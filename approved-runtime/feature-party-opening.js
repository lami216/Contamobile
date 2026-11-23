import {activePartyOpening,partyOpeningCommand,partyOpeningNetBalance,partyOpeningPreview,partyOpeningPermission} from './party-opening-domain.js';
import {createPartyWithOpening} from './party-create.js';

export const partyOpeningFrench={
 'إضافة رصيد بداية':'Ajouter un solde initial','بدون رصيد بداية':'Sans solde initial','رصيد البداية غير صالح':'Le solde initial est invalide.',
 'رصيد بداية الحساب':'Solde initial du compte','إضافة رصيد البداية':'Ajouter le solde initial','تعديل رصيد البداية':'Modifier le solde initial','حفظ رصيد البداية':'Enregistrer le solde initial','الاتجاه':'Sens','لنا':'À recevoir','علينا':'À payer','المبلغ':'Montant','ملاحظة':'Note','سبب التعديل':'Motif de la modification','سبب الإلغاء':'Motif de l’annulation','الرصيد الحالي':'Solde actuel','التغيير':'Variation','الرصيد بعد العملية':'Solde après l’opération','مراجعة رصيد البداية':'Vérifier le solde initial','متابعة التعديل':'Continuer la modification','إلغاء رصيد البداية':'Annuler le solde initial','عرض المستند':'Voir le document','سجل رصيد البداية':'Historique du solde initial','ملغى':'Annulé','فعال':'Actif','هذا مبلغ سابق لم يُسجّل، وسيُضاف إلى الرصيد الحالي.':'Ce montant antérieur non enregistré sera ajouté au solde actuel.','لا يؤثر رصيد البداية في النقد أو المخزون أو المبيعات.':'Le solde initial ne modifie ni la trésorerie, ni le stock, ni les ventes.','سيُلغى أثر رصيد البداية وحده، وتبقى الحركات اللاحقة.':'Seul le solde initial sera annulé. Les mouvements ultérieurs sont conservés.',
 'لا تسمح صلاحيات حسابك بإدارة رصيد بداية الأطراف':'Vos droits ne permettent pas de gérer les soldes initiaux des tiers.','ملاحظة رصيد البداية غير صالحة':'La note du solde initial est invalide.','ملاحظة رصيد البداية يجب ألا تتجاوز 1000 حرف':'La note du solde initial est limitée à 1000 caractères.','اختر اتجاه رصيد البداية':'Choisissez le sens du solde initial.','مبلغ رصيد البداية يجب أن يكون رقمًا موجبًا صالحًا':'Saisissez un montant initial strictement positif.','تاريخ رصيد البداية غير صالح':'La date du solde initial est invalide.','بنية أرصدة بداية الأطراف غير صالحة':'Les données des soldes initiaux sont invalides.','رصيد الطرف المسجل غير صالح؛ راجع الحساب قبل تغيير رصيد البداية':'Le solde du tiers est invalide. Vérifiez le compte avant de modifier le solde initial.','الطرف غير موجود':'Le tiers est introuvable.','توجد أرصدة بداية متعددة لهذا الطرف؛ راجع المستندات قبل المتابعة':'Plusieurs soldes initiaux existent pour ce tiers. Vérifiez les documents.','مستند رصيد البداية غير قابل للتعديل بهذه الطريقة':'Ce document initial ne peut pas être modifié de cette façon.','بيانات مستند رصيد البداية غير متسقة؛ راجع الحساب':'Le document du solde initial est incohérent. Vérifiez le compte.','حالة رصيد البداية غير صالحة':'L’état du solde initial est invalide.','بيانات رصيد البداية التاريخي غير صالحة':'Le solde initial historique est invalide.','رصيد البداية غير موجود أو ملغى':'Le solde initial est introuvable ou annulé.','تغير رصيد البداية؛ حدّث الحساب وأعد المحاولة':'Le solde initial a changé. Actualisez le compte puis réessayez.','تغير مستند رصيد البداية؛ حدّث الحساب وأعد المحاولة':'Le document initial a changé. Actualisez le compte puis réessayez.','نتيجة رصيد البداية غير صالحة':'Le résultat du solde initial est invalide.','عملية رصيد البداية غير صالحة':'L’opération du solde initial est invalide.','استعد الطرف المؤرشف قبل إضافة رصيد بداية':'Restaurez le tiers archivé avant d’ajouter un solde initial.','رصيد البداية موجود؛ عدّل مستنده الحالي بدل إضافته مرة أخرى':'Un solde initial existe déjà. Modifiez son document.','معرّف رصيد البداية غير صالح':'L’identifiant du solde initial est invalide.'
};

