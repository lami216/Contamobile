import {accessReason} from './platform/shared/android-access.mjs';
import {installOnlineEncoder} from './online-command-encoder.mjs';
import {onlinePollDelay} from './online-poll-policy.mjs';
const localOnly=/^(cloud:|backup:|go:backup$|open:user$|save-user$|user:|site:(new-user|user|save-user|restore|desktop-import|review-import|confirm-import|backup|previous-backup|activation|offline-link)|site:feature:(import|reset|owner|backup)|accounting-reset:|device-lifecycle:)/;
const posting=/^(post-|commit-pending$|confirm-void$|save-(product|party|account|warehouse|branding)$|pos:(checkout|save-party|confirm-below-cost)|site:(save-account|post-account-adjust|archive-|unarchive|feature:(stock-confirm|opening-save|currency-save|category-save|confirm$|account-toggle|party-restore|warehouse-(default|restore))))/;
const editing=/^(new:|source:|void:|open:(expense|deposit|withdraw|cashtransfer|product|productedit|party|partyedit|account|receive|pay|partyCash|actions)|warehouse-(create|edit)|site:(edit-account|account-adjust)|site:feature:(opening:|category-add|category-edit))/;
// This allowlist contains presentation only. New/unrecognised actions retain the
// guarded accounting path; no submit, setting, draft edit or archive is implied.
export const isOnlinePresentationAction=action=>/^(back|go:(home|inventory|parties|operations|reports|accounts|settings|warehouses|expenses|returns)|inventorytab:(products|low)|list-page:(previous|next):[^\s]+|table-sort:\d+:\d+|partytype:(customer|supplier)|invoice:\d+|ledger:\d+|account:\d+|product:\d+|site:(account-menu|support|party-metric:(customer|supplier):(all|\d+):[a-zA-Z]+))$/.test(action);
export function installOnlineRuntime(api){
 const db=api.database,encoder=installOnlineEncoder(api);let locked=false,checking=false,refreshing=null,lastError=null,timer=null,reviewDraft=[],stopped=false,lastActivity=performance.now();
 db.canAdoptBackground=()=>!locked&&!checking&&!api.isBusy()&&!api.hasEditor();
 const t=(ar,fr)=>api.language()==='fr'?fr:ar;
 const gate=document.createElement('section');gate.className='online-access-gate';gate.hidden=true;gate.setAttribute('role','dialog');gate.setAttribute('aria-modal','true');document.body.append(gate);
 function salesScopeNote(){
  document.querySelector('[data-online-sales-scope]')?.remove();if(!db.salesOnly())return;
  const note=document.createElement('p');note.dataset.onlineSalesScope='';note.className='account-mode-note';note.setAttribute('role','note');note.textContent=t('حساب بيع فقط: تكلفة الشراء والأرباح محجوبة. لا تتوفر مقارنة السعر بالتكلفة في هذه الشاشة؛ راجع سعر البيع قبل تأكيده.','Compte de vente uniquement : coûts et bénéfices masqués. Cette vue ne compare pas le prix au coût ; vérifiez le prix avant de confirmer.');document.querySelector('#phone #content')?.prepend(note);
 }
 function decorateReview(){
  document.querySelector('.online-review-panel')?.remove();if(!db.reviewRequired&&!reviewDraft.length)return;
  const panel=document.createElement('section');panel.className='online-review-panel';panel.setAttribute('aria-live','polite');
  panel.innerHTML=`<strong>${t('راجع سجل المنشأة قبل تسجيل عملية أخرى','Vérifiez le registre avant une nouvelle opération')}</strong><p>${t('عُرضت أحدث بيانات المنشأة. لا تُرسل المسودة السابقة تلقائيًا. تحقّق أولًا من وجود العملية ونتيجتها في السجل.','Les dernières données de l’établissement sont affichées. Le brouillon précédent n’est pas renvoyé automatiquement. Vérifiez d’abord l’opération et son résultat dans le registre.')}</p>${reviewDraft.length?`<details><summary>${t('بيانات المسودة للمراجعة','Données du brouillon à vérifier')}</summary><dl>${reviewDraft.map(row=>`<div><dt>${api.escape(row.label)}</dt><dd dir="auto">${api.escape(row.value)}</dd></div>`).join('')}</dl></details>`:''}<button type="button" class="secondary" data-online-reviewed>${db.reviewRequired?t('راجعت السجل؛ السماح بإجراءات جديدة','Registre vérifié ; autoriser de nouvelles actions'):t('إغلاق تفاصيل المراجعة','Fermer les détails de vérification')}</button>`;
  panel.querySelector('[data-online-reviewed]').onclick=()=>{if(db.reviewRequired){db.reviewRequired=false;encoder.reviewed();}else reviewDraft=[];api.render();mask();};
  document.querySelector('#phone #content')?.prepend(panel);
 }
 function mask(){
  const blocked=checking||!db.canPresent()||db.pending||db.settlement,phone=document.querySelector('#phone');gate.hidden=!blocked;
  if(phone){phone.inert=blocked;phone.style.visibility=blocked?'hidden':'';phone.setAttribute('aria-hidden',String(blocked));}
  if(!blocked){decorateReview();salesScopeNote();let notice=document.querySelector('[data-online-refresh-state]');if(!notice){notice=document.createElement('small');notice.dataset.onlineRefreshState='';notice.setAttribute('role','status');document.querySelector('#phone .app-head')?.append(notice);}if(notice)notice.textContent=refreshing?t('جارٍ تحديث بيانات المنشأة…','Actualisation des données…'):'';return;}
  gate.innerHTML=`<div class="access-card"><h1>${db.pending?t('تحقق من نتيجة العملية','Vérifier le résultat'):db.settlement?t('العملية تحتاج مراجعة','Une vérification est nécessaire'):t('الاتصال بالمنشأة مطلوب','Connexion à l’établissement requise')}</h1><p>${api.escape(accessReason(lastError||{code:db.pending?'ONLINE_RESULT_UNCERTAIN':db.settlement?'NEEDS_SETTLEMENT':'ONLINE_REQUIRED'},api.language()))}</p><p>${t('هذا الحساب يعمل بالإنترنت فقط. تبقى مسودتك في الجلسة الحالية.','Ce compte fonctionne uniquement en ligne. Votre brouillon reste dans la session actuelle.')}</p><button class="primary" data-online-check ${checking?'disabled':''}>${checking?t('جارٍ التحقق…','Vérification…'):db.pending?t('تحقق من العملية السابقة','Vérifier l’opération précédente'):db.settlement?t('تحقق بعد مراجعة المسؤول','Vérifier après la revue du responsable'):t('إعادة الاتصال','Se reconnecter')}</button><button class="secondary" data-online-logout ${checking?'disabled':''}>${t('تسجيل الخروج','Se déconnecter')}</button><button class="quiet" data-online-privacy>${t('سياسة الخصوصية','Confidentialité')}</button></div>`;
  gate.querySelector('[data-online-check]').onclick=check;gate.querySelector('[data-online-logout]').onclick=()=>api.logout();gate.querySelector('[data-online-privacy]').onclick=()=>window.NativeHost?.openPrivacy();
 }
 db.onGate=error=>{if(error)lastError=error;api.actor(db.actor());mask();};
 db.onAdopt=state=>api.adopt(state);
 db.onCommitted=command=>api.clearDrafts(command);
 const encoderFailure=db.onSaveFailure;db.onSaveFailure=error=>{encoderFailure(error);error.message=accessReason(error,api.language());};
 function confirming(value){document.body.classList.toggle('online-confirming',value);document.body.dataset.onlineMessage=t('جارٍ تأكيد العملية مع المنشأة…','Confirmation avec l’établissement…');}
 async function check(){
  if(checking||locked)return;const previousDraft=api.reviewSnapshot?.()||[];checking=true;mask();
  try{
   if(db.pending){const result=await db.resolvePending();if(result.committed)api.resetView();}
   else if(db.settlement)await db.checkSettlement();
   else{await db.status();await db.refresh();}
   lastError=null;api.render();
  }catch(error){lastError=error;}finally{if(db.reviewRequired){if(previousDraft.length)reviewDraft=previousDraft;api.clearActiveDrafts?.();api.resetView();api.openReviewLedger?.();api.render();}checking=false;mask();}
 }
 const originalAct=api.act();api.act(async action=>{
  if(action==='site:privacy'){window.NativeHost?.openPrivacy();return;}
  if(action==='site:logout'||action==='login'){await api.logout();return;}
  if(locked||checking||api.isBusy())return;
  if(localOnly.test(action)){api.fail(t('تُدار حسابات المنشأة ونسخها وأجهزتها من مسؤول المنشأة.','Les comptes, sauvegardes et appareils sont gérés par le responsable de l’établissement.'));return;}
  if(!db.connected||db.pending||db.settlement){mask();return;}
  if(!db.canPresent()){mask();void heartbeat();return;}
  if(db.reviewRequired&&(posting.test(action)||editing.test(action))){api.fail(accessReason({code:'REVIEW_REQUIRED'},api.language()));return;}
  if(isOnlinePresentationAction(action)){
   if(!db.canPresent()){mask();void heartbeat();return;}
   // The projection already belongs to this admitted member/branch. Never make
   // a local tab/detail navigation wait behind a network read or its queue.
   try{return await originalAct(action);}catch(error){api.fail(accessReason(error,api.language()));}finally{mask();}
   return;
  }
  locked=true;
  try{
   // Drafts and local editor navigation use this admitted projection. Any real
   // mutation still passes the app rollback boundary and the save gate below.
   encoder.begin(action);if(posting.test(action))confirming(true);
   return await originalAct(action);
  }catch(error){lastError=error;api.fail(accessReason(error,api.language()));}
  finally{encoder.finish();confirming(false);locked=false;mask();}
 });
 async function heartbeat(){
  if(refreshing||locked||checking||api.isBusy()||document.visibilityState==='hidden')return refreshing;
  refreshing=(async()=>{
   try{await db.status();if(db.canAdoptBackground()&&!db.pending&&!db.settlement){await db.refresh(false,true);if(db.lastRefreshChanged)api.render();}lastError=null;}
   catch(error){lastError=error;}finally{refreshing=null;mask();}
  })();mask();return refreshing;
 }
 const disconnected=()=>{db.disconnect();lastError={code:'ONLINE_REQUIRED'};mask();};
 const activity=()=>{lastActivity=performance.now();};
 function schedule(){clearTimeout(timer);if(stopped||document.visibilityState==='hidden')return;timer=setTimeout(async()=>{try{await heartbeat();}finally{schedule();}},onlinePollDelay(performance.now()-lastActivity));}
 const visibility=()=>{clearTimeout(timer);if(document.visibilityState!=='hidden'&&!stopped){lastActivity=performance.now();heartbeat().finally(schedule);}};
 const available=()=>{if(document.visibilityState!=='hidden'&&!stopped)heartbeat().finally(schedule);};
 document.addEventListener('pointerdown',activity,{passive:true});document.addEventListener('keydown',activity,{passive:true});document.addEventListener('visibilitychange',visibility);window.addEventListener('alkarna-network-available',available);
 window.addEventListener('alkarna-account-offline',disconnected);window.addEventListener('offline',disconnected);
 const admissionTimer=setInterval(()=>{if(!stopped&&!db.canPresent())mask();},500);
 window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer);clearInterval(admissionTimer);document.removeEventListener('pointerdown',activity);document.removeEventListener('keydown',activity);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('alkarna-network-available',available);confirming(false)},{once:true});
 return {mask,async boot(pending,pendingBranchId){db.pending=pending===true;try{await db.open(pendingBranchId);if(!db.pending)await db.checkSettlement();}catch(error){lastError=error;db.connected=false;}mask();schedule();},branchControl(){const branches=db.context.branches||[];return branches.length>1?`<label class="account-mode-note">${t('فرع المنشأة','Agence de l’établissement')}<select class="online-branch-picker" data-online-branch>${branches.map(b=>`<option value="${api.escape(b.id)}" ${b.id===db.branchId?'selected':''}>${api.escape(b.name)}</option>`).join('')}</select></label>`:'';},bindBranch(){const select=document.querySelector('[data-online-branch]');if(select)select.onchange=async()=>{if(locked||checking||api.isBusy()||db.pending||db.settlement||db.reviewRequired||api.hasEditor()){select.value=db.branchId;return;}locked=true;confirming(true);try{await db.open(select.value);api.resetView();api.render();}catch(error){lastError=error;db.connected=false;}finally{locked=false;confirming(false);mask();}};}};
}
