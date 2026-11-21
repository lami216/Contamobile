import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {canReadRecord,recordReadCapability,validatePartyIdentity,partyDisplayName} from '../approved-runtime/business-identity.js';
import {CAPABILITIES} from '../approved-runtime/permissions.js';
const root=process.env.DESKTOP_862_ROOT||process.env.DESKTOP_862_SOURCE||fileURLToPath(new URL('../../Desktop/',import.meta.url));
const load=async name=>(await readFile(path.join(root,name),'utf8')).replaceAll('\r\n','\n');
const moduleOf=code=>import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(code,{mode:'transform'})).toString('base64'));
let reference=null,partyReference=null;
try{
 const code=await load('lib/document-read-model.ts');assert.equal(createHash('sha256').update(code).digest('hex'),'a551cd0e463436e31052636619ade107c246427401456cb093bc37b402889b00');reference=await moduleOf(code);
 const domain=await load('app/domain.ts'),route=await load('app/api/command/route.ts');
 assert.equal(createHash('sha256').update(domain).digest('hex'),'62b6e338011e82701ef19c7da24eda36d2147de2ef0c69d558c070a0824519f2');
 assert.equal(createHash('sha256').update(route).digest('hex'),'02df05da56f12e0b3d6bc83cc01693776a47ed441bcb25f28c80284e510b0a3b');
 const branches=route.slice(route.indexOf('  if (type === "party.create")'),route.indexOf('  if (type === "party.restore")'));
 const resolver=domain.match(/export function resolvePartyType[\s\S]*?\n}/)?.[0];assert(branches&&resolver);
 partyReference=await moduleOf(`class CommandError extends Error {constructor(message,status=400){super(message);this.status=status}};const text=v=>typeof v==='string'?v.trim():'';const id=()=> 'new-party';${resolver}\nexport async function execute(type,body,rows){const session={};const matches=(row,q)=>Object.entries(q).every(([k,v])=>v&&typeof v==='object'&&'$ne'in v?row[k]!==v.$ne:row[k]===v);const db={collection(){return{async findOne(q){return rows.find(r=>matches(r,q))},async insertOne(r){rows.push(r)},async updateOne(q,u){const r=rows.find(r=>matches(r,q));Object.assign(r,u.$set)}}}};const propagatePartyName=async()=>{};const postPartyOpening=async()=>{throw Error('unexpected opening')};${branches}}`);
}catch(error){if(error.code!=='ENOENT')throw error;}
const state={parties:[{id:1,type:'customer',name:'أحمد',phone:'22001122'},{id:2,type:'supplier',name:'مورد',phone:'33001122'},{id:3,type:'customer',name:'مؤرشف',phone:'44001122',archived:true}]};
let checks=0;const check=async(name,fn)=>{await fn();checks++;console.log('PASS '+name)};
const fromSet=caps=>cap=>caps.includes(cap);
await check('ordinary workspace read authority is sufficient and create-only authority stays separate',()=>{
 for(const [kind,cap]of [['sale','pos.view'],['purchase','purchases.view'],['expense','expenses.view'],['stocktransfer','warehouses.transfer'],['adjustment','warehouses.adjust'],['transfer','banks.movements.view'],['deposit','banks.view']]){
  const r={kind};assert(canReadRecord(state,r,fromSet([cap])));assert.equal(recordReadCapability(state,r,fromSet([cap])),cap);
 }
 for(const [kind,cap]of [['sale','pos.create'],['purchase','purchases.create'],['expense','expenses.create'],['receive','customers.collect'],['pay','suppliers.pay'],['deposit','banks.deposit_withdraw'],['transfer','banks.transfer']])assert(!canReadRecord(state,{kind,party:kind==='pay'?2:1},fromSet([cap])));
});
await check('party-only access follows actual customer or supplier identity, including archived history',()=>{
 assert(canReadRecord(state,{kind:'sale',party:1},fromSet(['customers.view'])));
 assert(!canReadRecord(state,{kind:'sale',party:2},fromSet(['customers.view'])));
 assert(canReadRecord(state,{kind:'purchase',party:2},fromSet(['suppliers.view'])));
 assert(!canReadRecord(state,{kind:'purchase',party:1},fromSet(['suppliers.view'])));
 assert(canReadRecord(state,{kind:'receive',party:3},fromSet(['customers.view'])));
 assert(!canReadRecord(state,{kind:'receive',party:null,partyId:'1'},fromSet(['customers.view'])));
 assert(!fromSet(['customers.view'])(recordReadCapability(state,{kind:'receive',party:null},fromSet(['customers.view']))),'denied unrelated payment must stay denied through the shared capability gate');
});
await check('employee history is private even to records viewers and reports alone does not read documents',()=>{
 for(const kind of ['employee-payment','employee-accrual']){
  assert(!canReadRecord(state,{kind},fromSet(['records.view','reports.view','employees.manage','employees.pay'])));
  assert.equal(recordReadCapability(state,{kind},fromSet(['records.view'])),'employees.view');
  assert(canReadRecord(state,{kind},fromSet(['employees.view'])));
 }
 assert(!canReadRecord(state,{kind:'sale'},fromSet(['reports.view'])));
});
await check('capability button/action gate is equivalent to authorization across every single capability and native document role',()=>{
 const kinds=['sale','purchase','expense','stocktransfer','adjustment','transfer','deposit','withdraw','party-opening','receive','pay','return','offset','employee-payment','employee-accrual','unknown'];
 for(const kind of kinds)for(const party of [null,1,2,3,999])for(const cap of CAPABILITIES){const can=fromSet([cap]),r={kind,party};assert.equal(can(recordReadCapability(state,r,can)),canReadRecord(state,r,can),JSON.stringify({kind,party,cap}));}
});
await check('pinned Desktop 862 read-model execution agrees for capability and role combinations',()=>{
 if(!reference)return;
 const map={stocktransfer:'transfer',transfer:'account-transfer',deposit:'account-adjustment',withdraw:'account-adjustment',receive:'payment',pay:'payment'};
 const access={customerPartyIds:new Set(['1','3']),supplierPartyIds:new Set(['2'])};
 for(const kind of ['sale','purchase','expense','stocktransfer','adjustment','transfer','deposit','withdraw','party-opening','receive','pay','return','offset','employee-payment','employee-accrual','unknown'])for(const party of [null,1,2,3,999])for(const cap of [...CAPABILITIES,'none']){
  const can=fromSet([cap]),r={kind,party},source={kind:map[kind]||kind,partyId:party===null?null:String(party)};assert.equal(canReadRecord(state,r,can),reference.canReadDocument(source,{...access,can}),JSON.stringify({kind,party,cap}));
 }
});
await check('party identity uses trimmed text, null phone is optional, same name is allowed and role cannot change on edit',()=>{
 assert.deepEqual(validatePartyIdentity(state,{type:'customer',name:'  عميل جديد  ',phone:null}),{type:'customer',name:'عميل جديد',phone:''});
 assert.equal(validatePartyIdentity(state,{type:' customer ',name:'عميل',phone:null}).type,'customer');
 assert.deepEqual(validatePartyIdentity(state,{id:'1',type:'supplier',name:' أحمد ',phone:'22001122'}),{id:1,type:'customer',name:'أحمد',phone:'22001122'});
 assert.equal(validatePartyIdentity(state,{type:'customer',name:'أحمد',phone:''}).name,'أحمد');
 assert.throws(()=>validatePartyIdentity(state,{type:'other',name:'X'}),/نوع الحساب/);assert.throws(()=>validatePartyIdentity(state,{type:'customer',name:123}),/اسم الحساب/);
 assert.throws(()=>validatePartyIdentity(state,{id:999,name:'X'}),/الطرف غير موجود/);assert.throws(()=>validatePartyIdentity(state,{id:3,name:'X'}),/الطرف غير موجود/);
});
await check('nonempty duplicate phone rejects the same role including archived accounts, but permits customer and supplier pairing',()=>{
 assert.throws(()=>validatePartyIdentity(state,{type:'customer',name:'جديد',phone:' 22001122 '}),/رقم الهاتف مستخدم/);
 assert.throws(()=>validatePartyIdentity(state,{type:'customer',name:'جديد',phone:'44001122'}),/رقم الهاتف مستخدم/);
 assert.throws(()=>validatePartyIdentity(state,{id:1,name:'تعديل',phone:'44001122'}),/رقم الهاتف مستخدم/);
 assert.equal(validatePartyIdentity(state,{type:'supplier',name:'جديد',phone:'22001122'}).phone,'22001122');
 const restored={parties:[{id:1,type:'customer',name:'مستعاد',phone:'1',archived:false,isArchived:true}]};assert.equal(validatePartyIdentity(restored,{id:1,name:'مستعاد',phone:'1'}).id,1,'native archive state overrides preserved desktop metadata');
});
await check('party creation/update validation agrees with actual pinned Desktop command branches',async()=>{
 if(!partyReference)return;
 const cases=[{type:'customer',name:' جديد ',phone:null},{type:' customer ',name:'جديد',phone:null},{type:'customer',name:'جديد',phone:'22001122'},{type:'supplier',name:'جديد',phone:'22001122'},{type:'customer',name:'جديد',phone:'44001122'},{id:1,type:'supplier',name:' جديد ',phone:'22001122'},{id:1,name:'جديد',phone:'44001122'},{id:3,name:'مؤرشف',phone:'44001122'},{id:999,name:'غير موجود'},{type:'bad',name:'جديد'},{type:'customer',name:12,phone:12}];
 for(const input of cases){
  const original=JSON.stringify(state),rows=state.parties.map(p=>({id:String(p.id),name:p.name,phone:p.phone,partyType:p.type,isArchived:p.archived===true}));let mobile,desktop;
  try{mobile={value:validatePartyIdentity(state,input)}}catch(error){mobile={error:error.message,status:error.status}}
  try{const body={...input,...(input.id!==undefined?{id:String(input.id)}:{partyType:input.type})},id=await partyReference.execute(input.id!==undefined?'party.update':'party.create',body,rows),saved=rows.find(p=>p.id===id);desktop={value:{...(input.id!==undefined?{id:Number(id)}:{}),name:saved.name,phone:saved.phone,type:saved.partyType}}}catch(error){desktop={error:error.message,status:error.status}}
  assert.deepEqual(mobile,desktop,JSON.stringify(input));assert.equal(JSON.stringify(state),original,'validation must not mutate original accounts');
 }
});
await check('current party name drives operation display while source snapshot and finance stay untouched',()=>{
 const record={kind:'sale',party:1,title:'الاسم عند الإصدار',partyName:'اسم مخزن',partyNameOriginal:'أصل',total:15,lines:[{qty:1,price:15}]},before=JSON.stringify(record);
 assert.equal(partyDisplayName(state,record),'أحمد');assert.equal(JSON.stringify(record),before);
 assert.equal(partyDisplayName({parties:[]},record),'اسم مخزن');
 assert.equal(partyDisplayName(state,{party:null,partyId:1,title:'بيع مباشر',partyName:'اسم قبل فك الارتباط'}),'بيع مباشر');
 if(reference){const adapted=reference.resolveCurrentPartyName({...record,partyId:'1'},new Map([['1','أحمد']]));assert.equal(partyDisplayName(state,record),adapted.partyName);assert.equal(adapted.partyNameSnapshot,'أصل');}
});
console.log(JSON.stringify({suite:'business-identity-862',checks,livePinnedDesktop:Boolean(reference&&partyReference)}));
