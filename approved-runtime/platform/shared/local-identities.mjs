/* A phone's stable numeric UI identities are distinct from the server's numeric
 * projections. Global IDs remain the only identities carried by commands. */
const collections=['products','parties','accounts','records','categories'];
const object=(/** @type {any} */ value)=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const safeKey=(/** @type {any} */ value)=>typeof value==='string'&&value.length>0&&value.length<=500&&!['__proto__','constructor','prototype'].includes(value);
const numeric=(/** @type {any} */ value)=>Number.isSafeInteger(value)&&value>=1;
const clone=(/** @type {any} */ value)=>JSON.parse(JSON.stringify(value));
function reject(/** @type {string} */ message){const error=/** @type {Error & {code?:string}} */(new Error(message));error.code='LOCAL_IDENTITY_INVALID';throw error;}
/** @returns {Record<string,any>} */
function scope(/** @type {any} */ state){if(!safeKey(state?.originId)||!safeKey(state?.syncScope?.organizationId)||!safeKey(state?.syncScope?.branchId))reject('A local identity map requires a complete accounting branch identity');return {originId:state.originId,organizationId:state.syncScope.organizationId,branchId:state.syncScope.branchId};}
/** Validate the protected map, including retired identifiers absent from rows.
 * @param {any} state @returns {any} */
export function validateLocalIdentityMap(state){
 const map=state.localIdentityMap;if(map===undefined)return null;
 const expected=scope(state);if(!object(map)||map.version!==1||!object(map.collections)||Object.keys(map).some(key=>!['version','originId','organizationId','branchId','collections','canonicalRecords','pendingRecordOrder'].includes(key))||Object.keys(map.collections).some(key=>!collections.includes(key))||Object.entries(expected).some(([key,value])=>map[key]!==value))reject('The local identity map belongs to another branch or version');
 for(const collection of collections){const rows=map.collections[collection];if(!object(rows))reject('The local identity map is incomplete');const ids=new Set();for(const [globalId,localId]of Object.entries(rows)){if(!safeKey(globalId)||!numeric(localId)||ids.has(localId))reject('Local identity reservations must be distinct positive integers');ids.add(localId);}for(const entity of state[collection]||[])if(!safeKey(entity.globalId)||!numeric(entity.id)||rows[entity.globalId]!==entity.id)reject('An accounting row differs from its protected local identity');}
 for(const key of ['canonicalRecords','pendingRecordOrder']){if(map[key]===undefined)continue;if(!object(map[key]))reject('Invalid protected record ordering');const canonicalIds=new Set();for(const [globalId,order]of Object.entries(map[key])){if(!safeKey(globalId)||!numeric(order)||map.collections.records[globalId]===undefined||key==='canonicalRecords'&&canonicalIds.has(order))reject('Invalid protected record ordering');canonicalIds.add(order);}}
 return map;
}
/** Allocate without reusing a deleted/remote identity. Existing reservations
 * also preserve a locally pending entity when it is replayed after a pull.
 * @param {any} state @param {string} collection @param {string} globalId */
export function allocateLocalId(state,collection,globalId){
 if(!collections.includes(collection)||!safeKey(globalId))reject('Invalid local entity allocation');
 const map=state.localIdentityMap;let maximum=collection==='records'?100:0;
 for(const row of state[collection]||[])if(numeric(row.id))maximum=Math.max(maximum,row.id);else reject('A numeric local entity identifier is invalid');
 if(map!==undefined){const reservations=map.collections[collection],reserved=reservations[globalId];if(reserved!==undefined){if(!numeric(reserved)||(state[collection]||[]).some((/** @type {any} */ row)=>row.id===reserved&&row.globalId!==globalId))reject('A reserved local identity was reused');return reserved;}for(const localId of Object.values(reservations))maximum=Math.max(maximum,/** @type {number} */(localId));}
 if(!Number.isSafeInteger(maximum+1))reject('The local identifier range is exhausted');return maximum+1;
}
/** @param {any} state @param {string} collection @param {any} row @param {any} localSequence */
export function registerLocalIdentity(state,collection,row,localSequence=undefined){
 if(state.localIdentityMap===undefined)return;
 const reservations=state.localIdentityMap.collections[collection];if(!safeKey(row.globalId)||!numeric(row.id))reject('Cannot register an incomplete local identity');
 if(reservations[row.globalId]!==undefined&&reservations[row.globalId]!==row.id||Object.entries(reservations).some(([globalId,localId])=>globalId!==row.globalId&&localId===row.id))reject('A local identity reservation cannot be reassigned');reservations[row.globalId]=row.id;
 if(collection==='records'){const map=state.localIdentityMap;map.canonicalRecords??={};map.pendingRecordOrder??={};if(map.canonicalRecords[row.globalId]===undefined&&map.pendingRecordOrder[row.globalId]===undefined)map.pendingRecordOrder[row.globalId]=numeric(localSequence)?localSequence:row.id;}
}
/** Numeric UI IDs must never change chronological accounting decisions. Known
 * receipts follow server order; unconfirmed creations follow the durable outbox.
 * @param {any} state @param {any} a @param {any} b */
