import {expenseCategoryCommand,expenseCategoryKind,expenseCategoryPermission,expenseCategorySnapshot} from './expense-category-domain.js';

export const expenseCategoryFrench={
 'فئات المصاريف':'Catégories de dépenses','فئة المصروف':'Catégorie de dépense','اسم فئة المصروف':'Nom de la catégorie','نوع الفئة':'Type de catégorie','متكررة':'Récurrente','غير متكررة':'Non récurrente','دون فئة':'Sans catégorie','إدارة الفئات':'Gérer les catégories','فئة جديدة':'Nouvelle catégorie','تعديل':'Modifier','حذف':'Supprimer','مؤرشف':'Archivée','نشط':'Active','حفظ':'Enregistrer','رجوع':'Retour','الحالة':'État','لا توجد فئات مصاريف':'Aucune catégorie de dépense','تغيير نوع الفئة يعيد تصنيف المصاريف السابقة دون تغيير مبالغها.':'Modifier le type reclasse les anciennes dépenses sans modifier leurs montants.','حذف الفئة يخفيها من الاختيارات الجديدة ويحفظ المصاريف السابقة المرتبطة بها.':'La suppression masque la catégorie des nouveaux choix et conserve les dépenses liées.','لديك تعديلات غير محفوظة.':'Vous avez des modifications non enregistrées.','متابعة التعديل':'Continuer la modification','تجاهل التعديل':'Abandonner les modifications',
 'نوع فئة المصروف غير صالح':'Le type de catégorie de dépense est invalide.','اسم فئة المصروف مطلوب ولا يتجاوز 80 حرفًا':'Saisissez un nom de catégorie de 80 caractères au maximum.','بنية فئات المصاريف غير صالحة':'Les données des catégories de dépenses sont invalides.','قائمة فئات المصاريف غير صالحة':'La liste des catégories de dépenses est invalide.','معرّف فئة المصروف غير صالح':'L’identifiant de catégorie de dépense est invalide.','فئة المصروف موجودة بالفعل':'Cette catégorie de dépense existe déjà.','بيانات فئة المصروف غير صالحة':'Les données de catégorie de dépense sont invalides.','مصروف يشير إلى فئة غير موجودة':'Une dépense référence une catégorie introuvable.','اسم فئة المصروف المحفوظ غير صالح':'Le nom enregistré de la catégorie est invalide.','فئة المصروف غير موجودة':'La catégorie de dépense est introuvable.','بيانات فئة المصروف غير صالحة؛ أعد تحميل الصفحة':'La catégorie est invalide. Actualisez la page.','إصدار فئة المصروف غير صالح':'La version de la catégorie est invalide.','تغيرت فئة المصروف؛ أعد تحميل الصفحة ثم حاول مجددًا':'La catégorie a changé. Actualisez la page puis réessayez.','اسم فئة المصروف مستخدم لفئة مؤرشفة؛ عدّل الفئة الموجودة أو اختر اسمًا آخر':'Ce nom appartient à une catégorie archivée. Modifiez cette catégorie ou choisissez un autre nom.','فئة المصروف غير صالحة':'La catégorie de dépense est invalide.','فئة المصروف مؤرشفة؛ اختر فئة نشطة':'La catégorie est archivée. Choisissez une catégorie active.','لا تسمح صلاحيات حسابك بهذا الإجراء':'Vos droits ne permettent pas cette action.','عملية فئة المصروف غير صالحة':'L’opération de catégorie de dépense est invalide.'
};

