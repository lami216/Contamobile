// Accounting contract: offline-conta bdcdf2d, lib/party-opening.ts.
// Native openings add a signed net contribution; legacy opening baselines are never replayed.
export const PARTY_OPENING_VERSION=1;
const clone=value=>structuredClone(value);
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const active=record=>!record.voided&&(!record.status||record.status==='posted');
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=1e14;
const identity=value=>String(value??'');
const uuid=context=>context.uuid?.()||globalThis.crypto.randomUUID();
const actorOf=context=>typeof context.actor==='function'?context.actor():context.actor;
export const partyOpeningPermission=()=> 'party.opening.manage';

function permitted(context){
 const actor=actorOf(context);
 if(context.can?context.can(partyOpeningPermission()):actor?.role==='owner')return;
 fail('لا تسمح صلاحيات حسابك بإدارة رصيد بداية الأطراف',403);
}
function note(value){
 if(value!==undefined&&value!==null&&typeof value!=='string')fail('ملاحظة رصيد البداية غير صالحة');
 const result=typeof value==='string'?value.trim():'';
 if(result.length>1000)fail('ملاحظة رصيد البداية يجب ألا تتجاوز 1000 حرف');
 return result||null;
}
function values(input){
 const direction=typeof input.direction==='string'?input.direction.trim():'';
 if(!['receivable','payable'].includes(direction))fail('اختر اتجاه رصيد البداية');
 const raw=input.amount;
 if(typeof raw!=='number'&&(typeof raw!=='string'||! /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim())))fail('مبلغ رصيد البداية يجب أن يكون رقمًا موجبًا صالحًا');
 const amount=Number(raw);
 if(!finite(amount)||amount<=0)fail('مبلغ رصيد البداية يجب أن يكون رقمًا موجبًا صالحًا');
 return {direction,amount,contribution:direction==='receivable'?amount:-amount};
}
function date(value,now){
 if(value===undefined||value===null||value==='')return now;
 if(typeof value!=='string')fail('تاريخ رصيد البداية غير صالح');
 const result=/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T12:00:00.000Z':value;
 try{if(new Date(result).toISOString()!==result)fail('تاريخ رصيد البداية غير صالح')}catch{fail('تاريخ رصيد البداية غير صالح')}
 return result;
}
export function ensurePartyOpeningState(state){
 // Do not infer or replace legacy balances and do not apply existing documents again.
 if(!state||!Array.isArray(state.parties)||!Array.isArray(state.records)||!state.opening?.parties)fail('بنية أرصدة بداية الأطراف غير صالحة');
 return false;
}
export function partyOpeningNetBalance(party){
 if(!party||!['customer','supplier'].includes(party.type)||!finite(party.balance))fail('رصيد الطرف المسجل غير صالح؛ راجع الحساب قبل تغيير رصيد البداية',409);
 const net=party.balance*(party.type==='supplier'?-1:1);return net===0?0:net;
}
export function partyOpeningNetDelta(record){
 return record?.kind==='party-opening'&&active(record)?Number(record.partyOpeningContribution??record.partyBalanceDelta??0):0;
}
export function partyOpeningStoredDelta(state,record){
 const party=state.parties.find(p=>identity(p.id)===identity(record.party));
 if(!party)fail('الطرف غير موجود',404);
 const delta=partyOpeningNetDelta(record)*(party.type==='supplier'?-1:1);return delta===0?0:delta;
}
export function activePartyOpening(state,partyId){
 const all=state.records.filter(r=>r.kind==='party-opening'&&identity(r.party)===identity(partyId)&&active(r));
 if(all.length>1)fail('توجد أرصدة بداية متعددة لهذا الطرف؛ راجع المستندات قبل المتابعة',409);
 return all[0]||null;
}
function owner(state,id){
 const found=state.parties.find(p=>identity(p.id)===identity(id));
 if(!found)fail('الطرف غير موجود',404);
 partyOpeningNetBalance(found);return found;
}
function assertDocument(record){
 if(record.legacyKey||record.legacy||record.partyOpeningVersion!==PARTY_OPENING_VERSION||!Number.isSafeInteger(record.revision)||record.revision<0)fail('مستند رصيد البداية غير قابل للتعديل بهذه الطريقة',409);
 const saved=values({direction:record.partyOpeningDirection,amount:record.partyOpeningAmount});
 if(record.partyOpeningContribution!==saved.contribution||record.partyBalanceDelta!==saved.contribution||record.total!==saved.amount||record.account!==null||record.paid!==0||record.due!==0||record.cashAmount!==0||!Array.isArray(record.lines)||record.lines.length)fail('بيانات مستند رصيد البداية غير متسقة؛ راجع الحساب',409);
 return saved;
}
export function validatePartyOpeningState(state){
 ensurePartyOpeningState(state);
 for(const record of state.records.filter(r=>r.kind==='party-opening')){
  owner(state,record.party);
  if(record.partyOpeningVersion===PARTY_OPENING_VERSION){
   assertDocument(record);
   for(const key of ['partyOpeningBalanceBefore','partyOpeningAppliedDelta','partyOpeningBalanceAfter'])if(!finite(record[key]))fail('بيانات مستند رصيد البداية غير متسقة؛ راجع الحساب',409);
   if(record.status!==undefined&&!['posted','voided'].includes(record.status)||record.status==='voided'&&!record.voided)fail('حالة رصيد البداية غير صالحة',409);
  }else if(!finite(record.partyBalanceDelta??record.partyOpeningContribution))fail('بيانات رصيد البداية التاريخي غير صالحة',409);
 }
 for(const party of state.parties)activePartyOpening(state,party.id);
 return true;
}
function original(state,input){
 const record=state.records.find(r=>identity(r.id)===identity(input.documentId)&&r.kind==='party-opening'&&active(r));
 if(!record)fail('رصيد البداية غير موجود أو ملغى',404);
 assertDocument(record);
 if(typeof input.expectedRevision!=='number'||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision!==record.revision)fail('تغير رصيد البداية؛ حدّث الحساب وأعد المحاولة',409);
 const party=owner(state,record.party);
 if(activePartyOpening(state,party.id)?.id!==record.id)fail('تغير مستند رصيد البداية؛ حدّث الحساب وأعد المحاولة',409);
 return {record,party};
}
function apply(party,delta,now){
 const before=partyOpeningNetBalance(party),after=before+delta;
 if(!finite(delta)||!finite(after))fail('نتيجة رصيد البداية غير صالحة');
 if(delta!==0){
  party.balance=after===0?0:after*(party.type==='supplier'?-1:1);party.lastMovementAt=now;
  if(party.archived&&after!==0){party.archived=false;party.archivedAt=null;}
 }
 return {before,delta,after};
}
function audit(state,context,action,beforeRecord,afterRecord,beforeParty,afterParty,delta,reason,now){
 const actor=actorOf(context);
 state.auditEvents??=[];
 state.auditEvents.push({id:'party-opening-audit-'+uuid(context),action,entityId:afterRecord.id,partyId:afterRecord.party,version:PARTY_OPENING_VERSION,status:'committed',createdAt:now,at:now,reason,beforeDocument:beforeRecord?clone(beforeRecord):null,afterDocument:clone(afterRecord),beforeParty:clone(beforeParty),afterParty:clone(afterParty),appliedDelta:delta,...(actor?{user:actor.id,userName:actor.name}: {})});
}
export function partyOpeningPreview(state,input){
 const record=input.documentId?original(state,input).record:null;
 const party=owner(state,record?.party??input.partyId),inputValues=values(input),before=partyOpeningNetBalance(party),delta=inputValues.contribution-(record?.partyOpeningContribution||0);
 if(!finite(before+delta))fail('نتيجة رصيد البداية غير صالحة');
 return {party:clone(party),before,delta,after:before+delta,...inputValues};
}
export function partyOpeningCommand(state,input,context={}){
 permitted(context);ensurePartyOpeningState(state);
 if(!['party-opening.post','party-opening.update','party-opening.void'].includes(input?.type))fail('عملية رصيد البداية غير صالحة');
 // Work on an isolated candidate. Any validation/audit failure leaves the caller intact.
 const candidate=clone(state),now=context.now||new Date().toISOString();date(now,now);
 let record,party,beforeRecord=null,beforeParty,effect,reason;
 if(input.type==='party-opening.post'){
  const saved=values(input),detail=note(input.note),occurredAt=date(input.occurredAt,now);
  party=owner(candidate,input.partyId);
  if(party.archived)fail('استعد الطرف المؤرشف قبل إضافة رصيد بداية',409);
  if(activePartyOpening(candidate,party.id))fail('رصيد البداية موجود؛ عدّل مستنده الحالي بدل إضافته مرة أخرى',409);
  const id=context.id??Math.max(100,...candidate.records.map(r=>r.id))+1;
  if(!Number.isSafeInteger(id)||id<=0||candidate.records.some(r=>r.id===id))fail('معرّف رصيد البداية غير صالح',409);
  beforeParty=clone(party);effect=apply(party,saved.contribution,now);reason=detail;
  record={id,number:'POB-'+id,kind:'party-opening',status:'posted',revision:0,revisions:[],date:occurredAt.slice(0,10),time:occurredAt.slice(11,16),occurredAt,createdAt:now,party:party.id,partyName:party.name,partyType:party.type,account:null,warehouse:null,title:'رصيد بداية الحساب',note:detail,total:saved.amount,paid:0,due:0,cashAmount:0,lines:[],partyOpeningVersion:PARTY_OPENING_VERSION,partyOpeningDirection:saved.direction,partyOpeningAmount:saved.amount,partyOpeningContribution:saved.contribution,partyBalanceDelta:saved.contribution};
  candidate.records.unshift(record);
 }else{
  ({record,party}=original(candidate,input));beforeRecord=clone(record);beforeParty=clone(party);reason=note(input.reason);
  if(input.type==='party-opening.update'){
   const saved=values(input),detail=input.note===undefined?record.note:note(input.note);
   effect=apply(party,saved.contribution-record.partyOpeningContribution,now);
   Object.assign(record,{partyName:party.name,total:saved.amount,note:detail,partyOpeningDirection:saved.direction,partyOpeningAmount:saved.amount,partyOpeningContribution:saved.contribution,partyBalanceDelta:saved.contribution});
  }else{
   effect=apply(party,-record.partyOpeningContribution,now);
   Object.assign(record,{status:'voided',voided:true,voidedAt:now,voidReason:reason});
  }
  record.revisions=[...(record.revisions||[]),{...beforeRecord,revisions:undefined}];record.revision++;record.updatedAt=now;
 }
 const actor=actorOf(context);
 Object.assign(record,{partyOpeningBalanceBefore:effect.before,partyOpeningAppliedDelta:effect.delta,partyOpeningBalanceAfter:effect.after,...(actor?{updatedBy:actor.id,updatedByName:actor.name}: {})});
 audit(candidate,context,input.type,beforeRecord,record,beforeParty,party,effect.delta,reason,now);
 validatePartyOpeningState(candidate);
 return {state:candidate,record:clone(record)};
}
