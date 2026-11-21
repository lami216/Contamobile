import {deriveOpeningStockState,planOpeningStockCorrection} from './desktop-opening.js';
import {stockBalanceAfter} from './accounting-numbers.js';
import {refreshCurrentProductCosts,resolveCurrentProductCost} from './cost-provenance.js';
import {stockDeltas} from './business-accounting.js';
import {roundMoney} from './upgrade-state.js';

export function recordStockEvents(state,record,sign=1,phase='post',beforeState=null){
 state.stockEvents??=[];state.stockEventSequence=(state.stockEventSequence||0)+1;
 const sequence=state.stockEventSequence,at=record.updatedAt||new Date().toISOString(),balances=new Map();
 const push=(line,warehouse,delta,type)=>{if(!delta)return;const key=line.product+'|'+warehouse;
  const before=balances.has(key)?balances.get(key):beforeState?.products.find(p=>p.id===line.product)?.stocks[warehouse];
  const after=typeof before==='number'?stockBalanceAfter(before,delta):null;if(after!==null)balances.set(key,after);
  state.stockEvents.push({id:crypto.randomUUID(),productId:String(line.product),documentId:String(record.id),documentNumber:String(record.number||record.id),documentRevision:record.revision||0,eventSequence:sequence,warehouseId:warehouse,quantityDelta:delta,type,at,...(after===null?{reconstructed:true}:{balanceBefore:before,balanceAfter:after,occurredAt:at})});
 };
 for(const line of record.lines||[]){const type=record.openingStock?'opening':record.openingCorrection?'opening-correction':record.kind;
  const suffix=sign<0?(phase==='void'?'-void':'-edit'):phase==='edit'?'-edit':'';
  if(['sale','purchase'].includes(record.kind))push(line,record.warehouse,sign*(record.kind==='sale'?-1:1)*line.qty,type+suffix);
  else if(record.kind==='adjustment')push(line,line.warehouse||record.warehouse,sign*line.delta,type+suffix);
  else if(record.kind==='stocktransfer'){push(line,record.from,-sign*line.qty,phase==='post'?'transfer-out':'transfer-'+phase);push(line,record.toWarehouse,sign*line.qty,phase==='post'?'transfer-in':'transfer-'+phase)}
 }
}
// New revisions keep the actual net effect, matching the desktop stock journal.
// Reconstructed history above deliberately cannot acquire these proof fields.
export function recordStockRevision(state,previous,next,beforeState,phase='post'){
 const record=next||previous,changes=new Map();
 for(const [document,sign]of [[previous,-1],[next,1]])if(document)for(const effect of stockDeltas(document,sign)){
  const key=String(effect.line.product)+'|'+effect.warehouse,old=changes.get(key);
  if(old)old.delta=stockBalanceAfter(old.delta,effect.delta);else changes.set(key,{...effect});
 }
 state.stockEvents??=[];const sequence=(state.stockEventSequence||0)+1;state.stockEventSequence=sequence;
 const saved=state.records.find(r=>r.id===record.id)||record;
 const at=phase==='void'?saved.voidedAt:phase==='edit'?saved.updatedAt:saved.occurredAt;
 for(const {line,warehouse,delta}of changes.values()){
  if(delta===0)continue;
  const before=beforeState.products.find(p=>p.id===line.product)?.stocks[warehouse]??0;
  const after=state.products.find(p=>p.id===line.product)?.stocks[warehouse];
  if(typeof before!=='number'||typeof after!=='number'||!Number.isFinite(delta))throw Error('تعذّر حفظ دليل حركة المخزون');
  const type=record.openingStock?'opening':record.openingCorrection?'opening-correction':record.kind;
  state.stockEvents.push({id:crypto.randomUUID(),productId:String(line.product),documentId:String(record.id),documentNumber:String(saved.number||saved.id),documentRevision:saved.revision||0,eventSequence:sequence,warehouseId:warehouse,quantityDelta:delta,balanceBefore:before,balanceAfter:after,type:type+(phase==='post'?'':phase==='void'?'-void':'-edit'),occurredAt:at,at});
 }
}
export function seedStockEvents(state){
 if(state.stockEvents)return false;
 state.stockEvents=[];state.stockEventSequence=0;
 for(const p of state.products){
  for(const [warehouse,qty]of Object.entries(state.opening.stocks[p.id]||{}))if(qty)state.stockEvents.push({productId:String(p.id),documentId:'legacy-'+p.id,warehouseId:warehouse,quantityDelta:qty,type:'legacy-opening'});
  if(state.records.some(r=>(r.voided||r.revision>0)&&r.lines?.some(l=>l.product===p.id)))p.openingHistoryLocked=true;
 }
 for(const r of state.records.filter(r=>!r.voided).slice().sort((a,b)=>a.id-b.id))recordStockEvents(state,r);
 return true;
}
export async function openingState(state,product){
 seedStockEvents(state);
 const docs=state.records.map(r=>({...r,id:String(r.id),occurredAt:r.date,lines:(r.lines||[]).map(l=>({...l,productId:String(l.product),unitPrice:l.price}))}));
 const fake={collection(name){return {find(query){let rows=name==='stockMovements'?state.stockEvents.filter(r=>r.productId===query.productId):docs.filter(r=>query.id?.$in?.includes(r.id));return {sort(){return this},async toArray(){return rows}}}}}};
 const nativeTotal=state.records.filter(r=>!r.voided&&r.openingStock).reduce((sum,r)=>sum+r.lines.filter(l=>l.product===product.id).reduce((n,l)=>n+l.delta,0),0);
 return deriveOpeningStockState(fake,undefined,{...product,id:String(product.id),openingStock:product.openingTotal??nativeTotal,openingCost:product.openingCost??state.records.find(r=>r.openingStock&&!r.voided&&r.lines.some(l=>l.product===product.id))?.lines.find(l=>l.product===product.id)?.price,openingWarehouseId:product.openingWarehouse,legacyOpeningCost:product.legacyOpeningCost});
}
export function planOpeningRecord(state,product,provenance,desiredTotal,desiredCost,warehouse,relocate,id,date,time,note){
 if(product.openingHistoryLocked||!provenance.hasNativeOpening&&provenance.hasStockHistory)throw Error('رصيد البداية التاريخي غير قابل للتعديل؛ راجع سجل الحركات');
 if(!note?.trim())throw Error('أدخل سبب التصحيح');
 if(desiredTotal>0&&(!Number.isFinite(desiredCost)||desiredCost<=0))throw Error('تكلفة رصيد البداية يجب أن تكون أكبر من صفر');
 if(!state.warehouses.includes(warehouse)||state.warehouseMeta?.[warehouse]?.archived)throw Error('اختر مخزنًا فعالًا');
 const plan=planOpeningStockCorrection(provenance,desiredTotal,warehouse,relocate);
 for(const item of plan.deltas)if((product.stocks[item.warehouseId]||0)+item.delta<0)throw Error('التصحيح يتجاوز المخزون المتاح');
 return {id,kind:'adjustment',date,time,lines:plan.deltas.map(item=>({product:product.id,name:product.name,warehouse:item.warehouseId,qty:Math.abs(item.delta),delta:item.delta,price:desiredCost})),total:0,paid:0,due:0,warehouse,title:product.name,subtitle:'تصحيح رصيد البداية',openingCorrection:true,openingProduct:product.id,openingTotalBefore:provenance.total,openingTotalAfter:desiredTotal,openingCostBefore:provenance.cost??product.cost,openingCostAfter:desiredCost,openingWarehouseBefore:provenance.warehouseId,openingWarehouseAfter:warehouse,note:note.trim()};
}
export function applyOpeningMetadata(state,record,reverse=false){
 if(!record.openingCorrection)return;const p=state.products.find(p=>p.id===record.openingProduct),suffix=reverse?'Before':'After';
 p.openingTotal=record['openingTotal'+suffix];p.openingCost=record['openingCost'+suffix];p.openingWarehouse=record['openingWarehouse'+suffix];
 refreshCurrentProductCosts(state,[p.id]);
}
// A correction counts the stock at the original count, not the stock on the day it is edited.
// Older mobile rows kept that count in actualQuantity/newQty; desktop imports keep the source line.
export function adjustmentLineCount(state,record,line){
 const finite=value=>typeof value==='number'&&Number.isFinite(value);
 const desktopId=state.products.find(p=>p.id===line.product)?.desktopId;
 const source=desktopId==null?null:record.desktop?.lines?.find(l=>String(l.productId)===String(desktopId));
 const count=(r,l)=>finite(l.actualQuantity)?l.actualQuantity:finite(l.balanceAfter)?l.balanceAfter:r.lines.length===1&&finite(r.newQty)?r.newQty:null;
 const actual=count(record,line)??(finite(source?.balanceAfter)?source.balanceAfter:null);
 let baseline=finite(line.balanceBefore)?line.balanceBefore:finite(source?.balanceBefore)?source.balanceBefore:null;
 // Revisions from before this fix may retain the true baseline while a later buggy edit does not.
 for(const revision of record.revisions||[]){
  if(baseline!==null)break;
  if(revision.kind!=='adjustment'||revision.warehouse!==record.warehouse)continue;
  const prior=revision.lines?.find(l=>l.product===line.product);if(!prior||!finite(prior.delta))continue;
  const priorCount=count(revision,prior);
  if(finite(prior.balanceBefore))baseline=prior.balanceBefore;else if(priorCount!==null)baseline=priorCount-prior.delta;
 }
 if(baseline===null&&actual!==null&&finite(line.delta))baseline=actual-line.delta;
 if(baseline===null||!finite(line.delta))throw Error('سند التصحيح القديم لا يحتوي بيانات كافية للتعديل الآمن؛ راجع سجل المخزون');
 return {before:baseline,after:actual??baseline+line.delta};
}
export function stockOperationRecord(state,mode,draft,existing,id,date,time){
 if(!['transfer','adjustment'].includes(mode)||!state.warehouses.includes(draft.from)||state.warehouseMeta?.[draft.from]?.archived&&draft.from!==(existing?.warehouse||existing?.from))throw Error('اختر المخزن');
 if(mode==='transfer'&&(!state.warehouses.includes(draft.to)||draft.to===draft.from||state.warehouseMeta?.[draft.to]?.archived&&draft.to!==existing?.toWarehouse))throw Error('اختر مخزنين مختلفين');
 if(!draft.lines.length||new Set(draft.lines.map(l=>l.product)).size!==draft.lines.length)throw Error('أضف منتجات مختلفة إلى العملية');
 if(mode==='adjustment'&&existing){
  if(existing.kind!=='adjustment'||existing.openingStock||existing.openingCorrection)throw Error('رصيد البداية يُصحح من شاشة رصيد البداية');
  if(draft.from!==existing.warehouse)throw Error('لا يمكن تغيير مخزن سند التصحيح بعد اعتماده');
  if(draft.lines.length!==existing.lines.length||draft.lines.some(l=>!existing.lines.some(old=>old.product===l.product)))throw Error('لا يمكن تغيير منتجات سند التصحيح بعد اعتماده؛ عدّل الكميات فقط أو ألغ السند وأنشئ سندًا جديدًا');
 }
 const lines=draft.lines.map(line=>{const p=state.products.find(p=>p.id===line.product&&(!p.archived||existing?.lines.some(old=>old.product===p.id)));if(!p)throw Error('المنتج غير موجود');const qty=Number(line.quantity);if(!Number.isFinite(qty)||qty<0||mode==='transfer'&&qty===0)throw Error('أدخل كمية صحيحة');
  const old=existing?.lines.find(l=>l.product===p.id),base=mode==='adjustment'&&old?adjustmentLineCount(state,existing,old).before:(p.stocks[draft.from]||0)+(existing?.kind==='stocktransfer'&&existing.from===draft.from?(old?.qty||0):0)-(existing?.kind==='stocktransfer'&&existing.toWarehouse===draft.from?(old?.qty||0):0);
  if(mode==='transfer'&&stockBalanceAfter(base,-qty)<0)throw Error('الكمية المطلوبة أكبر من المخزون');
  let unitPrice=mode==='transfer'?0:old?.price;
  if(mode==='adjustment'){
   const originalWarehouse=state.warehouseMeta?.[draft.from]?.id??state.warehouseMeta?.[draft.from]?._id;
   const importedField=p.desktop?.stocks&&originalWarehouse!=null&&Object.hasOwn(p.desktop.stocks,String(originalWarehouse));
   const baseline=Number(state.opening?.stocks?.[p.id]?.[draft.from]||0)>0;
   const entered=importedField||baseline||(state.stockEvents||[]).some(e=>e.productId===String(p.id)&&e.warehouseId===draft.from&&/^(opening|legacy-opening|purchase|transfer-in|stocktransfer)(-|$)/.test(e.type))||state.records.some(r=>['purchase','stocktransfer'].includes(r.kind)&&(r.warehouse===draft.from||r.toWarehouse===draft.from)&&r.lines.some(l=>l.product===p.id));
   if(!existing&&!entered)throw Error('لا يمكن تصحيح هذا المنتج في المخزن قبل دخوله برصيد بداية أو شراء أو تحويل');
   const revised=qty-base,oldDelta=old?.delta||0;
   if(!old||revised>Math.max(0,oldDelta)){const cost=resolveCurrentProductCost(state,p,old?draft.from:undefined).cost;if(revised>Math.max(0,oldDelta)&&(cost===null||oldDelta>0&&!(Number(old?.price)>0)))throw Error('لا يمكن زيادة المخزون بالتصحيح دون مصدر تكلفة موثّق');if(!old||oldDelta<=0)unitPrice=cost??0;}
  }
  return {product:p.id,name:p.name,qty:mode==='transfer'?qty:Math.abs(qty-base),delta:mode==='transfer'?0:qty-base,price:unitPrice??0,...(mode==='adjustment'?{actualQuantity:qty,balanceBefore:base,balanceAfter:qty}:{})};
 });
 if(mode==='adjustment'&&!existing&&lines.every(l=>l.delta===0))throw Error('لا يوجد تغيير في المخزون لاعتماده');
 if(mode==='adjustment'&&!draft.note?.trim())throw Error('أدخل سبب التصحيح');
 return {id,kind:mode==='transfer'?'stocktransfer':'adjustment',date,time,lines,from:mode==='transfer'?draft.from:undefined,toWarehouse:mode==='transfer'?draft.to:undefined,warehouse:mode==='adjustment'?draft.from:undefined,newQty:lines.length===1?lines[0].actualQuantity:undefined,title:lines.length===1?lines[0].name:'حركة مخزون',subtitle:mode==='transfer'?'تحويل مخزون':'تصحيح مخزون',note:draft.note||'',total:0,paid:0,due:0};
}
