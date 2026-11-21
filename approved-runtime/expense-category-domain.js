// Classification-only port of offline-conta bdcdf2d lib/expense-categories.ts.
const clone=value=>structuredClone(value);
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const idOf=value=>String(value??'').trim();
const validId=value=>typeof value==='string'&&value.trim().length>0||Number.isSafeInteger(value)&&value>0;
const own=(value,key)=>Object.hasOwn(value,key);
export const expenseCategoryName=value=>typeof value==='string'?value.normalize('NFKC').trim().replace(/\s+/g,' '):'';
export const expenseCategoryKind=category=>category?.kind==='nonrecurring'?'nonrecurring':'recurring';
export const expenseCategoryPermission=type=>({'expense-category.create':'expenses.create','expense-category.update':'expenses.edit','expense-category.delete':'expenses.delete'})[type]||'expenses.view';
function kindInput(value){if(value===undefined)return'recurring';if(!['recurring','nonrecurring'].includes(value))fail('نوع فئة المصروف غير صالح');return value;}
function nameInput(value){const name=expenseCategoryName(value);if(!name||name.length>80)fail('اسم فئة المصروف مطلوب ولا يتجاوز 80 حرفًا');return name;}
export function ensureExpenseCategoryState(state){if(!state||!Array.isArray(state.records))fail('بنية فئات المصاريف غير صالحة');if(state.expenseCategories===undefined){state.expenseCategories=[];return true;}return false;}
export function validateExpenseCategoryState(state){
 if(state.expenseCategories!==undefined&&!Array.isArray(state.expenseCategories)||state.expenseCategories?.length>10000)fail('قائمة فئات المصاريف غير صالحة');
 const ids=new Set(),names=new Set();
 for(const category of state.expenseCategories||[]){
  if(!category||!validId(category.id)||ids.has(idOf(category.id)))fail('معرّف فئة المصروف غير صالح');ids.add(idOf(category.id));
  const name=nameInput(category.name).toLocaleLowerCase();if(names.has(name))fail('فئة المصروف موجودة بالفعل',409);names.add(name);
  if(category.kind!==undefined&&!['recurring','nonrecurring'].includes(category.kind)||category.isArchived!==undefined&&typeof category.isArchived!=='boolean'||category.revision!==undefined&&(!Number.isSafeInteger(category.revision)||category.revision<0))fail('بيانات فئة المصروف غير صالحة');
 }
 for(const record of state.records||[]){
  if(record.expenseCategoryId!==undefined&&record.expenseCategoryId!==null&&record.expenseCategoryId!==''&&(!validId(record.expenseCategoryId)||!ids.has(idOf(record.expenseCategoryId))))fail('مصروف يشير إلى فئة غير موجودة');
  if(record.expenseCategoryName!==undefined&&record.expenseCategoryName!==null&&typeof record.expenseCategoryName!=='string')fail('اسم فئة المصروف المحفوظ غير صالح');
 }
 return true;
}
function find(state,input){
 const category=(state.expenseCategories||[]).find(c=>idOf(c.id)===idOf(input.id));if(!category)fail('فئة المصروف غير موجودة',404);
 const revision=category.revision??0;
 if(!Number.isSafeInteger(revision)||revision<0)fail('بيانات فئة المصروف غير صالحة؛ أعد تحميل الصفحة',409);
 if(input.expectedRevision!==undefined){
  if(typeof input.expectedRevision!=='number'||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)fail('إصدار فئة المصروف غير صالح');
  if(input.expectedRevision!==revision)fail('تغيرت فئة المصروف؛ أعد تحميل الصفحة ثم حاول مجددًا',409);
 }
 return{category,revision};
}
function unique(state,name,except){
 const duplicate=(state.expenseCategories||[]).find(c=>idOf(c.id)!==idOf(except)&&expenseCategoryName(c.name).toLocaleLowerCase()===name.toLocaleLowerCase());
 if(duplicate)fail(duplicate.isArchived?'اسم فئة المصروف مستخدم لفئة مؤرشفة؛ عدّل الفئة الموجودة أو اختر اسمًا آخر':'فئة المصروف موجودة بالفعل',409);
}
export function expenseCategorySnapshot(state,input,original){
 if(!own(input,'expenseCategoryId'))return{expenseCategoryId:original?.expenseCategoryId??null,expenseCategoryName:original?.expenseCategoryName??null};
 if(input.expenseCategoryId!==null&&typeof input.expenseCategoryId!=='string')fail('فئة المصروف غير صالحة');
 const id=idOf(input.expenseCategoryId);if(!id)return{expenseCategoryId:null,expenseCategoryName:null};
 const category=(state.expenseCategories||[]).find(c=>idOf(c.id)===id);if(!category)fail('فئة المصروف غير موجودة',404);
 const retained=idOf(original?.expenseCategoryId)===id;
 if(category.isArchived&&!retained)fail('فئة المصروف مؤرشفة؛ اختر فئة نشطة',409);
 return{expenseCategoryId:retained?id:category.id,expenseCategoryName:retained?original?.expenseCategoryName??category.name:category.name};
}
export function expenseCategoryForRecord(state,record){
 const id=idOf(record?.expenseCategoryId),category=id?(state.expenseCategories||[]).find(c=>idOf(c.id)===id):null;
 return{expenseCategoryId:id,expenseCategoryName:category?.name??record?.expenseCategoryName??'',expenseCategoryKind:expenseCategoryKind(category)};
}
export function expenseCategoryMatches(state,record,filters={}){
 const value=expenseCategoryForRecord(state,record);
 if(filters.expenseCategoryKind&&!['recurring','nonrecurring'].includes(filters.expenseCategoryKind))fail('نوع فئة المصروف غير صالح');
 return(!filters.expenseCategoryId||(filters.expenseCategoryId==='__uncategorized'?!value.expenseCategoryId:idOf(filters.expenseCategoryId)===value.expenseCategoryId))&&(!filters.expenseCategoryKind||filters.expenseCategoryKind===value.expenseCategoryKind);
}
export function expenseCategoryCommand(state,input,context={}){
 const cap=expenseCategoryPermission(input?.type),actor=typeof context.actor==='function'?context.actor():context.actor;
 if(!(context.can?context.can(cap):actor?.role==='owner'))fail('لا تسمح صلاحيات حسابك بهذا الإجراء',403);
 if(!['expense-category.create','expense-category.update','expense-category.delete'].includes(input?.type))fail('عملية فئة المصروف غير صالحة');
 const candidate=clone(state);ensureExpenseCategoryState(candidate);validateExpenseCategoryState(candidate);
 const now=context.now||new Date().toISOString(),uuid=()=>context.uuid?.()||globalThis.crypto.randomUUID();let before=null,after=null,result,disposition;
 if(input.type==='expense-category.create'){
  const name=nameInput(input.name),kind=kindInput(input.kind);unique(candidate,name);
  const id=context.id??'expense-category-'+uuid();if(!validId(id)||candidate.expenseCategories.some(c=>idOf(c.id)===idOf(id)))fail('معرّف فئة المصروف غير صالح',409);
  after={id,name,normalizedName:name.toLocaleLowerCase(),kind,isArchived:false,revision:0,createdAt:now};candidate.expenseCategories.push(after);result=id;
 }else{
  const found=find(candidate,input),category=found.category,revision=found.revision;before=clone(category);
  if(input.type==='expense-category.update'){
   const name=nameInput(own(input,'name')?input.name:category.name),kind=input.kind===undefined?expenseCategoryKind(category):kindInput(input.kind);unique(candidate,name,category.id);
   const normalizedName=name.toLocaleLowerCase();if(category.name===name&&category.kind===kind&&category.normalizedName===normalizedName)return {state:candidate,result:category.id,category:clone(category),changed:false};
   Object.assign(category,{name,normalizedName,kind,revision:revision+1,updatedAt:now});after=category;result=category.id;
  }else{
   const used=candidate.records.some(r=>own(r,'expenseCategoryId')&&idOf(r.expenseCategoryId)===idOf(category.id));
   disposition=used?'archived':'deleted';result={id:idOf(category.id),disposition};
   if(used){if(category.isArchived===true)return {state:candidate,result,category:clone(category),changed:false};Object.assign(category,{isArchived:true,archivedAt:now,updatedAt:now,revision:revision+1});after=category;}
   else candidate.expenseCategories=candidate.expenseCategories.filter(c=>c!==category);
  }
 }
 candidate.auditEvents??=[];candidate.auditEvents.push({id:'expense-category-audit-'+uuid(),action:input.type,status:'committed',entityId:after?.id??before?.id,createdAt:now,at:now,before:before?clone(before):null,after:after?clone(after):null,...(disposition?{disposition}:{}),...(actor?{user:actor.id,userName:actor.name}:{})});
 validateExpenseCategoryState(candidate);return {state:candidate,result:clone(result),category:after?clone(after):null,changed:true};
}
