// Archive-clearance commands adapted from Desktop 870 transaction-lifecycle.ts.
// These pure commands never save independently: the caller commits returned state once.
import {planStockChange,stockBalanceAfter,stockNumber} from './accounting-numbers.js';
const text=value=>typeof value==='string'?value.trim():'';
const same=(left,right)=>left!==null&&left!==undefined&&right!==null&&right!==undefined&&String(left)===String(right);
const posted=row=>row?.kind==='adjustment'&&row.productArchiveStockClearance===true&&!row.voided&&(row.status===undefined||row.status==='posted');
const archived=product=>Object.hasOwn(product,'archived')?product.archived===true:product.isArchived===true;
export const PRODUCT_ARCHIVE_STOCK_ZERO_REASON='تصفير المخزون المرتبط بأرشفة المنتج';
export function isArchiveStockClearance(record){return record?.kind==='adjustment'&&record.productArchiveStockClearance===true;}
export function productStockEntries(product){
 const entries=[];for(const [warehouse,raw]of Object.entries(product.stocks??{})){const quantity=Number(raw);if(!Number.isFinite(quantity))throw Error('مخزون المنتج يحتوي قيمة غير صالحة');if(Math.abs(quantity)>1e-9)entries.push([warehouse,quantity]);}return entries;
}
function failure(record,reason){return Object.assign(new Error(`لا يمكن عكس تصفير الأرشفة للسند ${text(record.number)||String(record.id)} (${record.id}) في المخزن ${record.warehouse||record.warehouseId||'غير محدد'}: ${reason}`),{status:409,code:'ARCHIVE_CLEARANCE_INVALID',documentId:record.id,documentReference:record.number});}
function groupId(record){const raw=record.productArchiveStockClearanceGroupId;if(raw!==undefined&&raw!==null&&typeof raw!=='string'||typeof raw==='string'&&raw!==raw.trim())throw failure(record,'مرجع مجموعة التصفير غير صالح');return text(raw);}
function recordProduct(record){const lines=Array.isArray(record.lines)?record.lines:[];return lines[0]?.product;}
function linkedProduct(record,product){return (Array.isArray(record.lines)?record.lines:[]).some(line=>same(line?.product,product.id))||same(record.productArchiveProductId,product.id)||same(record.productArchiveProductId,product.desktopId)||same(record.productArchiveCanonicalProductId,product.canonicalId);}
function sourceProductMatches(value,product){return value===null||value===undefined||same(value,product.id)||same(value,product.desktopId)||same(value,product.canonicalId);}
function sameLegacyBatch(left,right){const a=Date.parse(String(left.occurredAt??'')),b=Date.parse(String(right.occurredAt??''));return Number.isFinite(a)&&Number.isFinite(b)?Math.abs(a-b)<=5000:same(left.id,right.id);}
function warehouseName(state,record){if(typeof record.warehouse==='string')return record.warehouse;const row=Object.entries(state.warehouseMeta||{}).find(([,meta])=>[meta.id,meta._id,meta.desktopId,meta.canonicalId].some(id=>same(id,record.warehouseId)));return row?.[0];}
function audit(state,action,entityId,context,more={}){state.auditEvents??=[];state.auditEvents.push({id:crypto.randomUUID(),action,status:'committed',entityId:String(entityId),createdAt:context.now,actor:{id:context.actor?.id,name:context.actor?.name,principalType:context.actor?.role==='owner'?'owner':'user'},...more});}
function changeStock(state,product,warehouse,delta,record,revision,context,type){
 const plan=planStockChange(product,warehouse,delta,record);if(plan.after<0)throw failure(record,'الرصيد الحالي لا يسمح بعكس التصفير');
 product.stocks??={};product.stocks[warehouse]=plan.after;
 if(plan.after!==0&&state.warehouseMeta?.[warehouse]?.archived){state.warehouseMeta[warehouse].archived=false;state.warehouseMeta[warehouse].archivedAt=null;}
 state.stockEvents??=[];state.stockEventSequence=(state.stockEventSequence||0)+1;
 state.stockEvents.push({id:crypto.randomUUID(),productId:String(product.id),documentId:String(record.id),documentNumber:String(record.number),documentRevision:revision,warehouseId:warehouse,warehouseName:warehouse,productName:product.name,type,quantityDelta:delta,balanceBefore:plan.before,balanceAfter:plan.after,occurredAt:context.now,at:context.now,eventSequence:state.stockEventSequence});
 if(state.warehouse!==undefined)product.qty=Number(product.stocks[state.warehouse]||0);
}
const contextOf=options=>({now:options?.now||new Date().toISOString(),actor:options?.actor});
function result(state,productId,documentIds=[],changed=true){return {state,productId,documentIds,changed};}
function selectedProduct(state,id){const product=(state.products||[]).find(row=>same(row.id,id));if(!product)throw Object.assign(Error('المنتج غير موجود'),{status:404});return product;}
function nextRecordId(state){const id=Math.max(100,...state.records.map(row=>Number(row.id)||0))+1;if(!Number.isSafeInteger(id))throw Error('تعذر تخصيص معرّف مستند صالح');return id;}
function stockUnitCost(product){for(const value of [product.lastPurchaseCost,product.openingCost,product.legacyOpeningCost,product.pieceCost,product.cost]){const n=Number(value);if(Number.isFinite(n)&&n>=0)return n;}return 0;}
function zeroStock(state,product,group,context){
 const ids=[];for(const [warehouse,before]of productStockEntries(product)){
  if(!state.warehouses.includes(warehouse))throw Error('تعذر تصفير المخزون لأن أحد المخازن المرتبطة بالمنتج غير موجود');
  const id=nextRecordId(state),canonicalId='adjustment-'+crypto.randomUUID(),delta=-before,record={id,canonicalId,number:'ADJ-'+Date.parse(context.now)+'-'+crypto.randomUUID().slice(0,6),kind:'adjustment',revision:0,status:'posted',voided:false,occurredAt:context.now,createdAt:context.now,updatedAt:context.now,date:context.now.slice(0,10),time:context.now.slice(11,16),warehouse,party:null,account:null,total:0,paid:0,due:0,paidTotal:0,dueTotal:0,cashAmount:0,paymentMethod:null,title:PRODUCT_ARCHIVE_STOCK_ZERO_REASON,subtitle:PRODUCT_ARCHIVE_STOCK_ZERO_REASON,productArchiveStockClearance:true,productArchiveStockClearanceGroupId:group,productArchiveProductId:String(product.id),...(product.canonicalId||product.desktopId?{productArchiveCanonicalProductId:String(product.canonicalId||product.desktopId)}:{}),revisions:[],lines:[{id:'line-'+crypto.randomUUID(),product:product.id,name:product.name,description:`${product.name} — ${PRODUCT_ARCHIVE_STOCK_ZERO_REASON} (قبل ${before}، بعد 0)`,qty:Math.abs(delta),quantity:delta,delta,price:stockUnitCost(product),lineTotal:0,balanceBefore:before,balanceAfter:0}]};
  changeStock(state,product,warehouse,delta,record,0,context,'adjustment');state.records.unshift(record);ids.push(id);audit(state,'adjustment.post',id,context,{productArchiveStockClearance:true});
 }return ids;
}
export function archiveProductStock(input,productId,options={}){
 const state=structuredClone(input),product=selectedProduct(state,productId),context=contextOf(options);if(archived(product))throw Error('المنتج مؤرشف بالفعل');
 const entries=productStockEntries(product);if(entries.length&&options.zeroStock!==true)throw Object.assign(Error('المنتج يحتوي مخزونًا. أكد تصفير المخزون قبل الأرشفة.'),{status:409,code:'PRODUCT_ARCHIVE_STOCK_CONFIRMATION_REQUIRED',stock:entries.map(([warehouseId,quantity])=>({warehouseId,quantity}))});
 const group=entries.length?'archive-clearance-'+crypto.randomUUID():null,ids=entries.length?zeroStock(state,product,group,context):[];
 product.archived=product.isArchived=true;product.archivedAt=context.now;product.archiveStockClearanceGroupId=group;product.updatedAt=context.now;audit(state,'product.archive',product.id,context,{documentIds:ids});return result(state,product.id,ids);
}
export function zeroArchivedProductStock(input,productId,options={}){
 const state=structuredClone(input),product=selectedProduct(state,productId),context=contextOf(options);if(!archived(product))throw Error('تصفير المخزون بهذه العملية متاح للمنتج المؤرشف فقط');
 if(!productStockEntries(product).length)return result(state,product.id,[],false);
 const group='archive-clearance-'+crypto.randomUUID(),ids=zeroStock(state,product,group,context);product.archiveStockClearanceGroupId=group;product.updatedAt=context.now;audit(state,'product.stock-zero',product.id,context,{documentIds:ids});return result(state,product.id,ids);
}
function reverseOnState(state,request,context){
 const selected=request.documentId==null?null:state.records.find(row=>same(row.id,request.documentId)&&posted(row));
 if(request.documentId!=null&&!selected)throw Object.assign(Error('تصحيح تصفير مخزون الأرشفة غير موجود أو ملغى'),{status:404});
 const productId=request.productId??(selected?recordProduct(selected):null);if(productId==null){if(request.documentId!=null)throw Error('سند تصفير المخزون لا يحتوي مرجع المنتج');return result(state,null,[],false);}
 const product=selectedProduct(state,productId);if(selected&&!same(recordProduct(selected),product.id))throw failure(selected,'مرجع المنتج لا يطابق طلب الاستعادة');
 const all=state.records.filter(row=>posted(row)&&linkedProduct(row,product));if(!all.length)return result(state,product.id,[],false);
 const selectedGroup=selected?groupId(selected):'',group=selected?all.filter(row=>selectedGroup?groupId(row)===selectedGroup:!groupId(row)&&sameLegacyBatch(row,selected)):all;
 if(!group.length||selected&&!group.some(row=>row.id===selected.id))throw failure(selected||all[0],'تعذر تحديد السندات المرتبطة بمجموعة التصفير');
 const named=new Set(group.map(groupId).filter(Boolean)),known=new Set(group.map(row=>String(row.id))),foreign=state.records.find(row=>posted(row)&&named.has(row.productArchiveStockClearanceGroupId)&&!known.has(String(row.id)));if(foreign)throw failure(foreign,'مجموعة التصفير تحتوي مرجع منتج آخر أو سندًا غير متطابق');
 const ids=group.map(row=>String(row.id));if(group.some(row=>typeof row.id==='number'? !Number.isSafeInteger(row.id)||row.id<=0:typeof row.id!=='string'||!row.id||row.id!==row.id.trim())||new Set(ids).size!==ids.length)throw failure(group[0],'مراجع سندات التصفير مفقودة أو مكررة');
 const events=(state.stockEvents||[]).filter(row=>ids.includes(String(row.documentId))),eventIds=new Set();for(const event of events){if(!text(event.id)||eventIds.has(event.id))throw failure(group.find(row=>same(row.id,event.documentId))||group[0],'مراجع حركات التصفير مفقودة أو مكررة');eventIds.add(event.id);}
 const shadow={...product,stocks:product.stocks&&typeof product.stocks==='object'&&!Array.isArray(product.stocks)?{...product.stocks}:product.stocks},plans=[],cells=new Set(),legacy=new Map();
 for(const record of group){
  const warehouse=warehouseName(state,record),lines=Array.isArray(record.lines)?record.lines:[],line=lines[0];
  if(!warehouse||!state.warehouses.includes(warehouse)||lines.length!==1||!line||!same(line.product,product.id)||!sourceProductMatches(record.productArchiveProductId,product))throw failure(record,'سجل التصفير لا يحتوي مرجع منتج ومخزن وحيدًا ومتطابقًا');
  if([record.total,record.paid,record.due,record.dueTotal,record.paidTotal,record.cashAmount,line.lineTotal].some(value=>value!==undefined&&stockNumber(value)!==0)||record.paymentMethod!=null&&record.paymentMethod!=='')throw failure(record,'سند التصفير يحتوي أثرًا ماليًا لا يطابق الأرشفة');
  const quantity=stockNumber(line.delta??line.quantity),before=stockNumber(line.balanceBefore),after=stockNumber(line.balanceAfter);
  if(quantity===null||quantity>=0||before===null||before<=0||after!==0||stockBalanceAfter(before,quantity)!==0||line.quantity!==undefined&&stockNumber(line.quantity)!==quantity||line.qty!==undefined&&stockNumber(line.qty)!==Math.abs(quantity))throw failure(record,'كمية التصفير أو أرصدة السند غير متطابقة');
  const revision=record.revision===undefined?0:stockNumber(record.revision);if(revision!==0||record.productArchiveStockClearanceRestored!==undefined&&record.productArchiveStockClearanceRestored!==false)throw failure(record,'السند معدل أو سبق عكسه ولا يمكن استعادته مرة أخرى');
  const name=groupId(record);if(name){const cell=name+'\u0000'+warehouse;if(cells.has(cell))throw failure(record,'مجموعة التصفير تحتوي سندات متكررة للمخزن نفسه');cells.add(cell);}else{const time=Date.parse(String(record.occurredAt??''));if(Number.isFinite(time)){const prior=legacy.get(warehouse)||[];prior.push({time,record});legacy.set(warehouse,prior);}}
  const source=events.filter(event=>same(event.documentId,record.id));if(source.length){const event=source[0];if(source.length!==1||event.type!=='adjustment'||event.isReversal===true||event.status==='reversed'||event.reversalOfMovementId!=null||!same(event.productId,product.id)||event.warehouseId!==warehouse||event.documentNumber!==undefined&&event.documentNumber!==record.number||stockNumber(event.quantityDelta)!==quantity||stockNumber(event.balanceBefore)!==before||stockNumber(event.balanceAfter)!==after||event.documentRevision!==undefined&&stockNumber(event.documentRevision)!==revision)throw failure(record,'حركات المخزون لا تطابق سند التصفير أو تحتوي عكسًا سابقًا');}
  let plan;try{plan=planStockChange(shadow,warehouse,-quantity,record);if(plan.after<0)throw Error();shadow.stocks??={};shadow.stocks[warehouse]=plan.after;}catch{throw failure(record,'الرصيد الحالي أو ناتج استعادة الكمية غير صالح');}
  plans.push({record,warehouse,delta:-quantity,revision:revision+1});
 }
 for(const rows of legacy.values()){rows.sort((a,b)=>a.time-b.time);for(let i=1;i<rows.length;i++)if(rows[i].time-rows[i-1].time<=5000)throw failure(rows[i].record,'سندات التصفير القديمة لا تحدد مجموعة واحدة للمخزن بأمان');}
 for(const {record,warehouse,delta,revision}of plans){
  const previous=structuredClone(record);delete previous.revisions;
  changeStock(state,product,warehouse,delta,record,revision,context,'adjustment-void');record.revisions=[...(record.revisions||[]),previous];Object.assign(record,{status:'voided',voided:true,voidedAt:context.now,updatedAt:context.now,revision,productArchiveStockClearanceRestored:true});audit(state,'adjustment.void',record.id,context,{productArchiveStockClearance:true});
 }
 const remaining=all.filter(row=>!known.has(String(row.id))),next=[...remaining].reverse().map(groupId).find(Boolean)||null;
 if(archived(product)&&!remaining.length){product.archived=product.isArchived=false;product.archivedAt=null;}product.archiveStockClearanceGroupId=next;product.updatedAt=context.now;
 return result(state,product.id,group.map(row=>row.id));
}
export function restoreArchiveStockClearance(input,request={},options={}){return reverseOnState(structuredClone(input),request,contextOf(options));}
export function restoreArchivedProduct(input,productId,options={}){
 const state=structuredClone(input),product=selectedProduct(state,productId),context=contextOf(options);if(!archived(product))throw Object.assign(Error('المنتج المحذوف غير موجود'),{status:404});
 const restored=reverseOnState(state,{productId:product.id},context);if(!restored.changed){product.archived=product.isArchived=false;product.archivedAt=null;product.archiveStockClearanceGroupId=null;product.updatedAt=context.now;}
 audit(state,'product.restore',product.id,context,{documentIds:restored.documentIds});return result(state,product.id,restored.documentIds);
}