export function installExpenseCategoryFeatures(api){
 let editor=null,editorBaseline='',pendingDelete=null,returnForm=null,pendingNavigation=null,stagedCategory=null,listPage=1;
 const state=()=>api.getState?api.getState():typeof api.state==='function'?api.state():api.state||S;
 const language=()=>typeof api.language==='function'?api.language():typeof appLanguage==='function'?appLanguage():'ar';
 const text=value=>language()==='fr'?expenseCategoryFrench[value]||value:value;
 const escape=value=>api.escape?api.escape(value):String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const currentModal=()=>api.getModal?api.getModal():typeof api.modal==='function'?api.modal():typeof modal!=='undefined'?modal:api.modal;
 const redraw=()=>api.render?api.render():render();
 const show=value=>{if(api.setModal)api.setModal(value);else if(api.showModal)api.showModal(value);else if(api.show)api.show(value);else modal=value;return redraw()};
 const can=cap=>api.can(cap);
 const button=(label,command,id='',tone='')=>`<button type="button" class="feature-button ${tone}" data-action="site:feature:${command}${id!==''?':'+encodeURIComponent(id):''}">${escape(text(label))}</button>`;
 const field=(label,html)=>`<label class="field"><span>${escape(text(label))}</span>${html}</label>`;
 const categories=()=>state().expenseCategories||[];
 const find=id=>categories().find(c=>String(c.id)===String(id));
 const actor=()=>typeof api.actor==='function'?api.actor():api.actor;
 function localized(work){try{return work()}catch(error){if(language()==='fr')error.message=expenseCategoryFrench[error.message]||error.message;throw error}}
 function capture(){if(editor&&currentModal()==='feature-expense-category-editor')editor={...editor,...api.form()};}
 function dirty(){capture();return editor&&JSON.stringify(editor)!==editorBaseline;}
 function load(category){editor={...(category?{id:category.id,expectedRevision:category.revision??0}:{}),name:category?.name||'',kind:expenseCategoryKind(category)};editorBaseline=JSON.stringify(editor);return show('feature-expense-category-editor')}
 function back(){
  editor=null;editorBaseline='';pendingDelete=null;
  if(!returnForm)return show(null);
  const saved=returnForm;returnForm=null;show('expense');
  const root=typeof document!=='undefined'?document.querySelector('#sheet-form'):null;
  if(root)for(const [name,value]of Object.entries(saved)){const input=root.elements.namedItem(name);if(input){input.value=value??'';input.dispatchEvent(new Event('input',{bubbles:true}))}}
 }
 const group={
  handles:command=>command.startsWith('expense-categor'),
  permission(command){if(command==='expense-category-save')return expenseCategoryPermission(editor?.id?'expense-category.update':'expense-category.create');if(command==='expense-category-new')return'expenses.create';if(command==='expense-category-edit')return'expenses.edit';if(command.startsWith('expense-category-delete'))return'expenses.delete';return'expenses.view'},
  managerButton(){return button('إدارة الفئات','expense-categories')},
  expenseField(original=null,value){
   const selected=value===undefined?original?.expenseCategoryId??'':value;
   const list=categories().filter(c=>!c.isArchived||String(c.id)===String(original?.expenseCategoryId));
   return `<div class="feature-category-bar">${field('فئة المصروف',`<select name="expenseCategoryId"><option value="">${escape(text('دون فئة'))}</option>${list.map(c=>`<option value="${escape(c.id)}" ${String(selected)===String(c.id)?'selected':''}>${escape(c.name)}</option>`).join('')}</select>`)}${can('expenses.view')?group.managerButton():''}</div>`;
  },
  snapshot(input,original){return localized(()=>expenseCategorySnapshot(state(),input,original))},
  before(action){
   if(!['feature-expense-categories','feature-expense-category-editor'].includes(currentModal()))return false;
   if(action==='close'&&dirty()){pendingNavigation='close';show('feature-expense-category-leave');return true;}
   if(action==='close'){back();return true;}return false;
  },
  action(command,id){return localized(()=>{
   id=id===undefined?id:decodeURIComponent(id);
   if(command==='expense-category-page'){listPage=Math.max(1,Number(id)||1);return redraw()}
   if(command==='expense-categories'){if(currentModal()==='expense')returnForm={...api.form()};editor=null;return show('feature-expense-categories')}
   if(command==='expense-category-new'){if(dirty()){pendingNavigation='new';return show('feature-expense-category-leave')}return load(null)}
   if(command==='expense-category-edit'){if(dirty()){pendingNavigation='edit:'+id;return show('feature-expense-category-leave')}const category=find(id);if(!category)throw Error(text('فئة المصروف غير موجودة'));return load(category)}
   if(command==='expense-category-save'){
    capture();if(!editor)throw Error(text('عملية فئة المصروف غير صالحة'));
    const {state:next,result,changed}=expenseCategoryCommand(state(),{...editor,type:editor.id?'expense-category.update':'expense-category.create'},{can:api.can,actor:actor()});api.replaceState(next);
    stagedCategory={result,created:!editor.id,changed};if(!changed)group.afterSave();return show('feature-expense-categories');
   }
   if(command==='expense-category-delete'){
    const category=find(id);if(!category)throw Error(text('فئة المصروف غير موجودة'));pendingDelete={id:category.id,expectedRevision:category.revision??0};return show('feature-expense-category-delete');
   }
   if(command==='expense-category-delete-confirm'){
    if(!pendingDelete)throw Error(text('فئة المصروف غير موجودة'));
    const {state:next,changed}=expenseCategoryCommand(state(),{...pendingDelete,type:'expense-category.delete'},{can:api.can,actor:actor()});api.replaceState(next);stagedCategory={deleted:true,changed};if(!changed)group.afterSave();return show('feature-expense-categories');
   }
   if(command==='expense-category-back'){if(dirty()){pendingNavigation='manager';return show('feature-expense-category-leave')}editor=null;return show('feature-expense-categories')}
   if(command==='expense-category-close')return back();
   if(command==='expense-category-continue')return show('feature-expense-category-editor');
   if(command==='expense-category-discard'){
    const next=pendingNavigation;pendingNavigation=null;editor=null;editorBaseline='';
    if(next==='close')return back();if(next==='new')return load(null);if(next?.startsWith('edit:'))return load(find(next.slice(5)));return show('feature-expense-categories');
   }
  })},
  afterSave(){if(stagedCategory){if(returnForm&&stagedCategory.created)returnForm.expenseCategoryId=stagedCategory.result;if(stagedCategory.changed)api.toast?.(language()==='fr'?'Catégorie enregistrée.':'تم حفظ فئة المصروف');stagedCategory=null;editor=null;editorBaseline='';pendingDelete=null;}},
  afterFailure(){stagedCategory=null},
  sheet(){
   const value=currentModal();
   if(value==='feature-expense-categories'){
    const pages=Math.max(1,Math.ceil(categories().length/50));listPage=Math.min(listPage,pages);
    const rows=categories().slice((listPage-1)*50,listPage*50).map(c=>`<tr><td data-user-content>${escape(c.name)}</td><td>${escape(text(expenseCategoryKind(c)==='nonrecurring'?'غير متكررة':'متكررة'))}</td><td>${escape(text(c.isArchived?'مؤرشف':'نشط'))}</td><td>${can('expenses.edit')?button('تعديل','expense-category-edit',c.id):''}${can('expenses.delete')&&!c.isArchived?button('حذف','expense-category-delete',c.id,'negative'):''}</td></tr>`).join('')||`<tr><td colspan="4">${escape(text('لا توجد فئات مصاريف'))}</td></tr>`;
    const table=(api.boundedTableHtml||((x)=>x))(`<div class="register-table-shell"><div class="register-scroll"><table class="register-table"><thead><tr><th>${escape(text('فئة المصروف'))}</th><th>${escape(text('نوع الفئة'))}</th><th>${escape(text('الحالة'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`);
    const paging=pages>1?`<div class="management-actions">${listPage>1?button(language()==='fr'?'Précédent':'السابق','expense-category-page',listPage-1):''}<span>${listPage} / ${pages}</span>${listPage<pages?button(language()==='fr'?'Suivant':'التالي','expense-category-page',listPage+1):''}</div>`:'';
    return api.modalMarkup(text('فئات المصاريف'),`<div class="management-actions">${can('expenses.create')?button('فئة جديدة','expense-category-new'):''}${button('رجوع','expense-category-close')}</div>${table}${paging}`,'',text('حفظ'),'feature-sheet');
   }
   if(value==='feature-expense-category-editor'&&editor)return api.modalMarkup(text(editor.id?'تعديل':'فئة جديدة'),`<div class="feature-fields">${field('اسم فئة المصروف',`<input name="name" maxlength="80" value="${escape(editor.name)}">`)}${field('نوع الفئة',`<select name="kind"><option value="recurring" ${editor.kind==='recurring'?'selected':''}>${escape(text('متكررة'))}</option><option value="nonrecurring" ${editor.kind==='nonrecurring'?'selected':''}>${escape(text('غير متكررة'))}</option></select>`)}<p class="notice">${escape(text('تغيير نوع الفئة يعيد تصنيف المصاريف السابقة دون تغيير مبالغها.'))}</p>${button('رجوع','expense-category-back')}</div>`,'site:feature:expense-category-save',text('حفظ'),'feature-sheet');
   if(value==='feature-expense-category-delete')return api.modalMarkup(text('حذف'),`<p class="notice">${escape(text('حذف الفئة يخفيها من الاختيارات الجديدة ويحفظ المصاريف السابقة المرتبطة بها.'))}</p>${button('رجوع','expense-category-back')}`,'site:feature:expense-category-delete-confirm',text('حذف'),'feature-sheet');
   if(value==='feature-expense-category-leave')return api.modalMarkup(text('لديك تعديلات غير محفوظة.'),`<div class="management-actions">${button('متابعة التعديل','expense-category-continue')}${button('تجاهل التعديل','expense-category-discard','','negative')}</div>`,'',text('حفظ'),'feature-sheet');
   return null;
  }
 };
 return group;
}
