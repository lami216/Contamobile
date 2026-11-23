import {statementNote} from './movement-statement.js';

// Desktop main 2327ccc: document-notes.ts and conta-app's official presentation.
// These are read-only display rules. Never change a document or revive a note
// from a reversal, revision reason, mutable product name or current party card.
const own=(value,key)=>value!=null&&Object.hasOwn(value,key);
function openingStock(record){
 if(record?.openingStock===true||record?.openingCorrection===true)return true;
 const source=record?.desktop||record,number=typeof source?.number==='string'?source.number.trim():'',title=typeof source?.title==='string'?source.title.trim():'';
 return source?.openingCorrection===true||number.startsWith('OPEN-COR')||/^OPEN(?:-|$)/.test(number)
  ||['رصيد بداية','تصحيح رصيد البداية','إضافة رصيد افتتاحي'].includes(title)||own(source,'openingStockAfter');
}
export function documentSavedNote(record){
 const note=statementNote(record);
 if(note)return {label:'ملاحظة',value:note};
 // Desktop counts store their user reason in title; native phone counts use
 // note and keep a product/system title. Only the imported Desktop title is a
 // fallback, and opening/archive titles are never user-entered statements.
 if(record?.kind==='adjustment'&&record.desktop&&!openingStock(record)&&record.productArchiveStockClearance!==true&&record.desktop.productArchiveStockClearance!==true){
  const value=statementNote({note:record.title});if(value)return {label:'البيان',value};
 }
 return null;
}
export function appendDocumentNote(fields,note,translate=value=>value){
 if(!note||fields.some(([label,value])=>[translate('ملاحظة'),translate('الملاحظة'),translate('ملاحظات'),translate('البيان')].includes(label)&&typeof value==='string'&&value.trim()===note.value))return fields;
 return [...fields,[translate(note.label),note.value]];
}
