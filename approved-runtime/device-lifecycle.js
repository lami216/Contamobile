import {validateState} from './database.js';
import {RecoveryPoller} from './service-contact.js';

/** A replacement phone imports only an administrator-approved, immutable version. */
export function installDeviceLifecycle(api){
  const supported=()=>typeof globalThis.NativeFiles?.deviceLifecycle==='function';
  const t=(ar,fr)=>api.language()==='fr'?fr:ar;
  const call=(command,payload={})=>globalThis.NativeFiles.deviceLifecycle(command,payload);
  let overlay=null,body=null,busy=false,preview=null,prepared=null,closed=true;
  const node=(tag,text,className)=>{const element=document.createElement(tag);if(text)element.textContent=text;if(className)element.className=className;return element};
  const visible=()=>!closed&&!document.hidden;
  const poller=new RecoveryPoller({poll:()=>call('status'),onResult:showStatus,onError:showError,visible,online:()=>navigator.onLine!==false});

  function message(text){const target=body?.querySelector('[role=status]');if(target)target.textContent=text}
  function showError(error){
    const code=String(error?.code||error?.message||'').toLowerCase();
    const text=/expired/.test(code)?t('انتهت موافقة الاستعادة. اطلب من الإدارة موافقة جديدة.','L’autorisation a expiré. Demandez un nouvel accord à l’administration.'):
      /populated|يحتوي بيانات/.test(code)?t('هذا الهاتف يحتوي بيانات. اطلب من الدعم مراجعتها قبل الاستعادة.','Cet appareil contient des données. Contactez l’assistance avant toute restauration.'):
      t('تعذّر إكمال الاستعادة. أعد المحاولة؛ تفعيل الهاتف محفوظ.','La récupération n’a pas abouti. Réessayez ; l’activation est conservée.');
    message(text);
  }
  function button(label,action,primary=false){
    const element=node('button',label,primary?'recovery-primary':'recovery-secondary');element.type='button';
    element.onclick=async()=>{
      if(busy||api.isBusy())return;
      busy=true;element.disabled=true;
      try{await action()}catch(error){showError(error)}finally{busy=false;element.disabled=false}
    };
    return element;
  }
  function actions(){return body?.querySelector('.recovery-actions')}
  function close(){
    if(api.isBusy())return;
    poller.stop();closed=true;overlay?.remove();overlay=null;body=null;preview=null;prepared=null;
  }
  async function refresh(){
    let value=await call('resume-local');
    if(value.stage==='awaiting-network')value=await call('resume');
    if(value.stage==='prepared'){
      if(await hasReceipt(value)){await finish(value);return}
      if(!api.isEmpty())throw Error('populated');
      showPreview(value);return;
    }
    if(value.stage==='complete'){
      if(!await hasReceipt(value))throw Error('Missing local restore receipt');
      await api.onRestored();
      if(value.ackPending)await call('resume');
      message(t('البيانات المستعادة جاهزة. سجّل الدخول بحساب النسخة.','Les données restaurées sont prêtes. Connectez-vous avec les identifiants de la sauvegarde.'));actions()?.replaceChildren();return;
    }
    if(!api.isEmpty())throw Error('populated');
    await showStatus(await call('status'));
  }
  async function hasReceipt(value){
    const receipt=await api.database.get('meta','cloud-bootstrap:'+value.grantId);
    return !!receipt&&['intentId','shopId','ownerId','backupId','sha256'].every(key=>receipt[key]===value[key]);
  }
  function summary(payload){
    const panel=node('div',null,'panel');
    panel.append(node('h3',payload.state.branding||t('المحل','Commerce')));
    const counts=node('p');counts.textContent=api.language()==='fr'?
      `${payload.state.products.length} produits · ${payload.state.parties.length} tiers · ${payload.state.records.length} documents`:
      `${payload.state.products.length} منتجات · ${payload.state.parties.length} أطراف · ${payload.state.records.length} مستندات`;
    panel.append(counts);
    const date=new Date(payload.createdAt);
    if(Number.isFinite(date.getTime()))panel.append(node('p',date.toLocaleString(api.language()==='fr'?'fr-FR':'ar-MR'),'muted'));
    return panel;
  }
  function showPreview(value){
    if(closed)return;
    const payload=JSON.parse(value.text);
    if(payload.format!=='alkarna-web-backup'||payload.schemaVersion!==1||payload.state?.originId!==value.shopId||!Array.isArray(payload.users)||!payload.users.some(user=>user.id===value.ownerId&&user.role==='owner'&&user.active!==false))throw Error('Invalid approved backup');
    validateState(payload.state);preview=value;
    const area=actions();area.replaceChildren(summary(payload));
    message(t('راجع نسخة محلك ثم أكد استعادتها على هذا الهاتف.','Vérifiez la copie de votre commerce puis confirmez la restauration sur cet appareil.'));
    area.append(node('p',t('ستعود حسابات الدخول الموجودة في النسخة. تفعيل هذا الهاتف مستقل عنها.','Les identifiants de la sauvegarde seront rétablis. L’activation de cet appareil reste indépendante.'),'notice'));
    area.append(button(t('استعادة هذه النسخة','Restaurer cette sauvegarde'),restore,true));
  }
  async function finish(value){
    await api.onRestored();
    const result=await call('bootstrap-finish',{grantId:value.grantId,intentId:value.intentId});
    if(result?.stage!=='complete')throw Error('Restore receipt was not accepted');
    message(result.ackPending?t('حُفظت البيانات على الهاتف. تأكيد الربط ينتظر الاتصال. سجّل الدخول بحساب النسخة.','Les données sont enregistrées. La confirmation de liaison attend la connexion. Connectez-vous avec les identifiants de la sauvegarde.'):
      t('تمت الاستعادة. أغلق النافذة وسجّل الدخول بحساب النسخة.','Restauration terminée. Fermez cette fenêtre et connectez-vous avec les identifiants de la sauvegarde.'));
    actions()?.replaceChildren();poller.stop();
  }
  async function restore(){
    if(!preview||!api.isEmpty())throw Error('populated');
    api.lock(true);
    try{
      prepared=await call('bootstrap-prepare',{grantId:preview.grantId,accepted:true});
      if(prepared.stage!=='prepared'||prepared.sha256!==preview.sha256||prepared.backupId!==preview.backupId||prepared.shopId!==preview.shopId||prepared.ownerId!==preview.ownerId)throw Error('Approved version changed');
      await api.database.applyCloudBootstrap(prepared);
      try{await finish(prepared)}catch{
        message(t('حُفظت البيانات على الهاتف. أعد تأكيد الربط لإكمال الاستعادة.','Les données sont enregistrées. Confirmez de nouveau la liaison pour terminer.'));
        actions()?.replaceChildren(button(t('إعادة تأكيد الربط','Confirmer la liaison'),()=>finish(prepared),true));
      }
    }finally{api.lock(false)}
  }
  async function showStatus(value){
    if(closed)return;
    const area=actions();area.replaceChildren();
    if(!value?.bootstrapAvailable){
      message(t('بانتظار ربط الهاتف الجديد بنسخة محلك من كونتا تولز.','En attente de la liaison de cet appareil à votre sauvegarde dans Contatools.'));
      area.append(button(t('تحديث الحالة','Actualiser'),refresh));
      if(!poller.waiting)poller.pending();
      return;
    }
    poller.stop();
    const list=await call('bootstrap-list',{grantId:value.bootstrapMeta?.grantId});
    if(closed)return;
    message(t('وصلت موافقة الإدارة. اختر معاينة النسخة قبل استعادتها.','L’administration a autorisé la récupération. Consultez la sauvegarde avant de la restaurer.'));
    area.append(button(t('معاينة نسخة السيرفر','Voir la sauvegarde du serveur'),async()=>{
      message(t('جارٍ تنزيل النسخة والتحقق منها…','Téléchargement et vérification…'));
      showPreview(await call('bootstrap-preview',{grantId:list.grantId}));
    },true));
  }
  async function open(){
    if(overlay||!supported()||!api.isEmpty())return;
    closed=false;overlay=node('div',null,'owner-recovery-overlay');overlay.dir=api.language()==='fr'?'ltr':'rtl';
    overlay.dataset.appearance=document.querySelector('#phone')?.dataset.appearance||'dark';
    const panel=node('section',null,'owner-recovery-panel');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','cloud-bootstrap-title');
    const header=node('header'),title=node('h2',t('استعادة نسخة السيرفر','Récupérer une sauvegarde serveur'));title.id='cloud-bootstrap-title';
    const closeButton=node('button',t('إغلاق','Fermer'),'recovery-secondary');closeButton.type='button';closeButton.onclick=close;header.append(title,closeButton);
    body=node('div',null,'recovery-body');const state=node('p');state.setAttribute('role','status');body.append(state,node('div',null,'recovery-actions'));panel.append(header,body);overlay.append(panel);document.body.append(overlay);
    overlay.addEventListener('keydown',event=>{
      if(event.key==='Escape')close();
      if(event.key!=='Tab')return;
      const controls=[...panel.querySelectorAll('button')].filter(element=>!element.disabled),first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){last?.focus();event.preventDefault()}else if(!event.shiftKey&&document.activeElement===last){first?.focus();event.preventDefault()}
    });closeButton.focus();
    try{
      await refresh();
    }catch(error){showError(error);actions()?.append(button(t('إعادة المحاولة','Réessayer'),refresh))}
  }
  document.addEventListener('click',event=>{if(event.target.closest('[data-cloud-bootstrap]'))open()});
  const wake=()=>poller.wake();
  addEventListener('online',wake);addEventListener('alkarna-network-available',wake);
  document.addEventListener('visibilitychange',()=>{if(visible())wake();else poller.pause()});
  async function resume(){
    if(!supported())return;
    const value=await call('resume-local');
    if(value.stage==='prepared'&&await hasReceipt(value))await finish(value);
    else if(value.stage==='complete'&&value.ackPending&&await hasReceipt(value))await call('resume');
  }
  return {open,close,supported,resume};
}
