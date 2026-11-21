// Official journal-only manual cash sources can be edited by Desktop's lifecycle.
// Derive eligibility without migrating old phone data or trusting a mutable label.
const same=(a,b)=>a!==null&&a!==undefined&&b!==null&&b!==undefined&&String(a)===String(b);
const manual=new Set(['manual-deposit','manual-withdrawal']);
const active=row=>row?.status!=='reversed'&&row?.isReversal!==true&&!row?.reversalOfMovementId;
export function isEditableLegacyBankMovement(state,record){
 if(!record||record.importReadOnlyReason!=='financial-movement-source'||!record.desktopMovementId)return false;
 const original=record.revisions?.length?record.revisions[0]:record,raw=original.desktop;
 if(!raw||!manual.has(raw.type)||!raw.documentId||typeof raw.documentId!=='string'||!raw.documentId.trim()||!active(raw)||raw.reversedByMovementId||raw.status!==undefined&&raw.status!=='posted')return false;
 if(!same(raw.id,record.desktopMovementId)||!same(original.desktopMovementId,record.desktopMovementId))return false;
 const direction=raw.type==='manual-deposit'?'in':'out',kind=direction==='in'?'deposit':'withdraw';
 if(raw.direction!==direction||original.kind!==kind||original.voided||original.status!=='posted'||original.party!=null||!Array.isArray(original.lines)||original.lines.length)return false;
 if(typeof raw.amount!=='number'||!Number.isFinite(raw.amount)||raw.amount<=0||raw.amount>1e14||original.total!==raw.amount||original.paid!==raw.amount||original.due!==0)return false;
 if(typeof raw.occurredAt!=='string'||!Number.isFinite(Date.parse(raw.occurredAt))||original.occurredAt!==raw.occurredAt)return false;
 const originalRevision=raw.revision??0;
 if(!Number.isSafeInteger(originalRevision)||originalRevision<0||original.revision!==originalRevision||!Number.isSafeInteger(record.revision)||record.revision<originalRevision)return false;
 if(record.revisions?.length&&record.revisions.length!==record.revision-originalRevision)return false;
 const linked=(state.financialMovements||[]).filter(row=>same(row.documentId,record.id)&&active(row));
 if(linked.length!==1)return false;
 const source=linked[0],sourceRaw=source.desktop||source;
 if(!same(source.id,raw.id)||!manual.has(source.type)||source.type!==raw.type||source.direction!==direction||source.amount!==raw.amount||sourceRaw.documentId!==raw.documentId||sourceRaw.occurredAt!==raw.occurredAt||source.reversedByMovementId||source.status!==undefined&&source.status!=='posted'||(sourceRaw.revision??0)!==originalRevision)return false;
 if(!same(source.paymentMethod??source.accountId,original.account)||!(state.accounts||[]).some(row=>same(row.id,original.account)))return false;
 if((state.records||[]).some(row=>row.id!==record.id&&same(row.desktopId,raw.documentId)))return false;
 return true;
}
