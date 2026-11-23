import {reportCostNumber,reportNetLines} from './accounting-numbers.js';
import {mobileLineTotal} from './invoice-amount.js';
// Read-only adapter for offline-conta/app/party-metrics.ts; balances retain their stored meaning.
const numeric=value=>{const number=Number(value??0);return Number.isFinite(number)?number:0};
const same=(left,right)=>left!=null&&right!=null&&String(left)===String(right);
const aliases=record=>[record.id,record.canonicalId,record.desktopId,record.desktopDocumentId,record.payrollDocumentId,record.desktop?.id].filter(value=>value!=null).map(String);
function supplierReturn(record,state){
 if(record.kind!=='return')return false;
 let kind=record.returnParentKind||record.sourceParentKind;
 if(!kind&&state){const id=record.parentDocumentId??record.desktop?.parentDocumentId;kind=state.partyParentKinds?.get(String(id))||(state.records||[]).find(parent=>aliases(parent).includes(String(id)))?.kind;}
 return kind==='purchase'||kind==='decant-purchase';
}
function nativeCash(record,state){
 const returnedToSupplier=supplierReturn(record,state);
 return {cashIn:record.kind==='sale'?numeric(record.paid):record.kind==='receive'?numeric(record.total):returnedToSupplier?numeric(record.paid):0,
  cashOut:record.kind==='purchase'?numeric(record.paid):record.kind==='pay'?numeric(record.total):record.kind==='return'&&!returnedToSupplier?numeric(record.paid):0};
}
function partyProfitSnapshot(record){
 const untouched=record.desktop&&Array.isArray(record.desktop.lines)&&Number(record.revision??0)===Number(record.desktop.revision??0)&&!(record.revisions||[]).length;
 const revised=Number(record.revision??0)>0||(record.revisions||[]).length>0;
 const source=untouched?record.desktop:{kind:record.kind,total:record.total,lines:(record.lines||[]).map(line=>{
  const cost=reportCostNumber(line.costAtSale),quantity=reportCostNumber(line.qty??line.quantity),lineTotal=mobileLineTotal(line);
  const grossProfit=!revised&&Object.hasOwn(line,'grossProfit')?line.grossProfit:cost!==null&&quantity!==null?lineTotal-quantity*cost:null;
  return {quantity,unitPrice:line.price??line.unitPrice,lineTotal,costAtSale:line.costAtSale,grossProfit};
 })};
 const sign=record.kind==='return'?-1:1,net=reportNetLines(source);let profit=0;
 for(const[lineIndex,line]of source.lines.entries()){
  const cost=reportCostNumber(line.costAtSale),quantity=reportCostNumber(line.quantity),allocated=net[lineIndex];
  // Exact Desktop party-metrics rule: undiscounted rows use the saved profit
  // snapshot, including zero/missing. Header-discount rows reconcile only from
  // the saved cost. This surface deliberately differs from report profit.
  if(source.kind==='sale'&&allocated&&allocated.lineTotal!==line.lineTotal&&cost!==null&&quantity!==null)profit+=sign*(allocated.lineTotal-quantity*cost);
  else if(line.grossProfit!=null&&Number.isFinite(Number(line.grossProfit)))profit+=sign*Number(line.grossProfit);
 }
 return profit;
}
/** Source journals are authoritative until a native revision supersedes them.
 * Unlinked party journals still contribute, exactly as Desktop's summary does;
 * they carry their source row for a read-only explanation, never a fake invoice. */
