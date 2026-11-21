(()=>{
 const $=id=>document.getElementById(id),fr=localStorage.getItem('alkarna-site-language')==='fr';
 document.documentElement.lang=fr?'fr':'ar';document.title=fr?'Activation d’AlKarna':'تفعيل الكرنه';document.querySelector('.brand').textContent=fr?'AlKarna':'الكرنه';document.documentElement.dir=fr?'ltr':'rtl';document.documentElement.dataset.appearance=localStorage.getItem('alkarna-site-appearance')||'dark';
 const t=(ar,french)=>fr?french:ar;
 const nativeMessages={"انتظر اكتمال حفظ الملف الحالي": "Attendez la fin de l’enregistrement en cours", "تعذّر تجهيز الملف": "Impossible de préparer le fichier", "تعذّر تشغيل الكاميرا": "Impossible d’ouvrir la caméra", "تعذّر حفظ ملف التفعيل": "Impossible d’enregistrer la licence", "تعذّر فتح الطباعة": "Impossible d’ouvrir l’impression", "تعذّر فتح بيانات التفعيل. أعد فتح التطبيق": "Impossible de lire la licence. Rouvrez l’application.", "تعذّر فتح وسيلة التواصل. الرقم: 49823328": "Impossible d’ouvrir le contact. Numéro : 49823328", "تعذّر كتابة الملف": "Impossible d’écrire le fichier", "قارئ الباركود مفتوح بالفعل": "Le lecteur de codes-barres est déjà ouvert", "لا توجد خدمة لحفظ الملفات على هذا الجهاز": "Aucun service d’enregistrement de fichiers sur cet appareil", "لم يكتمل حفظ الملف؛ أعد المحاولة": "Enregistrement incomplet. Réessayez.", "لم يُحفظ الملف": "Le fichier n’a pas été enregistré", "لم يُسمح بالكاميرا. أدخل الباركود يدويًا.": "Caméra non autorisée. Saisissez le code-barres manuellement.", "إغلاق الكاميرا": "Fermer la caméra", "الكاميرا غير متاحة. أدخل الباركود يدويًا.": "Caméra indisponible. Saisissez le code-barres manuellement.", "وجّه الكاميرا نحو الباركود": "Visez le code-barres avec la caméra", "أضف ملف تفعيل هذا الهاتف": "Ajoutez la licence de ce téléphone", "تعذّر استخراج كود الهاتف": "Impossible de lire le code du téléphone", "تعذّر التحقق من بيانات التفعيل المحفوظة. تواصل مع مسؤول التفعيل": "Impossible de vérifier la licence enregistrée. Contactez l’assistance.", "تعذّر التحقق من سجل التفعيل. تواصل مع مسؤول التفعيل": "Impossible de vérifier l’historique d’activation. Contactez l’assistance.", "تعذّر حفظ التفعيل. تحقّق من مساحة التخزين وأعد فتح التطبيق": "Impossible d’enregistrer la licence. Vérifiez le stockage puis rouvrez l’application.", "فعّل هذا الهاتف للبدء": "Activez ce téléphone pour commencer", "لم يكتمل حفظ التفعيل. أعد فتح التطبيق قبل المحاولة مجددًا": "Activation non enregistrée. Rouvrez l’application avant de réessayer.", "ملف الترخيص المحفوظ غير صالح. أضف ملف تفعيل جديدًا": "La licence enregistrée est invalide. Ajoutez un nouveau fichier.", "ملف التفعيل مستخدم من قبل. اطلب ملفًا جديدًا للتجديد": "Cette licence a déjà été utilisée. Demandez un nouveau fichier pour le renouvellement.", "انتهت مدة الترخيص. أضف ملف تفعيل جديدًا": "La licence a expiré. Ajoutez un nouveau fichier.", "تم اكتشاف إرجاع ساعة الجهاز. تواصل مع مسؤول التفعيل": "Un recul de l’horloge a été détecté. Contactez l’assistance.", "تعذّر استخراج كود الجهاز": "Impossible de lire le code de l’appareil", "ملف الترخيص أكبر من 64 كيلوبايت": "Le fichier de licence dépasse 64 Ko", "ملف الترخيص غير صالح أو تم تغييره": "Le fichier de licence est invalide ou a été modifié", "هذا الترخيص مخصص لجهاز آخر": "Cette licence est destinée à un autre appareil"};
 NativeHost.language?.(fr?'fr':'ar');
 for(const button of document.querySelectorAll('[data-language]')){button.setAttribute('aria-pressed',String(button.dataset.language===(fr?'fr':'ar')));button.onclick=()=>{sessionStorage.setItem('activation-draft',$('license-text').value);localStorage.setItem('alkarna-site-language',button.dataset.language);location.reload()}}

 const copy={eyebrow:['ترخيص الجهاز','Licence de l’appareil'],title:['تفعيل هذا الهاتف','Activer ce téléphone'],intro:['اربط هذا الهاتف بالإدارة للتحقق من التفعيل واستلام الموافقة مباشرة.','Reliez cet appareil à l’administration pour vérifier et recevoir son activation.'],'device-label':['كود الجهاز','Code de l’appareil'],'copy-code':['نسخ الكود','Copier le code'],'manual-title':['استيراد ترخيص سابق','Importer une licence existante'],'manual-note':['يتطلب التحقق من أي ملف جديد اتصالًا بالإنترنت قبل تثبيته.','Toute nouvelle licence doit être vérifiée en ligne avant son installation.'],'file-text':['اختيار ملف التفعيل','Choisir le fichier de licence'],'paste-title':['لصق محتوى ملف الترخيص','Coller le contenu de la licence'],'paste-label':['محتوى ملف الترخيص','Contenu de la licence'],'install-text':['التحقق وتثبيت الترخيص','Vérifier et installer la licence'],continue:['فتح التطبيق','Ouvrir l’application'],privacy:['سياسة الخصوصية','Confidentialité'],footnote:['استلام تفعيل جديد يحتاج الإنترنت. المحاسبة محلية، والتفعيل المحفوظ يبقى بمدته الأصلية دون اتصال.','Une nouvelle activation nécessite Internet. La comptabilité reste locale ; une licence déjà installée conserve sa durée initiale hors connexion.']};
 for(const [id,words] of Object.entries(copy))$(id).textContent=words[fr?1:0];
 const pending=new Map();let busy=false,current=null;
 window.__nativeResult=(id,result)=>{const request=pending.get(id);if(!request)return;pending.delete(id);clearTimeout(request.timer);result.error?request.reject(Object.assign(new Error(result.error),{code:result.code||''})):request.resolve(result)};
 const call=(method,...args)=>new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{if(!pending.delete(id))return;reject(Object.assign(new Error(t('لم يصل تأكيد. حدّث الحالة قبل إعادة المحاولة.','Confirmation non reçue. Actualisez l’état avant de réessayer.')),{code:'NATIVE_TIMEOUT'}))},60000);pending.set(id,{resolve,reject,timer});try{NativeHost[method](id,...args)}catch(e){pending.delete(id);clearTimeout(timer);reject(e)}});
 addEventListener('pagehide',()=>{for(const [id,request]of pending){pending.delete(id);clearTimeout(request.timer);request.reject(Object.assign(new Error('PAGE_CLOSED'),{code:'PAGE_CLOSED'}))}},{once:true});
 const message=(text,kind='')=>{$('status').textContent=text;$('status').className=kind};
 const reasons={LICENSE_REQUIRED:['فعّل هذا الهاتف للبدء','Activez ce téléphone pour commencer'],LICENSE_EXPIRED:['انتهت مدة الترخيص. أضف ملف تفعيل جديدًا','La licence a expiré. Ajoutez un nouveau fichier.'],LICENSE_CLOCK_ROLLBACK:['تم اكتشاف إرجاع ساعة الجهاز. تواصل مع مسؤول التفعيل','Un recul de l’horloge a été détecté. Contactez le responsable.'],ENTITLEMENT_PENDING:['بانتظار موافقة استبدال الهاتف','En attente de l’autorisation de remplacement'],ENTITLEMENT_REPLACED:['استُبدل هذا الهاتف. بيانات المحل محفوظة على الجهاز','Ce téléphone a été remplacé. Les données restent sur cet appareil.'],ENTITLEMENT_EXPIRED:['انتهت مدة التفعيل. اطلب التجديد من الإدارة','L’activation a expiré. Demandez son renouvellement à l’administration.']};
 reasons.DEVICE_BANNED=['حُظر تفعيل هذا الهاتف. بيانات المحل محفوظة.','L’activation de ce téléphone est interdite. Les données restent conservées.'];reasons.ACTIVATION_REVOKED=['أُبطل هذا التفعيل. يلزم تفعيل جديد معتمد؛ بيانات المحل محفوظة.','Cette activation est révoquée. Une nouvelle autorisation est nécessaire ; les données restent conservées.'];reasons.ENTITLEMENT_SUSPENDED=['أوقفت الإدارة تفعيل هذا الهاتف. بيانات المحل محفوظة.','L’administration a suspendu cette activation. Les données restent conservées.'];
 const duration=seconds=>{const n=Math.max(0,Math.ceil(seconds)),days=Math.floor(n/86400),hours=Math.floor(n%86400/3600),minutes=Math.floor(n%3600/60);return days?days+' '+t('يوم','j')+' '+hours+' '+t('ساعة','h'):hours?hours+' '+t('ساعة','h')+' '+minutes+' '+t('دقيقة','min'):minutes+' '+t('دقيقة','min')+' '+n%60+' '+t('ثانية','s')};
 function show(status){current=status;
  $('intro').textContent=status.valid?t('هذا الهاتف مفعّل. بيانات المحل محفوظة محليًا.','Ce téléphone est activé. Les données du commerce restent locales.'):copy.intro[fr?1:0];
  $('device-code').textContent=status.deviceId||'—';$('copy-code').disabled=!status.deviceId;$('continue').hidden=!status.valid;
  $('title').textContent=status.valid?t('الهاتف مفعّل','Téléphone activé'):copy.title[fr?1:0];
  if(status.code==='DEVICE_BANNED')$('title').textContent=t('تفعيل الهاتف محظور','Activation interdite');
  else if(['ACTIVATION_REVOKED','ENTITLEMENT_SUSPENDED'].includes(status.code))$('title').textContent=t('التفعيل موقوف','Activation interrompue');
  $('footnote').textContent=['DEVICE_BANNED','ACTIVATION_REVOKED','ENTITLEMENT_SUSPENDED'].includes(status.code)?t('بيانات المحل محفوظة. رفع الحظر لا يعيد تفعيلًا سابقًا؛ يلزم تفعيل جديد معتمد.','Les données sont conservées. Lever une interdiction ne rétablit pas une ancienne licence ; une nouvelle activation approuvée est nécessaire.'):copy.footnote[fr?1:0];
  if(status.code==='ENTITLEMENT_REPLACED'){$('title').textContent=t('استُبدل هذا الهاتف','Téléphone remplacé');$('intro').textContent=t('أصبح هاتفًا سابقًا في ملف العميل. بياناته محفوظة، ويمكن للإدارة مراجعة الحالة دون حذف التطبيق.','Cet appareil figure dans l’historique du client. Ses données sont conservées ; l’administration peut vérifier sa situation sans supprimer l’application.');}
  else if(status.code==='ENTITLEMENT_PENDING'){$('title').textContent=t('استبدال الهاتف','Remplacement du téléphone');$('intro').textContent=t('راجع موافقة الإدارة ثم أكد استلام التفعيل. استعادة نسخة بياناتك خطوة مستقلة بعد التفعيل.','Vérifiez l’autorisation puis recevez l’activation. La restauration des données reste une étape séparée.');}
  $('file-text').textContent=status.valid?t('تحديث ملف الترخيص','Mettre à jour la licence'):copy['file-text'][fr?1:0];
  const info=$('license-info');info.hidden=!status.valid;info.replaceChildren();
  if(status.valid){const p=status.license,remaining=p.remainingSeconds;for(const [label,value] of [[t('المحل','Magasin'),p.storeName],[t('صاحب الترخيص','Titulaire'),p.customerName],[t('الترخيص','Licence'),remaining===null?t('دائم','Permanente'):duration(remaining)+' '+t('متبقية','restant(s)')]]){const row=document.createElement('div'),name=document.createElement('span'),text=document.createElement('strong');name.textContent=label;text.textContent=value;row.append(name,text);info.append(row)}message(t('الترخيص صالح لهذا الهاتف','La licence est valide pour ce téléphone'),'success');}
  else message(reasons[status.code]?.[fr?1:0]||(fr?nativeMessages[status.reason]:status.reason)||t('تعذّر قراءة الترخيص','Impossible de lire la licence'),status.code==='LICENSE_REQUIRED'?'':'error');
  updateManualControls();
 }
 function updateManualControls(){const shared=!!current?.entitlement||current?.code==='DEVICE_BANNED';$('manual-activation').hidden=shared;for(const id of ['license-file','license-text','install-text'])$(id).disabled=busy||shared;$('file-label').hidden=shared;$('filename').hidden=shared;$('paste-title').closest('details').hidden=shared;}
 async function install(content){if(busy)return;if(!remoteConsent.checked){message(t('وافق على التحقق عبر الإنترنت أولًا.','Acceptez d’abord la vérification en ligne.'),'error');return;}busy=true;for(const el of document.querySelectorAll('button,input,textarea'))el.disabled=true;message(t('جارٍ التحقق من الترخيص…','Vérification de la licence…'));
  try{if(new TextEncoder().encode(content).length>65536)throw new Error(t('ملف الترخيص أكبر من 64 كيلوبايت','Le fichier dépasse 64 Ko'));const status=await call('installActivation',content);show(status);if(status.valid){$('license-text').value='';sessionStorage.removeItem('activation-draft');$('continue').focus();}}
  catch(e){if(['DEVICE_BANNED','ACTIVATION_REVOKED'].includes(e.code))try{show(await call('activationStatus'))}catch{}message(fr?t('لم يُقبل ملف الترخيص. تحقق من الاتصال وموافقة الإدارة على هذا الملف.','Licence refusée. Vérifiez la connexion et l’autorisation de ce document.'):e.message,'error')}
  finally{busy=false;for(const el of document.querySelectorAll('button,input,textarea'))el.disabled=false;$('copy-code').disabled=!current?.deviceId;updateOnlineButtons();updateManualControls();}
 }
 let onlineTimer=null,onlineWaiting=false,onlineAvailable=false,onlineLastCheck=0;
 const onlineSection=document.createElement('section');onlineSection.className='activation-contact';onlineSection.dataset.onlineActivation='true';
 const onlineTitle=document.createElement('h2');onlineTitle.textContent=t('التفعيل من كونتا تولز','Activation avec Contatools');
 const onlineDescription=document.createElement('p');onlineDescription.textContent=t('يرسل التحقق كود الجهاز ومفتاح تثبيته العام وبيانات الترخيص إلى الإدارة. لا يرسل بيانات المحاسبة أو كلمات المرور.','La vérification transmet le code de l’appareil, sa clé publique et les informations de licence à l’administration, sans comptabilité ni mot de passe.');
 const consentLabel=document.createElement('label');consentLabel.className='remote-consent';const remoteConsent=document.createElement('input');remoteConsent.type='checkbox';remoteConsent.id='remote-consent';const consentText=document.createElement('span');consentText.textContent=t('أوافق على ربط هذا الهاتف بالإدارة والتحقق من حالة التفعيل عبر الإنترنت.','J’accepte de relier cet appareil à l’administration et de vérifier son activation en ligne.');consentLabel.append(remoteConsent,consentText);
 const onlineMessage=document.createElement('p');onlineMessage.id='online-status';onlineMessage.setAttribute('role','status');onlineMessage.setAttribute('aria-live','polite');
 const onlineActions=document.createElement('div');onlineActions.className='activation-contact-actions online-activation-actions';
 const onlineConnect=document.createElement('button');onlineConnect.type='button';onlineConnect.id='online-connect';onlineConnect.textContent=t('التحقق واستلام التفعيل','Vérifier et recevoir l’activation');
 const onlineAccept=document.createElement('button');onlineAccept.type='button';onlineAccept.id='online-accept';onlineAccept.textContent=t('استلام التفعيل','Recevoir l’activation');onlineAccept.hidden=true;
 onlineActions.append(onlineConnect,onlineAccept);onlineSection.append(onlineTitle,onlineDescription,consentLabel,onlineMessage,onlineActions);
 $('license-info').before(onlineSection);
 const lifecycleCall=(command,payload={})=>call('deviceLifecycle',command,JSON.stringify(payload));
 function updateOnlineButtons(){onlineConnect.disabled=busy||!remoteConsent.checked;onlineAccept.disabled=busy||!onlineAvailable;onlineAccept.hidden=!onlineAvailable;}
 function cancelOnlineTimer(){clearTimeout(onlineTimer);onlineTimer=null;}
 function scheduleOnline(){
  cancelOnlineTimer();
  if(onlineWaiting&&remoteConsent.checked&&!document.hidden&&navigator.onLine!==false)onlineTimer=setTimeout(()=>onlineAction('local-status',false),60000);
 }
 function onlineResult(result){
  onlineAvailable=result.activationAvailable===true;
  onlineWaiting=true;remoteConsent.checked=true;
  remoteConsent.disabled=true;consentLabel.hidden=true;onlineConnect.dataset.enrolled='true';
  onlineConnect.textContent=t('تحديث التفعيل','Actualiser l’activation');
  const entitlement=result.entitlement,kind=result.entitlementKind;
  onlineAccept.textContent=result.entitlementAvailable?t(kind==='reactivate'?'استلام التفعيل الجديد':kind==='reinstall'?'تأكيد إعادة تثبيت الهاتف':kind==='renew'?'استلام التجديد':'تأكيد استبدال الهاتف',kind==='reactivate'?'Recevoir la nouvelle activation':kind==='reinstall'?'Confirmer la réinstallation':kind==='renew'?'Recevoir le renouvellement':'Confirmer le remplacement'):t('استلام التفعيل','Recevoir l’activation');
  onlineMessage.textContent=onlineAvailable?t('وصل تفعيل من الإدارة. اضغط لاستلامه على هذا الهاتف.','L’administration a envoyé une activation. Recevez-la sur cet appareil.'):
   result.status==='active'?t('الهاتف مربوط بملف العميل. يمكنك طلب التجديد من الإدارة.','Cet appareil est associé au dossier client. Vous pouvez demander un renouvellement à l’administration.'):
   t('وصل كود الهاتف إلى كونتا تولز. بانتظار تفعيل الإدارة.','Le code est enregistré dans Contatools. En attente de l’activation par l’administration.');
  if(result.entitlementAvailable)onlineMessage.textContent=t('وصلت موافقة الإدارة. التأكيد يجعل هذا الهاتف هو الحالي، ويحافظ على موعد انتهاء التفعيل. استعادة البيانات تتم بعد ذلك باختيارك.','L’autorisation est prête. La confirmation désigne ce téléphone comme appareil actuel sans prolonger la date de fin. Vous pourrez ensuite choisir de restaurer les données.');
  else if(entitlement?.status==='replaced'){onlineMessage.textContent=t('استُبدل هذا الهاتف. بياناته محفوظة؛ تواصل مع الإدارة لمراجعة ملف العميل.','Ce téléphone a été remplacé. Ses données restent conservées ; contactez l’administration.');}
  else if(entitlement?.status==='pending')onlineMessage.textContent=t('هذا الهاتف متصل وبانتظار موافقة الاستبدال من الإدارة.','Cet appareil est connecté et attend l’autorisation de remplacement.');
  // Keep reconciling signed administrative decisions after initial activation.
  if(result.control?.banned===true){onlineAvailable=false;onlineMessage.textContent=t('التفعيل محظور بقرار موثّق. إلغاء الحظر وحده لا يعيد تفعيلًا أُبطل.','Une décision vérifiée interdit l’activation. Lever l’interdiction ne rétablit pas une licence révoquée.');}
  else if(result.control?.documentStatus==='revoked'&&!onlineAvailable)onlineMessage.textContent=t('أُبطل التفعيل السابق. بانتظار موافقة جديدة من الإدارة؛ بياناتك محفوظة.','L’ancienne activation est révoquée. Une nouvelle autorisation est attendue ; vos données sont conservées.');
  updateOnlineButtons();scheduleOnline();
 }
 async function onlineAction(command,manual=true){
  if(busy){scheduleOnline();return}
  if(command==='status'&&Date.now()-onlineLastCheck<10000){scheduleOnline();return}
  busy=true;updateOnlineButtons();cancelOnlineTimer();
  try{
   if(navigator.onLine===false)throw Error('offline');
   if(command==='status')onlineLastCheck=Date.now();
   if(manual)onlineMessage.textContent=t('جارٍ الاتصال بكونتا تولز…','Connexion à Contatools…');
   const result=await lifecycleCall(command,command==='enroll'?{consent:true}:{});
   if(command==='activate'&&result.stage==='activated'){
    const installed=await call('activationStatus');show(installed);onlineAvailable=false;onlineWaiting=true;
    onlineMessage.textContent=!installed.valid?t('لم يُفتح الوصول إلى التطبيق. راجع حالة التفعيل المعروضة؛ بياناتك محفوظة.','L’accès reste fermé. Consultez l’état d’activation affiché ; les données sont conservées.'):result.ackPending?t('حُفظ التفعيل على الهاتف. تأكيد الاستلام ينتظر الاتصال.','L’activation est enregistrée. La confirmation attend la connexion.'):
     t('تم حفظ التفعيل. يمكنك فتح التطبيق.','L’activation est enregistrée. Vous pouvez ouvrir l’application.');scheduleOnline();
   }else{show(await call('activationStatus'));onlineResult(result);}
  }catch(error){
   onlineMessage.textContent=t('تعذّر الاتصال الآن. أعد المحاولة عند توفر الإنترنت.','Connexion indisponible. Réessayez avec Internet.');
   onlineWaiting=command!=='activate';scheduleOnline();
  }finally{busy=false;updateOnlineButtons();updateManualControls();}
 }
 remoteConsent.onchange=updateOnlineButtons;
 onlineConnect.onclick=()=>onlineAction(onlineConnect.dataset.enrolled?'status':'enroll').then(()=>{if(onlineConnect.textContent===t('تحديث التفعيل','Actualiser l’activation'))onlineConnect.dataset.enrolled='true'});
 onlineAccept.onclick=()=>onlineAction('activate');
 addEventListener('online',()=>{if(onlineWaiting)scheduleOnline()});
 addEventListener('offline',cancelOnlineTimer);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelOnlineTimer();else if(onlineWaiting)scheduleOnline()});
 addEventListener('pagehide',cancelOnlineTimer,{once:true});
 addEventListener('alkarna-control-updated',()=>{if(!busy)Promise.all([call('activationStatus'),lifecycleCall('local-status')]).then(([status,result])=>{show(status);if(result.remoteEnabled)onlineResult(result)}).catch(()=>{})});
 $('license-text').value=sessionStorage.getItem('activation-draft')||'';
 $('copy-code').onclick=()=>{NativeHost.copyDeviceCode();message(t('تم نسخ كود الجهاز','Code de l’appareil copié'),'success')};
 $('continue').onclick=()=>NativeHost.activationContinue();
 $('privacy').onclick=()=>NativeHost.openPrivacy();
 $('install-text').onclick=()=>install($('license-text').value.trim());
 $('license-file').onchange=async event=>{const file=event.target.files?.[0];if(!file)return;$('filename').textContent=file.name;try{if(file.size>65536)throw new Error(t('ملف الترخيص أكبر من 64 كيلوبايت','Le fichier dépasse 64 Ko'));await install(await file.text())}catch(e){message(e.message,'error')}finally{event.target.value=''}};
 Promise.all([call('activationStatus'),lifecycleCall('local-status')]).then(([status,result])=>{show(status);if(result.remoteEnabled)onlineResult(result)}).catch(e=>message(e.message,'error'));
 updateOnlineButtons();
 setInterval(()=>{if(!busy)call('activationStatus').then(show).catch(()=>{})},15000);
})();
