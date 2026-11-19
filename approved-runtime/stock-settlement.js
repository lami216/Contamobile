// Desktop 870: settlement numbers are display metadata, never document identities.
// Source: app/stock-settlement.ts and lib/document-sequences.ts @ e4cbe46fd59e302140e6d885c69ca98376d4a00d.
export const STOCK_SETTLEMENT_COUNTER_ID='documentSequence:stock-settlement';
const own=(row,key)=>Object.hasOwn(row||{},key);
const text=value=>typeof value==='string'?value.trim():'';
export function isOpeningStockDocument(record){
 if(!record||record.kind!=='adjustment')return false;
 const number=text(record.number),title=text(record.title);
 return record.openingStock===true||record.openingCorrection===true||number.startsWith('OPEN-COR')||/^OPEN(?:-|$)/.test(number)||['رصيد بداية','تصحيح رصيد البداية','إضافة رصيد افتتاحي'].includes(title)||(own(record,'openingStockBefore')&&own(record,'openingStockAfter'))||own(record,'openingStockAfter')||own(record,'openingTotalBefore')&&own(record,'openingTotalAfter');
}
export function isStockSettlementDocument(record){return Boolean(record&&record.kind==='adjustment'&&record.productArchiveStockClearance!==true&&!isOpeningStockDocument(record));}
export function validSettlementSequence(value){return typeof value==='number'&&Number.isSafeInteger(value)&&value>0;}
function counterState(state){
 if(state.counters!==undefined&&!Array.isArray(state.counters))throw Error('عداد التسويات غير صالح');
 const rows=(state.counters||[]).filter(row=>row?._id===STOCK_SETTLEMENT_COUNTER_ID);
 if(rows.length>1)throw Error('عداد التسويات غير صالح');
 const counter=rows[0],saved=counter?.value,mirror=state.sequences?.['stock-settlement'];
 if(saved!==undefined&&(typeof saved!=='number'||!Number.isSafeInteger(saved)||saved<0)||mirror!==undefined&&(typeof mirror!=='number'||!Number.isSafeInteger(mirror)||mirror<0))throw Error('عداد التسويات غير صالح');
 return {counter,maximum:Math.max(saved??0,mirror??0)};
}
/** Mutates a caller-owned staged state only; all validation precedes assignments.
 * Array order is the source collection insertion order, matching Desktop.find().
 * An adapter may provide orderedRecords when its presentation array is reversed. */
export function normalizeStockSettlementSequences(state,{orderedRecords=state.records||[],now}={}){
 const {counter,maximum:saved}=counterState(state),records=orderedRecords.filter(isStockSettlementDocument),used=new Set(),missing=[];let maximum=saved;
 for(const row of records){if(validSettlementSequence(row.settlementSequence)&&!used.has(row.settlementSequence)){used.add(row.settlementSequence);maximum=Math.max(maximum,row.settlementSequence);}else missing.push(row);}
 const planned=[];for(const row of missing){if(maximum>=Number.MAX_SAFE_INTEGER)throw Error('تعذر تخصيص رقم تسوية صالح');planned.push([row,++maximum]);}
 const hasReservation=records.length||counter||maximum>0;
 const updateCounter=hasReservation&&(!counter||counter.value!==maximum),updateMirror=hasReservation&&state.sequences?.['stock-settlement']!==maximum;
 for(const [row,sequence]of planned)row.settlementSequence=sequence;
 if(updateCounter){state.counters??=[];if(counter){counter.value=maximum;if(now)counter.updatedAt=now;}else state.counters.push({_id:STOCK_SETTLEMENT_COUNTER_ID,value:maximum,...(now?{createdAt:now,updatedAt:now}:{})});}
 if(updateMirror){state.sequences??={};state.sequences['stock-settlement']=maximum;}
 return {updated:planned.length,maximum,changed:Boolean(planned.length||updateCounter||updateMirror)};
}
/** Call only inside the financial commit; its owner also rolls back this reservation. */
export function nextStockSettlementSequence(state,{now=new Date().toISOString()}={}){
 const result=normalizeStockSettlementSequences(state,{now});if(result.maximum>=Number.MAX_SAFE_INTEGER)throw Error('تعذر تخصيص رقم تسوية صالح');
 const sequence=result.maximum+1;state.counters??=[];const counter=state.counters.find(row=>row?._id===STOCK_SETTLEMENT_COUNTER_ID);
 if(counter){counter.value=sequence;counter.updatedAt=now;}else state.counters.push({_id:STOCK_SETTLEMENT_COUNTER_ID,value:sequence,createdAt:now,updatedAt:now});
 state.sequences??={};state.sequences['stock-settlement']=sequence;return sequence;
}
export function displayDocumentNumber(record){
 if(isStockSettlementDocument(record)&&validSettlementSequence(record.settlementSequence))return String(record.settlementSequence);
 if(['sale','purchase','expense'].includes(record?.kind)&&Number.isSafeInteger(Number(record.sequence))&&Number(record.sequence)>0)return String(record.sequence);
 return String(record?.number??'—');
}
export function displayStockMovementDocumentNumber(movement,record){return record&&isStockSettlementDocument(record)&&validSettlementSequence(record.settlementSequence)?String(record.settlementSequence):String(movement?.documentNumber??record?.number??'');}
