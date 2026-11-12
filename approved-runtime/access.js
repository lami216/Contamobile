import {loginInput,accessReason,performAccountEntry} from './platform/shared/android-access.mjs';
let lang=localStorage.getItem('alkarna-site-language')==='fr'?'fr':'ar',state=null,busy=false,pending=null,pageActive=true,initializing=true,operationVersion=0,entryEdited=false,localEntryAvailable=false;
const $=selector=>document.querySelector(selector),t=(ar,fr)=>lang==='fr'?fr:ar;
const native=(command,payload={})=>window.NativeFiles?.accountAccess?NativeFiles.accountAccess(command,payload):Promise.reject(Object.assign(Error('NOT_CONFIGURED'),{code:'NOT_CONFIGURED'}));
const companyPending=record=>record?.mode==='online'&&record.stage==='pending'&&record.deviceStatus==='pending';
const contact=()=>t('تواصل مع مسؤول منشأتك للحصول على بيانات الدخول.','Contactez le responsable de votre établissement pour obtenir vos identifiants.');
const arrow='<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M19 12H5m6-6-6 6 6 6"/></svg>';
function updateNotice(){
 const notice=$('#entry-notice');if(!notice)return;
 notice.textContent=companyPending(pending)?t('أُرسل طلب هذا الجهاز إلى المسؤول. انتظر الموافقة، ثم سجّل الدخول من جديد.','La demande de cet appareil a été envoyée au responsable. Attendez son approbation, puis reconnectez-vous.') : pending?contact():'';
}
function render(){
 const draft={identifier:$('#identifier')?.value||'',code:$('#code')?.value||'',consent:$('#consent')?.checked===true};
 document.querySelector('.entry-brand strong').textContent=t('الكرنه','AlKarna');document.documentElement.lang=lang;document.documentElement.dir=lang==='fr'?'ltr':'rtl';$('#language').textContent=lang==='fr'?'العربية':'Français';$('#privacy').textContent=t('سياسة الخصوصية','Politique de confidentialité');$('#brand-caption').textContent=t('إدارة أعمالك، بثقة','Votre activité, en confiance');
 $('#content').innerHTML=`<p class="entry-eyebrow">${t('أهلًا بك','BIENVENUE')}</p><h1>${t('تسجيل الدخول','Connexion')}</h1><p class="entry-intro">${t('أدخل بيانات الدخول الخاصة بك.','Saisissez vos identifiants.')}</p><form id="login-form"><label for="identifier">${t('اسم المستخدم','Nom d’utilisateur')}</label><input id="identifier" name="identifier" type="text" dir="ltr" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="254"><label for="code">${t('كلمة المرور','Mot de passe')}</label><input id="code" name="code" type="password" dir="ltr" autocomplete="current-password" required maxlength="256"><label class="consent"><input id="consent" type="checkbox" required><span>${t('أوافق على التحقق من بيانات الدخول ومعرّف هذا الجهاز عبر الخدمة، وفق سياسة الخصوصية.','J’accepte la vérification des identifiants et de l’identifiant de cet appareil par le service, selon la politique de confidentialité.')}</span></label><p id="entry-notice" class="entry-note" role="status"></p><div id="error" class="access-error" role="alert"></div><button class="primary" type="submit"><span>${t('دخول','Connexion')}</span>${arrow}</button></form><p class="entry-note">${contact()}</p><p id="entry-status" class="entry-loading" role="status">${initializing?t('جارٍ قراءة حالة الجهاز… يمكنك إدخال بياناتك الآن.','Lecture de l’état… Vous pouvez saisir vos identifiants.') : ''}</p>`;
 $('#identifier').value=draft.identifier;$('#code').value=draft.code;$('#consent').checked=draft.consent;
 $('#login-form').addEventListener('submit',submit);appendLocalEntry();updateNotice();setBusy();
}
function appendLocalEntry(){
 if(!localEntryAvailable||$('#legacy'))return;
 const button=document.createElement('button');button.id='legacy';button.className='secondary';button.type='button';button.disabled=busy;button.textContent=t('الدخول إلى بيانات هذا الجهاز','Accéder aux données de cet appareil');button.onclick=()=>run(async()=>continueResult(await native('legacy')));
 $('#content').insertBefore(button,$('#entry-status'));
}
function setBusy(){for(const control of document.querySelectorAll('#content button,#content input'))control.disabled=busy;$('#content').setAttribute('aria-busy',String(busy));const button=$('#login-form button[type=submit] span');if(button)button.textContent=busy?t('جارٍ التحقق…','Vérification…'):t('دخول','Connexion')}
async function continueResult(result){
 if(companyPending(result)){pending={...result};updateNotice();return}
 if(result?.stage==='active'&&!result.activationRequired&&!result.setupRequired){const secret=$('#code');if(secret)secret.value='';NativeHost.accountContinue();return}
 pending={...result};updateNotice();
}
async function run(fn){
 if(busy||!pageActive)return;operationVersion++;busy=true;setBusy();$('#error').textContent='';
 try{await fn()}catch(error){$('#error').textContent=accessReason(error,lang)}finally{busy=false;setBusy()}
}
async function submit(event){event.preventDefault();await run(async()=>{const input=loginInput($('#identifier').value,$('#code').value,$('#consent').checked);const result=await performAccountEntry(native,input);$('#code').value='';await continueResult(result)})}
async function readInitialState(){
 const version=operationVersion;
 try{
  const result=await native('state');if(!pageActive)return;
  localEntryAvailable=result?.legacyAvailable===true&&!result?.offline?.setupRequired;appendLocalEntry();
  if(version!==operationVersion)return;state=result;initializing=false;const status=$('#entry-status');if(status)status.textContent='';
  if(!entryEdited){pending=companyPending(state?.companyEnrollment)?{...state.companyEnrollment}:null;updateNotice();}
 }catch(error){if(pageActive&&version===operationVersion){initializing=false;const status=$('#entry-status');if(status)status.textContent=t('تعذّرت قراءة الحالة الآن. يمكنك إدخال بياناتك والمحاولة.','Lecture de l’état indisponible. Saisissez vos identifiants pour réessayer.');}}finally{initializing=false;}
}
$('#privacy').addEventListener('click',()=>window.NativeHost?.openPrivacy());$('#language').addEventListener('click',()=>{if(busy)return;lang=lang==='fr'?'ar':'fr';localStorage.setItem('alkarna-site-language',lang);render()});
addEventListener('alkarna-local-account-status',event=>{const update=event.detail;if(!pageActive||update?.bound!==true||state?.offline?.bound!==true||update.phone!==state.offline.phone)return;state={...state,offline:{...state.offline,...update}};if(update.status!=='active'||update.setupRequired){localEntryAvailable=false;$('#legacy')?.remove();}if(!companyPending(pending))pending={...state.offline};updateNotice();});
addEventListener('pageshow',()=>{pageActive=true});addEventListener('pagehide',()=>{pageActive=false},{once:true});
document.addEventListener('input',event=>{if(event.target?.matches('#identifier,#code,#consent'))entryEdited=true});
render();readInitialState();
