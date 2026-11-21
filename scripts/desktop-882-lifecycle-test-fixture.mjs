import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export const commit='f1cd62bf6fbd8cbaef49a479aff440027afba37b';
export const lifecyclePin='aeef807657c21e5574ff5454312a00d391b4ac06aeedc05e9aa705e7d903f667';
const desktop=process.env.DESKTOP_882_ROOT||process.env.DESKTOP_882_SOURCE||fileURLToPath(new URL('../../Desktop/',import.meta.url));
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
export async function desktopLifecycleReference(){
 const source=(await readFile(path.join(desktop,'lib/transaction-lifecycle.ts'),'utf8')).replaceAll('\r\n','\n');
 assert.equal(createHash('sha256').update(source).digest('hex'),lifecyclePin,'Merged882 lifecycle source changed');
 const party=(await readFile(path.join(desktop,'app/party-balance.ts'),'utf8')).replaceAll('\r\n','\n');
 assert.equal(createHash('sha256').update(party).digest('hex'),'befecb80a99ee46acfd6a5e52a9eaf95c40619633299dd59fec5a8d04b443c1c','Merged882 party cash arithmetic source changed');
 const partyUrl=url(stripTypeScriptTypes(party,{mode:'transform'}));
 const prefix=`const {normalizePartyNet,partyCashDelta,partyNet}=await import(${JSON.stringify(partyUrl)});\n`;
 // Bank/party commands use the actual source. Stock-only imports are never invoked here.
 const compiled=stripTypeScriptTypes(source,{mode:'transform'}).replace(/^import .*;\r?\n/gm,'');
 return import(url(prefix+compiled+'\nexport {noteForUpdate};\n'));
}
const get=(row,keys)=>!keys.length?[row]:Array.isArray(row)?row.flatMap(r=>get(r,keys)):get(row?.[keys[0]],keys.slice(1));
function matches(row,query={}){return Object.entries(query).every(([key,value])=>{if(key==='$or')return value.some(q=>matches(row,q));if(key==='$and')return value.every(q=>matches(row,q));const found=get(row,key.split('.'));if(value&&typeof value==='object'&&!Array.isArray(value))return Object.entries(value).every(([op,v])=>op==='$in'?found.some(f=>v.includes(f)):op==='$ne'?found.every(f=>f!==v):op==='$exists'?found.some(f=>f!==undefined)===v:op==='$gte'?found.some(f=>f>=v):op==='$gt'?found.some(f=>f>v):false);return found.some(f=>f===value);});}
export class LifecycleMemoryDb{
 constructor(rows={}){this.rows=structuredClone(rows);for(const rows of Object.values(this.rows))for(const row of rows)row._id??=row.id;this.failDocumentWrite=false;}
 async transaction(work){const before=structuredClone(this.rows);try{return await work({})}catch(error){this.rows=before;throw error;}}
 collection(name){this.rows[name]??=[];const db=this;return{
  find(query={}){let rows=db.rows[name].filter(row=>matches(row,query));return{sort(order){rows.sort((a,b)=>{for(const[k,d]of Object.entries(order)){const delta=String(a[k]??'').localeCompare(String(b[k]??''));if(delta)return delta*d;}return 0;});return this;},async toArray(){return structuredClone(rows);}};},
  async findOne(query={}){return structuredClone(db.rows[name].find(row=>matches(row,query))??null);},
  async insertOne(row){if(name==='documents'&&db.failDocumentWrite)throw Error('Synthetic late source document failure');const saved=structuredClone(row);saved._id??=saved.id;db.rows[name].push(saved);return{insertedId:saved._id};},
  async updateOne(query,changes){if(name==='documents'&&db.failDocumentWrite)throw Error('Synthetic late source document failure');const row=db.rows[name].find(row=>matches(row,query));if(!row)return{matchedCount:0};for(const[k,v]of Object.entries(changes.$set??{}))row[k]=structuredClone(v);for(const[k,v]of Object.entries(changes.$inc??{}))row[k]=Number(row[k]??0)+v;for(const k of Object.keys(changes.$unset??{}))delete row[k];return{matchedCount:1,modifiedCount:1};},
  async deleteOne(query){const i=db.rows[name].findIndex(row=>matches(row,query));if(i<0)return{deletedCount:0};db.rows[name].splice(i,1);return{deletedCount:1};},
 };}
}
export async function lifecycleFixture(){
 const reference=await desktopLifecycleReference(),db=new LifecycleMemoryDb({paymentAccounts:[{id:'cash',code:'cash',name:'Cash',balance:1000,isActive:true,isArchived:false},{id:'bank',code:'bank',name:'Bank',balance:200,isActive:true,isArchived:false}],parties:[{id:'customer',name:'Customer',partyType:'customer',receivable:100,payable:0},{id:'supplier',name:'Supplier',partyType:'supplier',receivable:0,payable:100}],documents:[],financialMovements:[],accountTransfers:[],auditEvents:[]});
 const command=body=>db.transaction(session=>reference.executeLifecycleCommand(db,session,body));
 return {reference,db,command,document:id=>db.rows.documents.find(row=>row.id===id),active:id=>db.rows.financialMovements.filter(row=>row.documentId===id&&row.status!=='reversed'&&row.isReversal!==true)};
}
