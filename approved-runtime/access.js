import {loginInput,accessReason} from './platform/shared/android-access.mjs';
let lang=localStorage.getItem('alkarna-site-language')==='fr'?'fr':'ar',state=null,busy=false,pending=null,refreshTimer=null,pageActive=true,initializing=true,operationVersion=0,entryEdited=false,localEntryAvailable=false;
const $=selector=>document.querySelector(selector),t=(ar,fr)=>lang==='fr'?fr:ar;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const native=(command,payload={})=>window.NativeFiles?.accountAccess?NativeFiles.accountAccess(command,payload):Promise.reject(Object.assign(Error('NOT_CONFIGURED'),{code:'NOT_CONFIGURED'}));
const companyPending=record=>record?.mode==='online'&&record.stage==='pending'&&record.deviceStatus==='pending';
const localEntry=()=>localEntryAvailable?`<button id="legacy" class="secondary" type="button">${t('الدخول إلى بيانات هذا الهاتف','Accéder aux données du téléphone')}</button>`:'';
const arrow='<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M19 12H5m6-6-6 6 6 6"/></svg>';
function cancelRefresh(){clearTimeout(refreshTimer);refreshTimer=null}
function scheduleRefresh(){cancelRefresh();if(pageActive&&pending&&!companyPending(pending)&&!pending.bound&&pending.stage==='pending'&&!document.hidden&&navigator.onLine!==false)refreshTimer=setTimeout(()=>refreshStatus(),45000)}
function needsSetupForm(record){return record?.setupRequired===true&&['active','setup-required'].includes(record.status||record.stage)}
function stateDescription(record){
 const status=record.status||record.stage;
 if(status==='suspended'||status==='disabled'||status==='revoked')return t('أوقف المسؤول وصول هذا الهاتف. بياناتك المحلية محفوظة.','Le responsable a suspendu ce téléphone. Les données locales sont conservées.');
 if(status==='expired')return t('انتهت مدة التفعيل. تحقق من موافقة المسؤول؛ بياناتك المحلية محفوظة.','L’activation a expiré. Vérifiez l’autorisation du responsable ; les données locales sont conservées.');
 if(status==='replaced')return t('هذا هاتف سابق للحساب. بياناته المحلية ما زالت محفوظة.','Cet ancien téléphone conserve ses données locales.');
 if(status==='rejected')return t('لم يوافق المسؤول على طلب هذا الهاتف.','Le responsable n’a pas approuvé ce téléphone.');
 if(record.bound&&status==='active')return t('هاتفك مفعّل. يمكنك الدخول إلى بياناته المحلية.','Votre téléphone est activé. Ouvrez ses données locales.');
 if(record.bound&&status!=='pending')return t('تعذّر تأكيد حالة الهاتف. أعد التحقق؛ بياناتك المحلية محفوظة.','Impossible de confirmer l’état du téléphone. Réessayez ; les données locales sont conservées.');
 if(record.stage==='active')return t('وافق المسؤول على هذا الهاتف. استلم التفعيل للمتابعة.','Le responsable a approuvé ce téléphone. Recevez l’activation pour continuer.');
 return t('أُرسل طلب اعتماد هذا الهاتف إلى المسؤول. يمكنك التحقق من حالته بعد الموافقة.','La demande de ce téléphone a été transmise au responsable. Vérifiez son état après approbation.');
}
function render(){
 const draft={identifier:$('#identifier')?.value||'',code:$('#code')?.value||'',consent:$('#consent')?.checked===true};
 const setupRequired=needsSetupForm(state?.offline);
 document.querySelector('.entry-brand strong').textContent=t('الكرنه','AlKarna');document.documentElement.lang=lang;document.documentElement.dir=lang==='fr'?'ltr':'rtl';$('#language').textContent=lang==='fr'?'العربية':'Français';$('#privacy').textContent=t('سياسة الخصوصية','Politique de confidentialité');$('#brand-caption').textContent=t('إدارة أعمالك، بثقة','Votre activité, en confiance');
 if(companyPending(pending)){
  $('#content').innerHTML=`<div class="entry-status-icon" aria-hidden="true">${arrow}</div><h1>${t('بانتظار اعتماد الجهاز','Approbation de l’appareil')}</h1><p class="entry-intro">${t('بيانات المنشأة صحيحة. أُرسل طلب إضافة هذا الهاتف إلى المسؤول، ولن تُفتح بيانات المنشأة قبل موافقته.','Les identifiants sont valides. Le responsable doit approuver ce téléphone avant tout accès aux données.')}</p><div class="entry-identity" dir="ltr">${esc(pending.identifier||'')}</div><p class="entry-note">${t('بعد الموافقة، سجّل الدخول من جديد ببيانات المنشأة.','Après approbation, reconnectez-vous avec les identifiants de l’établissement.')}</p><button class="primary" id="company-retry" type="button">${t('تسجيل الدخول بعد الموافقة','Se connecter après approbation')}${arrow}</button>${localEntry()}<button class="quiet entry-other" id="different" type="button">${t('استخدام بيانات أخرى','Utiliser d’autres identifiants')}</button><div id="error" class="access-error" role="alert"></div>`;
 }else if(pending){
  const active=pending.bound?(pending.status||pending.stage)==='active':pending.stage==='active';
  $('#content').innerHTML=`<div class="entry-status-icon" aria-hidden="true">${arrow}</div><h1>${t(pending.bound?'حالة هذا الهاتف':'طلب تفعيل الهاتف',pending.bound?'État du téléphone':'Activation du téléphone')}</h1><div class="entry-identity" dir="ltr">${esc(pending.phone||state?.offline?.phone||'')}</div><p class="entry-intro">${stateDescription(pending)}</p><button class="primary" id="check" type="button">${t('تحقق من حالة الطلب','Vérifier la demande')}${arrow}</button>${!pending.bound&&active&&!pending.setupRequired?`<button class="secondary" id="activate" type="button">${t('استلام التفعيل وفتح الحساب','Recevoir l’activation')}</button>`:''}${pending.bound&&pending.renewalAvailable?`<button class="secondary" id="renew" type="button">${t('استلام موافقة الصلاحية الجديدة','Recevoir la nouvelle autorisation')}</button>`:''}${pending.bound&&active&&!pending.setupRequired?`<button class="secondary" id="legacy" type="button">${t('فتح بيانات هذا الهاتف','Ouvrir les données du téléphone')}</button>`:''}<button class="quiet entry-other" id="different" type="button">${t('استخدام بيانات أخرى','Utiliser d’autres identifiants')}</button><div id="error" class="access-error" role="alert"></div>`;
 }else{
  $('#content').innerHTML=`<p class="entry-eyebrow">${t('أهلًا بك','BIENVENUE')}</p><h1>${setupRequired?t('أكمل إعداد هاتفك','Terminer la configuration'):t('تسجيل الدخول','Connexion')}</h1><p class="entry-intro">${setupRequired?t('حُفظ تفعيل هذا الهاتف. أدخل رقمه ورمزه السري لإكمال إعداد بياناتك.','L’activation est enregistrée. Saisissez le numéro et le code secret pour terminer.'):t('أدخل رقم هاتفك، أو بيانات المنشأة التي أعطاك إياها المسؤول.','Saisissez votre numéro de téléphone ou les identifiants fournis par votre responsable.')}</p><form id="login-form"><label for="identifier">${t('رقم الهاتف أو بريد المنشأة','Téléphone ou e-mail de l’établissement')}</label><input id="identifier" name="identifier" type="text" dir="ltr" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="254" placeholder="${t('رقم من 8 أرقام أو البريد الإلكتروني','8 chiffres ou adresse e-mail')}"><label for="code">${t('كلمة المرور أو الرمز السري','Mot de passe ou code secret')}</label><input id="code" name="code" type="password" dir="ltr" autocomplete="current-password" required maxlength="256"><label class="consent"><input id="consent" type="checkbox" required><span>${t('أوافق على إرسال بيانات الدخول ومعرّف هذا الجهاز للتحقق والاعتماد، وفق سياسة الخصوصية.','J’accepte l’envoi des identifiants et de l’identifiant de cet appareil pour vérification et approbation, selon la politique de confidentialité.')}</span></label><div id="error" class="access-error" role="alert"></div><button class="primary" type="submit"><span>${t('متابعة','Continuer')}</span>${arrow}</button></form><p class="entry-note">${t('رقم الهاتف يرسل طلب تفعيل جهاز واحد. حسابات المنشآت ينشئها المسؤول ويعتمد أجهزتها.','Un numéro demande l’activation d’un appareil. Le responsable crée les comptes d’établissement et approuve leurs appareils.')}</p>${localEntry()}<p id="entry-status" class="entry-loading" role="status">${initializing?t('جارٍ قراءة حالة الهاتف… يمكنك إدخال بياناتك الآن.','Lecture de l’état… Vous pouvez saisir vos identifiants.') : ''}</p>`;
  $('#identifier').value=draft.identifier||(setupRequired?state.offline.phone:'');$('#code').value=draft.code;$('#consent').checked=draft.consent;
 }
 $('#login-form')?.addEventListener('submit',submit);$('#check')?.addEventListener('click',()=>refreshStatus());
 $('#activate')?.addEventListener('click',()=>run(async()=>continueResult(await native('offline-activate'))));$('#renew')?.addEventListener('click',()=>run(async()=>continueResult(await native('offline-renew'))));
 $('#different')?.addEventListener('click',()=>openLogin(false));$('#company-retry')?.addEventListener('click',()=>openLogin(true));$('#legacy')?.addEventListener('click',()=>run(async()=>continueResult(await native('legacy'))));
 setBusy();scheduleRefresh();
}
function appendLocalEntry(){
 if(!localEntryAvailable||$('#legacy'))return;
 const button=document.createElement('button');button.id='legacy';button.className='secondary';button.type='button';button.disabled=busy;button.textContent=t('الدخول إلى بيانات هذا الهاتف','Accéder aux données du téléphone');button.onclick=()=>run(async()=>continueResult(await native('legacy')));
 const anchor=$('#different')||$('#entry-status');$('#content').insertBefore(button,anchor||null);
}
function openLogin(keepIdentifier){if(busy)return;const identifier=keepIdentifier?pending?.identifier||'':'';operationVersion++;pending=null;cancelRefresh();render();$('#identifier').value=identifier;if(identifier)$('#code').focus()}
function setBusy(){for(const control of document.querySelectorAll('#content button,#content input'))control.disabled=busy;$('#content').setAttribute('aria-busy',String(busy));const button=$('#login-form button[type=submit] span');if(button)button.textContent=busy?t('جارٍ التحقق…','Vérification…'):t('متابعة','Continuer')}
function continueResult(result,identifier=''){
 if(companyPending(result)){pending={...result,identifier:identifier||result.identifier||state?.companyEnrollment?.identifier||''};render();return}
 if(needsSetupForm(result)){state={...state,offline:{...state?.offline,...result}};pending=null;render();return}
 if(result?.stage==='active'&&!result.activationRequired&&!result.setupRequired){const secret=$('#code');if(secret)secret.value='';cancelRefresh();NativeHost.accountContinue();return}
 pending={...result,phone:result?.phone||result?.identifier};render();
}
async function refreshStatus(){if(!pending||companyPending(pending))return;await run(async()=>{const result=await native(pending.bound?'offline-current':'offline-status');if(needsSetupForm(result)){state={...state,offline:{...state?.offline,...result}};pending=null}else pending={...pending,...result};render()})}
async function run(fn){
 if(busy||!pageActive)return;operationVersion++;busy=true;setBusy();const target=$('#error');if(target)target.textContent='';
 try{await fn()}catch(error){const target=$('#error');if(target)target.textContent=pending&&!companyPending(pending)&&/OFFLINE|NETWORK|CONNECTION|TIMEOUT|HTTP_50|fetch/i.test(String(error.code||'')+' '+String(error.message||''))?t('تعذّر تحديث الحالة الآن. أعد المحاولة عند توفر الإنترنت؛ بياناتك محفوظة.','Impossible d’actualiser l’état. Réessayez avec Internet ; vos données sont conservées.'):accessReason(error,lang)}finally{busy=false;setBusy();scheduleRefresh()}
}
async function submit(event){event.preventDefault();await run(async()=>{const input=loginInput($('#identifier').value,$('#code').value,$('#consent').checked);const result=await native('login',input);const secret=$('#code');if(secret)secret.value='';continueResult(result,input.identifier)})}
async function readInitialState(){
 const version=operationVersion;
 try{
  const result=await native('state');if(!pageActive)return;
  localEntryAvailable=result?.legacyAvailable===true&&!result?.offline?.setupRequired;
  if(version!==operationVersion){appendLocalEntry();return;}state=result;initializing=false;
  if(entryEdited){
   const status=$('#entry-status');if(status)status.textContent='';
   appendLocalEntry();
   return;
  }
  if(!entryEdited&&state?.offline?.bound&&!needsSetupForm(state.offline))pending={...state.offline,stage:state.offline.status,bound:true};
  else if(!entryEdited&&companyPending(state?.companyEnrollment))pending={...state.companyEnrollment};
  render();
  if(!entryEdited&&state?.offline?.status==='pending'&&!state.offline.bound&&!pending){$('#identifier').value=state.offline.phone;$('#error').textContent=t('طلب هذا الهاتف محفوظ. أدخل رمزه السري للتحقق من الموافقة.','La demande est enregistrée. Saisissez son code secret pour vérifier l’approbation.');}
 }catch(error){if(pageActive&&version===operationVersion){initializing=false;const status=$('#entry-status');if(status)status.textContent=t('تعذّرت قراءة الحالة الآن. يمكنك إدخال بياناتك والمحاولة.','Lecture de l’état indisponible. Saisissez vos identifiants pour réessayer.');}}finally{initializing=false;if(pageActive&&version!==operationVersion){const status=$('#entry-status');if(status)status.textContent='';}}
}
$('#privacy').addEventListener('click',()=>window.NativeHost?.openPrivacy());$('#language').addEventListener('click',()=>{if(busy)return;lang=lang==='fr'?'ar':'fr';localStorage.setItem('alkarna-site-language',lang);render()});
addEventListener('alkarna-local-account-status',event=>{const update=event.detail;if(!pageActive||!pending?.bound||update?.bound!==true||update.phone!==pending.phone)return;if(needsSetupForm(update)){state={...state,offline:{...state?.offline,...update}};pending=null}else pending={...pending,...update};render()});
addEventListener('pageshow',()=>{pageActive=true;scheduleRefresh()});addEventListener('online',scheduleRefresh);addEventListener('offline',cancelRefresh);document.addEventListener('visibilitychange',()=>document.hidden?cancelRefresh():scheduleRefresh());addEventListener('pagehide',()=>{pageActive=false;cancelRefresh()},{once:true});
document.addEventListener('input',event=>{if(event.target?.matches('#identifier,#code,#consent'))entryEdited=true});
render();readInitialState();
