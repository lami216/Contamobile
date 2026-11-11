import {accessReason} from './platform/shared/android-access.mjs';
import {installOnlineEncoder} from './online-command-encoder.mjs';
const localOnly=/^(cloud:|backup:|go:backup$|open:user$|save-user$|user:|site:(new-user|user|save-user|restore|desktop-import|review-import|confirm-import|backup|previous-backup|activation|offline-link)|site:feature:(import|reset|owner|backup)|accounting-reset:|device-lifecycle:)/;
const posting=/^(post-|commit-pending$|confirm-void$|save-(product|party|account|warehouse|branding)$|pos:(checkout|save-party|confirm-below-cost)|site:(save-account|post-account-adjust|archive-|unarchive|feature:(stock-confirm|opening-save|currency-save|category-save|confirm$|account-toggle|party-restore|warehouse-(default|restore))))/;
const editing=/^(new:|source:|void:|open:(expense|deposit|withdraw|cashtransfer|product|productedit|party|partyedit|account|receive|pay|partyCash|actions)|warehouse-(create|edit)|site:(edit-account|account-adjust)|site:feature:(opening:|category-add|category-edit))/;
export function installOnlineRuntime(api){
 const db=api.database,encoder=installOnlineEncoder(api);let locked=false,checking=false,lastError=null,timer=null,reviewDraft=[];
 const t=(ar,fr)=>api.language()==='fr'?fr:ar;
 const gate=document.createElement('section');gate.className='online-access-gate';gate.hidden=true;gate.setAttribute('role','dialog');gate.setAttribute('aria-modal','true');document.body.append(gate);
 function decorateReview(){
  document.querySelector('.online-review-panel')?.remove();if(!db.reviewRequired&&!reviewDraft.length)return;
  const panel=document.createElement('section');panel.className='online-review-panel';panel.setAttribute('aria-live','polite');
  panel.innerHTML=`<strong>${t('راجع سجل المؤسسة قبل تسجيل عملية أخرى','Vérifiez le registre avant une nouvelle opération')}</strong><p>${t('عُرضت أحدث بيانات المؤسسة. لا تُرسل المسودة السابقة تلقائيًا. تحقّق أولًا من وجود العملية ونتيجتها في السجل.','Les dernières données de l’entreprise sont affichées. Le brouillon précédent n’est pas renvoyé automatiquement. Vérifiez d’abord l’opération et son résultat dans le registre.')}</p>${reviewDraft.length?`<details><summary>${t('بيانات المسودة للمراجعة','Données du brouillon à vérifier')}</summary><dl>${reviewDraft.map(row=>`<div><dt>${api.escape(row.label)}</dt><dd dir="auto">${api.escape(row.value)}</dd></div>`).join('')}</dl></details>`:''}<button type="button" class="secondary" data-online-reviewed>${db.reviewRequired?t('راجعت السجل؛ السماح بإجراءات جديدة','Registre vérifié ; autoriser de nouvelles actions'):t('إغلاق تفاصيل المراجعة','Fermer les détails de vérification')}</button>`;
  panel.querySelector('[data-online-reviewed]').onclick=()=>{if(db.reviewRequired){db.reviewRequired=false;encoder.reviewed();}else reviewDraft=[];api.render();mask();};
  document.querySelector('#phone #content')?.prepend(panel);
 }
 function mask(){
  const blocked=checking||!db.connected||db.pending||db.settlement||!db.cachedState,phone=document.querySelector('#phone');gate.hidden=!blocked;
  if(phone){phone.inert=blocked;phone.style.visibility=blocked?'hidden':'';phone.setAttribute('aria-hidden',String(blocked));}
  if(!blocked){decorateReview();return;}
  gate.innerHTML=`<div class="access-card"><h1>${db.pending?t('تحقق من نتيجة العملية','Vérifier le résultat'):db.settlement?t('العملية تحتاج مراجعة','Une vérification est nécessaire'):t('الاتصال بالمؤسسة مطلوب','Connexion à l’entreprise requise')}</h1><p>${api.escape(accessReason(lastError||{code:db.pending?'ONLINE_RESULT_UNCERTAIN':db.settlement?'NEEDS_SETTLEMENT':'ONLINE_REQUIRED'},api.language()))}</p><p>${t('هذا الحساب يعمل بالإنترنت فقط. تبقى مسودتك في الجلسة الحالية.','Ce compte fonctionne uniquement en ligne. Votre brouillon reste dans la session actuelle.')}</p><button class="primary" data-online-check ${checking?'disabled':''}>${checking?t('جارٍ التحقق…','Vérification…'):db.pending?t('تحقق من العملية السابقة','Vérifier l’opération précédente'):db.settlement?t('تحقق بعد مراجعة المسؤول','Vérifier après la revue du responsable'):t('إعادة الاتصال','Se reconnecter')}</button><button class="secondary" data-online-logout ${checking?'disabled':''}>${t('تسجيل الخروج','Se déconnecter')}</button><button class="quiet" data-online-privacy>${t('سياسة الخصوصية','Confidentialité')}</button></div>`;
  gate.querySelector('[data-online-check]').onclick=check;gate.querySelector('[data-online-logout]').onclick=()=>api.logout();gate.querySelector('[data-online-privacy]').onclick=()=>window.NativeHost?.openPrivacy();
 }
 db.onGate=error=>{if(error)lastError=error;api.actor(db.actor());mask();};
 db.onAdopt=state=>api.adopt(state);
 db.onCommitted=command=>api.clearDrafts(command);
 const encoderFailure=db.onSaveFailure;db.onSaveFailure=error=>{encoderFailure(error);error.message=accessReason(error,api.language());};
 function confirming(value){document.body.classList.toggle('online-confirming',value);document.body.dataset.onlineMessage=t('جارٍ تأكيد العملية مع المؤسسة…','Confirmation avec l’entreprise…');}
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
  if(localOnly.test(action)){api.fail(t('تُدار حسابات المؤسسة ونسخها وأجهزتها من مسؤول المؤسسة.','Les comptes, sauvegardes et appareils sont gérés par le responsable de l’entreprise.'));return;}
  if(!db.connected||db.pending||db.settlement){mask();return;}
  if(db.reviewRequired&&(posting.test(action)||editing.test(action))){api.fail(accessReason({code:'REVIEW_REQUIRED'},api.language()));return;}
  locked=true;
  try{
   await db.status();encoder.begin(action);if(posting.test(action))confirming(true);
   return await originalAct(action);
  }catch(error){lastError=error;api.fail(accessReason(error,api.language()));}
  finally{encoder.finish();confirming(false);locked=false;mask();}
 });
 async function heartbeat(){
  if(locked||checking||api.isBusy()||document.visibilityState==='hidden')return;
  locked=true;
  try{await db.status();if(!db.pending&&!db.settlement&&!api.hasEditor()){await db.refresh();api.render();}lastError=null;}
  catch(error){lastError=error;}finally{locked=false;mask();}
 }
 const disconnected=()=>{db.connected=false;lastError={code:'ONLINE_REQUIRED'};mask();};
 window.addEventListener('alkarna-account-offline',disconnected);window.addEventListener('offline',disconnected);
 window.addEventListener('pagehide',()=>{clearInterval(timer);confirming(false)},{once:true});
 return {mask,async boot(pending,pendingBranchId){db.pending=pending===true;try{await db.open(pendingBranchId);if(!db.pending)await db.checkSettlement();}catch(error){lastError=error;db.connected=false;}mask();timer=setInterval(heartbeat,8000);},branchControl(){const branches=db.context.branches||[];return branches.length>1?`<label class="account-mode-note">${t('فرع المؤسسة','Agence de l’entreprise')}<select class="online-branch-picker" data-online-branch>${branches.map(b=>`<option value="${api.escape(b.id)}" ${b.id===db.branchId?'selected':''}>${api.escape(b.name)}</option>`).join('')}</select></label>`:'';},bindBranch(){const select=document.querySelector('[data-online-branch]');if(select)select.onchange=async()=>{if(locked||checking||api.isBusy()||db.pending||db.settlement||db.reviewRequired||api.hasEditor()){select.value=db.branchId;return;}locked=true;confirming(true);try{await db.open(select.value);api.resetView();api.render();}catch(error){lastError=error;db.connected=false;}finally{locked=false;confirming(false);mask();}};}};
}