export function compareRecordOrder(state,a,b){
 const map=state.localIdentityMap;if(map===undefined)return a.id-b.id;
 const canonical=map.canonicalRecords||{},left=canonical[a.globalId],right=canonical[b.globalId];
 if(left!==undefined&&right!==undefined)return left-right;if(left!==undefined)return -1;if(right!==undefined)return 1;
 return (map.pendingRecordOrder?.[a.globalId]??a.id)-(map.pendingRecordOrder?.[b.globalId]??b.id)||a.id-b.id;
}
/** Make a new UI projection. Neither confirmed server state nor the previous
 * view is mutated. All known mappings, including retired categories, survive.
 * @param {any} serverState @param {any} previousView @returns {any} */
export function materializeLocalView(serverState,previousView){
 const identity=scope(serverState),view=clone(serverState);delete view.localIdentityMap;
 if(previousView&&Object.entries(identity).some(([key,value])=>scope(previousView)[key]!==value))reject('Cannot materialize a different accounting branch into this phone view');
 const prior=previousView?validateLocalIdentityMap(previousView):null;
 /** @type {any} */const map={version:1,...identity,collections:{},canonicalRecords:{},pendingRecordOrder:clone(prior?.pendingRecordOrder||{})};
 /** @type {Record<string,Map<number,string>>} */const source={};
 /** @type {Record<string,Map<string,number>>} */const targets={};
 for(const collection of collections){
  /** @type {Record<string,number>} */const reservations={};const used=new Map();let maximum=collection==='records'?100:0;
  const reserve=(/** @type {string} */ globalId,/** @type {number} */ localId)=>{if(!safeKey(globalId)||!numeric(localId)||reservations[globalId]!==undefined&&reservations[globalId]!==localId||used.has(localId)&&used.get(localId)!==globalId)reject('A previous local identity is ambiguous');reservations[globalId]=localId;used.set(localId,globalId);maximum=Math.max(maximum,localId);};
  for(const [globalId,localId]of Object.entries(prior?.collections[collection]||{}))reserve(globalId,/** @type {number} */(localId));
  for(const row of previousView?.[collection]||[])reserve(row.globalId,row.id);
  source[collection]=new Map();targets[collection]=new Map();const globals=new Set();
  if(!Array.isArray(view[collection]))reject('The accounting view is missing an identity collection');
  for(const row of view[collection]){
   if(!safeKey(row.globalId)||!numeric(row.id)||source[collection].has(row.id)||globals.has(row.globalId))reject('The server projection has duplicate or invalid entity identities');globals.add(row.globalId);source[collection].set(row.id,row.globalId);
   if(reservations[row.globalId]===undefined){if(!Number.isSafeInteger(maximum+1))reject('The local identifier range is exhausted');reserve(row.globalId,maximum+1);}
   targets[collection].set(row.globalId,reservations[row.globalId]);if(collection==='records')map.canonicalRecords[row.globalId]=row.id;
  }
  map.collections[collection]=reservations;
 }
 for(const row of previousView?.records||[])if(map.canonicalRecords[row.globalId]===undefined&&map.pendingRecordOrder[row.globalId]===undefined)map.pendingRecordOrder[row.globalId]=row.id;
 const reference=(/** @type {string} */ collection,/** @type {any} */ value,/** @type {any} */ hint=undefined)=>{
  if(value===undefined||value===null)return value;const globalId=hint===undefined?source[collection].get(typeof value==='string'&&/^[1-9][0-9]*$/.test(value)?Number(value):value):hint;
  if(!safeKey(globalId)||map.collections[collection][globalId]===undefined)reject('An accounting reference has no stable entity identity');return map.collections[collection][globalId];
 };
 /** @type {Map<string,string>} */const warehouseNames=new Map();
 for(const name of view.warehouses||[]){const globalId=view.warehouseMeta?.[name]?.globalId;if(!safeKey(globalId)||warehouseNames.has(globalId))reject('Warehouse identities must be complete and distinct');warehouseNames.set(globalId,name);}
 const warehouse=(/** @type {any} */ name)=>{if(name===undefined||name===null)return name;if(view.warehouseMeta?.[name])return name;const globalId=previousView?.warehouseMeta?.[name]?.globalId;return warehouseNames.get(globalId)??name;};
 const record=(/** @type {any} */ row,/** @type {any} */ inherited=undefined,/** @type {number} */ depth=0)=>{
  if(depth>100)reject('Invoice history nesting is too deep');if(!object(row))reject('An invoice history entry is invalid');
  const globalId=row.globalId||inherited;if(row.id!==undefined)row.id=reference('records',row.id,globalId);
  for(const key of ['party','otherParty'])if(row[key]!==undefined)row[key]=reference('parties',row[key]);
  for(const key of ['account','to'])if(row[key]!==undefined)row[key]=reference('accounts',row[key]);
  if(row.openingProduct!==undefined)row.openingProduct=reference('products',row.openingProduct);
  if(row.sourceRecord!==undefined)row.sourceRecord=reference('records',row.sourceRecord);
  for(const key of ['warehouse','from','toWarehouse','openingWarehouseBefore','openingWarehouseAfter'])if(row[key]!==undefined)row[key]=warehouse(row[key]);
  for(const line of row.lines||[]){line.product=reference('products',line.product);if(line.warehouse!==undefined)line.warehouse=warehouse(line.warehouse);}
  for(const revision of row.revisions||[])record(revision,globalId,depth+1);
 };
 // References still use server numeric IDs at this point; remap those before
 // changing top-level entity IDs. Foreign desktop/provenance IDs are untouched.
 for(const product of view.products){if(product.categoryId!==undefined)product.categoryId=reference('categories',product.categoryId);if(product.openingWarehouse!==undefined)product.openingWarehouse=warehouse(product.openingWarehouse);}
 for(const row of view.records)record(row);
 if(view.lastSale)record(view.lastSale);
 if(view.opening){for(const [key,collection]of [['accounts','accounts'],['parties','parties'],['stocks','products']]){
  /** @type {Record<string,any>} */
  const mapped={};
  for(const [serverId,value]of Object.entries(view.opening[key]||{})){const localId=reference(collection,serverId);if(Object.hasOwn(mapped,localId))reject('Opening balances have colliding identities');mapped[localId]=value;}view.opening[key]=mapped;
 }}
 for(const event of view.stockEvents||[]){if(event.productId!==undefined){const next=reference('products',event.productId,event.productGlobalId);event.productId=typeof event.productId==='string'?String(next):next;}if(event.documentId!==undefined){const next=reference('records',event.documentId,event.documentGlobalId);event.documentId=typeof event.documentId==='string'?String(next):next;}if(event.warehouseId!==undefined)event.warehouseId=warehouse(event.warehouseId);}
 for(const collection of collections)for(const row of view[collection])row.id=targets[collection].get(row.globalId);
 // Warehouse selection belongs to the current phone, and follows a rename by
 // global identity. Shared salesWarehouse remains the server's business value.
 const selected=previousView?.warehouseMeta?.[previousView?.warehouse]?.globalId,selectedName=warehouseNames.get(selected);if(selectedName)view.warehouse=selectedName;
 if(previousView?.saleParty!==undefined){const previousParty=(previousView.parties||[]).find((/** @type {any} */ row)=>String(row.id)===String(previousView.saleParty));if(previousParty&&map.collections.parties[previousParty.globalId]!==undefined)view.saleParty=map.collections.parties[previousParty.globalId];else if(previousView.saleParty===null)view.saleParty=null;}
 else if(view.saleParty!==undefined)view.saleParty=reference('parties',view.saleParty);
 for(const product of view.products)product.qty=product.stocks?.[view.warehouse]||0;
 view.localIdentityMap=map;validateLocalIdentityMap(view);return view;
}
