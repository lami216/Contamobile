(()=>{
 const $=id=>document.getElementById(id),fr=localStorage.getItem('alkarna-site-language')==='fr';
 document.documentElement.lang=fr?'fr':'ar';document.title=fr?'Licence d’établissement — AlKarna':'ترخيص المنشأة — الكرنه';document.querySelector('.brand').textContent=fr?'AlKarna':'الكرنه';document.documentElement.dir=fr?'ltr':'rtl';document.documentElement.dataset.appearance=localStorage.getItem('alkarna-site-appearance')||'dark';
 const t=(ar,french)=>fr?french:ar;
 const nativeMessages={"انتظر اكتمال حفظ الملف الحالي": "Attendez la fin de l’enregistrement en cours", "تعذّر تجهيز الملف": "Impossible de préparer le fichier", "تعذّر تشغيل الكاميرا": "Impossible d’ouvrir la caméra", "تعذّر حفظ ملف التفعيل": "Impossible d’enregistrer la licence", "تعذّر فتح الطباعة": "Impossible d’ouvrir l’impression", "تعذّر فتح بيانات التفعيل. أعد فتح التطبيق": "Impossible de lire la licence. Rouvrez l’application.", "تعذّر فتح وسيلة التواصل. الرقم: 49823328": "Impossible d’ouvrir le contact. Numéro : 49823328", "تعذّر كتابة الملف": "Impossible d’écrire le fichier", "قارئ الباركود مفتوح بالفعل": "Le lecteur de codes-barres est déjà ouvert", "لا توجد خدمة لحفظ الملفات على هذا الجهاز": "Aucun service d’enregistrement de fichiers sur cet appareil", "لم يكتمل حفظ الملف؛ أعد المحاولة": "Enregistrement incomplet. Réessayez.", "لم يُحفظ الملف": "Le fichier n’a pas été enregistré", "لم يُسمح بالكاميرا. أدخل الباركود يدويًا.": "Caméra non autorisée. Saisissez le code-barres manuellement.", "إغلاق الكاميرا": "Fermer la caméra", "الكاميرا غير متاحة. أدخل الباركود يدويًا.": "Caméra indisponible. Saisissez le code-barres manuellement.", "وجّه الكاميرا نحو الباركود": "Visez le code-barres avec la caméra", "أضف ملف تفعيل هذا الهاتف": "Ajoutez la licence de ce téléphone", "تعذّر استخراج كود الهاتف": "Impossible de lire le code du téléphone", "تعذّر التحقق من بيانات التفعيل المحفوظة. تواصل مع مسؤول التفعيل": "Impossible de vérifier la licence enregistrée. Contactez l’assistance.", "تعذّر التحقق من سجل التفعيل. تواصل مع مسؤول التفعيل": "Impossible de vérifier l’historique d’activation. Contactez l’assistance.", "تعذّر حفظ التفعيل. تحقّق من مساحة التخزين وأعد فتح التطبيق": "Impossible d’enregistrer la licence. Vérifiez le stockage puis rouvrez l’application.", "فعّل هذا الهاتف للبدء": "Activez ce téléphone pour commencer", "لم يكتمل حفظ التفعيل. أعد فتح التطبيق قبل المحاولة مجددًا": "Activation non enregistrée. Rouvrez l’application avant de réessayer.", "ملف الترخيص المحفوظ غير صالح. أضف ملف تفعيل جديدًا": "La licence enregistrée est invalide. Ajoutez un nouveau fichier.", "ملف التفعيل مستخدم من قبل. اطلب ملفًا جديدًا للتجديد": "Cette licence a déjà été utilisée. Demandez un nouveau fichier pour le renouvellement.", "انتهت مدة الترخيص. أضف ملف تفعيل جديدًا": "La licence a expiré. Ajoutez un nouveau fichier.", "تم اكتشاف إرجاع ساعة الجهاز. تواصل مع مسؤول التفعيل": "Un recul de l’horloge a été détecté. Contactez l’assistance.", "تعذّر استخراج كود الجهاز": "Impossible de lire le code de l’appareil", "ملف الترخيص أكبر من 64 كيلوبايت": "Le fichier de licence dépasse 64 Ko", "ملف الترخيص غير صالح أو تم تغييره": "Le fichier de licence est invalide ou a été modifié", "هذا الترخيص مخصص لجهاز آخر": "Cette licence est destinée à un autre appareil"};
 NativeHost.language?.(fr?'fr':'ar');
 for(const button of document.querySelectorAll('[data-language]')){button.setAttribute('aria-pressed',String(button.dataset.language===(fr?'fr':'ar')));button.onclick=()=>{sessionStorage.setItem('activation-draft',$('license-text').value);localStorage.setItem('alkarna-site-language',button.dataset.language);location.reload()}}

 const copy={'contact-title':['مساعدة فنية','Assistance technique'],'contact-intro':['لمشكلة في قراءة الترخيص أو استخدام التطبيق، تواصل مع الدعم الفني. بيانات المحل تبقى محفوظة.','Pour une difficulté de lecture de la licence ou d’utilisation, contactez l’assistance technique. Les données restent conservées.'],'contact-call-text':['اتصال بالدعم الفني','Appeler l’assistance'],eyebrow:['ترخيص المنشأة على الهاتف','Licence de l’établissement sur cet appareil'],title:['ترخيص هذا الهاتف','Licence de ce téléphone'],intro:['استورد ملف ترخيص موجودًا ومخصصًا لهذا الهاتف. اعتماد حساب المنشأة متاح من شاشة الدخول.','Importez une licence existante destinée à cet appareil. L’autorisation du compte d’établissement est disponible depuis la connexion.'],'device-label':['كود الجهاز','Code de l’appareil'],'copy-code':['نسخ الكود','Copier le code'],'file-text':['استيراد ملف ترخيص موجود','Importer une licence existante'],'paste-title':['لصق محتوى ملف الترخيص','Coller le contenu de la licence'],'paste-label':['محتوى ملف الترخيص','Contenu de la licence'],'install-text':['تثبيت الترخيص','Installer la licence'],continue:['فتح التطبيق','Ouvrir l’application'],footnote:['بعد حفظ الترخيص يعمل الهاتف محليًا وفق صلاحيته. بيانات المحل تبقى محفوظة.','Une fois la licence enregistrée, le téléphone fonctionne localement pendant sa validité. Les données restent conservées.']};
 for(const [id,words] of Object.entries(copy))$(id).textContent=words[fr?1:0];
 const pending=new Map();let busy=false,current=null;
 window.__nativeResult=(id,result)=>{const request=pending.get(id);if(!request)return;pending.delete(id);result.error?request.reject(Object.assign(new Error(result.error),{code:result.code||''})):request.resolve(result)};
 const call=(method,...args)=>new Promise((resolve,reject)=>{const id=crypto.randomUUID();pending.set(id,{resolve,reject});try{NativeHost[method](id,...args)}catch(e){pending.delete(id);reject(e)}});
 const message=(text,kind='')=>{$('status').textContent=text;$('status').className=kind};
 const reasons={LICENSE_REQUIRED:['فعّل هذا الهاتف للبدء','Activez ce téléphone pour commencer'],LICENSE_EXPIRED:['انتهت مدة الترخيص. أضف ملف تفعيل جديدًا','La licence a expiré. Ajoutez un nouveau fichier.'],LICENSE_CLOCK_ROLLBACK:['تم اكتشاف إرجاع ساعة الجهاز. تواصل مع مسؤول التفعيل','Un recul de l’horloge a été détecté. Contactez le responsable.'],ENTITLEMENT_PENDING:['بانتظار موافقة استبدال الهاتف','En attente de l’autorisation de remplacement'],ENTITLEMENT_REPLACED:['استُبدل هذا الهاتف. بيانات المحل محفوظة على الجهاز','Ce téléphone a été remplacé. Les données restent sur cet appareil.'],ENTITLEMENT_EXPIRED:['انتهت صلاحية وصول هذا الهاتف. بيانات المحل محفوظة.','L’accès de ce téléphone a expiré. Les données restent conservées.'],ENTITLEMENT_SUSPENDED:['أوقفت الإدارة وصول هذا الهاتف. بيانات المحل محفوظة.','L’administration a suspendu l’accès de ce téléphone. Les données restent conservées.']};
 const duration=seconds=>{const n=Math.max(0,Math.ceil(seconds)),days=Math.floor(n/86400),hours=Math.floor(n%86400/3600),minutes=Math.floor(n%3600/60);return days?days+' '+t('يوم','j')+' '+hours+' '+t('ساعة','h'):hours?hours+' '+t('ساعة','h')+' '+minutes+' '+t('دقيقة','min'):minutes+' '+t('دقيقة','min')+' '+n%60+' '+t('ثانية','s')};
 function show(status){current=status;
  $('intro').textContent=status.valid?t('ترخيص هذا الهاتف صالح. يمكنك مراجعة بياناته أو استيراد ملف ترخيص موجود.','La licence de ce téléphone est valide. Consultez ses informations ou importez une licence existante.'):copy.intro[fr?1:0];
  if(status.valid&&status.entitlement)$('intro').textContent=t('هذا الهاتف معتمد في حساب المنشأة. تصلك موافقات الإدارة من كونتا تولز مباشرة.','Ce téléphone est autorisé pour le compte d’établissement. Les autorisations de l’administration sont reçues directement depuis Contatools.');
  $('device-code').textContent=status.deviceId||'—';$('copy-code').disabled=!status.deviceId;$('continue').hidden=!status.valid;
  $('title').textContent=status.valid?t('الهاتف مفعّل','Téléphone activé'):copy.title[fr?1:0];
  if(status.code==='ENTITLEMENT_REPLACED'){$('title').textContent=t('استُبدل هذا الهاتف','Téléphone remplacé');$('intro').textContent=t('أصبح هاتفًا سابقًا في ملف العميل. بياناته محفوظة، ويمكن للإدارة مراجعة الحالة دون حذف التطبيق.','Cet appareil figure dans l’historique du client. Ses données sont conservées ; l’administration peut vérifier sa situation sans supprimer l’application.');}
  else if(status.code==='ENTITLEMENT_PENDING'){$('title').textContent=t('استبدال الهاتف','Remplacement du téléphone');$('intro').textContent=t('راجع موافقة الإدارة ثم أكد استلام التفعيل. استعادة نسخة بياناتك خطوة مستقلة بعد التفعيل.','Vérifiez l’autorisation puis recevez l’activation. La restauration des données reste une étape séparée.');}
  $('file-text').textContent=copy['file-text'][fr?1:0];
  const info=$('license-info');info.hidden=!status.valid;info.replaceChildren();
  if(status.valid){const p=status.license,remaining=p.remainingSeconds;for(const [label,value] of [[t('المحل','Magasin'),p.storeName],[t('صاحب الترخيص','Titulaire'),p.customerName],[t('الترخيص','Licence'),remaining===null?t('دائم','Permanente'):duration(remaining)+' '+t('متبقية','restant(s)')]]){const row=document.createElement('div'),name=document.createElement('span'),text=document.createElement('strong');name.textContent=label;text.textContent=value;row.append(name,text);info.append(row)}message(t('الترخيص صالح لهذا الهاتف','La licence est valide pour ce téléphone'),'success');}
  else message(reasons[status.code]?.[fr?1:0]||(fr?nativeMessages[status.reason]:status.reason)||t('تعذّر قراءة الترخيص','Impossible de lire la licence'),status.code==='LICENSE_REQUIRED'?'':'error');
  updateManualControls();
 }
 function updateManualControls(){const shared=!!current?.entitlement;for(const id of ['license-file','license-text','install-text'])$(id).disabled=busy||shared;$('file-label').hidden=shared;$('filename').hidden=shared;$('paste-title').closest('details').hidden=shared;}
 async function install(content){if(busy)return;busy=true;for(const el of document.querySelectorAll('button,input,textarea'))el.disabled=true;message(t('جارٍ التحقق من الترخيص…','Vérification de la licence…'));
  try{if(new TextEncoder().encode(content).length>65536)throw new Error(t('ملف الترخيص أكبر من 64 كيلوبايت','Le fichier dépasse 64 Ko'));const status=await call('installActivation',content);show(status);if(status.valid){$('license-text').value='';sessionStorage.removeItem('activation-draft');$('continue').focus();}}
  catch(e){message(fr?t('لم يُقبل ملف الترخيص. تأكد أنه صادر لهذا الجهاز ولم يُستخدم من قبل.','Licence refusée. Vérifiez l’appareil, le fichier et son utilisation précédente.'):e.message,'error')}
  finally{busy=false;for(const el of document.querySelectorAll('button,input,textarea'))el.disabled=false;$('copy-code').disabled=!current?.deviceId;updateOnlineButtons();updateManualControls();}
 }
 let onlineTimer=null,onlineWaiting=false,onlineAvailable=false,onlineLastCheck=0;
 const onlineSection=document.createElement('section');onlineSection.className='activation-contact';onlineSection.dataset.onlineActivation='true';
 const onlineTitle=document.createElement('h2');onlineTitle.textContent=t('اعتماد الهاتف من كونتا تولز','Autorisation de l’appareil avec Contatools');
 const onlineDescription=document.createElement('p');onlineDescription.textContent=t('تحقق من اعتماد هذا الهاتف في حساب المنشأة واستلم موافقة المسؤول. يلزم الاتصال بهذه الخطوة فقط؛ بيانات المحل لا تتغير.','Vérifiez l’autorisation de ce téléphone et recevez la décision du responsable. Cette étape nécessite Internet ; les données locales restent inchangées.');
 const onlineMessage=document.createElement('p');onlineMessage.id='online-status';onlineMessage.setAttribute('role','status');onlineMessage.setAttribute('aria-live','polite');
 const onlineActions=document.createElement('div');onlineActions.className='activation-contact-actions online-activation-actions';
 const onlineConnect=document.createElement('button');onlineConnect.type='button';onlineConnect.id='online-connect';onlineConnect.textContent=t('ربط الهاتف بكونتا تولز','Relier à Contatools');
 const onlineAccept=document.createElement('button');onlineAccept.type='button';onlineAccept.id='online-accept';onlineAccept.textContent=t('استلام التفعيل','Recevoir l’activation');onlineAccept.hidden=true;
 onlineActions.append(onlineConnect,onlineAccept);onlineSection.append(onlineTitle,onlineDescription,onlineMessage,onlineActions);
 $('license-info').before(onlineSection);
 const lifecycleCall=(command,payload={})=>call('deviceLifecycle',command,JSON.stringify(payload));
 function updateOnlineButtons(){onlineConnect.disabled=busy;onlineAccept.disabled=busy||!onlineAvailable;onlineAccept.hidden=!onlineAvailable;}
 function cancelOnlineTimer(){clearTimeout(onlineTimer);onlineTimer=null;}
 function scheduleOnline(){
  cancelOnlineTimer();
  if(onlineWaiting&&!document.hidden&&navigator.onLine!==false)onlineTimer=setTimeout(()=>onlineAction('status',false),45000);
 }
 function onlineResult(result){
  onlineAvailable=result.activationAvailable===true;
  onlineWaiting=!onlineAvailable;
  onlineConnect.textContent=t('تحديث حالة الهاتف','Actualiser l’état du téléphone');
  const entitlement=result.entitlement,kind=result.entitlementKind;
  onlineAccept.textContent=result.entitlementAvailable?t(kind==='reinstall'?'تأكيد إعادة تثبيت الهاتف':kind==='renew'?'استلام التجديد':'تأكيد استبدال الهاتف',kind==='reinstall'?'Confirmer la réinstallation':kind==='renew'?'Recevoir le renouvellement':'Confirmer le remplacement'):t('استلام التفعيل','Recevoir l’activation');
  onlineMessage.textContent=onlineAvailable?t('وصل تفعيل من الإدارة. اضغط لاستلامه على هذا الهاتف.','L’administration a envoyé une activation. Recevez-la sur cet appareil.'):
   result.status==='active'?t('الهاتف معتمد في حساب المنشأة. لا توجد موافقة جديدة للاستلام.','Le téléphone est autorisé pour le compte d’établissement. Aucune nouvelle autorisation n’est disponible.'):
   t('وصل معرّف الهاتف إلى كونتا تولز. بانتظار موافقة المسؤول.','L’identifiant du téléphone est enregistré dans Contatools. En attente de la décision du responsable.');
  if(result.entitlementAvailable)onlineMessage.textContent=t('وصلت موافقة الإدارة. التأكيد يجعل هذا الهاتف هو الحالي، ويحافظ على موعد انتهاء التفعيل. استعادة البيانات تتم بعد ذلك باختيارك.','L’autorisation est prête. La confirmation désigne ce téléphone comme appareil actuel sans prolonger la date de fin. Vous pourrez ensuite choisir de restaurer les données.');
  else if(entitlement?.status==='replaced'){onlineWaiting=false;onlineMessage.textContent=t('استُبدل هذا الهاتف. بياناته محفوظة؛ تواصل مع الإدارة لمراجعة ملف العميل.','Ce téléphone a été remplacé. Ses données restent conservées ; contactez l’administration.');}
  else if(entitlement?.status==='pending')onlineMessage.textContent=t('هذا الهاتف متصل وبانتظار موافقة الاستبدال من الإدارة.','Cet appareil est connecté et attend l’autorisation de remplacement.');
  if(result.status==='active'&&!onlineAvailable)onlineWaiting=false;
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
   const result=await lifecycleCall(command);
   if(command==='activate'&&result.stage==='activated'){
    show(await call('activationStatus'));onlineAvailable=false;onlineWaiting=false;
    onlineMessage.textContent=result.ackPending?t('حُفظ التفعيل على الهاتف. تأكيد الاستلام ينتظر الاتصال.','L’activation est enregistrée. La confirmation attend la connexion.'):
     t('تم حفظ التفعيل. يمكنك فتح التطبيق.','L’activation est enregistrée. Vous pouvez ouvrir l’application.');
   }else{if(result.entitlement)show(await call('activationStatus'));onlineResult(result);}
  }catch(error){
   onlineMessage.textContent=t('تعذّر الاتصال الآن. أعد المحاولة عند توفر الإنترنت.','Connexion indisponible. Réessayez avec Internet.');
   onlineWaiting=command!=='activate';scheduleOnline();
  }finally{busy=false;updateOnlineButtons();updateManualControls();}
 }
 onlineConnect.onclick=()=>onlineAction(onlineConnect.dataset.enrolled?'status':'enroll').then(()=>{if(onlineConnect.textContent===t('تحديث حالة الهاتف','Actualiser l’état du téléphone'))onlineConnect.dataset.enrolled='true'});
 onlineAccept.onclick=()=>onlineAction('activate');
 addEventListener('online',()=>{if(onlineWaiting)scheduleOnline()});
 addEventListener('offline',cancelOnlineTimer);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelOnlineTimer();else if(onlineWaiting)scheduleOnline()});
 addEventListener('pagehide',cancelOnlineTimer,{once:true});
 $('license-text').value=sessionStorage.getItem('activation-draft')||'';
 $('copy-code').onclick=()=>{NativeHost.copyDeviceCode();message(t('تم نسخ كود الجهاز','Code de l’appareil copié'),'success')};
 $('continue').onclick=()=>NativeHost.activationContinue();
 $('install-text').onclick=()=>install($('license-text').value.trim());
 $('license-file').onchange=async event=>{const file=event.target.files?.[0];if(!file)return;$('filename').textContent=file.name;try{if(file.size>65536)throw new Error(t('ملف الترخيص أكبر من 64 كيلوبايت','Le fichier dépasse 64 Ko'));await install(await file.text())}catch(e){message(e.message,'error')}finally{event.target.value=''}};
 call('activationStatus').then(status=>{show(status);if(status.license||status.entitlement)onlineAction('status',false)}).catch(e=>message(e.message,'error'));
 setInterval(()=>{if(!busy&&current?.valid)call('activationStatus').then(show).catch(()=>{})},15000);
})();