export function installPartyOpeningFeatures(api){
 let draft=null,review=null,voidTarget=null,stagedRecord=null,historyPage=1,noteExpanded=false,creation=null,creationModal=null;
 const state=()=>api.getState?api.getState():typeof api.state==='function'?api.state():api.state||S;
 const language=()=>typeof api.language==='function'?api.language():typeof appLanguage==='function'?appLanguage():'ar';
 const text=value=>language()==='fr'?partyOpeningFrench[value]||value:value;
 const escape=value=>api.escape?api.escape(value):String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const actor=()=>typeof api.actor==='function'?api.actor():api.actor;
 const can=()=>api.can(partyOpeningPermission());
 const currentModal=()=>api.getModal?api.getModal():typeof api.modal==='function'?api.modal():typeof modal!=='undefined'?modal:api.modal;
 const redraw=()=>api.render?api.render():render();
 const show=value=>{if(api.setModal)api.setModal(value);else if(api.showModal)api.showModal(value);else if(api.show)api.show(value);else modal=value;return redraw()};
 const field=(label,html)=>`<label class="field"><span>${escape(text(label))}</span>${html}</label>`;
 const button=(label,command,id='',tone='')=>`<button type="button" class="feature-button ${tone}" data-action="site:feature:${command}${id!==''?':'+id:''}">${escape(text(label))}</button>`;
 const amount=value=>api.money?api.money(value,'xs'):escape(Number(value).toLocaleString(language()==='fr'?'fr-FR':'en-US',{maximumFractionDigits:6}));
 const party=id=>state().parties.find(p=>String(p.id)===String(id));
 const editable=record=>Boolean(record&&!record.legacyKey&&!record.legacy&&!record.importReadOnly&&record.partyOpeningVersion===1&&Number.isSafeInteger(record.revision)&&record.revision>=0);
 function localized(work){try{return work()}catch(error){if(language()==='fr')error.message=partyOpeningFrench[error.message]||error.message;throw error}}
 function context(){return{actor:actor(),can:api.can,now:new Date().toISOString()}}
 function creationMode(){const value=currentModal();return ['party','pos-new-party'].includes(value)?value:null}
 function creationFields(){
  const toggle=`<button type="button" class="feature-button" data-action="site:feature:party-opening-create-toggle" aria-expanded="${creation.enabled}" aria-controls="party-create-opening">${escape(text(creation.enabled?'بدون رصيد بداية':'إضافة رصيد بداية'))}</button>`;
  if(!creation.enabled)return toggle;
  const noteButton=`<button type="button" class="feature-button" data-action="site:feature:party-opening-create-note" aria-expanded="${creation.noteExpanded}" aria-controls="party-create-note">${escape(text('ملاحظة'))}</button>`;
  return `${toggle}<div id="party-create-opening" class="feature-fields"><div class="pair">${field('الاتجاه',`<select name="openingDirection"><option value="receivable" ${creation.openingDirection==='receivable'?'selected':''}>${escape(text('لنا'))}</option><option value="payable" ${creation.openingDirection==='payable'?'selected':''}>${escape(text('علينا'))}</option></select>`)}${field('المبلغ',`<input name="openingAmount" type="text" inputmode="decimal" data-pos-select-all value="${escape(creation.openingAmount)}">`)}</div>${noteButton}${creation.noteExpanded?`<div id="party-create-note">${field('ملاحظة',`<input name="openingNote" maxlength="1000" dir="auto" value="${escape(creation.openingNote)}">`)}</div>`:''}</div>`;
 }
 function load(partyId,record){
  if(!can())throw Error(text('لا تسمح صلاحيات حسابك بإدارة رصيد بداية الأطراف'));
  if(record&&!editable(record))throw Error(text('مستند رصيد البداية غير قابل للتعديل بهذه الطريقة'));
  const p=party(partyId);if(!p)throw Error(text('الطرف غير موجود'));
  draft={partyId:p.id,...(record?{documentId:record.id,expectedRevision:record.revision}:{}),direction:record?.partyOpeningDirection||'receivable',amount:record?String(record.partyOpeningAmount):'',note:typeof record?.note==='string'?record.note:'',reason:''};review=null;noteExpanded=Boolean(draft.note.trim());
  return show('feature-party-opening');
 }
 function fields(){
  const noteButton=`<button type="button" class="feature-button" data-action="site:feature:party-opening-note" aria-expanded="${noteExpanded}" aria-controls="party-opening-note-field">${escape(text('ملاحظة'))}</button>`;
  const noteField=noteExpanded?`<div id="party-opening-note-field">${field('ملاحظة',`<input name="note" maxlength="1000" dir="auto" value="${escape(draft.note)}">`)}</div>`:'';
  return `<div class="feature-fields"><p data-user-content>${escape(party(draft.partyId)?.name)}</p>${!draft.documentId?`<p class="notice">${escape(text('هذا مبلغ سابق لم يُسجّل، وسيُضاف إلى الرصيد الحالي.'))}</p>`:''}<div class="pair">${field('الاتجاه',`<select name="direction"><option value="receivable" ${draft.direction==='receivable'?'selected':''}>${escape(text('لنا'))}</option><option value="payable" ${draft.direction==='payable'?'selected':''}>${escape(text('علينا'))}</option></select>`)}${field('المبلغ',`<input name="amount" type="text" inputmode="decimal" data-pos-select-all value="${escape(draft.amount)}">`)}</div>${noteButton}${noteField}${draft.documentId?field('سبب التعديل',`<input name="reason" maxlength="1000" value="${escape(draft.reason)}">`):''}<p class="notice">${escape(text('لا يؤثر رصيد البداية في النقد أو المخزون أو المبيعات.'))}</p></div>`;
 }
 const previewHtml=value=>`<div class="panel">${[['الرصيد الحالي',value.before],['التغيير',value.delta],['الرصيد بعد العملية',value.after]].map(([label,value])=>`<div class="report-line"><span>${escape(text(label))}</span>${amount(value)}</div>`).join('')}</div>`;
 const group={
  handles:command=>command.startsWith('party-opening'),
  permission:command=>command==='party-opening-page'?null:partyOpeningPermission(),
  panel(value){
   const p=typeof value==='object'?value:party(value);if(!p)return'';
   const records=state().records.filter(r=>r.kind==='party-opening'&&r.party===p.id),opening=localized(()=>activePartyOpening(state(),p.id));
   const launch=can()&&!p.archived&&(!opening||editable(opening))?button(opening?'تعديل رصيد البداية':'إضافة رصيد البداية','party-opening',p.id):'';
   const pages=Math.max(1,Math.ceil(records.length/50));historyPage=Math.min(historyPage,pages);
   const rows=records.slice((historyPage-1)*50,historyPage*50).map(r=>`<tr><td>${escape(r.date)}</td><td><button type="button" class="feature-row-name" data-action="invoice:${r.id}">${escape(r.number)}</button></td><td>${amount(r.partyOpeningContribution??r.partyBalanceDelta??0)}</td><td>${escape(text(r.voided?'ملغى':'فعال'))}</td><td>${can()&&!r.voided&&editable(r)?button('تعديل رصيد البداية','party-opening-edit',r.id)+button('إلغاء رصيد البداية','party-opening-void',r.id,'negative'):''}</td></tr>`).join('');
   const history=rows?`<details class="feature-details"><summary>${escape(text('سجل رصيد البداية'))}</summary>${(api.boundedTableHtml||((x)=>x))(`<div class="register-table-shell"><div class="register-scroll"><table class="register-table"><thead><tr><th>${language()==='fr'?'Date':'التاريخ'}</th><th>${language()==='fr'?'Document':'المستند'}</th><th>${escape(text('المبلغ'))}</th><th>${language()==='fr'?'État':'الحالة'}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`)}</details>`:'';
   const paging=pages>1?`<div class="management-actions">${historyPage>1?button(language()==='fr'?'Précédent':'السابق','party-opening-page',historyPage-1):''}<span>${historyPage} / ${pages}</span>${historyPage<pages?button(language()==='fr'?'Suivant':'التالي','party-opening-page',historyPage+1):''}</div>`:'';
   return `<div class="management-actions">${launch}</div>${history}${paging}`;
  },
  openRecord(id){const record=state().records.find(r=>r.id===Number(id)&&r.kind==='party-opening');if(!record)throw Error(text('رصيد البداية غير موجود أو ملغى'));return load(record.party,record)},
  decorateSheet(html){
   const mode=creationMode();if(!mode||!can())return html;
   if(!creation||creationModal!==mode){creationModal=mode;creation={name:'',phone:'',enabled:false,openingDirection:'receivable',openingAmount:'',openingNote:'',noteExpanded:false};}
   // Retain the original party/POS sheet and its primary action/style. Only
   // append the optional fields inside that same form, including after retry.
   return html.replace(/<input\b[^>]*\bname="(name|phone)"[^>]*>/g,(input,name)=>input.replace(/\bvalue="[^"]*"/,`value="${escape(creation[name])}"`)).replace('</form>',creationFields()+'</form>');
  },
  before(action){
   if(['open:party','pos:new-party','close','back'].includes(action)||action.startsWith('go:')){creation=null;creationModal=null;}
   const mode=creationMode();if(!mode||!['save-party','pos:save-party'].includes(action))return false;
   if(creation)creation={...creation,...api.form()};
   if(!creation?.enabled)return false;
   const type=mode==='pos-new-party'?(saleType==='sale'?'customer':'supplier'):partyType;
   const result=localized(()=>createPartyWithOpening(state(),{name:creation.name,phone:creation.phone,type,opening:{direction:creation.openingDirection,amount:creation.openingAmount,note:creation.openingNote}},context()));
   if(mode==='pos-new-party')result.state.saleParty=result.party.id;
   api.replaceState(result.state);stagedRecord=result.record;
   if(api.setModal)api.setModal(mode==='pos-new-party'&&posReturnToPayment?'payment':null);else modal=mode==='pos-new-party'&&posReturnToPayment?'payment':null;
   redraw();return true;
  },
  async action(command,id){return localized(()=>{
   if(command==='party-opening-create-toggle'||command==='party-opening-create-note'){
    if(!creationMode()||!creation)throw Error(text('عملية رصيد البداية غير صالحة'));
    creation={...creation,...api.form()};
    if(command==='party-opening-create-toggle')creation.enabled=!creation.enabled;else creation.noteExpanded=!creation.noteExpanded;
    return redraw();
   }
   if(command==='party-opening-page'){historyPage=Math.max(1,Number(id)||1);return redraw()}
   if(command==='party-opening'){const record=activePartyOpening(state(),Number(id));return load(Number(id),record)}
   if(command==='party-opening-edit')return group.openRecord(id);
   if(command==='party-opening-note'){if(!draft)throw Error(text('عملية رصيد البداية غير صالحة'));draft={...draft,...api.form()};noteExpanded=!noteExpanded;return redraw()}
   if(command==='party-opening-review'){
    draft={...draft,...api.form()};review=partyOpeningPreview(state(),draft);return show('feature-party-opening-review');
   }
   if(command==='party-opening-back'){review=null;return show('feature-party-opening')}
   if(command==='party-opening-save'){
    if(!draft||!review)throw Error(text('عملية رصيد البداية غير صالحة'));
    const {state:next,record}=partyOpeningCommand(state(),{...draft,type:draft.documentId?'party-opening.update':'party-opening.post'},context());api.replaceState(next);stagedRecord=record;
    return show(null);
   }
   if(command==='party-opening-void'){
    const record=state().records.find(r=>r.id===Number(id)&&r.kind==='party-opening'&&!r.voided);if(!record)throw Error(text('رصيد البداية غير موجود أو ملغى'));
    if(!editable(record))throw Error(text('مستند رصيد البداية غير قابل للتعديل بهذه الطريقة'));
    voidTarget={id:record.id,revision:record.revision};return show('feature-party-opening-void');
   }
   if(command==='party-opening-void-confirm'){
    if(!voidTarget)throw Error(text('رصيد البداية غير موجود أو ملغى'));
    const {state:next,record}=partyOpeningCommand(state(),{type:'party-opening.void',documentId:voidTarget.id,expectedRevision:voidTarget.revision,reason:api.form().reason},context());api.replaceState(next);stagedRecord=record;
    return show(null);
   }
  })},
  afterSave(){if(!creationMode()){creation=null;creationModal=null;}if(stagedRecord){const record=stagedRecord;stagedRecord=null;draft=null;review=null;voidTarget=null;if(api.onCommitted)api.onCommitted(record);api.toast?.(language()==='fr'?'Solde initial enregistré.':'تم حفظ رصيد البداية')}},
  afterFailure(){stagedRecord=null},
  sheet(){
   const value=currentModal();
   if(value==='feature-party-opening'&&draft)return api.modalMarkup(text(draft.documentId?'تعديل رصيد البداية':'إضافة رصيد البداية'),fields(),'site:feature:party-opening-review',text('مراجعة رصيد البداية'),'feature-sheet');
   if(value==='feature-party-opening-review'&&review)return api.modalMarkup(text('مراجعة رصيد البداية'),previewHtml(review)+button('متابعة التعديل','party-opening-back'),'site:feature:party-opening-save',text('حفظ رصيد البداية'),'feature-sheet');
   if(value==='feature-party-opening-void'&&voidTarget){const record=state().records.find(r=>r.id===voidTarget.id),p=record&&party(record.party);if(!record||!p)return null;const before=partyOpeningNetBalance(p),delta=-record.partyOpeningContribution;return api.modalMarkup(text('إلغاء رصيد البداية'),`<p class="notice">${escape(text('سيُلغى أثر رصيد البداية وحده، وتبقى الحركات اللاحقة.'))}</p>${previewHtml({before,delta,after:before+delta})}${field('سبب الإلغاء','<input name="reason" maxlength="1000">')}`,'site:feature:party-opening-void-confirm',text('إلغاء رصيد البداية'),'feature-sheet')}
   return null;
  }
 };
 return group;
}
