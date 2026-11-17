import {accountingDocuments,accountingMovements,accountingProduct} from './cost-provenance.js';
import {recoverHistoricalSaleCosts as recoverSaleCore,accountingHealth as healthCore,confirmSaleCostRecovery as confirmCore,readSaleCostRecoverySummary as summaryCore,SaleCostRecoveryError} from './accounting-health-core.js';
import {recoverHistoricalStockData as recoverStockCore,planHistoricalStockRecovery} from './stock-recovery-core.js';
export {SaleCostRecoveryError,planHistoricalStockRecovery};
/** Private ordered table adapter keeps the literal 862 proof rules independent
 * from the mobile store. The caller commits the returned state in one durable save. */
function accountingMemory(state){
 const copy=structuredClone(state),documents=accountingDocuments(copy).map((d,i)=>{const record=copy.records[i],original=typeof record.occurredAt==='string'&&Number.isSafeInteger(record.postingOrder)&&record.postingOrder>0;return {...d,...(!original?{importedFrom:d.importedFrom||'mobile-history-unproven'}:{}),__order:record.postingOrder??Number(record.id)}}).sort((a,b)=>a.__order-b.__order).map(d=>{delete d.__order;return d;});
 const rows=values=>values.map((value,index)=>({record_key:String(value.id??value._id),data_json:JSON.stringify(value),rowid:index+1}));
 const tables={documents:rows(documents),products:rows(copy.products.map(p=>({...accountingProduct(p),...(p.desktopId||p.importKey?{importedFrom:'preserved-import'}:{})}))),stock_movements:rows(accountingMovements(copy)),warehouses:rows(copy.warehouses.map(name=>({id:name,_id:name,name}))),audit_events:rows(copy.auditEvents||[]),app_settings:rows(Array.isArray(copy.accountingSettings)?copy.accountingSettings:[])};
 let transaction=null;
 const native={inTransaction:false,exec(sql){if(/^(BEGIN|SAVEPOINT)/.test(sql)){transaction=structuredClone(tables);this.inTransaction=true;}else if(/^ROLLBACK/.test(sql)){if(transaction)for(const key of Object.keys(tables))tables[key]=transaction[key];transaction=null;this.inTransaction=false;}else if(/^(COMMIT|RELEASE)/.test(sql)){transaction=null;this.inTransaction=false;}else throw Error('Unsupported accounting transaction');},prepare(sql){
  const table=sql.match(/(?:FROM|INTO|UPDATE)\s+([a-z_]+)/i)?.[1];if(!table||!tables[table])throw Error('Unsupported accounting table');
  return {
   all(...args){let list=tables[table];if(table==='stock_movements'&&sql.includes('json_each')){const productIds=new Set(JSON.parse(args[0])),saleIds=new Set(JSON.parse(args[1]));list=list.filter(row=>{const r=JSON.parse(row.data_json);return productIds.has(r.productId)||saleIds.has(r.documentId);});}
    if(table==='audit_events'){
     if(sql.includes('json_each')){const ids=new Set(JSON.parse(args[0])),allowed=new Set(['sale.post','sale.update','sale.void','purchase.post','purchase.update','purchase.void','sale-cost-recovery.confirm']);list=list.filter(row=>{const r=JSON.parse(row.data_json);return ids.has(r.entityId)&&r.status==='committed'&&allowed.has(r.action);});}
     else if(sql.includes('sale-cost-recovery.confirm'))list=list.filter(row=>{const r=JSON.parse(row.data_json);return r.action==='sale-cost-recovery.confirm'&&r.version===1;});
    }return list.map(row=>({...row}));},
   get(...args){if(table==='app_settings')return tables[table].find(row=>row.record_key===args[0]);if(table==='stock_movements'&&sql.startsWith('SELECT 1'))return tables[table].find(row=>{const r=JSON.parse(row.data_json);return r.type==='sale-void'&&(typeof r.quantityDelta==='string'||typeof r.balanceAfter==='string');});return this.all(...args)[0];},
   run(...args){if(sql.startsWith('UPDATE')){const [json,key,before]=args,row=tables[table].find(r=>r.record_key===key&&r.data_json===before);if(!row)return {changes:0};row.data_json=json;return {changes:1};}
    if(sql.startsWith('INSERT')){const [key,json]=args,old=tables[table].find(r=>r.record_key===key);if(old){if(!sql.includes('ON CONFLICT'))throw Error('Duplicate accounting evidence');old.data_json=json;}else tables[table].push({record_key:key,data_json:json,rowid:tables[table].reduce((max,r)=>Math.max(max,r.rowid),0)+1});return {changes:1};}
    throw Error('Unsupported accounting write');}
  };
 }};
 return {native,tables,copy,original:state,createSafetySnapshot(options){const id='stock-recovery-'+crypto.randomUUID();copy.accountingSafetySnapshots??=[];copy.accountingSafetySnapshots.push({id,createdAt:new Date().toISOString(),context:options.context,state:structuredClone(state)});return {id,kind:'embedded-mobile-snapshot'};}};
}
function published(db){
 const next=db.copy,source=new Map(accountingDocuments(db.original).map(d=>[d.id,d]));
 for(const row of db.tables.documents){const after=JSON.parse(row.data_json),before=source.get(after.id);if(!before||JSON.stringify(before)===row.data_json)continue;const record=next.records.find(r=>String(r.id)===after.id);if(!record)continue;
  for(const [index,line]of after.lines.entries()){const target=record.lines[index];if(!target)continue;for(const key of ['costAtSale','grossProfit','saleCostRecovery'])if(Object.hasOwn(line,key))target[key]=structuredClone(line[key]);}
  if(after.revision!==before.revision)record.revision=after.revision;if(after.updatedAt!==before.updatedAt)record.updatedAt=after.updatedAt;
 }
 for(const row of db.tables.products){const after=JSON.parse(row.data_json),product=next.products.find(p=>String(p.id)===after.id);if(product&&JSON.stringify(product.stocks)!==JSON.stringify(after.stocks)){product.stocks=structuredClone(after.stocks);product.qty=product.stocks[next.warehouse]??0;}}
 // Preserve legacy row shapes and opaque source metadata on unchanged movements.
 const movements=new Map(db.tables.stock_movements.map(row=>[row.record_key,JSON.parse(row.data_json)]));
 for(const movement of next.stockEvents||[]){const after=movements.get(String(movement.id));if(after){if(after.quantityDelta!==movement.quantityDelta)movement.quantityDelta=after.quantityDelta;if(after.balanceAfter!==movement.balanceAfter)movement.balanceAfter=after.balanceAfter;}}
 const audits=db.tables.audit_events.map(row=>JSON.parse(row.data_json));if(audits.length||(next.auditEvents||[]).length)next.auditEvents=audits;
 const settings=db.tables.app_settings.map(row=>JSON.parse(row.data_json));if(settings.length||next.accountingSettings)next.accountingSettings=settings;
 return next;
}
export function accountingHealth(state,options={}){return healthCore(accountingMemory(state),options);}
export function readSaleCostRecoverySummary(state){return summaryCore(accountingMemory(state));}
export function recoverHistoricalSaleCosts(state,options={}){const db=accountingMemory(state),summary=recoverSaleCore(db,options);return {state:published(db),summary};}
export function recoverHistoricalStockData(state,options={}){const db=accountingMemory(state),summary=recoverStockCore(db,options);return {state:published(db),summary};}
export function confirmSaleCostRecovery(state,body,actor){const db=accountingMemory(state),result=confirmCore(db,{...body,documentId:String(body.documentId)},actor);return {state:published(db),result};}
export function recoverAccountingHistory(state,options={}){const stock=recoverHistoricalStockData(state,options),sale=recoverHistoricalSaleCosts(stock.state,options);return {state:sale.state,stock:stock.summary,sale:sale.summary};}
