// Desktop main879 app/expense-date-time.ts @8a6cb072c411ee698f3ca5a0f1943be80ccd2955.
// Selected accounting dates and actual recording instants have different meanings.
class ExpenseDateTimeError extends Error {
 constructor(message,status=400){super(message);this.status=status;}
}
export function expenseBusinessDate(value){
 const day=typeof value==='string'?value.trim():'',date=/^\d{4}-\d{2}-\d{2}$/.test(day)?new Date(`${day}T00:00:00.000Z`):null;
 if(!date||!Number.isFinite(date.valueOf())||date.toISOString().slice(0,10)!==day)throw new ExpenseDateTimeError('العنوان والتاريخ غير صالحين');
 return day;
}
function recordedInstant(now){if(!Number.isFinite(now.valueOf()))throw new ExpenseDateTimeError('وقت تسجيل المصروف غير صالح',500);return now.toISOString();}
export function expensePostDateTime(value,now=new Date()){
 const businessDate=expenseBusinessDate(value),recordedAt=recordedInstant(now);
 return {businessDate,occurredAt:businessDate+recordedAt.slice(10),recordedAt,createdAt:recordedAt};
}
export function expenseEditDateTime(value,original,now=new Date()){
 const businessDate=expenseBusinessDate(value),saved=original.occurredAt,match=typeof saved==='string'?/^(\d{4}-\d{2}-\d{2})(T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z)$/.exec(saved):null;
 let validOriginal=false;if(match)try{validOriginal=expenseBusinessDate(match[1])===match[1]}catch{}
 if(!match||!validOriginal)throw new ExpenseDateTimeError('لا يمكن تعديل المصروف لأن وقت السند الأصلي غير صالح',409);
 return {businessDate,occurredAt:businessDate===match[1]?saved:businessDate+match[2],updatedAt:recordedInstant(now)};
}
/** Native rows predating canonical timestamps retain their explicit date/time.
 * This projects their saved clock for validation; it never invents recordedAt. */
function originalExpenseInstant(record){
 if(Object.hasOwn(record,'occurredAt'))return {occurredAt:record.occurredAt,nativeLegacy:false};
 if(typeof record.desktop?.occurredAt==='string')return {occurredAt:record.desktop.occurredAt,nativeLegacy:false};
 const clock=String(record.time??'');
 if(!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/.test(clock))throw new ExpenseDateTimeError('لا يمكن تعديل المصروف لأن وقت السند الأصلي غير صالح',409);
 let day;try{day=expenseBusinessDate(record.date)}catch{throw new ExpenseDateTimeError('لا يمكن تعديل المصروف لأن وقت السند الأصلي غير صالح',409)}
 return {occurredAt:day+'T'+clock+(clock.length===5?':00.000':'')+'Z',nativeLegacy:true};
}
/** Apply the canonical clock rules without changing IDs or legacy proof fields. */
export function prepareExpenseRecordDateTime(record,previous=null,now=new Date()){
 const next={...record},day=expenseBusinessDate(record.date);
 if(!previous){Object.assign(next,expensePostDateTime(day,now));next.date=day;next.time=next.occurredAt.slice(11,16);return next;}
 const source=originalExpenseInstant(previous),dateTime=expenseEditDateTime(day,source,now);Object.assign(next,dateTime);next.date=day;
 next.time=source.nativeLegacy?previous.time:dateTime.occurredAt.slice(11,16);
 if(source.nativeLegacy)delete next.occurredAt;
 for(const key of ['createdAt','recordedAt'])if(Object.hasOwn(previous,key))next[key]=previous[key];else delete next[key];
 return next;
}
