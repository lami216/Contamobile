import {passwordDigest} from './database.js';
import {RegistrationEvents,RecoveryPoller} from './service-contact.js';

/** Focused pre-login owner recovery; credentials and business rows never enter registration. */
export function installOwnerRecovery({database,getState,getUsers,onApplied,onResume=async()=>{}}){
  const call=(command,value='')=>window.NativeFiles.ownerRecovery(command,typeof value==='string'?value:JSON.stringify(value));
  const french=()=>localStorage.getItem('alkarna-site-language')==='fr';
  const t=(ar,fr)=>french()?fr:ar;
  let overlay=null,inFlight=false,closed=true,ackTimer=null,ackFlight=null,ackPending=false,appliedScope=null;
  const visible=()=>!document.hidden,online=()=>navigator.onLine!==false;
  function stop(){poller.stop();closed=true;overlay?.remove();overlay=null;appliedScope=null;}
  function context(){return {shopId:getState().originId,owners:getUsers().filter(u=>u.role==='owner'&&u.active!==false).map(u=>({id:u.id,name:u.name,role:'owner'}))};}
  async function apply(result){
    if(result.stage==='prepared'){
      let saved;try{saved=await database.recoverOwner(result)}catch(error){error.recoveryLocal=true;error.recovery=result;throw error}
      appliedScope=result;
      const token=sessionStorage.getItem('alkarna-local-session');if(token){const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(x=>x.toString(16).padStart(2,'0')).join('');const session=await database.get('meta','session:'+hash);if(!session||session.user===result.ownerId)sessionStorage.removeItem('alkarna-local-session');}
      await onApplied(result.ownerId);
      const completed=await call('finish',{grantId:result.grantId,intentId:result.intentId});ackPending=completed.ackPending===true;scheduleAck(completed.retryAt);return {stage:'complete',username:saved?.username||getUsers().find(user=>user.id===result.ownerId)?.username};
    }if(result.ackPending){ackPending=true;scheduleAck(result.retryAt);}if(result.stage==='complete'){const completed=await completedIdentity(result);await onResume(completed);return completed}return result;
  }
  async function completedIdentity(result){
    const safe={...result};delete safe.username;
    const keys=['shopId','ownerId','requestId','grantId','intentId'],scope=keys.some(key=>Object.hasOwn(result,key))?result:appliedScope;
    if(!scope)return safe; // Older completed journals did not expose a verifiable local scope.
    const deny=()=>{const error=Error();error.code='RECOVERY_SCOPE_INVALID';throw error};
    if(!keys.every(key=>typeof scope[key]==='string'&&scope[key])||scope.shopId!==getState().originId)deny();
    const receipt=await database.get('meta','owner-recovery:'+scope.grantId);
    if(!receipt||!['shopId','ownerId','requestId','intentId'].every(key=>receipt[key]===scope[key]))deny();
    const owner=await database.get('users',scope.ownerId);if(!owner||owner.role!=='owner'||owner.active===false)deny();
    return {...safe,username:owner.username};
  }
  function node(tag,text,className){const el=document.createElement(tag);if(text)el.textContent=text;if(className)el.className=className;return el;}
  function message(text){const box=overlay?.querySelector('[role=status]');if(box){box.textContent=text;for(const key of ['recoveryCode','recoveryPhase','recoveryStatus','recoveryRequestId'])delete box.dataset[key];}}
  function failure(error){
    const reasons={
      RECOVERY_USERNAME_TAKEN:['اسم المستخدم مستخدم لحساب آخر. اختر اسمًا آخر ثم أعد الحفظ.','Ce nom d’utilisateur appartient à un autre compte. Choisissez-en un autre puis réessayez.'],
      RECOVERY_USERNAME_INVALID:['أدخل اسم مستخدم صالحًا.','Saisissez un nom d’utilisateur valide.'],
      RECOVERY_SCOPE_INVALID:['تعذّر مطابقة إيصال الاستعادة مع الحساب المحلي. أغلق النافذة وتواصل مع الدعم.','Le reçu de récupération ne correspond pas au compte local. Fermez cette fenêtre et contactez l’assistance.'],
      RECOVERY_REGISTRATION_REQUIRED:['تسجيل هذا التثبيت غير موجود لدى الخدمة. اضغط طلب موافقة الإدارة مجددًا لتحديث التسجيل ثم إرسال نفس الطلب.','Cette installation n’est pas enregistrée auprès du service. Redemandez l’approbation pour actualiser son inscription et renvoyer la même demande.'],
      RECOVERY_OWNER_UNREGISTERED:['حساب المالك يحتاج تحديث تسجيله لدى الخدمة. اضغط طلب موافقة الإدارة مجددًا؛ لن تتغير بياناتك أو مدة التفعيل.','L’inscription du propriétaire doit être actualisée. Redemandez l’approbation ; vos données et la durée d’activation restent inchangées.'],
      RECOVERY_DEVICE_REVIEW_REQUIRED:['الخدمة تحتاج مراجعة هوية هذا الهاتف. تواصل مع الدعم؛ لم تتغير بياناتك أو كلمة المرور.','L’identité de cet appareil doit être vérifiée par l’assistance. Vos données et votre mot de passe restent inchangés.'],
      RECOVERY_PHONE_NOT_CURRENT:['هذا التثبيت ليس الهاتف المعتمد حاليًا. اطلب من الإدارة مراجعة ملف الهاتف قبل الاستعادة.','Cette installation n’est pas l’appareil actuellement autorisé. Demandez à l’administration de vérifier sa fiche avant la récupération.'],
      RECOVERY_RESET_IN_PROGRESS:['تهيئة المحاسبة السابقة لم تكتمل بعد. تواصل مع الدعم لإكمالها قبل استعادة حساب المالك.','La réinitialisation comptable précédente n’est pas terminée. Contactez l’assistance avant de récupérer le propriétaire.'],
      RECOVERY_PERMISSION_EXPIRED:['انتهت صلاحية إذن الاستعادة. أغلق النافذة واطلب موافقة جديدة.','L’autorisation de récupération a expiré. Fermez cette fenêtre puis demandez une nouvelle approbation.'],
      RECOVERY_INVALID_PROOF:['تعذّر التحقق من صلاحية طلب هذا الهاتف. تواصل مع الدعم؛ بياناتك وتفعيلك محفوظان.','La demande de cet appareil n’a pas pu être vérifiée. Contactez l’assistance ; vos données et votre activation sont conservées.'],
      RECOVERY_RATE_LIMITED:['هناك محاولات كثيرة. انتظر قليلًا ثم أعد الطلب؛ لا حاجة لإعادة تثبيت التطبيق.','Trop de tentatives. Patientez puis réessayez ; aucune réinstallation n’est nécessaire.'],
      RECOVERY_REQUEST_CONFLICT:['لا يمكن إكمال الطلب بالحالة الحالية للهاتف. تواصل مع الإدارة لمراجعة ملفه؛ بياناتك محفوظة.','L’état actuel de cet appareil ne permet pas de terminer la demande. Contactez l’administration ; vos données sont conservées.'],
      RECOVERY_OFFLINE:['الهاتف غير متصل بالإنترنت. اتصل ثم اضغط طلب موافقة الإدارة؛ بياناتك وتفعيلك محفوظان.','L’appareil est hors ligne. Connectez-le puis redemandez l’approbation ; vos données et votre activation sont conservées.'],
      RECOVERY_NETWORK:['لم يكتمل الاتصال بالخدمة. تحقق من الإنترنت ثم أعد المحاولة بعد قليل؛ بياناتك محفوظة.','La connexion au service n’a pas abouti. Vérifiez Internet puis réessayez ; vos données sont conservées.'],
      RECOVERY_SECURE_CONNECTION:['تعذّر إنشاء اتصال آمن بالخدمة. تحقق من تاريخ الهاتف وشبكته، أو تواصل مع الدعم.','La connexion sécurisée au service a échoué. Vérifiez la date et le réseau de l’appareil, ou contactez l’assistance.'],
      RECOVERY_LOCAL_ACTIVATION:['تعذّر قراءة مستند التفعيل الأصلي للاستعادة. تواصل مع الدعم؛ لا تحذف التطبيق أو بياناته.','Le document d’activation d’origine ne peut pas être lu. Contactez l’assistance ; ne supprimez ni l’application ni ses données.'],
      RECOVERY_LOCAL_STATE:['تعذّر فتح سجل الاستعادة الآمن على الهاتف. تواصل مع الدعم؛ لا تحذف التطبيق أو بياناته.','Le journal sécurisé de récupération ne peut pas être ouvert. Contactez l’assistance ; ne supprimez ni l’application ni ses données.'],
      RECOVERY_LOCAL_INPUT:['تعذّر مطابقة حساب المالك المحلي. أغلق النافذة وأعد المحاولة، أو تواصل مع الدعم.','Le propriétaire local ne peut pas être identifié. Fermez cette fenêtre puis réessayez, ou contactez l’assistance.'],
      RECOVERY_INVALID_RESPONSE:['رد خدمة الاستعادة غير متوافق أو غير قابل للتحقق. تواصل مع الدعم؛ بياناتك وتفعيلك محفوظان.','La réponse du service est incompatible ou invérifiable. Contactez l’assistance ; vos données et votre activation sont conservées.'],
      RECOVERY_SERVICE_UNAVAILABLE:['خدمة الاستعادة غير متاحة حاليًا. أعد المحاولة لاحقًا أو تواصل مع الدعم؛ بياناتك محفوظة.','Le service de récupération est indisponible. Réessayez plus tard ou contactez l’assistance ; vos données sont conservées.']
    };
    const fallback=error?.status===429?'RECOVERY_RATE_LIMITED':error?.status===403?'RECOVERY_DEVICE_REVIEW_REQUIRED':error?.status===409?'RECOVERY_REQUEST_CONFLICT':error?.status>=500||error?.status===404?'RECOVERY_SERVICE_UNAVAILABLE':'';
    const code=Object.hasOwn(reasons,error?.code)?error.code:fallback,reason=reasons[code];
    let text=reason?t(...reason):error?.recoveryLocal?t('تعذّر حفظ بيانات الدخول على الجهاز. أعد الحفظ؛ بياناتك وتفعيلك محفوظان.','Impossible d’enregistrer les identifiants sur cet appareil. Réessayez ; vos données et votre activation sont conservées.'):t('تعذّر إتمام طلب الاستعادة. أعد المحاولة أو تواصل مع الدعم؛ بياناتك وتفعيلك محفوظان.','La récupération n’a pas pu être terminée. Réessayez ou contactez l’assistance ; vos données et votre activation sont conservées.');
    const reference=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(error?.requestId||'')?error.requestId:'';
    if(reference)text+=' '+t('مرجع الطلب: ','Référence : ')+reference;
    message(text);const box=overlay?.querySelector('[role=status]');if(box){if(code)box.dataset.recoveryCode=code;if(['register','register-now','request','poll','prepare','resume','resume-local','ack','finish'].includes(error?.phase))box.dataset.recoveryPhase=error.phase;if(Number.isInteger(error?.status)&&error.status>=0&&error.status<=599)box.dataset.recoveryStatus=String(error.status);if(reference)box.dataset.recoveryRequestId=reference;}
  }
  function button(label,fn,primary=false){const el=node('button',label,primary?'recovery-primary':'recovery-secondary');el.type='button';el.onclick=async()=>{if(inFlight)return;inFlight=true;el.disabled=true;try{await fn()}catch(error){failure(error)}finally{inFlight=false;el.disabled=false}};return el;}
  function unconfigured(){message(t('خدمة الاستعادة لم تُربط بهذه النسخة بعد. تواصل مع الدعم على 49823328.','Le service de récupération n’est pas encore configuré. Assistance : 49823328.'));}
  const registration=new RegistrationEvents({call,context,visible,online});
  const poller=new RecoveryPoller({poll:()=>call('poll'),onResult:status,onError:failure,visible:()=>!closed&&visible(),online});
  function scheduleAck(at=0){clearTimeout(ackTimer);ackTimer=null;if(!ackPending||ackFlight||!visible()||!online())return;ackTimer=setTimeout(()=>ack().catch(()=>{}),Math.min(2147483647,Math.max(750,(at||0)-Date.now())));}
  async function ack(){if(!ackPending||ackFlight||!visible()||!online())return;ackFlight=call('ack');try{const result=await ackFlight;ackPending=result.ackPending===true;if(ackPending&&!result.permanent){ackFlight=null;scheduleAck(result.retryAt||Date.now()+60000);}}catch(error){ackFlight=null;scheduleAck(Math.max(error.retryAt||0,Date.now()+60000));}finally{ackFlight=null;}}
  async function poll(){const result=await poller.refresh(true);if(result?.stage==='cooldown')message(t('انتظر قليلًا قبل تحديث الطلب مجددًا.','Patientez avant d’actualiser à nouveau.'));}
  async function status(result){
    if(closed)return;if(result.stage==='unconfigured')return unconfigured();
    const area=overlay.querySelector('.recovery-actions');area.replaceChildren();
    if(result.status==='waiting'){message(t('طلبك ينتظر موافقة الإدارة بعد التحقق من هويتك. لا تشارك كلمة مرورك.','Demande en attente de vérification par l’administration. Ne communiquez jamais votre mot de passe.'));area.append(button(t('تحديث الحالة','Actualiser'),poll));if(!poller.waiting)poller.pending();return;}
    poller.stop();
    if(result.status==='approved'){
      // Native code supplies the scope only after verifying the existing signed approval.
      // A picker selection, display name, or unscoped status must never reveal a login name.
      const currentOverlay=overlay;let users;
      try{users=await database.all('users')}catch(error){if(closed||overlay!==currentOverlay)return;error.recoveryLocal=true;failure(error);area.append(button(t('إعادة المحاولة','Réessayer'),()=>status(result)));return;}
      const owner=users.find(user=>user.id===result.ownerId&&user.role==='owner'&&user.active!==false);
      if(closed||overlay!==currentOverlay)return;
      if(result.shopId!==getState().originId||!owner){message(t('تعذّر مطابقة الموافقة مع حساب المالك. أغلق النافذة واطلب الاستعادة مجددًا.','L’approbation ne correspond pas au propriétaire local. Fermez cette fenêtre et recommencez.'));return;}
      message(t('تمت الموافقة. راجع اسم المستخدم للدخول واختر كلمة مرور جديدة.','Demande approuvée. Vérifiez le nom d’utilisateur de connexion et choisissez un nouveau mot de passe.'));
      const form=node('form');form.autocomplete='off';const fields=[],usernameLabel=node('label',t('اسم المستخدم','Nom d’utilisateur')),username=node('input');username.name='username';username.type='text';username.autocomplete='username';username.autocapitalize='none';username.spellcheck=false;username.inputMode='text';username.enterKeyHint='next';username.required=true;username.dir='auto';username.value=typeof result.username==='string'?result.username:owner.username;usernameLabel.append(username);form.append(usernameLabel);
      for(const [name,ar,fr]of [['password','كلمة المرور الجديدة','Nouveau mot de passe'],['confirm','تأكيد كلمة المرور','Confirmation']]){const label=node('label',t(ar,fr)),input=node('input');input.name=name;input.type='password';input.autocomplete='new-password';input.enterKeyHint=name==='confirm'?'done':'next';input.minLength=4;input.maxLength=256;input.required=true;label.append(input);form.append(label);fields.push(input);}
      const save=button(t('حفظ بيانات الدخول','Enregistrer les identifiants'),async()=>{
        const [a,b]=fields,normalized=username.value.trim().toLowerCase();
        if(!normalized){message(t('أدخل اسم المستخدم.','Saisissez le nom d’utilisateur.'));username.focus();return;}
        if(a.value.length<4||a.value!==b.value){message(t('أدخل كلمتي مرور متطابقتين من 4 أحرف على الأقل.','Saisissez deux mots de passe identiques de 4 caractères minimum.'));return;}
        let fresh;try{fresh=await database.all('users')}catch(error){error.recoveryLocal=true;throw error}if(result.shopId!==getState().originId||!fresh.some(user=>user.id===owner.id&&user.role==='owner'&&user.active!==false)){message(t('تغيّر حساب المالك. أغلق النافذة واطلب الاستعادة مجددًا.','Le compte propriétaire a changé. Fermez cette fenêtre et recommencez.'));return;}
        if(fresh.some(user=>user.id!==owner.id&&String(user.username||'').trim().toLowerCase()===normalized)){const error=Error();error.code='RECOVERY_USERNAME_TAKEN';failure(error);username.focus();return;}
        const derived=await passwordDigest(a.value),outcome=await apply(await call('prepare',{password:derived,username:normalized}));
        if(closed||overlay!==currentOverlay)return;
        if(outcome.stage==='unconfigured')unconfigured();else if(outcome.stage==='complete'){a.value=b.value='';complete(outcome)}else if(outcome.stage==='expired')await status({status:'expired'});
      });
      form.onsubmit=e=>{e.preventDefault();save.click()};form.append(save);area.append(form);return;
    }
    message(result.status==='rejected'?t('رفضت الإدارة الطلب. تواصل مع الدعم للتحقق من صاحب المحل.','Demande refusée. Contactez l’assistance pour vérifier le propriétaire.'):t('انتهى هذا الطلب. يمكنك إغلاق النافذة وطلب استعادة جديدة.','Cette demande a expiré. Fermez cette fenêtre pour en créer une nouvelle.'));
  }
  function complete(result={}){poller.stop();const area=overlay?.querySelector('.recovery-actions');area?.replaceChildren();message(t('حُفظت بيانات الدخول. أغلق النافذة وسجّل الدخول بنفسك.','Identifiants enregistrés. Fermez cette fenêtre puis connectez-vous.'));if(area&&typeof result.username==='string'){const label=node('label',t('اسم المستخدم','Nom d’utilisateur')),input=node('input');input.type='text';input.name='recoveredUsername';input.value=result.username;input.readOnly=true;input.dir='auto';input.autocomplete='username';label.append(input);area.append(label)}}
  async function open(){
    if(overlay)return;closed=false;overlay=node('div',null,'owner-recovery-overlay');overlay.dir=french()?'ltr':'rtl';overlay.dataset.appearance=document.querySelector('#phone')?.dataset.appearance||'dark';const panel=node('section',null,'owner-recovery-panel');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','owner-recovery-title');
    const header=node('header'),title=node('h2',t('استعادة حساب المالك','Récupérer le compte propriétaire'));title.id='owner-recovery-title';header.append(title,button(t('إغلاق','Fermer'),stop));const body=node('div',null,'recovery-body'),description=node('p',t('اختر المالك المحلي. ترسل الخدمة طلب موافقة فقط، ولا تنقل فواتيرك أو كلمات المرور.','Choisissez le propriétaire local. La demande ne transmet ni factures ni mots de passe.'));const state=node('p');state.setAttribute('role','status');const area=node('div',null,'recovery-actions');body.append(description,state,area);panel.append(header,body);overlay.append(panel);document.body.append(overlay);overlay.addEventListener('keydown',e=>{if(e.key==='Escape')stop();if(e.key==='Tab'){const els=[...panel.querySelectorAll('button,input,select')].filter(e=>!e.disabled);const a=els[0],b=els.at(-1);if(e.shiftKey&&document.activeElement===a){b?.focus();e.preventDefault()}else if(!e.shiftKey&&document.activeElement===b){a?.focus();e.preventDefault()}}});header.querySelector('button').onclick=stop;header.querySelector('button').focus();
    if(!window.NativeFiles?.ownerRecovery)return unconfigured();
    const owners=context().owners;if(!owners.length){message(t('لا يوجد حساب مالك قابل للاستعادة.','Aucun compte propriétaire disponible.'));return;}
    const currentOverlay=overlay;
    try{const result=await apply(await call('resume'));if(closed||overlay!==currentOverlay)return;if(result.stage==='unconfigured')return unconfigured();if(result.stage==='complete')return complete(result);if(result.status)return status(result);}catch(error){
      if(closed||overlay!==currentOverlay)return;
      if(error.recoveryLocal&&error.recovery){try{await status({...error.recovery,status:'approved'});failure(error);return}catch{}}
      failure(error);area.append(button(t('إعادة المحاولة','Réessayer'),async()=>{stop();await open()}));return;
    }
    const label=node('label',t('حساب المالك','Compte propriétaire')),select=node('select');for(const owner of owners){const option=node('option',owner.name);option.value=owner.id;select.append(option)}label.append(select);area.append(label,button(t('طلب موافقة الإدارة','Demander l’approbation'),async()=>{const registered=await registration.forRecovery();if(closed||document.hidden)return;if(registered?.stage==='unconfigured')return unconfigured();if(!registered?.registered){if(registered?.code)failure(registered);else if(registered?.stage==='offline')failure({code:'RECOVERY_OFFLINE',phase:'register-now'});else message(t('انتظر قليلًا قبل إعادة الطلب. بياناتك وتفعيلك محفوظان.','Patientez avant de recommencer. Vos données et votre activation sont conservées.'));return;}poller.stop();await status(await call('request',select.value));},true));
  }
  const wake=()=>{registration.notify();poller.wake();scheduleAck();};
  addEventListener('online',wake);addEventListener('alkarna-network-available',wake);addEventListener('offline',()=>{registration.cancel();poller.pause();clearTimeout(ackTimer);});
  document.addEventListener('visibilitychange',()=>{if(visible())wake();else{registration.cancel();poller.pause();clearTimeout(ackTimer);}});
  document.addEventListener('click',e=>{if(e.target.closest('[data-owner-recovery]'))open();});
  return {
    async resume(){if(!window.NativeFiles?.ownerRecovery)return;return apply(await call('resume-local'));},
    async register(){if(!window.NativeFiles?.ownerRecovery||!context().owners.length)return;registration.notify();},
    close:stop
  };
}
