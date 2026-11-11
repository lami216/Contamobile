/* Financial commands for the approved v27 model. No DOM, transport or storage.
 * Both local SQLite authorization and Contatools execute this exact module.
 * A command describes the original business action, never a snapshot patch. */
import {allocateLocalId,registerLocalIdentity,validateLocalIdentityMap,compareRecordOrder} from './local-identities.mjs';
export const DOMAIN_VERSION=1;
export class DomainError extends Error {
 constructor(/** @type {any} */ code,/** @type {any} */ message,/** @type {any} */ details={}){super(message);this.name='DomainError';this.code=code;this.details=details;}
}
const fail=(/** @type {any} */ code,/** @type {any} */ message,/** @type {any} */ details={})=>{throw new DomainError(code,message,details)};
const copy=(/** @type {any} */ value)=>JSON.parse(JSON.stringify(value));
const collections=['products','parties','accounts','records','categories'];
// Not a JSON/client-provided flag. Only this module mints a creation context.
const productCreationContext=Symbol('atomic-product-creation');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeKey=(/** @type {any} */ value)=>typeof value==='string'&&value.length>0&&value.length<=500&&!['__proto__','constructor','prototype'].includes(value);
export const roundMoney=(/** @type {any} */ value)=>Math.round((Number(value)+Number.EPSILON)*100)/100;
const finite=(/** @type {any} */ value,/** @type {any} */ min=-1e14)=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=1e14&&value>=min;
const assertAmount=(/** @type {any} */ value,/** @type {any} */ min=0)=>{if(!finite(value,min))fail('INVALID_AMOUNT','Invalid amount');return value;};
const nowOf=(/** @type {any} */ context)=>context.now||new Date().toISOString();
/** @returns {string} */
export function canonical(/** @type {any} */ value){
 if(value===null||typeof value!=='object'){if(typeof value==='number'&&!Number.isFinite(value))fail('INVALID_JSON','Non-finite JSON value');return JSON.stringify(value);}
 if(Array.isArray(value))return '['+value.map((/** @type {any} */ item)=>canonical(item??null)).join(',')+']';
 return '{'+Object.keys(value).filter((/** @type {any} */ k)=>value[k]!==undefined).sort().map((/** @type {any} */ k)=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
// Portable SHA-256: JavaScriptCore has no node:crypto or WebCrypto synchronous API.
export function sha256(/** @type {any} */ value){
 const bytes=unescape(encodeURIComponent(String(value))).split('').map((/** @type {any} */ c)=>c.charCodeAt(0)),length=bytes.length*8;
 bytes.push(128);while(bytes.length%64!==56)bytes.push(0);
 for(let i=7;i>=0;i--)bytes.push(i>=4?0:(length>>>i*8)&255);
 const k=[1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];
 const h=[1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225],rot=(/** @type {any} */ x,/** @type {any} */ n)=>(x>>>n)|(x<<(32-n));
 for(let offset=0;offset<bytes.length;offset+=64){
 /** @type {number[]} */
 const w=[];for(let i=0;i<16;i++)w[i]=(bytes[offset+4*i]<<24)|(bytes[offset+4*i+1]<<16)|(bytes[offset+4*i+2]<<8)|bytes[offset+4*i+3];for(let i=16;i<64;i++){
 /** @type {number} */
 const previous15=w[i-15];
 /** @type {number} */
 const previous2=w[i-2];w[i]=(w[i-16]+(rot(previous15,7)^rot(previous15,18)^(previous15>>>3))+w[i-7]+(rot(previous2,17)^rot(previous2,19)^(previous2>>>10)))|0;}let [a,b,c,d,e,f,g,j]=h;for(let i=0;i<64;i++){const t1=(j+(rot(e,6)^rot(e,11)^rot(e,25))+((e&f)^(~e&g))+k[i]+w[i])|0,t2=((rot(a,2)^rot(a,13)^rot(a,22))+((a&b)^(a&c)^(b&c)))|0;j=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}[a,b,c,d,e,f,g,j].forEach((/** @type {any} */ v,/** @type {any} */ i)=>h[i]=(h[i]+v)|0);}
 return h.map((/** @type {any} */ n)=>(n>>>0).toString(16).padStart(8,'0')).join('');
}
export const commandHash=(/** @type {any} */ command)=>sha256(canonical(command));
export function emptyState(/** @type {any} */ {originId,organizationId,branchId,branding='الكرنه'}={}){
 if(!safeKey(originId)||!safeKey(organizationId)||!safeKey(branchId))fail('INVALID_SCOPE','Branch identity required');
 return normalizeIdentities({originId,branding,products:[],parties:[],accounts:[{id:1,name:'نقدي',balance:0,active:true,openingBalance:0}],records:[],categories:[],warehouses:['المخزن الرئيسي'],warehouse:'المخزن الرئيسي',salesWarehouse:'المخزن الرئيسي',warehouseMeta:{'المخزن الرئيسي':{archived:false}},opening:{accounts:{1:0},parties:{},stocks:{}},currency:{code:'MRU',availableCodes:['MRU']},sequences:{},brandInfo:{},stockEvents:[],stockEventSequence:0,featureSchema:2},{organizationId,branchId});
}
export function normalizeIdentities(/** @type {any} */ input,/** @type {any} */ scope={}){
 const state=copy(input);if(!safeKey(state.originId))fail('INVALID_ORIGIN','originId is required before shared accounting');
 if(state.syncScope&&(state.syncScope.organizationId!==scope.organizationId||state.syncScope.branchId!==scope.branchId))fail('CROSS_SCOPE','State belongs to another branch');
 state.syncScope={organizationId:scope.organizationId,branchId:scope.branchId};
 for(const collection of collections){state[collection]??=[];const seen=new Set();for(const row of state[collection]){row.globalId??='legacy:'+encodeURIComponent(state.originId)+':'+collection+':'+row.id;row.syncVersion??=collection==='records'?(row.revision||0)+1:1;if(!safeKey(row.globalId)||seen.has(row.globalId))fail('DUPLICATE_IDENTITY','Duplicate global entity identity');seen.add(row.globalId);}}
 state.warehouseMeta??={};for(const name of state.warehouses){const meta=state.warehouseMeta[name]??={archived:false};meta.globalId??='legacy:'+encodeURIComponent(state.originId)+':warehouses:'+encodeURIComponent(name);meta.syncVersion??=1;}
 return state;
}
const byGlobal=(/** @type {any} */ state,/** @type {any} */ collection,/** @type {any} */ id)=>{const row=state[collection]?.find((/** @type {any} */ row)=>row.globalId===id);if(!row)fail('MISSING_REFERENCE','Referenced entity does not belong to this branch',{collection,globalId:id});return row;};
const globalOf=(/** @type {any} */ state,/** @type {any} */ collection,/** @type {any} */ id)=>(id===null||id===undefined)?null:byLocal(state,collection,id).globalId;
const byLocal=(/** @type {any} */ state,/** @type {any} */ collection,/** @type {any} */ id)=>{const row=state[collection]?.find((/** @type {any} */ row)=>row.id===id);if(!row?.globalId)fail('IDENTITY_NOT_READY','Normalize entity identities before capturing a command',{collection,localId:id});return row;};
const warehouseOf=(/** @type {any} */ state,/** @type {any} */ id)=>{const name=state.warehouses.find((/** @type {any} */ name)=>state.warehouseMeta[name]?.globalId===id);if(!name)fail('MISSING_REFERENCE','Warehouse does not belong to this branch',{globalId:id});return name;};
const warehouseGlobal=(/** @type {any} */ state,/** @type {any} */ name)=>(name===null||name===undefined)?null:state.warehouseMeta?.[name]?.globalId||fail('IDENTITY_NOT_READY','Warehouse identity missing');
const nextId=(/** @type {any} */ state,/** @type {any} */ collection,/** @type {any} */ globalId)=>state.localIdentityMap===undefined?Math.max(collection==='records'?100:0,...state[collection].map((/** @type {any} */ row)=>row.id))+1:allocateLocalId(state,collection,globalId);
const checkVersion=(/** @type {any} */ entity,/** @type {any} */ expected)=>{if(!Number.isSafeInteger(expected)||expected!==(entity.syncVersion||1))fail('VERSION_CONFLICT','The document changed on another device',{globalId:entity.globalId,expectedVersion:expected,currentVersion:entity.syncVersion||1});};
const requireCapability=(/** @type {any} */ context,/** @type {any} */ cap)=>{if(context.role==='org-admin'||context.capabilities?.includes('*')||context.capabilities?.includes(cap))return;fail('FORBIDDEN','This membership cannot perform this operation',{capability:cap});};
function assertScope(/** @type {any} */ state,/** @type {any} */ command,/** @type {any} */ context){
 if(command.schemaVersion!==DOMAIN_VERSION||!uuid.test(command.operationId||''))fail('INVALID_COMMAND','Stable UUID operationId required');
 const organizationId=context.organizationId||context.orgId,branchId=context.branchId;
 if(!safeKey(organizationId)||!safeKey(branchId)||command.organizationId!==organizationId||command.branchId!==branchId||state.syncScope?.organizationId!==organizationId||state.syncScope?.branchId!==branchId)fail('CROSS_SCOPE','Organization or branch mismatch');
 if(command.authorMemberId!==context.memberId||!safeKey(command.authorMemberId))fail('AUTHOR_CHANGED','The original employee must review this operation after reassignment');
 if(context.branchIds&&!context.branchIds.includes(branchId))fail('CROSS_SCOPE','Membership does not have this branch');
 if(!Number.isSafeInteger(command.epoch)||command.epoch<1||command.epoch!==context.epoch)fail('STALE_EPOCH','This operation belongs to a previous restored database',{operationEpoch:command.epoch,currentEpoch:context.epoch});
 if(!Array.isArray(command.dependencies)||command.dependencies.length>100||command.dependencies.some((/** @type {any} */ id)=>!uuid.test(id)||id===command.operationId)||new Set(command.dependencies).size!==command.dependencies.length)fail('INVALID_DEPENDENCIES','Invalid command dependencies');
 if(!command.payload||typeof command.payload!=='object'||Array.isArray(command.payload)||canonical(command).length>2_000_000)fail('INVALID_COMMAND','Invalid command payload');
}
export function makeCommand(/** @type {any} */ kind,/** @type {any} */ payload,/** @type {any} */ options){
 return {schemaVersion:DOMAIN_VERSION,operationId:options.operationId,organizationId:options.organizationId,branchId:options.branchId,epoch:options.epoch,authorMemberId:options.memberId,kind,payload:copy(payload),occurredAt:options.occurredAt||new Date().toISOString(),dependencies:[...(options.dependencies||[])],...((options.expectedVersion===null||options.expectedVersion===undefined)?{}:{expectedVersion:options.expectedVersion})};
}
export function encodeRecordCommand(/** @type {any} */ state,/** @type {any} */ record,/** @type {any} */ options){
 const old=state.records.find((/** @type {any} */ row)=>row.id===record.id),r=copy(record),globalId=old?.globalId||record.globalId||options.entityGlobalId;
 if(!safeKey(globalId))fail('INVALID_IDENTITY','A new record requires a globalId');
 delete r.id;delete r.revisions;delete r.revision;delete r.syncVersion;delete r.voided;delete r.voidedAt;
 r.globalId=globalId;r.number=old?.number||r.number||options.documentNumber;
 if(!r.number)fail('DOCUMENT_NUMBER_REQUIRED','Reserve a visible document number before posting');
 for(const key of ['party','otherParty'])if((r[key]!==null&&r[key]!==undefined))r[key]=globalOf(state,'parties',r[key]);
 for(const key of ['account','to'])if((r[key]!==null&&r[key]!==undefined))r[key]=globalOf(state,'accounts',r[key]);
 if((r.openingProduct!==null&&r.openingProduct!==undefined))r.openingProduct=globalOf(state,'products',r.openingProduct);
 if((r.sourceRecord!==null&&r.sourceRecord!==undefined))r.sourceRecord=globalOf(state,'records',r.sourceRecord);
 for(const key of ['warehouse','from','toWarehouse','openingWarehouseBefore','openingWarehouseAfter'])if((r[key]!==null&&r[key]!==undefined))r[key]=warehouseGlobal(state,r[key]);
 r.lines=(r.lines||[]).map((/** @type {any} */ line)=>{const next={...line,product:globalOf(state,'products',line.product)};if(line.warehouse)next.warehouse=warehouseGlobal(state,line.warehouse);if(['sale','purchase'].includes(r.kind))next.costAtSale??=byLocal(state,'products',line.product).cost;return next;});
 return makeCommand(old?'record.edit':'record.post',{record:r}, {...options,expectedVersion:options.expectedVersion===undefined?old?.syncVersion:options.expectedVersion});
}
export function encodeVoidCommand(/** @type {any} */ state,/** @type {any} */ record,/** @type {any} */ options){return makeCommand('record.void',{globalId:record.globalId}, {...options,expectedVersion:options.expectedVersion===undefined?record.syncVersion:options.expectedVersion});}
export function encodeEntityCommand(/** @type {any} */ state,/** @type {any} */ collection,/** @type {any} */ entity,/** @type {any} */ options){
 if(!['products','parties','accounts','categories'].includes(collection))fail('INVALID_COLLECTION','Unsupported entity collection');
 const old=entity.id?state[collection].find((/** @type {any} */ row)=>row.id===entity.id):null;
 const metadata=/** @type {Record<string,string[]>} */({products:['name','sku','price','cost','expiry','note','categoryId'],parties:['name','phone','type'],accounts:['name','active'],categories:['name']})[collection];
 /** @type {Record<string,any>} */ const fields={};for(const key of metadata)if(entity[key]!==undefined)fields[key]=entity[key];
 if((fields.categoryId!==null&&fields.categoryId!==undefined))fields.categoryId=globalOf(state,'categories',fields.categoryId);
 if(!old&&collection==='parties')fields.openingBalance=entity.balance||0;
 if(!old&&collection==='accounts')fields.openingBalance=entity.openingBalance??entity.balance??0;
 return makeCommand('entity.upsert',{collection,globalId:old?.globalId||entity.globalId||options.entityGlobalId,fields}, {...options,expectedVersion:options.expectedVersion===undefined?old?.syncVersion:options.expectedVersion});
}
export function recordCapability(/** @type {any} */ state,/** @type {any} */ record,/** @type {any} */ suffix='create',/** @type {any} */ context={}){
 if(record.openingStock&&suffix==='create'){
  if(!record.lines?.length||!record.lines.every((/** @type {any} */ line)=>context[productCreationContext]?.has(state.products.find((/** @type {any} */ p)=>p.id===line.product)?.globalId)))fail('OPENING_REQUIRES_CREATION','An opening-stock document must belong to the same atomic product creation');
  return 'products.create';
 }
 if(record.openingAccountCorrection)return 'banks.balance_correct'+(suffix==='create'?'':'.'+suffix);
 const base=/** @type {Record<string,string>} */({sale:'pos',purchase:'purchases',expense:'expenses',stocktransfer:'warehouses.transfer',adjustment:'warehouses.adjust',transfer:'banks.transfer',deposit:'banks.deposit_withdraw',withdraw:'banks.deposit_withdraw'})[record.kind];
 if(['receive','pay'].includes(record.kind)){const party=state.parties.find((/** @type {any} */ row)=>row.id===record.party);if(!party)fail('MISSING_REFERENCE','Party is required');return (party.type==='customer'?'customers.collect':'suppliers.pay')+(suffix==='create'?'':'.'+suffix);}
 if(!base)fail('UNSUPPORTED_RECORD','This document type cannot be created or edited');
 return base+(['sale','purchase','expense'].includes(record.kind)?'.'+suffix:suffix==='create'?'':'.'+suffix);
}
// Called again before returning a cached command receipt: narrowing a member's
// permissions must revoke retries too, even when their first request committed.
export function authorizeCommand(/** @type {any} */ state,/** @type {any} */ command,/** @type {any} */ context){
 assertScope(state,command,context);
 if(command.kind==='batch'){let preview=state;const batchContext={...context,[productCreationContext]:new Set()};for(const part of command.payload.commands||[]){const nested={...command,...part};authorizeCommand(preview,nested,batchContext);try{preview=domainApply(preview,nested,batchContext).state;}catch(error){if(error instanceof DomainError&&['FORBIDDEN','CROSS_SCOPE'].includes(error.code))throw error;}if(part.kind==='entity.upsert'&&part.payload.collection==='products'&&part.expectedVersion===undefined)batchContext[productCreationContext].add(part.payload.globalId);}return true;}
 if(command.kind.startsWith('record.')){const old=state.records.find((/** @type {any} */ r)=>r.globalId===(command.payload.globalId||command.payload.record?.globalId)),record=command.payload.record?materializeRecord(state,command.payload.record,old):old;if(!record)fail('MISSING_REFERENCE','Document not found');requireCapability(context,recordCapability(state,record,command.kind==='record.post'?'create':command.kind==='record.void'?'delete':'edit',context));}
 else if(command.kind==='entity.upsert'){const p=command.payload,old=state[p.collection]?.find((/** @type {any} */ r)=>r.globalId===p.globalId);requireCapability(context,entityCapability(p.collection,old||p.fields,(command.expectedVersion!==null&&command.expectedVersion!==undefined)?'edit':'create'));}
 else if(command.kind==='entity.archive'){const p=command.payload,row=byGlobal(state,p.collection,p.globalId);requireCapability(context,entityCapability(p.collection,row,p.archived?'delete':'edit'));}
 else if(command.kind==='warehouse.upsert'){const p=command.payload,exists=state.warehouses.some((/** @type {any} */ w)=>state.warehouseMeta[w].globalId===p.globalId);requireCapability(context,p.archived?'warehouses.delete':exists?'warehouses.edit':'warehouses.create');}
 else if(command.kind==='category.delete')requireCapability(context,'products.edit');
 else if(command.kind==='settings.update')requireCapability(context,'settings.branding.manage');
 else fail('INVALID_COMMAND','Unknown semantic command');return true;
}
/** Exact permission manifest for native-owned compact receipt authorization.
 * Scope/author checks still run. The collector is not an authorization grant;
 * the native host first verifies the save with the actual current rights.
 * @returns {string[]} */
export function commandCapabilities(/** @type {any} */ state,/** @type {any} */ command,/** @type {any} */ context){
 const required=new Set();
 const capabilities={includes(/** @type {string} */ cap){if(cap==='*')return false;required.add(cap);return true;}};
 authorizeCommand(state,command,{...context,role:'capability-manifest',capabilities});return [...required].sort();
}
function materializeRecord(/** @type {any} */ state,/** @type {any} */ input,/** @type {any} */ previous){
 const record=copy(input);record.id=previous?.id||nextId(state,'records',record.globalId);
 for(const key of ['party','otherParty'])if((record[key]!==null&&record[key]!==undefined))record[key]=byGlobal(state,'parties',record[key]).id;
 for(const key of ['account','to'])if((record[key]!==null&&record[key]!==undefined))record[key]=byGlobal(state,'accounts',record[key]).id;
 if((record.openingProduct!==null&&record.openingProduct!==undefined))record.openingProduct=byGlobal(state,'products',record.openingProduct).id;
 if((record.sourceRecord!==null&&record.sourceRecord!==undefined)){const source=byGlobal(state,'records',record.sourceRecord);if(source.voided)fail('DEPENDENCY_CONFLICT','The source document was cancelled');record.sourceRecord=source.id;}
 for(const key of ['warehouse','from','toWarehouse','openingWarehouseBefore','openingWarehouseAfter'])if((record[key]!==null&&record[key]!==undefined))record[key]=warehouseOf(state,record[key]);
 record.lines=(record.lines||[]).map((/** @type {any} */ line)=>({...line,product:byGlobal(state,'products',line.product).id,...(line.warehouse?{warehouse:warehouseOf(state,line.warehouse)}:{})}));
 return record;
}
const available=(/** @type {any} */ entity,/** @type {any} */ previous,/** @type {any} */ role)=>entity&&(!entity.archived&&(role==='party'||entity.active!==false)||previous?.[role]===entity.id);
function validateRecord(/** @type {any} */ state,/** @type {any} */ r,/** @type {any} */ old,/** @type {any} */ context){
 if(!['sale','purchase','expense','receive','pay','deposit','withdraw','transfer','stocktransfer','adjustment'].includes(r.kind)||old&&r.kind!==old.kind&&!old.openingAccountCorrection)fail('UNSUPPORTED_RECORD','Unsupported document kind');
 if(!safeKey(r.globalId)||!Array.isArray(r.lines)||r.lines.length>10000||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(r.date||'')||!/^\d{2}:\d{2}(:\d{2})?$/.test(r.time||''))fail('INVALID_RECORD','Invalid document');
 if(old?.voided)fail('VOIDED_DOCUMENT','A cancelled document cannot be edited');
 if(old?.number&&String(r.number)!==String(old.number))fail('NUMBER_IMMUTABLE','An issued invoice cannot be silently renumbered');
 if(!safeKey(String(r.number||''))||state.records.some((/** @type {any} */ row)=>row.globalId!==r.globalId&&row.kind===r.kind&&String(row.number)===String(r.number)))fail('DOCUMENT_NUMBER_CONFLICT','This visible document number is already issued');
 if(String(r.note||'').length>300)fail('INVALID_NOTE','Note is too long');
 const a=state.accounts.find((/** @type {any} */ row)=>row.id===r.account),p=state.parties.find((/** @type {any} */ row)=>row.id===r.party);
 if((r.account!==null&&r.account!==undefined)&&!available(a,old,'account'))fail('ARCHIVED_REFERENCE','Select an active payment account');
 if((r.party!==null&&r.party!==undefined)&&!available(p,old,'party'))fail('ARCHIVED_REFERENCE','Select an active party');
 if((r.to!==null&&r.to!==undefined)&&(!available(state.accounts.find((/** @type {any} */ row)=>row.id===r.to),old,'to')||r.to===r.account))fail('INVALID_TRANSFER','Select two different active payment accounts');
 for(const name of [r.warehouse,r.from,r.toWarehouse,...r.lines.map((/** @type {any} */ l)=>l.warehouse)].filter(Boolean))if(!state.warehouses.includes(name)||state.warehouseMeta[name]?.archived)fail('ARCHIVED_REFERENCE','Select an active warehouse');
 if(new Set(r.lines.map((/** @type {any} */ l)=>l.product)).size!==r.lines.length)fail('DUPLICATE_LINE','A product may appear only once');
 for(const l of r.lines){const product=state.products.find((/** @type {any} */ row)=>row.id===l.product);if(!product||product.archived&&!old?.lines.some((/** @type {any} */ line)=>line.product===l.product))fail('ARCHIVED_REFERENCE','Product unavailable');assertAmount(l.qty);assertAmount(l.price);if(r.kind==='adjustment')assertAmount(l.delta,-1e14);else if(l.qty<=0)fail('INVALID_QUANTITY','Quantity must be positive');if(['sale','purchase'].includes(r.kind)&&l.price<=0)fail('INVALID_PRICE','Price must be positive');if(r.kind==='sale'&&product.expiry&&product.expiry<r.date)fail('EXPIRED_PRODUCT','An expired product cannot be sold');}
 if(['sale','purchase'].includes(r.kind)){
  if(!r.lines.length||!r.warehouse)fail('INVALID_RECORD','Invoice lines and warehouse required');
  const total=roundMoney(r.lines.reduce((/** @type {any} */ n,/** @type {any} */ l)=>n+l.qty*l.price,0));assertAmount(total);if(total<=0)fail('INVALID_AMOUNT','Invoice total must be positive');
  if(roundMoney(r.total)!==total||roundMoney((r.paid||0)+(r.due||0))!==total||![0,total].includes(r.paid||0)||![0,total].includes(r.due||0))fail('INVALID_SETTLEMENT','Invoice total and settlement do not match approved full-payment/note rules');
  if(r.due&&(!p||p.type!==(r.kind==='sale'?'customer':'supplier')))fail('INVALID_PARTY','Credit invoice requires the matching party type');
  if(r.paid&&!a)fail('MISSING_REFERENCE','Payment account required');
  r.total=total;r.paid=roundMoney(r.paid||0);r.due=roundMoney(r.due||0);
  for(const l of r.lines){l.costAtSale??=state.products.find((/** @type {any} */ p)=>p.id===l.product).cost;assertAmount(l.costAtSale);}
  r.profit=roundMoney(r.lines.reduce((/** @type {any} */ n,/** @type {any} */ l)=>n+(l.price-l.costAtSale)*l.qty,0));
 }else if(['expense','receive','pay','deposit','withdraw','transfer'].includes(r.kind)){
  assertAmount(r.total);if(!r.total||!a)fail('INVALID_AMOUNT','Amount and payment account required');if(['receive','pay'].includes(r.kind)&&!p)fail('MISSING_REFERENCE','Party required');if(r.kind==='transfer'&&(r.to===null||r.to===undefined))fail('MISSING_REFERENCE','Destination account required');r.total=roundMoney(r.total);r.paid=r.total;r.due=0;
 }else{
  if(!r.lines.length||r.kind==='stocktransfer'&&(!r.from||!r.toWarehouse||r.from===r.toWarehouse)||r.kind==='adjustment'&&!r.warehouse)fail('INVALID_STOCK_DOCUMENT','Invalid stock operation');
  if(r.kind==='adjustment'&&!r.openingStock&&!String(r.note||'').trim())fail('REASON_REQUIRED','Stock correction requires a reason');
  if(r.kind==='adjustment'&&!r.openingStock&&!r.openingCorrection)for(const line of r.lines){if(!finite(line.balanceBefore,0)||!finite(line.actualQuantity,0)||line.balanceAfter!==line.actualQuantity||line.delta!==line.actualQuantity-line.balanceBefore||line.qty!==Math.abs(line.delta))fail('INVALID_STOCK_COUNT','Stock count baseline must be explicit');if(old){const prior=old.lines.find((/** @type {any} */ l)=>l.product===line.product);if(!prior||prior.balanceBefore!==line.balanceBefore)fail('INVALID_STOCK_COUNT','Cannot change the original stock count baseline');}else if(line.balanceBefore!==(state.products.find((/** @type {any} */ p)=>p.id===line.product).stocks[r.warehouse]||0))fail('STOCK_COUNT_CONFLICT','Stock changed since this count was made');}
  r.paid=0;r.due=0;r.total=r.openingCorrection||r.openingStock?0:roundMoney(r.lines.reduce((/** @type {any} */ n,/** @type {any} */ l)=>n+(r.kind==='stocktransfer'?l.qty:Math.abs(l.delta))*l.price,0));
 }
 if(r.openingAccountCorrection){const current=state.records.find((/** @type {any} */ row)=>!row.voided&&row.openingAccountCorrection&&row.account===r.account);if(old&&current?.id!==old.id)fail('LATER_CORRECTION','Only the latest active opening correction can be edited');if(!finite(r.openingBalanceBefore)||!finite(r.openingBalanceAfter)||roundMoney(Math.abs(r.openingBalanceAfter-r.openingBalanceBefore))!==r.total)fail('INVALID_OPENING','Opening account correction does not match its financial movement');if(!old&&r.openingBalanceBefore!==(a.openingBalance??state.opening.accounts[a.id]??0))fail('VERSION_CONFLICT','Opening balance changed');}
 if(r.openingCorrection){const product=state.products.find((/** @type {any} */ p)=>p.id===r.openingProduct);if(!product||product.openingHistoryLocked||!['openingTotalBefore','openingTotalAfter','openingCostBefore','openingCostAfter'].every((/** @type {any} */ k)=>finite(r[k],0))||r.openingTotalBefore!==(product.openingTotal||0)||r.openingCostBefore!==(product.openingCost??product.cost))fail('INVALID_OPENING','Opening stock provenance changed or is not safely editable');const sum=r.lines.reduce((/** @type {any} */ n,/** @type {any} */ l)=>n+l.delta,0);if(sum!==r.openingTotalAfter-r.openingTotalBefore||r.lines.some((/** @type {any} */ l)=>l.product!==product.id))fail('INVALID_OPENING','Opening stock correction does not match provenance');}
 if(r.openingStock&&!old){for(const line of r.lines){const product=state.products.find((/** @type {any} */ p)=>p.id===line.product);if(!context[productCreationContext]?.has(product.globalId)||Object.values(product.stocks).some(q=>q!==0)||!Number.isSafeInteger(line.qty)||line.qty<=0||line.delta!==line.qty||line.price<=0)fail('OPENING_REQUIRES_CREATION','Opening stock requires a new zero-stock product from this atomic creation');}}
}
export function invoiceEffect(/** @type {any} */ state,/** @type {any} */ r,/** @type {any} */ sign){
 const a=state.accounts.find((/** @type {any} */ a)=>a.id===r.account),p=state.parties.find((/** @type {any} */ p)=>p.id===r.party),stock=(/** @type {any} */ line,/** @type {any} */ warehouse,/** @type {any} */ delta)=>{const product=state.products.find((/** @type {any} */ p)=>p.id===line.product);if(!product)fail('MISSING_REFERENCE','Product not found');product.stocks[warehouse]=(product.stocks[warehouse]||0)+sign*delta;};
 if(['sale','purchase'].includes(r.kind)){for(const l of r.lines)stock(l,r.warehouse,(r.kind==='sale'?-1:1)*l.qty);if(a)a.balance+=sign*(r.kind==='sale'?r.paid:-r.paid);if(p)p.balance+=sign*(r.due||0);}
 else if(['receive','pay'].includes(r.kind)){if(a)a.balance+=sign*(r.kind==='receive'?r.total:-r.total);if(p)p.balance+=sign*(p.type==='customer'?(r.kind==='receive'?-1:1):(r.kind==='pay'?-1:1))*r.total;}
 else if(['expense','deposit','withdraw','transfer'].includes(r.kind)){if(a)a.balance+=sign*(r.kind==='deposit'?r.total:-r.total);if(r.kind==='transfer')state.accounts.find((/** @type {any} */ a)=>a.id===r.to).balance+=sign*r.total;}
 else if(r.kind==='stocktransfer')for(const l of r.lines){stock(l,r.from,-l.qty);stock(l,r.toWarehouse,l.qty);}
 else if(r.kind==='adjustment')for(const l of r.lines)stock(l,l.warehouse||r.warehouse,l.delta);
 else fail('UNSUPPORTED_RECORD','Removed document types are read-only');
 for(const rows of [state.accounts,state.parties])for(const row of rows)row.balance=roundMoney(row.balance);
 syncQuantities(state);
}
function syncQuantities(/** @type {any} */ state){for(const p of state.products)p.qty=p.stocks[state.warehouse]||0;}
function checkFinancialState(/** @type {any} */ state){
 for(const row of [...state.accounts,...state.parties])if(!finite(row.balance))fail('INVALID_BALANCE','Invalid signed balance');
 for(const p of state.products)for(const [warehouse,quantity]of Object.entries(p.stocks)){if(!finite(quantity,0))fail('INSUFFICIENT_STOCK','The operation would consume unavailable stock',{productGlobalId:p.globalId,warehouse,shortage:-quantity});}
}
function reconcileArchives(/** @type {any} */ state,/** @type {any} */ record,/** @type {any} */ previous=null,/** @type {any} */ cancelled=false){
 const records=[record,previous].filter(Boolean),accounts=new Set(records.flatMap((/** @type {any} */ r)=>[r.account,r.to]).filter((/** @type {any} */ id)=>(id!==null&&id!==undefined))),parties=new Set(records.map((/** @type {any} */ r)=>r.party).filter((/** @type {any} */ id)=>(id!==null&&id!==undefined)));
 const expose=(/** @type {any} */ row,/** @type {any} */ account)=>{row.archived=false;row.archivedAt=null;if(account)row.active=true;};
 for(const a of state.accounts)if(accounts.has(a.id)){const kept=!cancelled&&previous&&['account','to'].some((/** @type {any} */ key)=>previous[key]===a.id&&record[key]===a.id);if(kept&&(a.archived||a.active===false)||a.archived&&a.balance!==0)expose(a,true);}
 for(const p of state.parties)if(parties.has(p.id)&&p.archived&&p.balance!==0)expose(p,false);
}
function recordEvents(/** @type {any} */ state,/** @type {any} */ r,/** @type {any} */ sign,/** @type {any} */ phase,/** @type {any} */ at){
 state.stockEvents??=[];const revision=state.stockEventSequence=(state.stockEventSequence||0)+1;
 const push=(/** @type {any} */ line,/** @type {any} */ warehouse,/** @type {any} */ delta,/** @type {any} */ type)=>{if(delta)state.stockEvents.push({productId:String(line.product),productGlobalId:state.products.find((/** @type {any} */ p)=>p.id===line.product).globalId,documentId:String(r.id),documentGlobalId:r.globalId,documentRevision:revision,warehouseId:warehouse,quantityDelta:delta,type,at});};
 for(const l of r.lines){const type=r.openingStock?'opening':r.openingCorrection?'opening-correction':r.kind,suffix=sign<0?(phase==='void'?'-void':'-edit'):phase==='edit'?'-edit':'';if(['sale','purchase'].includes(r.kind))push(l,r.warehouse,sign*(r.kind==='sale'?-1:1)*l.qty,type+suffix);else if(r.kind==='adjustment')push(l,l.warehouse||r.warehouse,sign*l.delta,type+suffix);else if(r.kind==='stocktransfer'){push(l,r.from,-sign*l.qty,phase==='post'?'transfer-out':'transfer-'+phase);push(l,r.toWarehouse,sign*l.qty,phase==='post'?'transfer-in':'transfer-'+phase);}}
}
function currentCosts(/** @type {any} */ state){for(const p of state.products){
 const purchases=state.records.filter((/** @type {any} */ r)=>!r.voided&&r.kind==='purchase'&&r.lines.some((/** @type {any} */ l)=>l.product===p.id)).slice().sort((/** @type {any} */ a,/** @type {any} */ b)=>a.date.localeCompare(b.date)||compareRecordOrder(state,a,b));
 const next=purchases.length?purchases.at(-1).lines.find((/** @type {any} */ l)=>l.product===p.id).price:(p.openingCost??p.cost);
 if(next!==p.cost){p.cost=next;p.syncVersion=(p.syncVersion||1)+1;}
}}
function openingMetadata(/** @type {any} */ state,/** @type {any} */ r,/** @type {any} */ reverse=false){if(!r?.openingCorrection)return;const p=state.products.find((/** @type {any} */ p)=>p.id===r.openingProduct),suffix=reverse?'Before':'After';p.openingTotal=r['openingTotal'+suffix];p.openingCost=r['openingCost'+suffix];p.openingWarehouse=r['openingWarehouse'+suffix];}
function applyRecord(/** @type {any} */ state,/** @type {any} */ command,/** @type {any} */ context){
 const old=command.kind==='record.post'?null:byGlobal(state,'records',command.payload.globalId||command.payload.record?.globalId);
 if(old)checkVersion(old,command.expectedVersion);
 if(command.kind==='record.void'){
  requireCapability(context,recordCapability(state,old,'delete'));if(old.voided)fail('VOIDED_DOCUMENT','Document already cancelled');
  if(old.openingCorrection&&state.records.find((/** @type {any} */ r)=>!r.voided&&r.openingCorrection&&r.openingProduct===old.openingProduct)?.id!==old.id||old.openingAccountCorrection&&state.records.find((/** @type {any} */ r)=>!r.voided&&r.openingAccountCorrection&&r.account===old.account)?.id!==old.id)fail('LATER_CORRECTION','Only the latest active opening correction can be cancelled');
  invoiceEffect(state,old,-1);checkFinancialState(state);old.voided=true;old.voidedAt=nowOf(context);old.voidedBy=context.memberId;old.voidedByName=context.memberName||context.memberId;old.syncVersion=(old.syncVersion||1)+1;recordEvents(state,old,-1,'void',nowOf(context));openingMetadata(state,old,true);if(old.openingAccountCorrection)state.accounts.find((/** @type {any} */ a)=>a.id===old.account).openingBalance=old.openingBalanceBefore;reconcileArchives(state,old,null,true);currentCosts(state);return {globalId:old.globalId,localId:old.id,version:old.syncVersion,voided:true};
 }
 if(command.kind==='record.post'&&state.records.some((/** @type {any} */ r)=>r.globalId===command.payload.record?.globalId))fail('ENTITY_EXISTS','This document identity is already in use');
 const r=materializeRecord(state,command.payload.record,old);validateRecord(state,r,old,context);requireCapability(context,recordCapability(state,r,old?'edit':'create',context));
 if(old&&old.kind==='adjustment'&&!old.openingStock&&!old.openingCorrection){
  if(old.warehouse!==r.warehouse||old.lines.length!==r.lines.length||r.lines.some((/** @type {any} */ l)=>!old.lines.some((/** @type {any} */ prior)=>prior.product===l.product)))fail('FIXED_STOCK_COUNT','Warehouse and product set of a posted correction are fixed');
  for(const line of r.lines)state.products.find((/** @type {any} */ p)=>p.id===line.product).stocks[r.warehouse]+=line.delta-old.lines.find((/** @type {any} */ l)=>l.product===line.product).delta;syncQuantities(state);
 }else{if(old)invoiceEffect(state,old,-1);invoiceEffect(state,r,1);}
 checkFinancialState(state);r.revision=(old?.revision||0)+(old?1:0);r.syncVersion=(old?.syncVersion||0)+1;r.revisions=[...(old?.revisions||[]),...(old?[{...copy(old),revisions:undefined}]:[])];r.createdAt=old?.createdAt||nowOf(context);r.updatedAt=nowOf(context);r.updatedBy=context.memberId;r.updatedByName=context.memberName||context.memberId;
 if(old)state.records[state.records.indexOf(old)]=r;else state.records.unshift(r);registerLocalIdentity(state,'records',r,context.localSequence);
 reconcileArchives(state,r,old);if(old){recordEvents(state,old,-1,'edit',nowOf(context));openingMetadata(state,old,true);}recordEvents(state,r,1,old?'edit':'post',nowOf(context));openingMetadata(state,r);
 if(r.openingStock)for(const line of r.lines){const p=state.products.find((/** @type {any} */ p)=>p.id===line.product);p.openingTotal=(p.openingTotal||0)+line.delta;p.openingCost=line.price;p.openingWarehouse=r.warehouse;}
 if(r.openingAccountCorrection)state.accounts.find((/** @type {any} */ a)=>a.id===r.account).openingBalance=r.openingBalanceAfter;
 if(r.sequence){state.sequences??={};state.sequences[r.kind]=Math.max(state.sequences[r.kind]||0,r.sequence);}
 if(r.kind==='purchase'||r.openingCorrection)currentCosts(state);if(['sale','purchase'].includes(r.kind))state.lastSale=copy(r);
 return {globalId:r.globalId,localId:r.id,version:r.syncVersion,number:r.number};
}
function entityCapability(/** @type {any} */ collection,/** @type {any} */ fields,/** @type {any} */ suffix){return (/** @type {Record<string,string>} */({products:'products',categories:'products',accounts:'banks',parties:fields.type==='supplier'?'suppliers':'customers'})[collection]||fail('INVALID_COLLECTION','Unknown collection'))+'.'+suffix;}
function applyEntity(/** @type {any} */ state,/** @type {any} */ command,/** @type {any} */ context){
 const {collection,globalId,fields}=command.payload;if(!['products','parties','accounts','categories'].includes(collection)||!safeKey(globalId)||!fields||typeof fields!=='object')fail('INVALID_ENTITY','Invalid entity');
 const old=state[collection].find((/** @type {any} */ row)=>row.globalId===globalId);if(old)checkVersion(old,command.expectedVersion);else if((command.expectedVersion!==null&&command.expectedVersion!==undefined))fail('MISSING_REFERENCE','Entity no longer exists');
 requireCapability(context,entityCapability(collection,old||fields,old?'edit':'create'));
 const allowed=/** @type {Record<string,string[]>} */({products:['name','sku','price','cost','expiry','note','categoryId'],parties:['name','phone','type','openingBalance'],accounts:['name','active','openingBalance'],categories:['name']})[collection];
 if(Object.keys(fields).some((/** @type {any} */ key)=>!allowed.includes(key)))fail('INVALID_ENTITY_FIELD','Balances and stock cannot be changed with metadata commands');
 const row={...(old||{}),...copy(fields),id:old?.id||nextId(state,collection,globalId),globalId,syncVersion:(old?.syncVersion||0)+1};
 if(typeof row.name!=='string'||!row.name.trim()||row.name.length>120)fail('INVALID_NAME','A short name is required');row.name=row.name.trim();
 if(collection==='products'){
  if(row.sku!==undefined&&(typeof row.sku!=='string'||row.sku.trim().length>128))fail('INVALID_BARCODE','Barcode must be text of at most 128 characters');
  row.sku=row.sku?.trim()||(typeof old?.sku==='string'?old.sku.trim():'');
  if(row.sku&&state.products.some((/** @type {any} */ product)=>product.globalId!==globalId&&String(product.sku||'').trim()===row.sku))fail('DUPLICATE_BARCODE','This barcode is already assigned to another product');
  assertAmount(row.price);assertAmount(row.cost);if((row.categoryId!==null&&row.categoryId!==undefined))row.categoryId=byGlobal(state,'categories',row.categoryId).id;if(!old){row.stocks=Object.fromEntries(state.warehouses.map((/** @type {any} */ w)=>[w,0]));row.qty=0;state.opening.stocks[row.id]=copy(row.stocks);}
 }
 if(collection==='parties'){if(!['customer','supplier'].includes(row.type)||old&&row.type!==old.type)fail('INVALID_PARTY_TYPE','Cannot change party type');if(old&&fields.openingBalance!==undefined)fail('INVALID_ENTITY_FIELD','Opening balance is only set when creating a party');if(!old){row.balance=assertAmount(fields.openingBalance||0,-1e14);state.opening.parties[row.id]=row.balance;delete row.openingBalance;}}
 if(collection==='accounts'){if(old&&fields.openingBalance!==undefined)fail('INVALID_ENTITY_FIELD','Use an opening-balance correction document');if(!old){row.balance=assertAmount(fields.openingBalance||0,-1e14);row.openingBalance=row.balance;row.active??=true;state.opening.accounts[row.id]=row.balance;}}
 if(collection==='categories'&&state.categories.some((/** @type {any} */ c)=>c.id!==row.id&&c.name.toLocaleLowerCase()===row.name.toLocaleLowerCase()))fail('DUPLICATE_NAME','Category names must be unique');
 if(old)state[collection][state[collection].indexOf(old)]=row;else state[collection].push(row);registerLocalIdentity(state,collection,row);
 if(!old&&collection==='products')context[productCreationContext]?.add(globalId);
 return {globalId,localId:row.id,version:row.syncVersion};
}
function applyArchive(/** @type {any} */ state,/** @type {any} */ command,/** @type {any} */ context){
 const {collection,globalId,archived}=command.payload;if(!['products','parties','accounts'].includes(collection)||typeof archived!=='boolean')fail('INVALID_ENTITY','Invalid archive target');const row=byGlobal(state,collection,globalId);checkVersion(row,command.expectedVersion);requireCapability(context,entityCapability(collection,row,archived?'delete':'edit'));
 if(archived&&collection==='parties'&&Math.abs(row.balance)>.005)fail('OUTSTANDING_BALANCE','A party with an outstanding balance cannot be archived');if(archived&&collection==='accounts'&&(row.id===1||row.balance!==0))fail('OUTSTANDING_BALANCE','The primary cash account or an account with a balance cannot be archived');row.archived=archived;if(!archived&&collection==='accounts')row.active=true;row.syncVersion++;return {globalId,localId:row.id,version:row.syncVersion};
}
function applyWarehouse(/** @type {any} */ state,/** @type {any} */ command,/** @type {any} */ context){
 const {globalId,name,archived,isDefault}=command.payload,oldName=state.warehouses.find((/** @type {any} */ w)=>state.warehouseMeta[w].globalId===globalId),meta=oldName?state.warehouseMeta[oldName]:null;
 requireCapability(context,archived===true?'warehouses.delete':oldName?'warehouses.edit':'warehouses.create');if(meta)checkVersion(meta,command.expectedVersion);if(!safeKey(globalId)||typeof name!=='string'||!safeKey(name)||name.length>120||state.warehouses.some((/** @type {any} */ w)=>w===name&&w!==oldName))fail('INVALID_WAREHOUSE','Invalid or duplicate warehouse name');
 if(archived&&(state.salesWarehouse===oldName||state.products.some((/** @type {any} */ p)=>(p.stocks[oldName]||0)!==0)))fail('WAREHOUSE_NOT_EMPTY','Default or nonempty warehouse cannot be archived');
 if(oldName&&oldName!==name){state.warehouses=state.warehouses.map((/** @type {any} */ w)=>w===oldName?name:w);for(const p of state.products){p.stocks[name]=p.stocks[oldName]||0;delete p.stocks[oldName];if(p.openingWarehouse===oldName)p.openingWarehouse=name;}for(const stocks of Object.values(state.opening.stocks)){stocks[name]=stocks[oldName]||0;delete stocks[oldName];}const rename=(/** @type {any} */ r)=>{for(const key of ['warehouse','from','toWarehouse','openingWarehouseBefore','openingWarehouseAfter'])if(r[key]===oldName)r[key]=name;for(const l of r.lines||[])if(l.warehouse===oldName)l.warehouse=name;for(const prior of r.revisions||[])rename(prior);};for(const r of state.records)rename(r);for(const e of state.stockEvents||[])if(e.warehouseId===oldName)e.warehouseId=name;for(const key of ['warehouse','salesWarehouse'])if(state[key]===oldName)state[key]=name;delete state.warehouseMeta[oldName];}
 if(!oldName){state.warehouses.push(name);for(const p of state.products)p.stocks[name]=0;for(const stocks of Object.values(state.opening.stocks))stocks[name]=0;}
 state.warehouseMeta[name]={...meta,globalId,archived:archived??meta?.archived??false,syncVersion:(meta?.syncVersion||0)+1};if(isDefault){if(state.warehouseMeta[name].archived)fail('ARCHIVED_REFERENCE','Default warehouse must be active');state.salesWarehouse=name;}syncQuantities(state);return {globalId,name,version:state.warehouseMeta[name].syncVersion};
}
function applySettings(/** @type {any} */ state,/** @type {any} */ command,/** @type {any} */ context){
 requireCapability(context,'settings.branding.manage');const {fields}=command.payload,allowed=['branding','brandInfo','currency'];if(!fields||Object.keys(fields).some((/** @type {any} */ k)=>!allowed.includes(k)))fail('INVALID_SETTINGS','Settings command cannot alter financial data');
 if(fields.currency){const c=fields.currency;if(!/^[A-Z]{3}$/.test(c.code)||!Array.isArray(c.availableCodes)||c.availableCodes.length>30||c.availableCodes.some((/** @type {any} */ v)=>!/^[A-Z]{3}$/.test(v)))fail('INVALID_CURRENCY','Invalid currency code');}
 if((fields.branding!==null&&fields.branding!==undefined)&&(typeof fields.branding!=='string'||!fields.branding.trim()||fields.branding.length>200))fail('INVALID_SETTINGS','Invalid shop name');
 Object.assign(state,copy(fields));return {updated:Object.keys(fields)};
}
/** @returns {{state:any,result:any}} */
export function domainApply(/** @type {any} */ input,/** @type {any} */ command,/** @type {any} */ context){
 let state=copy(input);validateLocalIdentityMap(state);assertScope(state,command,context);let result;
 if(!/^\d{4}-\d{2}-\d{2}T/.test(command.occurredAt||'')||!Number.isFinite(Date.parse(command.occurredAt)))fail('INVALID_COMMAND','Immutable command timestamp required');
 context={...context,now:command.occurredAt};
 if(command.kind==='batch'){
  const parts=command.payload.commands;if(!Array.isArray(parts)||!parts.length||parts.length>30||parts.some((/** @type {any} */ part)=>!part||part.kind==='batch'||Object.keys(part).some((/** @type {any} */ k)=>!['kind','payload','expectedVersion'].includes(k))))fail('INVALID_COMMAND','Invalid atomic business action');
  const batchContext={...context,[productCreationContext]:new Set()},results=[];for(const part of parts){const applied=domainApply(state,{...command,...part},batchContext);state=applied.state;results.push(applied.result);}return {state,result:{results}};
 }
 if(command.kind.startsWith('record.')){if(!['record.post','record.edit','record.void'].includes(command.kind))fail('INVALID_COMMAND','Unknown record command');result=applyRecord(state,command,context);}
 else if(command.kind==='entity.upsert')result=applyEntity(state,command,context);
 else if(command.kind==='entity.archive')result=applyArchive(state,command,context);
 else if(command.kind==='warehouse.upsert')result=applyWarehouse(state,command,context);
 else if(command.kind==='settings.update')result=applySettings(state,command,context);
 else if(command.kind==='category.delete'){requireCapability(context,'products.edit');const row=byGlobal(state,'categories',command.payload.globalId);checkVersion(row,command.expectedVersion);state.categories=state.categories.filter((/** @type {any} */ c)=>c!==row);for(const p of state.products)if(p.categoryId===row.id)p.categoryId=null;result={globalId:row.globalId,deleted:true};}
 else fail('INVALID_COMMAND','Unknown semantic command');
 checkFinancialState(state);return {state,result};
}
// Native authorization compares only business state. UI selection/drafts and audit
// display caches are not authority and never become server commands themselves.
export function financialProjection(/** @type {any} */ state){const projected=Object.fromEntries(['originId','syncScope','products','parties','accounts','records','warehouses','warehouseMeta','opening','categories','currency','sequences','salesWarehouse','branding','brandInfo','stockEvents','stockEventSequence','localIdentityMap'].filter((/** @type {any} */ k)=>state[k]!==undefined).map((/** @type {any} */ k)=>[k,state[k]]));projected.products=state.products.map((/** @type {any} */ p)=>{const row={...p};delete row.qty;return row;});return projected;}
export function verifyFinancialSave(/** @type {any} */ current,/** @type {any} */ submitted,/** @type {any} */ command,/** @type {any} */ context){const applied=domainApply(current,command,context);if(canonical(financialProjection(applied.state))!==canonical(financialProjection(submitted)))fail('DERIVED_STATE_MISMATCH','Submitted accounting state is not the result of its semantic command');return applied;}
