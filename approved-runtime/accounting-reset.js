/** Administration may request a reset. Only an exact, signed native claim after
 * this local owner's explicit consent can authorize the atomic database reset. */
export function installAccountingReset(api){
 const t=(ar,fr)=>api.language()==='fr'?fr:ar;
 const supported=()=>typeof globalThis.NativeFiles?.accountingReset==='function';
 const visible=()=>!document.hidden,online=()=>navigator.onLine!==false;
 const call=(command,payload={})=>globalThis.NativeFiles.accountingReset(command,payload);
 let timer=null,flight=null,overlay=null,request=null;
 let deferred=null,stopped=false,lastActor=null,remotePending=null;
 let resetLockHeld=false;
 // ACK retries may overlap ordinary saves. Only release the lock this controller
 // acquired; completing a network receipt must never unlock another operation.
 function lockReset(){
  if(resetLockHeld)return;
  resetLockHeld=true;
  api.lock(true);
 }
 function unlockReset(){
  if(!resetLockHeld)return;
  resetLockHeld=false;
  api.lock(false);
 }
 function context(){
  const actor=api.actor();
  if(actor&&actor.role!=='owner')return null;
  const owners=api.users().filter(user=>user.role==='owner'&&user.active!==false);
  const owner=actor||owners[0],shopId=api.state()?.originId;
  return owner&&shopId?{shopId,ownerId:owner.id}:null;
 }
 function remove(){
  overlay?.remove();
  overlay=null;
 }
 function schedule(delay=60000){
  clearTimeout(timer);
  if(!stopped&&visible()&&online()&&supported()){
   timer=setTimeout(()=>poll().catch(()=>{}),Math.min(900000,Math.max(1000,delay)));
  }
 }
 function node(tag,text,className){
  const element=document.createElement(tag);
  if(text)element.textContent=text;
  if(className)element.className=className;
  return element;
 }
 function cleanupDrafts(){
  for(const key of Object.keys(localStorage))if(key.startsWith('alkarna-')&&!['alkarna-site-language','alkarna-site-appearance'].includes(key))localStorage.removeItem(key);
  sessionStorage.clear();
 }
 function status(text){
  const element=overlay?.querySelector('[role=status]');
  if(element)element.textContent=text;
 }
 async function apply(prepared){
  if(prepared?.stage!=='prepared')return false;
  await api.pauseBackup();
  const outcome=await api.database.resetAccounting(prepared,api.emptyState(prepared.shopId));
  if(!outcome.alreadyApplied||await api.database.accountingResetBootstrap())cleanupDrafts();
  // A lost server ACK does not undo the committed local transaction. Native code
  // records single-use consumption before attempting the network acknowledgement.
  const completed=await call('finish',{requestId:prepared.requestId,grantId:prepared.grantId,intentId:prepared.intentId});
  if(completed?.stage!=='complete')throw Error('Reset receipt not durably consumed');
  remotePending=completed?.ackPending?'ack':null;
  request=null;
  remove();
  const receipt=Object.fromEntries(['requestId','grantId','intentId','shopId','ownerId'].map(key=>[key,prepared[key]]));
  await api.onApplied(outcome,completed,receipt);
  return true;
 }
 async function exitAfterReset(receipt){
  if(typeof globalThis.NativeFiles?.closeAfterAccountingReset!=='function')return false;
  try{
   // Never close for a mere poll, an ACK, or a historical receipt after the new
   // owner has completed setup. Both records are committed by the reset's IDB
   // transaction before native finish durably consumes its grant.
   const saved=await api.database.get('meta','accounting-reset:'+receipt.requestId);
   const bootstrap=await api.database.accountingResetBootstrap();
   const keys=['requestId','grantId','intentId','shopId','ownerId'];
   if(!keys.every(key=>typeof receipt[key]==='string'&&receipt[key]===saved?.[key]&&receipt[key]===bootstrap?.[key]))return false;
   const result=await globalThis.NativeFiles.closeAfterAccountingReset(receipt);
   if(result?.stage!=='closing')return false;
   stopped=true;
   clearTimeout(timer);
   return true;
  }catch{
   // The caller reopens the committed empty shop in this document instead of
   // relying on a WebView navigation that the Android host deliberately blocks.
   return false;
  }
 }
 function canPresent(){
  return !api.isBusy()&&!api.hasModal()&&
   !document.querySelector('.owner-recovery-overlay')&&
   !document.activeElement?.matches('input,textarea,select');
 }
 function present(){
  const scope=context();
  if(overlay||!request||!scope||request.shopId!==scope.shopId||
     request.ownerId!==scope.ownerId||request.requestId===deferred||
     request.expiresAt<=Date.now()||!canPresent())return;
  overlay=node('div',null,'owner-recovery-overlay');
  overlay.dir=api.language()==='fr'?'ltr':'rtl';
  overlay.dataset.appearance=document.querySelector('#phone')?.dataset.appearance||'dark';
  const panel=node('section',null,'owner-recovery-panel');
  panel.setAttribute('role','dialog');
  panel.setAttribute('aria-modal','true');
  panel.setAttribute('aria-labelledby','accounting-reset-title');
  panel.dataset.accountingReset='review';
  const header=node('header');
  const title=node('h2',t('طلب بداية محاسبة جديدة','Demande de remise à zéro'));
  title.id='accounting-reset-title';
  header.append(title);
  const body=node('div',null,'recovery-body'),actions=node('div',null,'recovery-actions'),message=node('p');
  message.setAttribute('role','status');
  body.append(node('p',t('طلبت الإدارة حذف بيانات المحاسبة المحلية وحسابات الدخول على هذا الهاتف. التفعيل ومدته والنسخ المحفوظة على السيرفر لن تُحذف.','L’administration demande la suppression de la comptabilité locale et des comptes de connexion de ce téléphone. La licence, sa durée et les sauvegardes sur le serveur seront conservées.')));
  if(request.reason)body.append(node('p',t('سبب الطلب: ','Motif : ')+request.reason));
  const button=(label,fn,primary=false)=>{
   const control=node('button',label,primary?'recovery-primary':'recovery-secondary');
   control.type='button';
   control.onclick=fn;
   return control;
  };
  const later=()=>{deferred=request?.requestId;remove()};
  header.append(button(t('ليس الآن','Plus tard'),later));
  if(api.actor()?.id===request.ownerId&&api.actor()?.role==='owner'){
   const label=node('label',t('أفهم أن الفواتير والأرصدة والمنتجات والعملاء والموردين والمستخدمين ستُحذف من هذا الهاتف.','Je comprends que les factures, soldes, produits, clients, fournisseurs et utilisateurs seront supprimés de ce téléphone.'),'feature-check');
   const consent=node('input');
   consent.type='checkbox';
   consent.name='accountingResetConsent';
   consent.style.flexShrink='0';
   label.prepend(consent);
   body.append(label);
   const accept=button(t('مسح البيانات وبدء محاسبة جديدة','Effacer et recommencer'),async()=>{
    if(!consent.checked||flight||api.isBusy()||!online())return;
    if(request.expiresAt<=Date.now()){
     request=null;
     remove();
     schedule(1000);
     return;
    }
    const target={requestId:request.requestId,shopId:request.shopId,ownerId:request.ownerId,accepted:true};
    if(api.actor()?.id!==target.ownerId||api.actor()?.role!=='owner')return;
    lockReset();
    for(const control of panel.querySelectorAll('button,input'))control.disabled=true;
    status(t('جارٍ التحقق من التفويض وحفظ التهيئة…','Vérification de l’autorisation et enregistrement…'));
    remotePending='resume';
    flight=(async()=>consume(await call('prepare',target)))();
    try{
     await flight;
    }catch{
     progress();
    }finally{
     flight=null;
     if(remotePending!=='resume')unlockReset();
     schedule(1000);
    }
   },true);
   accept.disabled=true;
   consent.onchange=()=>{accept.disabled=!consent.checked||!online()};
   actions.append(accept);
   actions.append(button(t('رفض الطلب','Refuser la demande'),async()=>{
    if(flight||!online())return;
    flight=call('decline',{requestId:request.requestId,shopId:request.shopId,ownerId:request.ownerId});
    try{
     await flight;
     request=null;
     remove();
    }catch{
     status(t('تعذّر إرسال الرفض. لم تُحذف بياناتك.','Refus non envoyé. Vos données sont conservées.'));
    }finally{
     flight=null;
    }
   }));
  }else body.append(node('p',t('سجّل الدخول بحساب المالك لمراجعة الطلب والموافقة عليه أو رفضه. لن تتغير البيانات بمجرد الاتصال.','Connectez-vous avec le compte propriétaire pour accepter ou refuser. La connexion seule ne modifie aucune donnée.')));
  body.append(message,actions);
  panel.append(header,body);
  overlay.append(panel);
  document.body.append(overlay);
  overlay.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&!flight){later();return}
   if(event.key!=='Tab')return;
   const focusable=[...panel.querySelectorAll('button,input')].filter(element=>!element.disabled);
   const first=focusable[0],last=focusable.at(-1);
   if(event.shiftKey&&document.activeElement===first){
    last?.focus();
    event.preventDefault();
   }else if(!event.shiftKey&&document.activeElement===last){
    first?.focus();
    event.preventDefault();
   }
  });
  header.querySelector('button').focus();
 }
 function progress(){
  remove();
  lockReset();
  overlay=node('div',null,'owner-recovery-overlay');
  overlay.dir=api.language()==='fr'?'ltr':'rtl';
  overlay.dataset.appearance=document.querySelector('#phone')?.dataset.appearance||'dark';
  const panel=node('section',null,'owner-recovery-panel');
  panel.setAttribute('role','dialog');
  panel.setAttribute('aria-modal','true');
  panel.setAttribute('aria-label',t('استكمال التهيئة الموافق عليها','Terminer la remise à zéro acceptée'));
  panel.dataset.accountingReset='progress';
  const header=node('header'),body=node('div',null,'recovery-body');
  header.append(node('h2',t('استكمال التهيئة','Terminer la remise à zéro')));
  body.append(node('p',t('سبق أن وافقت على بداية جديدة. نتحقق من نتيجة الطلب قبل المتابعة. اتصل بالإنترنت وأبقِ التطبيق مفتوحًا قليلًا؛ لا تحذفه. تفعيلك محفوظ.','Vous avez accepté une remise à zéro. Nous vérifions son résultat avant de continuer. Connectez-vous et gardez l’application ouverte un moment, sans la désinstaller. Votre licence est conservée.')));
  const retry=node('button',t('إعادة المحاولة','Réessayer'),'recovery-secondary');
  retry.type='button';
  retry.onclick=()=>{if(!flight)schedule(1000)};
  body.append(retry);
  panel.append(header,body);
  overlay.append(panel);
  document.body.append(overlay);
  retry.focus();
 }
 async function consume(result){
  if(result?.stage==='prepared'){
   remotePending='resume';
   lockReset();
   try{
    return await apply(result);
   }finally{
    if(remotePending!=='resume')unlockReset();
   }
  }
  if(result?.stage==='awaiting-network'){
   remotePending='resume';
   progress();
   return false;
  }
  if(result?.stage==='complete'){
   remotePending=result.ackPending?'ack':null;
   request=null;
   remove();
   unlockReset();
   return false;
  }
  if(result?.stage==='unavailable'||result?.stage==='idle'){
   remotePending=null;
   request=null;
   remove();
   unlockReset();
  }
  return false;
 }
 async function poll(){
  clearTimeout(timer);
  const scope=context();
  // A consumed receipt can be acknowledged during a business save. A pending
  // accepted reset resumes under its own lock; new requests wait for idle UI.
  if(flight||(!scope&&!remotePending)||!supported()||!online()||
     !visible()||(api.isBusy()&&!remotePending)){
   schedule();
   return;
  }
  flight=remotePending?call(remotePending):call('poll',scope);
  try{
   const result=await flight;
   if(result.stage==='pending'&&result.request){
    request=result.request;
    present();
   }else if(['prepared','awaiting-network','complete','unavailable','idle'].includes(result.stage)){
    await consume(result);
   }else if(result.stage==='none'){
    request=null;
    remove();
   }
   // An in-place browser fallback has no new document/start event to wake its
   // freshly consumed receipt. Deliver that ACK promptly, retaining native backoff.
   schedule(result.retryAt?result.retryAt-Date.now():remotePending==='ack'?1000:60000);
  }catch{
   if(remotePending==='resume')progress();
   schedule(120000);
  }finally{
   flight=null;
  }
 }
 async function resume(){
  if(!supported())return false;
  return consume(await call('resume-local'));
 }
 function wake(){
  if(stopped)return;
  const owner=api.actor()?.id||null;
  if(owner!==lastActor){
   lastActor=owner;
   deferred=null;
   if(!remotePending)remove();
  }
  if(remotePending==='resume')progress();
  else present();
  const confirm=overlay?.querySelector('.recovery-primary');
  const consent=overlay?.querySelector('[name=accountingResetConsent]');
  if(confirm&&consent)confirm.disabled=!consent.checked||!online()||api.isBusy();
  schedule(1000);
 }
 globalThis.addEventListener?.('online',wake);
 globalThis.addEventListener?.('alkarna-network-available',wake);
 globalThis.addEventListener?.('offline',()=>{
  clearTimeout(timer);
  for(const button of overlay?.querySelectorAll('button')||[]){
   if(button.classList.contains('recovery-primary'))button.disabled=true;
  }
 });
 document.addEventListener('visibilitychange',()=>{
  if(visible())wake();
  else clearTimeout(timer);
 });
 document.addEventListener('focusout',()=>setTimeout(present,100));
 globalThis.addEventListener?.('pagehide',()=>{
  stopped=true;
  clearTimeout(timer);
 },{once:true});
 return {resume,start:wake,wake,cleanupDrafts,exitAfterReset};
}
