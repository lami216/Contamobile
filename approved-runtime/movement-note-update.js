// Desktop main882 transaction-lifecycle.ts @ f1cd62bf6fbd8cbaef49a479aff440027afba37b.
const kinds=new Set(['receive','pay','deposit','withdraw','transfer']);
const own=(value,key)=>value!=null&&Object.hasOwn(value,key);
export const isMovementNoteRecord=record=>Boolean(record&&kinds.has(record.kind));

/** Omission preserves the source verbatim; an explicit blank/null clears it. */
export function noteForUpdate(body,original,fallback){
 if(Object.hasOwn(body,'note'))return typeof body.note==='string'?body.note.trim()||null:null;
 const saved=original&&Object.hasOwn(original,'note')?original.note:fallback?.note;
 return typeof saved==='string'?saved:null;
}
function sourceNote(record){
 const source=record?.desktop;
 // Older phone importers projected missing/null notes to ''. Consult their
 // unchanged original envelope, never revive it after a native edit or clear.
 const untouched=source&&typeof source==='object'&&Number(record.revision??0)===Number(source.revision??0)&&!(record.revisions||[]).length;
 if(untouched&&record.note===''&&typeof source.note!=='string')return source;
 return record;
}
function aliases(record){
 return new Set([record?.id,record?.canonicalId,record?.desktopId,record?.desktopDocumentId,record?.desktop?.id,record?.desktop?.documentId].filter(value=>value!=null&&value!=='').map(String));
}
/** Find only the current authoritative source, never a reversal explanation. */
export function movementNoteFallback(state,record){
 if(!isMovementNoteRecord(record))return undefined;
 const ids=aliases(record);
 if(record.kind==='transfer'){
  const transferIds=new Set([record.transferId,record.desktopTransferId,record.desktopTransfer?.id,record.desktop?.transferId].filter(value=>value!=null).map(String));
  return (state.desktopAccountTransfers||[]).find(row=>row.status!=='voided'&&(ids.has(String(row.documentId))||transferIds.has(String(row.id))))||record.desktopTransfer;
 }
 const type={receive:'party-receipt',pay:'party-payment',deposit:'manual-deposit',withdraw:'manual-withdrawal'}[record.kind];
 return (state.financialMovements||[]).find(row=>row.type===type&&row.status!=='reversed'&&row.isReversal!==true&&(ids.has(String(row.documentId))||record.desktopMovementId!=null&&String(row.id)===String(record.desktopMovementId)));
}
/** Read-only projection used by existing phone fields and source presentation. */
export function currentMovementNote(state,record){
 if(!isMovementNoteRecord(record))return typeof record?.note==='string'?record.note:null;
 return noteForUpdate({},sourceNote(record),movementNoteFallback(state,record));
}
export function prepareMovementNote(state,next,previous){
 if(!isMovementNoteRecord(next))return next;
 next.note=noteForUpdate(next,sourceNote(previous),movementNoteFallback(state,previous));
 return next;
}