export function partyCashContributions(state){
 const records=state.records||[],byId=new Map(),result=[];
 for(const record of records)for(const id of aliases(record))byId.set(id,record);
 const changed=record=>record&&(!record.desktop||Number(record.revision??0)!==Number(record.desktop.revision??0)||(record.revisions||[]).length>0);
 for(const movement of state.financialMovements||[]){
  if(movement.partyId==null||movement.status==='reversed'||movement.isReversal===true)continue;
  const record=byId.get(String(movement.documentId))||byId.get(String(movement.desktop?.documentId));if(changed(record))continue;
  const amount=Number(movement.amount);if(!Number.isFinite(amount))continue;
  if(movement.direction==='in'||movement.direction==='out')result.push({partyId:movement.partyId,record:record||null,movement,cashIn:movement.direction==='in'?amount:0,cashOut:movement.direction==='out'?amount:0});
 }
 for(const record of records){if(record.party==null||!effectivePartyRecord(record)||record.desktop&&!changed(record))continue;const values=nativeCash(record,state);if(values.cashIn||values.cashOut)result.push({partyId:record.party,record,movement:null,...values});}
 return result;
}
export function effectivePartyRecord(record){return !record.voided&&!record.reversed&&!record.isReversal&&(!record.status||record.status==='posted')}
export function partyNetBalance(party){return numeric(party.balance)*(party.type==='supplier'?-1:1)}
export function historicalPartyProfit(record){
 if(record.profit!=null&&Number.isFinite(Number(record.profit)))return Number(record.profit);
 return (record.lines||[]).reduce((total,line)=>total+numeric(line.grossProfit),0);
}
export function partyRecordMetric(record,key,type,state){
 if(!effectivePartyRecord(record))return 0;
 if(key==='trade')return type==='customer'?(record.kind==='sale'||record.kind==='return'&&!supplierReturn(record,state)?numeric(record.total)*(record.kind==='return'?-1:1):0):record.kind==='purchase'?numeric(record.total):supplierReturn(record,state)?-numeric(record.total):0;
 if(key==='profit')return type==='customer'&&(record.kind==='sale'||record.kind==='return'&&!supplierReturn(record,state))?partyProfitSnapshot(record):0;
 if(key==='invoiceCount')return type==='supplier'&&record.kind==='purchase'?1:0;
 if(key==='cashIn'||key==='cashOut')return state?(state.partyCashRows||partyCashContributions(state)).filter(row=>same(row.record?.id,record.id)&&same(row.partyId,record.party)).reduce((sum,row)=>sum+row[key],0):nativeCash(record,state)[key];
 return 0;
}
function metricContext(state){
 const context={products:[],parties:[],warehouses:[],records:[],...state};
 context.partyParentKinds=new Map();for(const record of context.records)for(const id of aliases(record))context.partyParentKinds.set(id,record.kind);
 return context;
}
export function partyFinancialSummary(state,type,partyId=null){
 state=metricContext(state);
 const parties=state.parties.filter(p=>p.type===type&&(partyId===null?!p.archived:p.id===partyId));
 const ids=new Set(parties.map(p=>p.id)),cashIds=new Set(parties.map(p=>String(p.id))),keys=['trade','profit','invoiceCount'];
 const values={trade:0,profit:0,cashIn:0,cashOut:0,invoiceCount:0,receivable:0,payable:0};
 for(const party of parties){const net=partyNetBalance(party);values.receivable+=Math.max(0,net);values.payable+=Math.max(0,-net)}
 for(const row of partyCashContributions(state)){if(!cashIds.has(String(row.partyId)))continue;values.cashIn+=row.cashIn;values.cashOut+=row.cashOut;}
 for(const record of state.records){if(!ids.has(record.party)||!effectivePartyRecord(record))continue;for(const key of keys){const value=partyRecordMetric(record,key,type,state);values[key]=value===null||values[key]===null?null:values[key]+value}}
 return {type,partyId,parties,values};
}
export function partyMetricContributions(state,summary,key){
 state=metricContext(state);
 if(key==='receivable'||key==='payable')return summary.parties.map(p=>({party:p,value:Math.max(0,partyNetBalance(p)*(key==='payable'?-1:1))})).filter(row=>row.value!==0);
 if(key==='cashIn'||key==='cashOut'){const ids=new Set(summary.parties.map(party=>String(party.id)));return partyCashContributions(state).filter(row=>ids.has(String(row.partyId))).map(row=>({...row,value:row[key]})).filter(row=>row.value!==0);}
 const ids=new Set(summary.parties.map(p=>p.id));return state.records.filter(r=>ids.has(r.party)&&effectivePartyRecord(r)).map(record=>({record,value:partyRecordMetric(record,key,summary.type,state)})).filter(row=>row.value!==0);
}
