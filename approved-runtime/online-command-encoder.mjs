// Commands reuse the tested shared reducer/encoder from the iOS institution
// implementation; Android transport and online-only rights are independent.
import {canonical,domainApply,encodeRecordCommand,encodeVoidCommand,encodeEntityCommand,makeCommand,financialProjection} from './platform/shared/accounting-domain.mjs';
import {registerLocalIdentity} from './platform/shared/local-identities.mjs';
const clone=value=>structuredClone(value);
const part=c=>({kind:c.kind,payload:c.payload,...(c.expectedVersion===undefined?{}:{expectedVersion:c.expectedVersion})});
export function installOnlineEncoder(api){
 const database=api.database;let tx=null,confirmIntent=null;const baselines=new Map();let warehouseBaseline=null;
 const context=()=>({organizationId:database.context.organization.id,branchId:database.branchId,memberId:database.context.member.id,role:database.context.member.role,capabilities:database.context.member.capabilities,branchIds:database.context.member.branchIds,epoch:database.epoch});
 const options=more=>({...context(),operationId:tx.operationId,occurredAt:tx.occurredAt,...more});
 const baseline=(collection,row)=>row?baselines.get(collection+':'+row.globalId)||{expectedVersion:row.syncVersion}:{};
 const originalCommit=api.commitRecord();
 api.commitRecord(record=>{
  if(!tx)return originalCommit(record);
  const before=clone(api.state()),old=before.records.find(r=>r.id===record.id),sequence=old?.sequence||record.sequence||Math.max(before.sequences?.[record.kind]||0,0,...before.records.filter(r=>r.kind===record.kind).map(r=>r.sequence||0))+1;
  const number=old?.number||`AND-${tx.operationId.slice(0,8)}-${record.kind.toUpperCase()}-${sequence}`;
  const prepared={...clone(record),number,sequence,globalId:old?.globalId||record.globalId||crypto.randomUUID(),lines:(record.lines||[]).map(line=>({...line,...(['sale','purchase'].includes(record.kind)?{costAtSale:line.costAtSale??before.products.find(p=>p.id===line.product)?.cost}:{})}))};
  const command=encodeRecordCommand(before,prepared,options({entityGlobalId:prepared.globalId,documentNumber:number,...baseline('records',old)}));
  const result=originalCommit(prepared);if(result)tx.parts.push(part(command));return result;
 });
 function remember(action,state){
  let collection,id;
  if(action.startsWith('source:')){collection='records';id=Number(action.split(':')[1]);}
  else if(action.startsWith('void:')){collection='records';id=Number(action.split(':')[1]);}
  else if(action==='open:productedit'){collection='products';id=api.selected();}
  else if(action==='open:partyedit'){collection='parties';id=api.selected();}
  else if(action.startsWith('site:edit-account:')){collection='accounts';id=Number(action.split(':').at(-1));}
  else if(action.startsWith('site:feature:category-edit:')){collection='categories';id=Number(action.split(':').at(-1));}
  else if(action.startsWith('warehouse-edit:')){const meta=state.warehouseMeta[action.slice('warehouse-edit:'.length)];warehouseBaseline=meta?{globalId:meta.globalId,expectedVersion:meta.syncVersion}:null;}
  else if(action==='warehouse-create')warehouseBaseline=null;
  const row=collection?state[collection].find(r=>r.id===id):null;if(row)baselines.set(collection+':'+row.globalId,{expectedVersion:row.syncVersion,epoch:database.epoch});
 }
 function begin(action){
  let fields={};try{fields=api.form(action==='save-branding'?'branding-form':undefined);}catch{}
  tx={action,before:clone(api.state()),parts:[],operationId:crypto.randomUUID(),occurredAt:new Date().toISOString(),form:fields,modal:api.modal(),selected:api.selected(),partyType:api.partyType(),saleType:api.saleType(),warehouseEdit:api.warehouseEdit(),knownRecords:new Set(api.state().records.map(r=>r.id)),saveFailed:false};
  if(action==='confirm-void'){const r=tx.before.records.find(r=>r.id===tx.selected);if(r)tx.parts.push(part(encodeVoidCommand(tx.before,r,options(baseline('records',r)))));}
  const intent=/^site:feature:(party-archive|warehouse-archive|category-delete):(.+)$/.exec(action);
  if(intent){const [,kind,id]=intent,state=tx.before;
   if(kind==='party-archive'){const row=state.parties.find(p=>p.id===Number(id));confirmIntent=part(makeCommand('entity.archive',{collection:'parties',globalId:row.globalId,archived:true},options({expectedVersion:row.syncVersion})));}
   if(kind==='category-delete'){const row=state.categories.find(p=>p.id===Number(id));confirmIntent=part(makeCommand('category.delete',{globalId:row.globalId},options({expectedVersion:row.syncVersion})));}
   if(kind==='warehouse-archive'){const name=decodeURIComponent(id),meta=state.warehouseMeta[name];confirmIntent=part(makeCommand('warehouse.upsert',{globalId:meta.globalId,name,archived:true},options({expectedVersion:meta.syncVersion})));}
  }
  if(/^site:feature:warehouse-(default|restore):/.test(action)){const name=decodeURIComponent(action.split(':').at(-1)),meta=tx.before.warehouseMeta[name];tx.parts.push(part(makeCommand('warehouse.upsert',{globalId:meta.globalId,name,...(action.includes('default')?{isDefault:true}:{archived:false})},options({expectedVersion:meta.syncVersion}))));}
 }
 function metadata(submitted){
  const {action,form:f,before}=tx,parts=tx.parts.slice();
  const entity=(collection,id,fields)=>{
   const row=id?before[collection].find(r=>r.id===id):null,live=id?submitted[collection].find(r=>r.id===id):submitted[collection].find(r=>!before[collection].some(old=>old.id===r.id));
   if(!live)throw Error('SEMANTIC_ENTITY_MISSING');const globalId=row?.globalId||crypto.randomUUID();live.globalId=globalId;live.syncVersion=row?.syncVersion||1;
   const command=encodeEntityCommand(before,collection,{...fields,...(row?{id:row.id}:{globalId})},options({entityGlobalId:globalId,...baseline(collection,row)}));parts.push(part(command));return {row,live,command};
  };
  if(action==='save-product'){
   const product=entity('products',tx.modal==='productedit'?tx.selected:null,{name:f.name?.trim(),price:Number(f.price),cost:Number(f.cost),sku:f.sku?.trim()||(tx.modal==='productedit'?before.products.find(p=>p.id===tx.selected)?.sku:`AUTO-AND-${tx.operationId}`),expiry:f.expiry||'',note:f.note?.trim()||'',categoryId:f.categoryId?Number(f.categoryId):null});
   if(!product.row&&Number(f.qty)>0){
    const interim=domainApply(before,product.command,context()).state,created=interim.products.find(p=>p.globalId===product.live.globalId),r=submitted.records.find(r=>r.openingStock&&!tx.knownRecords.has(r.id)&&r.lines.some(l=>l.product===product.live.id));
    if(!r)throw Error('OPENING_DOCUMENT_REQUIRED');r.globalId=crypto.randomUUID();r.number=`AND-${tx.operationId.slice(0,8)}-OPEN`;r.syncVersion=1;
    const record={...clone(r),lines:r.lines.map(l=>({...l,product:created.id}))};parts.push(part(encodeRecordCommand(interim,record,options({entityGlobalId:r.globalId,documentNumber:r.number}))));
   }
  }else if(action==='save-party'||action==='pos:save-party')entity('parties',tx.modal==='partyedit'?tx.selected:null,{name:f.name?.trim(),phone:f.phone?.trim()||'',type:action==='pos:save-party'?(tx.saleType==='purchase'?'supplier':'customer'):tx.partyType,balance:0});
  else if(action==='save-account')entity('accounts',null,{name:f.name?.trim(),balance:Number(f.balance)||0,openingBalance:Number(f.balance)||0,active:true});
  else if(action==='site:save-account')entity('accounts',tx.selected,{name:f.name?.trim()});
  else if(action==='save-branding')parts.push(part(makeCommand('settings.update',{fields:{branding:submitted.branding,brandInfo:submitted.brandInfo}},options())));
  else if(action==='save-warehouse')parts.push(part(makeCommand('warehouse.upsert',{globalId:warehouseBaseline?.globalId||crypto.randomUUID(),name:f.name?.trim()},options(warehouseBaseline?{expectedVersion:warehouseBaseline.expectedVersion}:{}))));
  else if(action==='site:feature:currency-save')parts.push(part(makeCommand('settings.update',{fields:{currency:submitted.currency}},options())));
  else if(action==='site:feature:category-save'){const target=submitted.categories.find(c=>c.name===f.categoryName?.trim());if(!target)throw Error('SEMANTIC_ENTITY_MISSING');entity('categories',before.categories.some(c=>c.id===target.id)?target.id:null,{name:target.name});}
  else if(action.startsWith('site:feature:account-toggle:')){const id=Number(action.split(':').at(-1)),row=before.accounts.find(a=>a.id===id);entity('accounts',id,{name:row.name,active:row.active===false});}
  else if(/^(site:archive-product:|site:archive-account:|site:unarchive:|site:feature:party-restore:)/.test(action)){
   const collection=action.startsWith('site:archive-product:')?'products':action.startsWith('site:archive-account:')?'accounts':action.startsWith('site:unarchive:')?(action.split(':')[2]==='product'?'products':'accounts'):'parties',id=Number(action.split(':').at(-1)),row=before[collection].find(r=>r.id===id);
   parts.push(part(makeCommand('entity.archive',{collection,globalId:row.globalId,archived:action.includes('archive-')&&!action.includes('unarchive')},options({expectedVersion:row.syncVersion}))));
  }else if(action==='site:feature:confirm'){if(!confirmIntent)throw Error('SEMANTIC_INTENT_REQUIRED');parts.push(confirmIntent);confirmIntent=null;}
  return parts;
 }
 database.prepareSave=async submitted=>{
  if(!tx)throw Error('SEMANTIC_ACTION_REQUIRED');const parts=metadata(submitted);
  if(!parts.length){if(canonical(financialProjection(tx.before))!==canonical(financialProjection(submitted)))throw Error('SEMANTIC_COMMAND_REQUIRED');return {nonFinancial:true};}
  const command=makeCommand(parts.length===1?parts[0].kind:'batch',parts.length===1?parts[0].payload:{commands:parts},options({expectedVersion:parts.length===1?parts[0].expectedVersion:undefined}));
  // Preserve numeric UI references across the authoritative refresh. This is an
  // identity reservation only; submitted balances never become confirmed data.
  for(const collection of ['products','parties','accounts','records','categories'])for(const row of submitted[collection]||[])registerLocalIdentity(submitted,collection,row);
  return {command,localView:submitted};
 };
 database.onSaveFailure=()=>{if(tx)tx.saveFailed=true;};
 function finish(){const done=tx;tx=null;if(!done)return;remember(done.action,done.before);if(!done.saveFailed)return;api.restoreForm(done);}
 return {begin,finish,reviewed(){baselines.clear();warehouseBaseline=null;confirmIntent=null;}};
}
