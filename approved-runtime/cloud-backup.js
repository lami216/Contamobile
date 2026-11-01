/** Optional server backup. It never participates in an accounting transaction. */
export function installCloudBackup(api){
 const t=(ar,fr)=>api.language()==='fr'?fr:ar,esc=api.escape;
 let context=null,status=null,error='',pending=false,dirty=false,staging=null,again=false,timer=null,loaded=false,generation=0;
 const isOwner=()=>api.actor()?.role==='owner';
 const supported=()=>typeof globalThis.NativeFiles?.cloudBackup==='function'&&typeof globalThis.NativeFiles?.stageCloudBackup==='function';
 const settings=()=>status?.settings||{consent:false,schedule:'daily',time:'21:00',weekday:1,wifiOnly:false};
 const base=()=>context||{shopId:api.state()?.originId,ownerId:api.actor()?.id};
 const sameShop=()=>context?.shopId===api.state()?.originId&&api.users().some(u=>u.id===context.ownerId&&u.role==='owner'&&u.active!==false);
 function friendly(value){
  const key=[value?.code,value?.status,value?.message,typeof value==='string'?value:''].filter(Boolean).join(' ').toLowerCase();
  if(/quota|storage.full/.test(key))return t('مساحة النسخ ممتلئة. تواصل مع الإدارة لزيادة المساحة؛ بيانات الهاتف محفوظة.','Espace de sauvegarde plein. Contactez l’administration ; les données locales sont conservées.');
  if(/size|too.large|413/.test(key))return t('تجاوز الرفع حد حجم النسخة أو مساحة الاشتراك المتاحة. احتفظ بنسخة ملف وراجع المساحة مع الدعم.','L’envoi dépasse la taille autorisée ou l’espace disponible de l’abonnement. Conservez une copie fichier et vérifiez l’espace avec l’assistance.');
  if(/expired|entitlement|not.enabled|disabled|403/.test(key))return t('اشتراك النسخ غير متاح. راجع حالة الخدمة مع الإدارة.','Service de sauvegarde indisponible. Vérifiez l’abonnement avec l’administration.');
  if(/unconfigured|not.configured|404/.test(key))return t('خدمة النسخ لم تُجهّز لهذه النسخة أو على السيرفر بعد.','Le service de sauvegarde n’est pas encore configuré pour cette version ou sur le serveur.');
  if(/server.error|503/.test(key))return t('خدمة النسخ غير متاحة الآن أو لم تُجهّز على السيرفر بعد. بيانات الهاتف محفوظة والعمل دون إنترنت متاح.','Le service de sauvegarde est indisponible ou pas encore préparé sur le serveur. Les données locales sont conservées et le travail hors connexion reste disponible.');
  if(/wifi|unmetered/.test(key))return t('بانتظار Wi-Fi حسب اختيارك.','En attente du Wi-Fi selon votre choix.');
  if(/pause|restore|review/.test(key))return t('الرفع متوقف للمراجعة بعد استعادة أو دمج بيانات. راجع الإعدادات قبل استئنافه.','Envoi suspendu après restauration ou fusion. Vérifiez les réglages avant de reprendre.');
  if(/owner|registered|registration/.test(key))return t('يلزم ربط هذا المالك والهاتف في كونتا تولز أولًا.','Ce propriétaire et cet appareil doivent être associés dans Contatools.');
  return t('تعذّر إكمال النسخ الآن. سنعيد المحاولة عند توفر الاتصال والشروط المختارة؛ بياناتك المحلية محفوظة.','Sauvegarde momentanément impossible. Nouvelle tentative avec la connexion et les conditions choisies ; vos données locales sont conservées.');
 }
 const date=value=>{if(!value)return '—';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString(api.language()==='fr'?'fr-FR':'ar-MR'): '—'};
 // Passive status updates must not rebuild an open form or another sheet.
 // The cached status is rendered when that sheet closes or an explicit action renders.
 function paint(){if(api.isVisible()&&!api.modal())api.render()}
 function update(value){if(value&&typeof value==='object')status={...status,...value,settings:value.settings??status?.settings,server:value.server??status?.server};error='';paint();return value}
 async function call(command,payload={}){if(!supported())throw Object.assign(new Error('unconfigured'),{code:'unconfigured'});return globalThis.NativeFiles.cloudBackup(command,{...base(),...payload})}
 function label(){
  if(!supported())return t('متاح في تطبيق Android المرتبط بالخدمة','Disponible dans l’application Android associée au service');
  if(!loaded)return t('جارٍ قراءة الحالة…','Lecture de l’état…');
  if(error)return error;
  if(status?.paused)return friendly('paused');
  if(status?.server?.entitlement?.enabled===false||status?.server?.entitlement?.active===false)return t('اشتراك النسخ غير فعال','Abonnement de sauvegarde inactif');
  if(!settings().consent)return t('النسخ التلقائي متوقف على هذا الهاتف','Sauvegarde automatique désactivée sur cet appareil');
  if(/upload|running/.test(String(status?.stage||'')))return t('جارٍ رفع نسخة؛ يمكنك متابعة العمل','Sauvegarde en cours ; vous pouvez continuer à travailler');
  if(status?.lastError)return friendly(status.lastError);
  if(dirty||status?.changesPending)return t('توجد تغييرات لم تُنسخ بعد','Des modifications restent à sauvegarder');
  if(status?.lastSuccessAt)return t('آخر نسخة ناجحة محفوظة على السيرفر','Dernière sauvegarde confirmée sur le serveur');
  return t('بانتظار أول نسخة ناجحة','En attente de la première sauvegarde réussie');
 }
 async function refresh(remote=false){
  if(!supported()){loaded=true;paint();return null}
  try{const value=await call('status',{refresh:remote});loaded=true;return update(value)}catch(e){loaded=true;error=friendly(e);paint();return null}
 }
 async function start(){
  try{const saved=await api.database.get('meta','cloud-backup-context');if(saved?.context){context=saved.context;if(!sameShop())context=null}if(context){await refresh(false);if(settings().consent)committed()}}catch{error=friendly('local-storage');paint()}
 }
 if(typeof document!=='undefined'){
  const localTimer=setInterval(()=>{if(!document.hidden&&api.isVisible()&&context&&!pending)refresh(false).catch(()=>{})},15000);
  globalThis.addEventListener?.('pagehide',()=>{clearInterval(localTimer);clearTimeout(timer)},{once:true});
 }
 function committed(){dirty=true;clearTimeout(timer);timer=setTimeout(()=>stage().catch(()=>{}),1500)}
 async function stage(force=false){
  if(!supported()||!context||!sameShop()||!settings().consent||status?.paused){if(force)throw Error(status?.paused?'paused':'unconfigured');return false}
  if(staging){again=true;await staging;if(force)return stage(true);return true}
  const currentGeneration=generation,currentContext={...context};
  staging=(async()=>{
   const snapshot=await api.database.cloudSnapshot();
   if(currentGeneration!==generation)throw Error('paused');
   if(snapshot.payload.state.originId!==currentContext.shopId)throw Error('owner');
   if(!force&&snapshot.revision<=(status?.stagedRevision??-1)){dirty=false;return}
   const blob=new Blob([JSON.stringify(snapshot.payload)],{type:'application/json'});
   const value=await globalThis.NativeFiles.stageCloudBackup(currentContext,blob,snapshot.revision);
   if(currentGeneration!==generation)throw Error('paused');
   dirty=false;update(value);
  })();
  try{await staging;return true}catch(e){error=friendly(e);paint();if(force)throw e;return false}finally{staging=null;if(again){again=false;committed()}}
 }
 async function pause(reason='restore'){
  generation++;clearTimeout(timer);again=false;
  if(context&&supported()){await call('pause',{reason});await refresh(false)}
  dirty=true;
 }
 async function replaced(){generation++;context=null;status=null;versions=[];nextCursor=null;loaded=false;dirty=true;try{await api.database.put('meta',{id:'cloud-backup-context',context:null})}catch{}}
 function panel(){if(!isOwner())return '';const entitlement=status?.server?.entitlement||{},next=status?.retryAt||status?.nextRunAt;return `<div class="section-title"><h2>${t('النسخ على السيرفر','Sauvegarde sur le serveur')}</h2></div><div class="panel"><div class="report-line"><strong role="status">${esc(label())}</strong></div><div class="report-line"><span>${t('آخر نسخة ناجحة','Dernière sauvegarde réussie')}</span><b>${esc(date(status?.lastSuccessAt))}</b></div>${settings().consent&&next?`<div class="report-line"><span>${t('المحاولة التالية المتوقعة','Prochaine tentative prévue')}</span><b>${esc(date(next))}</b></div>`:''}${entitlement.endsAt?`<div class="report-line"><span>${t('نهاية اشتراك النسخ','Fin de l’abonnement')}</span><b>${esc(date(entitlement.endsAt))}</b></div>`:''}${entitlement.downloadUntil?`<div class="report-line"><span>${t('التنزيل متاح حتى','Téléchargement possible jusqu’au')}</span><b>${esc(date(entitlement.downloadUntil))}</b></div>`:''}<div class="padded"><p class="notice">${t('خدمة مستقلة يفعّلها كونتا تولز. البيع والبيانات المحلية يعملان دون إنترنت حتى عند توقف النسخ.','Service indépendant activé par Contatools. Les ventes et les données locales restent disponibles hors connexion même si la sauvegarde est suspendue.')}</p><div class="management-actions"><button class="secondary" data-action="cloud:settings">${t('إعداد النسخ التلقائي','Régler la sauvegarde')}</button><button class="secondary" data-action="cloud:run">${t('نسخ الآن','Sauvegarder maintenant')}</button><button class="secondary" data-action="cloud:list">${t('النسخ المحفوظة','Sauvegardes disponibles')}</button><button class="secondary" data-action="cloud:refresh">${t('تحديث الحالة','Actualiser')}</button></div></div></div>`}
 let versions=[],nextCursor=null;
 function sheet(){
  if(api.modal()==='cloud-settings'){
   const s=settings();return api.modalMarkup(t('النسخ التلقائي','Sauvegarde automatique'),`<p class="notice">${esc(label())}</p>
<label class="feature-check"><input type="checkbox" name="cloudConsent" ${s.consent?'checked':''}><span>${t('أوافق على رفع نسخ بيانات المحل وحسابات الدخول إلى السيرفر الخاص بالخدمة','J’autorise l’envoi des données du commerce et des comptes de connexion vers le serveur du service')}</span></label>
<div class="feature-fields"><label class="field"><span>${t('موعد النسخ','Fréquence')}</span><select name="cloudSchedule"><option value="connected" ${s.schedule==='connected'?'selected':''}>${t('عند توفر الإنترنت مع وجود تغييرات','À la connexion si les données ont changé')}</option><option value="daily" ${s.schedule==='daily'?'selected':''}>${t('يوميًا','Tous les jours')}</option><option value="weekly" ${s.schedule==='weekly'?'selected':''}>${t('أسبوعيًا','Chaque semaine')}</option></select></label>
<div class="pair"><label class="field"><span>${t('الوقت المفضل','Heure souhaitée')}</span><input type="time" name="cloudTime" value="${esc(s.time||'21:00')}"></label><label class="field"><span>${t('اليوم للنسخ الأسبوعي','Jour de la sauvegarde hebdomadaire')}</span><select name="cloudWeekday">${[[1,'الاثنين','Lundi'],[2,'الثلاثاء','Mardi'],[3,'الأربعاء','Mercredi'],[4,'الخميس','Jeudi'],[5,'الجمعة','Vendredi'],[6,'السبت','Samedi'],[7,'الأحد','Dimanche']].map(([id,ar,fr])=>`<option value="${id}" ${Number(s.weekday)===id?'selected':''}>${t(ar,fr)}</option>`).join('')}</select></label></div></div>
<label class="feature-check"><input type="checkbox" name="cloudWifi" ${s.wifiOnly?'checked':''}><span>${t('Wi-Fi فقط','Wi-Fi uniquement')}</span></label><p class="muted">${t('الموعد مفضل؛ قد يؤجله Android بسبب الشبكة أو توفير الطاقة. يُستدرك الموعد الفائت عند توفر الشروط. الإيقاف القسري للتطبيق قد يتطلب فتحه مجددًا.','L’heure est souhaitée : Android peut différer le travail selon le réseau et la batterie. Un horaire manqué est rattrapé dès que possible. Après un arrêt forcé, il peut être nécessaire de rouvrir l’application.')}</p>`,'cloud:save',t('حفظ إعداد النسخ','Enregistrer les réglages'));
  }
  if(api.modal()==='cloud-versions')return api.modalMarkup(t('النسخ المحفوظة','Sauvegardes disponibles'),`<p class="notice">${t('تنزيل النسخة يفتح معاينة؛ لن تُستبدل بياناتك دون تأكيد. الاستعادة لا تعيد مدة التفعيل ولا تنقل تفعيل جهاز آخر.','Le téléchargement ouvre un aperçu. Aucune donnée n’est remplacée sans confirmation. La restauration ne renouvelle pas la licence et ne transfère pas l’activation d’un autre appareil.')}</p>${versions.length?`<div class="feature-admin-list" data-scroll-key="cloud-versions">${versions.map(v=>`<button type="button" class="row" data-action="cloud:download:${esc(v.backupId||v.id)}"><span class="copy"><strong>${esc(date(v.createdAt||v.completedAt))}</strong><small>${esc(v.bytes||v.sizeBytes||v.size||0)} ${t('بايت','octets')}</small></span><span>${t('معاينة','Aperçu')}</span></button>`).join('')}</div>`:`<p>${t('لا توجد نسخ متاحة لهذا الهاتف والمحل.','Aucune sauvegarde disponible pour cet appareil et ce commerce.')}</p>`}${nextCursor!==null?`<button class="secondary" type="button" data-action="cloud:more">${t('عرض المزيد','Afficher plus')}</button>`:''}`);
  return null;
 }
 async function action(action){
  if(!isOwner())return api.fail(t('إدارة النسخ على السيرفر خاصة بمالك المحل.','La sauvegarde serveur est réservée au propriétaire.'));
  if(pending)return;
  pending=true;
  try{
   const command=action.split(':')[1];
   if(!context){context={shopId:api.state().originId,ownerId:api.actor().id};await api.database.put('meta',{id:'cloud-backup-context',context})}
   if(!sameShop())throw Error('owner');
   if(command==='settings'){await refresh(true);api.show('cloud-settings');return}
   if(command==='refresh'){await refresh(true);return}
   if(command==='save'){
    const f=api.form(),value=await call('configure',{consent:f.cloudConsent==='on',schedule:f.cloudSchedule,time:f.cloudTime,weekday:Number(f.cloudWeekday),wifiOnly:f.cloudWifi==='on'});
    update(value);api.show(null);if(settings().consent)await stage(true);return;
   }
   if(command==='run'){await refresh(true);if(!settings().consent){api.show('cloud-settings');return}await stage(true);update(await call('run'));return}
   if(command==='list'||command==='more'){const response=await call('list',{limit:30,...(command==='more'&&nextCursor!==null?{cursor:nextCursor}:{})}),items=response.versions||response.items||[];versions=command==='more'?[...versions,...items]:items;nextCursor=Number.isSafeInteger(response.nextCursor)?response.nextCursor:null;api.show('cloud-versions');return}
   if(command==='download'){const id=action.slice('cloud:download:'.length),value=await call('download',{backupId:id});await api.preview(value.text);return}
  }catch(e){error=friendly(e);api.fail(error)}finally{pending=false;paint()}
 }
 return {start,committed,pause,replaced,panel,sheet,action,refresh};
}
