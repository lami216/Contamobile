// Desktop 862 read/party identity contracts, adapted only to the phone's IDs and kind names.
// Source: lib/document-read-model.ts and app/api/command/route.ts party.create/update.
const text=value=>typeof value==='string'?value.trim():'';
const sameId=(left,right)=>left!==null&&left!==undefined&&right!==null&&right!==undefined&&String(left)===String(right);
const partyId=record=>Object.hasOwn(record,'party')?record.party:record.partyId;
const partyIndexes=new WeakMap(),emptyParties=[];
const partyOf=(state,record)=>{if(!state||typeof state!=='object')return undefined;const rows=state.parties||emptyParties;let saved=partyIndexes.get(state);if(!saved||saved.rows!==rows||saved.length!==rows.length){saved={rows,length:rows.length,index:new Map(rows.map(p=>[String(p.id),p]))};partyIndexes.set(state,saved)}return saved.index.get(String(partyId(record)))};
// Native phone parties have `type`; Desktop's pre-role records were suppliers.
const partyType=party=>Object.hasOwn(party||{},'type')?(party.type==='customer'?'customer':'supplier'):(party?.partyType==='customer'?'customer':'supplier');
const sale=['pos.view','pos.edit','pos.delete'];
const purchase=['purchases.view','purchases.edit','purchases.delete'];
const expense=['expenses.view','expenses.edit','expenses.delete'];
const customer=['customers.view','customers.edit','customers.delete','customers.collect.edit','customers.collect.delete'];
const supplier=['suppliers.view','suppliers.edit','suppliers.delete','suppliers.pay.edit','suppliers.pay.delete'];
const stockTransfer=['warehouses.transfer','warehouses.transfer.edit','warehouses.transfer.delete'];
const stockAdjustment=['warehouses.adjust','warehouses.adjust.edit','warehouses.adjust.delete'];
const accountTransfer=['banks.view','banks.movements.view','banks.transfer.edit','banks.transfer.delete'];
const accountAdjustment=['banks.view','banks.movements.view','banks.deposit_withdraw.edit','banks.deposit_withdraw.delete'];
function readScope(state,record){
 if(!record||typeof record!=='object')return {caps:[],fallback:'records.view'};
 const kind=record.kind,party=partyOf(state,record),related=party?(partyType(party)==='customer'?customer:supplier):[];
 if(kind==='employee-accrual'||kind==='employee-payment'||kind==='employee-closure')return {caps:['employees.view'],fallback:'employees.view',private:true};
 if(kind==='sale')return {caps:[...sale,...(party&&partyType(party)==='customer'?customer:[])],fallback:'pos.view'};
 if(kind==='purchase')return {caps:[...purchase,...(party&&partyType(party)==='supplier'?supplier:[])],fallback:'purchases.view'};
 if(kind==='party-opening')return {caps:['party.opening.manage',...related],fallback:'party.opening.manage'};
 if(kind==='expense')return {caps:expense,fallback:'expenses.view'};
 if(kind==='stocktransfer')return {caps:stockTransfer,fallback:'warehouses.transfer'};
 if(kind==='adjustment')return {caps:stockAdjustment,fallback:'warehouses.adjust'};
 if(kind==='transfer'||kind==='account-transfer')return {caps:accountTransfer,fallback:'banks.view'};
 if(['deposit','withdraw','account-adjustment'].includes(kind))return {caps:accountAdjustment,fallback:'banks.view'};
 if(['receive','pay','payment','settlement','offset','return'].includes(kind))return {caps:related,fallback:party&&partyType(party)==='supplier'?'suppliers.view':'customers.view'};
 return {caps:[],fallback:'records.view'};
}
export function canReadRecord(state,record,can){
 if(!record||typeof record!=='object'||typeof can!=='function')return false;
 const scope=readScope(state,record);
 return scope.private?Boolean(can('employees.view')):Boolean(can('records.view')||scope.caps.some(cap=>can(cap)));
}
/** A capability for the phone's shared action/button gate, including denied actions. */
export function recordReadCapability(state,record,can){
 const scope=readScope(state,record);
 if(scope.private)return 'employees.view';
 if(typeof can==='function'){
  if(can('records.view'))return 'records.view';
  const allowed=scope.caps.find(cap=>can(cap));if(allowed)return allowed;
 }
 // A missing party must not grant access through an unrelated party workspace.
 // For example, customers.view alone cannot read an unlinked old payment.
 return typeof can==='function'&&can(scope.fallback)?'records.view':scope.fallback;
}
export function validatePartyIdentity(state,input={}){
 const hasId=input.id!==undefined&&input.id!==null&&input.id!=='',existing=hasId?(state?.parties||[]).find(party=>sameId(party.id,input.id)):null;
 const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
 if(hasId&&(!existing||(Object.hasOwn(existing,'archived')?existing.archived===true:existing.isArchived===true)))fail('الطرف غير موجود',404);
 const type=existing?partyType(existing):text(input.type??input.partyType);
 const name=text(input.name),phone=text(input.phone);
 if(!name)fail('اسم الحساب مطلوب');
 if(!['customer','supplier'].includes(type))fail('نوع الحساب غير صالح');
 if(phone&&(state?.parties||[]).some(party=>!sameId(party.id,existing?.id)&&partyType(party)===type&&party.phone===phone))fail('رقم الهاتف مستخدم لحساب آخر من النوع نفسه',409);
 return {...(existing?{id:existing.id}:{}),name,phone,type};
}
/** Current display/search identity only; stored financial and as-issued snapshots are untouched. */
export function partyDisplayName(state,record={}){
 const current=text(partyOf(state,record)?.name);
 if(Object.hasOwn(record,'party')&&(record.party===null||record.party===undefined||record.party===''))return text(record.title)||text(record.partyName)||text(record.partyNameOriginal)||text(record.desktop?.partyName);
 return current||text(record.partyName)||text(record.title)||text(record.partyNameOriginal)||text(record.desktop?.partyName);
}
