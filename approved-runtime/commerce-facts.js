import {reportCostNumber,reportNetLines as allocateNetLines,latestReportCost,stockNumber} from './accounting-numbers.js';
import {mobileLineTotal} from './invoice-amount.js';
import {accountingDocuments,accountingMovements,effectiveAccountingRecord} from './cost-provenance.js';
export {reportCostNumber,latestReportCost};
const n=value=>Number(value)||0;
const signedNumber=value=>{if(typeof value!=='number'&&(typeof value!=='string'||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())))return null;const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;};
const costDependentFields=new Set(['cost','profit','margin','salesCost','salesProfit','netOperatingResult','netProfit','netProfitAfterInventoryLoss','ownerAvailableProfit']);
export const reportHasUnknownCost=state=>Boolean(state&&(state.costKnown===false||n(state.unknownRevenue)>0));
export const reportCostUnknown=(key,state)=>costDependentFields.has(key)&&reportHasUnknownCost(state);
export const reportCostExportValue=(key,value,state,label='غير مؤكد')=>reportCostUnknown(key,state)?label:n(value);
/** Allocate saved header discounts once over all source lines, before selection. */
export function reportNetLines(document){return allocateNetLines({...document,lines:(document.lines||[]).map(line=>({...line,lineTotal:mobileLineTotal(line)}))});}
function indexedHistory(source){
 const map=new Map();for(const [productId,values]of source){const rows=values.slice().sort((a,b)=>a.at.localeCompare(b.at)||a.sequence-b.sequence),groups=[];
  for(let index=0;index<rows.length;){const first=rows[index],tied=[];while(index<rows.length&&rows[index].at===first.at&&rows[index].sequence===first.sequence)tied.push(reportCostNumber(rows[index++].value));const cost=tied[0];groups.push({at:first.at,cost:cost!==null&&cost>0&&tied.every(value=>value===cost)?cost:null});}map.set(productId,groups);
 }return map;
}
function historicalCost(index,productId,at){const rows=index.get(productId)||[];let low=0,high=rows.length;while(low<high){const middle=(low+high)>>>1;if(rows[middle].at<=at)low=middle+1;else high=middle;}return low?{present:true,cost:rows[low-1].cost}:{present:false,cost:null};}
export function saleFacts(state,{records=state.records.filter(effectiveAccountingRecord),productPredicate=()=>true}={}) {
 const documents=accountingDocuments(state),byId=new Map(documents.map(d=>[String(d.id),d])),purchases=new Map(),openings=new Map();
 for(const document of documents){const opening=document.kind==='adjustment'&&(document.openingCorrection||String(document.number||'').startsWith('OPEN-'));if(document.kind!=='purchase'&&!opening)continue;
  for(const line of document.lines){let value=document.status==='posted'?line.unitPrice:null;if(opening&&document.status==='posted'){if(document.openingCostAfter!==undefined)value=document.openingCostAfter;if((reportCostNumber(document.openingStockAfter===undefined?line.quantity:document.openingStockAfter)??0)<=0)value=null;}
   const target=opening?openings:purchases,key=String(line.productId),rows=target.get(key)||[];rows.push({at:document.occurredAt,sequence:Number(document.sequence??0),value});target.set(key,rows);
  }
 }
 const purchaseIndex=indexedHistory(purchases),openingIndex=indexedHistory(openings),partiesById=new Map(state.parties.map(p=>[p.id,p]));
 const movementsByLine=new Map(),productsById=new Map(state.products.map(p=>[String(p.id),p])),facts=[];for(const movement of accountingMovements(state)){const key=movement.documentId+'|'+movement.productId,list=movementsByLine.get(key)||[];list.push(movement);movementsByLine.set(key,list);}
 for(const record of records){if(!['sale','return'].includes(record.kind))continue;const document=byId.get(String(record.id));if(!document)continue;const parent=byId.get(String(document.parentDocumentId)),isReturn=document.kind==='return';if(isReturn&&parent?.kind==='purchase')continue;
  const sign=isReturn?-1:1,costDate=isReturn?String(parent?.occurredAt??document.occurredAt):document.occurredAt;
  const netLines=allocateNetLines(document);
  for(const [index,line]of netLines.entries()){const original=(record.lines||[])[index]||line;if(!productPredicate(original,record))continue;
   const snapshot=reportCostNumber(line.costAtSale),purchase=historicalCost(purchaseIndex,String(line.productId),costDate),opening=historicalCost(openingIndex,String(line.productId),costDate);
   const debit=movementsByLine.get(document.id+'|'+line.productId)||[],addedInEdit=debit.some(m=>m.type==='sale-edit')&&!debit.some(m=>m.type==='sale');
   let unit=snapshot,source=snapshot!==null?'snapshot':'unknown';
   if(unit===null&&!addedInEdit){if(purchase.present){unit=purchase.cost;source=unit===null?'unknown':'historical-purchase';}else if(opening.cost!==null){unit=opening.cost;source='historical-opening';}
    // Older approved-mobile records already saved their own profit. Use that
    // snapshot read-only, never a current card, and never override saved null.
    else if(!Object.hasOwn(original,'costAtSale')&&record.costKnown!==false){const saved=signedNumber(original.grossProfit)??(record.lines?.length===1?signedNumber(record.profit):null),raw=reportCostNumber(mobileLineTotal(original)),q=reportCostNumber(line.quantity);if(saved!==null&&raw!==null&&q>0&&raw>=saved){unit=(raw-saved)/q;source='saved-mobile-profit';}}
   }
   const savedProfit=typeof line.grossProfit==='number'||typeof line.grossProfit==='string'&&line.grossProfit.trim()!==''?Number(line.grossProfit):NaN;
   const rawRevenue=reportCostNumber(document.lines[index]?.lineTotal),savedTotalCost=n(line.quantity)*(snapshot??0);
   const returnConflict=isReturn&&snapshot!==null&&rawRevenue!==null&&Number.isFinite(savedProfit)&&Math.abs(savedProfit-(rawRevenue-savedTotalCost))>1e-6&&Math.abs(savedProfit-(n(line.lineTotal)-savedTotalCost))>1e-6;
   const revenue=sign*n(line.lineTotal),quantity=sign*n(line.quantity),costKnown=unit!==null&&!returnConflict,cost=sign*n(line.quantity)*(unit??0),profit=revenue-cost,product=productsById.get(line.productId);
   facts.push({id:record.id+'-'+(line.id||index),documentId:record.id,record,action:'invoice:'+record.id,number:record.number||record.kind.toUpperCase()+'-'+record.id,date:record.date,occurredAt:document.occurredAt,party:partiesById.get(record.party)?.name||record.title||'',partyId:record.party,kind:record.kind,productId:original.product??line.productId,product:product?.name||original.name||line.description||'منتج غير متاح',quantity,unitPrice:n(line.unitPrice),revenue,total:revenue,cost,profit,margin:revenue?profit/revenue*100:0,costKnown,costSource:source,unknownRevenue:costKnown?0:Math.abs(revenue)});
  }
 }
 return facts;
}
export function profitSummary(facts){const revenue=facts.reduce((s,r)=>s+n(r.revenue),0),cost=facts.reduce((s,r)=>s+n(r.cost),0),profit=revenue-cost;return {revenue,total:revenue,cost,profit,margin:revenue?profit/revenue*100:0,costKnown:facts.every(r=>r.costKnown!==false),unknownRevenue:facts.reduce((s,r)=>s+n(r.unknownRevenue),0)};}
export function documentCommerceSummary(state,record,productPredicate=()=>true,facts){
 const rows=(facts??saleFacts(state,{records:[record],productPredicate})).filter(f=>f.documentId===record.id),summary=profitSummary(rows);
 if(!rows.length&&['sale','return'].includes(record.kind)){const revenue=n(record.total)*(record.kind==='return'?-1:1);return {...summary,revenue,total:revenue,profit:revenue,costKnown:false,unknownRevenue:Math.abs(revenue)};}
 return summary;
}
export function productQuantity(product,warehouses){return warehouses.reduce((sum,w)=>sum+(stockNumber(product.stocks?.[w])??0),0);}
