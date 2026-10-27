import {passwordDigest} from './database.js';
import {RegistrationEvents,RecoveryPoller} from './service-contact.js';

/** Focused pre-login owner recovery; credentials and business rows never enter registration. */
export function installOwnerRecovery({database,getState,getUsers,onApplied}){
  const call=(command,value='')=>window.NativeFiles.ownerRecovery(command,typeof value==='string'?value:JSON.stringify(value));
  const french=()=>localStorage.getItem('alkarna-site-language')==='fr';
  const t=(ar,fr)=>french()?fr:ar;
  let overlay=null,inFlight=false,closed=true,ackTimer=null,ackFlight=null,ackPending=false;
  const visible=()=>!document.hidden,online=()=>navigator.onLine!==false;
  function stop(){poller.stop();closed=true;overlay?.remove();overlay=null;}
  function context(){return {shopId:getState().originId,owners:getUsers().filter(u=>u.role==='owner'&&u.active!==false).map(u=>({id:u.id,name:u.name,role:'owner'}))};}
  async function apply(result){
    if(result.stage==='prepared'){
      await database.recoverOwner(result);
      const token=sessionStorage.getItem('alkarna-local-session');if(token){const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(x=>x.toString(16).padStart(2,'0')).join('');const session=await database.get('meta','session:'+hash);if(!session||session.user===result.ownerId)sessionStorage.removeItem('alkarna-local-session');}
      await onApplied(result.ownerId);
      const completed=await call('finish',{grantId:result.grantId,intentId:result.intentId});ackPending=completed.ackPending===true;scheduleAck(completed.retryAt);return {stage:'complete'};
    }if(result.ackPending){ackPending=true;scheduleAck(result.retryAt);}return result;
  }
  function node(tag,text,className){const el=document.createElement(tag);if(text)el.textContent=text;if(className)el.className=className;return el;}
  function message(text){const box=overlay?.querySelector('[role=status]');if(box)box.textContent=text;}
  function button(label,fn,primary=false){const el=node('button',label,primary?'recovery-primary':'recovery-secondary');el.type='button';el.onclick=async()=>{if(inFlight)return;inFlight=true;el.disabled=true;try{await fn()}catch{message(t('تعذّر الاتصال بخدمة الاستعادة. أعد المحاولة؛ بياناتك وتفعيلك محفوظان.','Service indisponible. Réessayez ; vos données et votre activation sont conservées.'))}finally{inFlight=false;el.disabled=false}};return el;}
  function unconfigured(){message(t('خدمة الاستعادة لم تُربط بهذه النسخة بعد. تواصل مع الدعم على 49823328.','Le service de récupération n’est pas encore configuré. Assistance : 49823328.'));}
  const registration=new RegistrationEvents({call,context,visible,online});
  const poller=new RecoveryPoller({poll:()=>call('poll'),onResult:status,onError:error=>message(error.permanent?t('تعذّر التحقق من الطلب. تواصل مع الدعم.','Impossible de vérifier la demande. Contactez l’assistance.'):t('الاتصال متوقف. سنعيد التحقق بتباعد؛ كلمة المرور لم تتغير.','Connexion interrompue. Nouvelle tentative espacée ; mot de passe inchangé.')),visible:()=>!closed&&visible(),online});
  function scheduleAck(at=0){clearTimeout(ackTimer);ackTimer=null;if(!ackPending||ackFlight||!visible()||!online())return;ackTimer=setTimeout(()=>ack().catch(()=>{}),Math.min(2147483647,Math.max(750,(at||0)-Date.now())));}
  async function ack(){if(!ackPending||ackFlight||!visible()||!online())return;ackFlight=call('ack');try{const result=await ackFlight;ackPending=result.ackPending===true;if(ackPending&&!result.permanent){ackFlight=null;scheduleAck(result.retryAt||Date.now()+60000);}}catch(error){ackFlight=null;scheduleAck(Math.max(error.retryAt||0,Date.now()+60000));}finally{ackFlight=null;}}
  async function poll(){const result=await poller.refresh(true);if(result?.stage==='cooldown')message(t('انتظر قليلًا قبل تحديث الطلب مجددًا.','Patientez avant d’actualiser à nouveau.'));}
  async function status(result){
    if(closed)return;if(result.stage==='unconfigured')return unconfigured();
    const area=overlay.querySelector('.recovery-actions');area.replaceChildren();
    if(result.status==='waiting'){message(t('طلبك ينتظر موافقة الإدارة بعد التحقق من هويتك. لا تشارك كلمة مرورك.','Demande en attente de vérification par l’administration. Ne communiquez jamais votre mot de passe.'));area.append(button(t('تحديث الحالة','Actualiser'),poll));if(!poller.waiting)poller.pending();return;}
    poller.stop();
    if(result.status==='approved'){
      message(t('تمت الموافقة. أدخل كلمة مرور جديدة لحساب المالك.','Demande approuvée. Choisissez un nouveau mot de passe pour le propriétaire.'));
      const form=node('form');form.autocomplete='off';const fields=[];
      for(const [name,ar,fr]of [['password','كلمة المرور الجديدة','Nouveau mot de passe'],['confirm','تأكيد كلمة المرور','Confirmation']]){const label=node('label',t(ar,fr)),input=node('input');input.name=name;input.type='password';input.autocomplete='new-password';input.minLength=4;input.maxLength=256;input.required=true;label.append(input);form.append(label);fields.push(input);}
      const save=button(t('حفظ كلمة المرور','Enregistrer'),async()=>{const [a,b]=fields;if(a.value.length<4||a.value!==b.value){message(t('أدخل كلمتي مرور متطابقتين من 4 أحرف على الأقل.','Saisissez deux mots de passe identiques de 4 caractères minimum.'));return;}const derived=await passwordDigest(a.value);a.value=b.value='';const result=await apply(await call('prepare',derived));if(result.stage==='unconfigured')unconfigured();else if(result.stage==='complete')complete();else if(result.stage==='expired')await status({status:'expired'});});
      form.onsubmit=e=>{e.preventDefault();save.click()};form.append(save);area.append(form);return;
    }
    message(result.status==='rejected'?t('رفضت الإدارة الطلب. تواصل مع الدعم للتحقق من صاحب المحل.','Demande refusée. Contactez l’assistance pour vérifier le propriétaire.'):t('انتهى هذا الطلب. يمكنك إغلاق النافذة وطلب استعادة جديدة.','Cette demande a expiré. Fermez cette fenêtre pour en créer une nouvelle.'));
  }
  function complete(){poller.stop();overlay?.querySelector('.recovery-actions')?.replaceChildren();message(t('حُفظت كلمة المرور الجديدة. أغلق النافذة وسجّل الدخول بنفسك.','Nouveau mot de passe enregistré. Fermez cette fenêtre puis connectez-vous.'));}
  async function open(){
    if(overlay)return;closed=false;overlay=node('div',null,'owner-recovery-overlay');overlay.dir=french()?'ltr':'rtl';overlay.dataset.appearance=document.querySelector('#phone')?.dataset.appearance||'dark';const panel=node('section',null,'owner-recovery-panel');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','owner-recovery-title');
    const header=node('header'),title=node('h2',t('استعادة حساب المالك','Récupérer le compte propriétaire'));title.id='owner-recovery-title';header.append(title,button(t('إغلاق','Fermer'),stop));const body=node('div',null,'recovery-body'),description=node('p',t('اختر المالك المحلي. ترسل الخدمة طلب موافقة فقط، ولا تنقل فواتيرك أو كلمات المرور.','Choisissez le propriétaire local. La demande ne transmet ni factures ni mots de passe.'));const state=node('p');state.setAttribute('role','status');const area=node('div',null,'recovery-actions');body.append(description,state,area);panel.append(header,body);overlay.append(panel);document.body.append(overlay);overlay.addEventListener('keydown',e=>{if(e.key==='Escape')stop();if(e.key==='Tab'){const els=[...panel.querySelectorAll('button,input,select')].filter(e=>!e.disabled);const a=els[0],b=els.at(-1);if(e.shiftKey&&document.activeElement===a){b?.focus();e.preventDefault()}else if(!e.shiftKey&&document.activeElement===b){a?.focus();e.preventDefault()}}});header.querySelector('button').onclick=stop;header.querySelector('button').focus();
    if(!window.NativeFiles?.ownerRecovery)return unconfigured();
    const owners=context().owners;if(!owners.length){message(t('لا يوجد حساب مالك قابل للاستعادة.','Aucun compte propriétaire disponible.'));return;}
    try{const result=await apply(await call('resume'));if(closed)return;if(result.stage==='unconfigured')return unconfigured();if(result.stage==='complete')return complete();}catch{message(t('هناك استعادة لم تكتمل. أعد المحاولة بعد عودة الاتصال.','Une récupération reste en attente. Réessayez après le rétablissement de la connexion.'));return;}
    const label=node('label',t('حساب المالك','Compte propriétaire')),select=node('select');for(const owner of owners){const option=node('option',owner.name);option.value=owner.id;select.append(option)}label.append(select);area.append(label,button(t('طلب موافقة الإدارة','Demander l’approbation'),async()=>{const registered=await registration.forRecovery();if(registered?.stage==='unconfigured')return unconfigured();if(!registered?.registered){message(registered?.stage==='blocked'?t('تعذّر توثيق الجهاز. تواصل مع الدعم؛ لم تتغير بياناتك.','Appareil non vérifié. Contactez l’assistance ; données inchangées.'):t('الاتصال غير متاح أو المحاولة مؤجلة. أعد المحاولة بعد قليل.','Connexion indisponible ou tentative différée. Réessayez plus tard.'));return;}poller.stop();await status(await call('request',select.value));},true));
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
