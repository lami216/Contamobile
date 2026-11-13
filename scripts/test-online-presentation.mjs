import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {OnlineDatabase} from '../approved-runtime/online-database.mjs';
import {isOnlinePresentationAction} from '../approved-runtime/online-runtime.mjs';
import {emptyState} from '../approved-runtime/platform/shared/accounting-domain.mjs';
const clone=structuredClone,scope={organizationId:'org',branchId:'branch',originId:'origin'};
function fixture(){
 const context={organization:{id:'org'},member:{id:'member',role:'org-admin',capabilities:['*'],branchIds:['branch'],membershipVersion:1},branches:[{id:'branch',originId:'origin'}]};let response,hold;
 const state=emptyState(scope),db=new OnlineDatabase(context,async(command)=>{if(command==='online-status'){if(response instanceof Error)throw response;return clone(response||context);}if(hold)await hold;return {...scope,mode:'online',epoch:1,cursor:0,state:clone(state)};});
 return {db,state,context,setResponse:v=>response=v,setHold:v=>hold=v};
}
test('presentation allowlist never includes financial/editor/unknown actions',()=>{
 for(const action of ['go:home','go:inventory','go:reports','ledger:12','invoice:4','back','list-page:next:%5B1%5D','table-sort:0:1'])assert.equal(isOnlinePresentationAction(action),true,action);
 for(const action of ['go:backup','new:sale','post-sale','save-product','site:save-account','site:feature:currency-save','site:archive-product:2','pos:add:1','unexpected'])assert.equal(isOnlinePresentationAction(action),false,action);
});
test('presentation requires a verified scoped projection, sane cursor and native admission age',async()=>{
 const {db}=fixture();await db.open();assert.equal(db.canPresent(),false);await db.status();assert.equal(db.canPresent(),true);
 for(const [field,value]of [['cursor',undefined],['epoch',0],['cachedScope','foreign']]){const old=db[field];db[field]=value;assert.equal(db.canPresent(),false,field);db[field]=old;}
 db.verifiedAt=performance.now()-14001;assert.equal(db.canPresent(),false);
});
test('recent native status reuse cannot restart a presentation lease or ignore signed expiry',async()=>{
 const f=fixture();await f.db.open();await f.db.status();const checked=f.db.verifiedAt;await f.db.status(true);assert.equal(f.db.verifiedAt,checked);
 f.db.context.entitlement={payload:{expiresAt:new Date(Date.now()-1).toISOString()}};assert.equal(f.db.canPresent(),false);const late=fixture();await late.db.open();await late.db.status();let release;late.db.transport=()=>new Promise(r=>release=r);const checking=late.db.status();late.db.disconnect();release(late.context);await assert.rejects(checking,/ONLINE_REQUIRED/);assert.equal(late.db.connected,false);
});
test('role changes and definite revocation clear old privileged read projections',async()=>{
 for(const mode of ['role','revoked']){const f=fixture();await f.db.open();await f.db.status();f.setResponse(mode==='role'?{...f.context,member:{...f.context.member,role:'sales',capabilities:['pos.view'],membershipVersion:2},protocolCapabilities:{salesViewVersion:1}}:Object.assign(Error('REVOKED'),{code:'REVOKED'}));await f.db.status().catch(()=>{});assert.equal(f.db.cachedState,null);assert.equal(f.db.remoteState,null);assert.equal(f.db.canPresent(),false);}
});
test('background reads completing after editor entry do not adopt or overwrite drafts',async()=>{
 const f=fixture();await f.db.open();await f.db.status();const old=JSON.stringify(f.db.cachedState);let release;f.setHold(new Promise(r=>release=r));f.db.canAdoptBackground=()=>false;const pending=f.db.refresh(false,true);f.state.branding='new';release();await pending;assert.equal(JSON.stringify(f.db.cachedState),old);assert.equal(f.db.lastRefreshChanged,false);
});
test('late background snapshots cannot replace a newer financial revision or branch scope',async()=>{
 for(const change of ['revision','branch','disconnect']){const f=fixture();await f.db.open();await f.db.status();const old=JSON.stringify(f.db.cachedState);let release;f.setHold(new Promise(r=>release=r));const pending=f.db.refresh(false,true);if(change==='revision')f.db.revision++;else if(change==='disconnect')f.db.disconnect();else f.db.branchId='another';release();await pending.catch(()=>{});assert.equal(JSON.stringify(f.db.cachedState),old);}
});
const engine=await readFile(new URL('../approved-runtime/engine.js',import.meta.url),'utf8'),start=engine.indexOf('inventory=function(...args){\n const all=S.products'),end=engine.indexOf('\ntable13=function',start),inventorySource=engine.slice(start,end);
function inventoryHarness(){
 const products=Array.from({length:137},(_,i)=>({id:i+1,name:'Product '+i,sku:'',qty:i,cost:200-i,archived:false})),state={products,records:[{id:1,total:71}],accounts:[{id:1,balance:57}]},page=new Map(),sorts=new Map(),windows=[];
 const context={S:state,search:'',inventoryTab:'products',LIST_PAGE_SIZE:50,listWindowPages:page,listWindowSorts:sorts,listWindowPending:null,listWindowKey:()=> 'key',listWindowSortKey:()=> 'sort',searchMatches:()=>true,compareValues19:(a,b,d)=>(typeof a==='number'?a-b:String(a).localeCompare(String(b)))*(d==='desc'?-1:1),arrangeWarehouseContent:x=>x,listInventoryBefore:()=>JSON.stringify(state.products.filter(p=>context.inventoryTab!=='low'||p.qty<=10).map(p=>p.id)),boundedTableHtml:html=>{windows.push({ids:JSON.parse(html),total:context.listWindowPending?.total});return html;}};vm.runInNewContext(inventorySource,context);return {context,state,products,page,sorts,windows};
}
test('inventory formats only the selected page but preserves exact full-state identity on success and throw',()=>{
 const h=inventoryHarness(),before=JSON.stringify(h.state);assert.equal(typeof h.context.inventory(),'string');assert.equal(h.windows[0].ids.length,50);assert.equal(h.windows[0].total,137);assert.equal(JSON.stringify(h.state),before);assert.equal(h.state.products,h.products);assert.equal(h.context.listWindowPending,null);
 h.context.listInventoryBefore=()=>{throw Error('SYNTHETIC_RENDER_ERROR')};assert.throws(()=>h.context.inventory(),/SYNTHETIC_RENDER_ERROR/);assert.equal(JSON.stringify(h.state),before);assert.equal(h.state.products,h.products);assert.equal(h.context.listWindowPending,null);assert.doesNotMatch(inventorySource,/\bawait\b/);
});
test('inventory paging, full-list sorting, low-stock and upstream category scope retain every catalog row',()=>{
 const h=inventoryHarness();h.page.set('key',2);h.context.inventory();assert.deepEqual(h.windows.at(-1).ids,Array.from({length:50},(_,i)=>51+i));h.sorts.set('sort',{label:'سعر الشراء',direction:'asc'});h.page.set('key',1);h.context.inventory();assert.deepEqual(h.windows.at(-1).ids,h.products.slice().sort((a,b)=>a.cost-b.cost).slice(0,50).map(p=>p.id));
 h.context.inventoryTab='low';h.context.inventory();assert.deepEqual(h.windows.at(-1).ids,Array.from({length:11},(_,i)=>i+1));assert.equal(h.state.products.length,137);h.state.products=h.products.filter(p=>p.id%2===0);const category=h.state.products;h.context.inventoryTab='products';h.context.inventory();assert.equal(h.state.products,category);assert.equal(h.windows.at(-1).total,68);assert.ok(h.windows.at(-1).ids.every(id=>id%2===0));
});
