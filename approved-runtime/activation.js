(()=>{
 const $=id=>document.getElementById(id),fr=localStorage.getItem('alkarna-site-language')==='fr';
 document.documentElement.lang=fr?'fr':'ar';document.documentElement.dir=fr?'ltr':'rtl';document.documentElement.dataset.appearance=localStorage.getItem('alkarna-site-appearance')||'dark';
 const t=(ar,french)=>fr?french:ar;
 const copy={eyebrow:['ترخيص الجهاز','Licence de l’appareil'],title:['تفعيل هذا الهاتف','Activer ce téléphone'],intro:['انسخ كود الجهاز إلى أداة التفعيل على الكمبيوتر، ثم اختر ملف الترخيص الذي تصدره الأداة.','Copiez le code dans votre outil d’activation sur ordinateur, puis sélectionnez le fichier de licence émis.'],'device-label':['كود الجهاز','Code de l’appareil'],'copy-code':['نسخ الكود','Copier le code'],'file-text':['اختيار ملف التفعيل','Choisir le fichier de licence'],'paste-title':['لصق محتوى ملف الترخيص','Coller le contenu de la licence'],'paste-label':['محتوى ملف الترخيص','Contenu de la licence'],'install-text':['تفعيل الترخيص','Activer la licence'],continue:['فتح التطبيق','Ouvrir l’application'],footnote:['التفعيل يعمل دون إنترنت. بيانات المحل تبقى محفوظة.','L’activation fonctionne hors ligne. Les données du magasin restent conservées.']};
 for(const [id,words] of Object.entries(copy))$(id).textContent=words[fr?1:0];
 const pending=new Map();let busy=false,current=null;
 window.__nativeResult=(id,result)=>{const request=pending.get(id);if(!request)return;pending.delete(id);result.error?request.reject(new Error(result.error)):request.resolve(result)};
 const call=(method,...args)=>new Promise((resolve,reject)=>{const id=crypto.randomUUID();pending.set(id,{resolve,reject});try{NativeHost[method](id,...args)}catch(e){pending.delete(id);reject(e)}});
 const message=(text,kind='')=>{$('status').textContent=text;$('status').className=kind};
 const reasons={LICENSE_REQUIRED:['فعّل هذا الهاتف للبدء','Activez ce téléphone pour commencer'],LICENSE_EXPIRED:['انتهت مدة الترخيص. أضف ملف تفعيل جديدًا','La licence a expiré. Ajoutez un nouveau fichier.'],LICENSE_CLOCK_ROLLBACK:['تم اكتشاف إرجاع ساعة الجهاز. تواصل مع مسؤول التفعيل','Un recul de l’horloge a été détecté. Contactez le responsable.']};
 const duration=seconds=>{const n=Math.max(0,Math.ceil(seconds)),days=Math.floor(n/86400),hours=Math.floor(n%86400/3600),minutes=Math.floor(n%3600/60);return days?days+' '+t('يوم','j')+' '+hours+' '+t('ساعة','h'):hours?hours+' '+t('ساعة','h')+' '+minutes+' '+t('دقيقة','min'):minutes+' '+t('دقيقة','min')+' '+n%60+' '+t('ثانية','s')};
 function show(status){current=status;$('device-code').textContent=status.deviceId||'—';$('copy-code').disabled=!status.deviceId;$('continue').hidden=!status.valid;
  $('title').textContent=status.valid?t('الهاتف مفعّل','Téléphone activé'):copy.title[fr?1:0];
  $('file-text').textContent=status.valid?t('تحديث ملف الترخيص','Mettre à jour la licence'):copy['file-text'][fr?1:0];
  const info=$('license-info');info.hidden=!status.valid;info.replaceChildren();
  if(status.valid){const p=status.license,remaining=p.remainingSeconds;for(const [label,value] of [[t('المحل','Magasin'),p.storeName],[t('صاحب الترخيص','Titulaire'),p.customerName],[t('الترخيص','Licence'),remaining===null?t('دائم','Permanente'):duration(remaining)+' '+t('متبقية','restant(s)')]]){const row=document.createElement('div'),name=document.createElement('span'),text=document.createElement('strong');name.textContent=label;text.textContent=value;row.append(name,text);info.append(row)}message(t('الترخيص صالح لهذا الهاتف','La licence est valide pour ce téléphone'),'success');}
  else message(reasons[status.code]?.[fr?1:0]||status.reason||t('تعذّر قراءة الترخيص','Impossible de lire la licence'),status.code==='LICENSE_REQUIRED'?'':'error');
 }
 async function install(content){if(busy)return;busy=true;for(const el of document.querySelectorAll('button,input,textarea'))el.disabled=true;message(t('جارٍ التحقق من الترخيص…','Vérification de la licence…'));
  try{if(new TextEncoder().encode(content).length>65536)throw new Error(t('ملف الترخيص أكبر من 64 كيلوبايت','Le fichier dépasse 64 Ko'));const status=await call('installActivation',content);show(status);if(status.valid){$('license-text').value='';$('continue').focus();}}
  catch(e){message(fr?t('لم يُقبل ملف الترخيص. تأكد أنه صادر لهذا الجهاز ولم يُستخدم من قبل.','Licence refusée. Vérifiez l’appareil, le fichier et son utilisation précédente.'):e.message,'error')}
  finally{busy=false;for(const el of document.querySelectorAll('button,input,textarea'))el.disabled=false;$('copy-code').disabled=!current?.deviceId;}
 }
 $('copy-code').onclick=()=>{NativeHost.copyDeviceCode();message(t('تم نسخ كود الجهاز','Code de l’appareil copié'),'success')};
 $('continue').onclick=()=>NativeHost.activationContinue();
 $('install-text').onclick=()=>install($('license-text').value.trim());
 $('license-file').onchange=async event=>{const file=event.target.files?.[0];if(!file)return;$('filename').textContent=file.name;try{if(file.size>65536)throw new Error(t('ملف الترخيص أكبر من 64 كيلوبايت','Le fichier dépasse 64 Ko'));await install(await file.text())}catch(e){message(e.message,'error')}finally{event.target.value=''}};
 call('activationStatus').then(show).catch(e=>message(e.message,'error'));
 setInterval(()=>{if(!busy&&current?.valid)call('activationStatus').then(show).catch(()=>{})},15000);
})();
