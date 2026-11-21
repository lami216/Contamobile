// Desktop0.1.26 main f1cd62bf6fbd8cbaef49a479aff440027afba37b, lib/movement-statement.ts.
// A statement is literal user data, never a translation key or a movement label.
export function statementNote(source){return typeof source?.note==='string'?source.note.trim():'';}
export function movementStatement(source,fallback=''){return statementNote(source)||fallback;}

/** Untouched Desktop imports retain the financial movement's own statement.
 * Native edits are authoritative after their revision advances; this read-only
 * projection never repairs, backfills or persists older missing note fields. */
export function financialStatementIndex(state){
 const index=new Map();
 for(const row of state.financialMovements||[]){if(row.status==='reversed'||row.isReversal===true)continue;
  const account=String(row.paymentMethod??row.accountId),key=String(row.documentId)+'\u0000'+account,own='movement:'+String(row.id)+'\u0000'+account;
  if(!index.has(key))index.set(key,row);if(!index.has(own))index.set(own,row);
 }
 return index;
}
export function financialStatementSource(state,record,accountId,index=financialStatementIndex(state)){
 if(!record?.desktop||Number(record.revision??0)!==Number(record.desktop.revision??0))return record;
 const account=String(accountId),ids=[record.id,record.desktopId,record.desktopDocumentId,record.payrollDocumentId,record.desktop?.id].filter(v=>v!=null).map(String);
 for(const id of ids){const row=index.get(id+'\u0000'+account);if(row)return row;}
 return record.desktopMovementId!=null?index.get('movement:'+String(record.desktopMovementId)+'\u0000'+account)||record:record;
}
