// Offline 862 arithmetic at the existing mobile transaction boundary.
import {planStockChange,stockBalanceAfter,historicalInvoiceStockLines} from './accounting-numbers.js';
import {partyOpeningStoredDelta} from './party-opening-domain.js';
import {mobileLineTotal,invoiceAmountFields,mobileInvoiceTotal} from './invoice-amount.js';
import {saleLineCost,refreshCurrentProductCosts,suggestedPurchasePrice} from './cost-provenance.js';

export function financialRecordReadOnly(state,record){
 if(record.kind==='employee-closure'||record.kind?.startsWith('employee-')&&(state.employees||[]).some(e=>e.id===record.employeeId&&e.isDeleted===true))return true;
 if(record.importReadOnly)return true;
 if(['sale','purchase','expense'].includes(record.kind)&&record.legacyKey)return true;
 return record.kind==='sale'&&(state.records||[]).some(row=>row.kind==='return'&&!row.voided&&(!row.status||row.status==='posted')&&[record.id,record.desktopId].filter(v=>v!=null).some(id=>String(row.parentDocumentId??row.desktop?.parentDocumentId)===String(id)));
}

export function storedPartyDelta(state,record,partyId){
 if(record.party!==partyId)return 0;
 const party=state.parties.find(p=>p.id===partyId);
 if(record.kind==='return')return (record.returnParentKind==='purchase'?1:-1)*(party?.type==='supplier'?-1:1)*Number(record.due||0);
 if(record.kind==='party-opening')return partyOpeningStoredDelta(state,record);
 if(['receive','pay'].includes(record.kind))return (party?.type==='supplier'?(record.kind==='pay'?-1:1):(record.kind==='receive'?-1:1))*record.total;
 if(['sale','purchase'].includes(record.kind))return Number(record.due||0);
 return 0;
}
export function cashDelta(record,accountId){
 if(record.kind==='return')return record.account===accountId?(record.returnParentKind==='purchase'?1:-1)*Number(record.paid||0):0;
 if(record.kind==='employee-opening'||record.kind==='employee-accrual'||record.kind==='employee-closure'||record.kind==='party-opening')return 0;
 if(record.kind==='employee-payment')return record.account===accountId?(record.employeePaymentDirection==='deposit'?1:-1)*record.total:0;
 return (record.account===accountId?(['sale','receive','deposit'].includes(record.kind)?1:-1)*Number(record.paid||0):0)+(record.kind==='transfer'&&record.to===accountId?record.total:0);
}
export function stockDeltas(record,sign=1){
 const lines=['sale','purchase'].includes(record.kind)?historicalInvoiceStockLines(record):record.lines||[];
 return lines.flatMap(line=>{
  if(['sale','purchase'].includes(record.kind))return [{line,warehouse:record.warehouse,delta:sign*(record.kind==='sale'?-1:1)*line.qty}];
  if(record.kind==='adjustment')return [{line,warehouse:line.warehouse||record.warehouse,delta:sign*line.delta}];
  if(record.kind==='stocktransfer')return [{line,warehouse:record.from,delta:-sign*line.qty},{line,warehouse:record.toWarehouse,delta:sign*line.qty}];
  return [];
 });
}
export function applyRecordEffect(state,record,sign){
 // Compute every stock result before applying any effect. The caller also owns rollback.
 const staged=new Map();
 const changes=stockDeltas(record,sign).map(row=>{
  const product=state.products.find(p=>p.id===row.line.product);if(!product)throw Error('المنتج غير موجود');
  let shadow=staged.get(product.id);
  if(!shadow){shadow={...product,stocks:{...product.stocks}};staged.set(product.id,shadow);}
  const plan=planStockChange(shadow,row.warehouse,row.delta,record);
  shadow.stocks[row.warehouse]=plan.after;
  return {...row,product,plan};
 });
 for(const {product,warehouse,plan}of changes)product.stocks[warehouse]=plan.after;
 for(const account of state.accounts)account.balance+=sign*cashDelta(record,account.id);
 for(const party of state.parties)party.balance+=sign*storedPartyDelta(state,record,party.id);
 return state;
}
// Existing invoices change physical stock by the net quantity, never by a
// reverse-and-repost pair which can absorb a real sub-unit holding.
export function applyRecordRevision(state,previous,next){
 const net=new Map();
 for(const [record,sign]of [[previous,-1],[next,1]])for(const row of stockDeltas(record,sign)){
  const key=String(row.line.product)+'|'+row.warehouse,old=net.get(key);
  if(old)old.delta=stockBalanceAfter(old.delta,row.delta);else net.set(key,{...row});
 }
 const products=new Map(state.products.map(p=>[p.id,p]));
 const changes=[...net.values()].filter(row=>row.delta!==0).map(row=>{
  const product=products.get(row.line.product);if(!product)throw Error('المنتج غير موجود');
  return {...row,product,plan:planStockChange(product,row.warehouse,row.delta,next)};
 });
 for(const row of changes)row.product.stocks[row.warehouse]=row.plan.after;
 for(const account of state.accounts){const delta=cashDelta(next,account.id)-cashDelta(previous,account.id);if(delta!==0)account.balance+=delta;}
 for(const party of state.parties){const delta=storedPartyDelta(state,next,party.id)-storedPartyDelta(state,previous,party.id);if(delta!==0)party.balance+=delta;}
 return state;
}
export function invoiceDraftLine(line){
 const mode=line.lineTotalMode||'mobile-legacy',total=Object.hasOwn(line,'lineTotal')?line.lineTotal:Math.round((line.qty*line.price+Number.EPSILON)*100)/100;
 return {id:line.product,qty:line.qty,price:line.price,lineTotal:total,lineTotalMode:mode};
}
function lineAmounts(item,old){
 const unchanged=old&&Number(old.qty)===Number(item.qty)&&Number(old.price)===Number(item.price);
 const effective={...item,lineTotalMode:item.lineTotalMode||(unchanged?'mobile-legacy':'exact')};
 if(!unchanged&&effective.lineTotalMode!=='exact'){effective.lineTotalMode='exact';delete effective.lineTotal;}
 return invoiceAmountFields(effective,old);
}
export function cartInvoiceTotal(cart,original){
 const oldLines=new Map((original?.lines||[]).map(l=>[l.product,l]));
 return mobileInvoiceTotal(cart.map(item=>({...item,...lineAmounts(item,oldLines.get(item.id))})));
}
export function postingLines(state,cart,kind,warehouse,original){
 const products=new Map(state.products.map(p=>[p.id,p])),oldLines=new Map((original?.lines||[]).map(l=>[l.product,l]));
 return cart.map(item=>{
  const product=products.get(item.id),old=oldLines.get(item.id);
  if(!product)throw Error('المنتج غير موجود');
  const line={...(old||{}),id:old?.id||crypto.randomUUID(),product:product.id,name:product.name,qty:Number(item.qty),price:Number(item.price),...lineAmounts(item,old)};
  if(kind==='sale')line.costAtSale=saleLineCost(state,product,old,warehouse);
  return line;
 });
}
export function invoiceProfit(lines){
 if(lines.some(l=>typeof l.costAtSale!=='number'||!Number.isFinite(l.costAtSale)||l.costAtSale<0))return null;
 return lines.reduce((sum,l)=>sum+mobileLineTotal(l)-l.qty*l.costAtSale,0);
}
export {stockBalanceAfter,mobileLineTotal,mobileInvoiceTotal,refreshCurrentProductCosts,saleLineCost,suggestedPurchasePrice};
