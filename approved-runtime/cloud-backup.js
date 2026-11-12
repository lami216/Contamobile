import {snapshotWindowMs, pendingRevisionCount, snapshotDelay} from './backup-window.js';
/** Optional server backup. It never participates in an accounting transaction. */
export function installCloudBackup(api){
 const t=(ar,fr)=>api.language()==='fr'?fr:ar,esc=api.escape;
 let context=null,status=null,error='',pending=false,dirty=false,staging=null,again=false,timer=null,loaded=false,generation=0;
 let remoteFlight=null,lastRemoteAttempt=0,firstDirtyAt=0,dirtyVersion=0,observedRevision=null;
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
 const bytes=value=>{const n=Math.max(0,Number(value)||0);return n>=1048576?(n/1048576).toLocaleString(api.language()==='fr'?'fr-FR':'en-US',{maximumFractionDigits:1})+' MB':Math.ceil(n/1024).toLocaleString(api.language()==='fr'?'fr-FR':'en-US')+' KB'};
 // Passive status updates must not rebuild an open form or another sheet.
 // The cached status is rendered when that sheet closes or an explicit action renders.
 function paint(){
  if(!api.isVisible()||(api.modal()&&api.modal()!=='cloud-overview'))return;
  const details=document.querySelector('[data-cloud-subscription-details]'),body=details?.closest('.sheet-body');
  const saved=details?{open:details.open,top:body?.scrollTop||0,focus:document.activeElement===details.querySelector('summary')}:null;
  api.render();
  if(saved){const current=document.querySelector('[data-cloud-subscription-details]');if(current){current.open=saved.open;const currentBody=current.closest('.sheet-body');if(currentBody)currentBody.scrollTop=saved.top;if(saved.focus)current.querySelector('summary')?.focus({preventScroll:true})}}
 }
 function update(value){if(value&&typeof value==='object')status={...status,...value,settings:value.settings??status?.settings,server:value.server??status?.server};error='';paint();return value}
 async function call(command,payload={}){if(!supported())throw Object.assign(new Error('unconfigured'),{code:'unconfigured'});return globalThis.NativeFiles.cloudBackup(command,{...base(),...payload})}
 function label(){
  if(!supported())return t('متاح في تطبيق Android المرتبط بالخدمة','Disponible dans l’application Android associée au service');
  if(!loaded)return t('جارٍ قراءة الحالة…','Lecture de l’état…');
  if(error)return error;
  if(status?.paused)return friendly('paused');
  if(status?.server?.entitlement?.enabled===false||status?.server?.entitlement?.active===false)return t('اشتراك النسخ غير فعال','Abonnement de sauvegarde inactif');
  if(/upload|running/.test(String(status?.stage||'')))return t('جارٍ رفع نسخة؛ يمكنك متابعة العمل','Sauvegarde en cours ; vous pouvez continuer à travailler');
  if(status?.lastError)return friendly(status.lastError);
  if(!settings().consent)return status?.manualPending?t('النسخة اليدوية بانتظار الاتصال','La sauvegarde manuelle attend la connexion'):status?.lastSuccessAt?t('آخر نسخة ناجحة محفوظة على السيرفر؛ النسخ التلقائي متوقف','Dernière sauvegarde confirmée sur le serveur ; sauvegarde automatique désactivée'):t('النسخ التلقائي متوقف على هذا الهاتف','Sauvegarde automatique désactivée sur cet appareil');
  if(dirty||status?.changesPending)return t('توجد تغييرات لم تُنسخ بعد','Des modifications restent à sauvegarder');
  if(status?.lastSuccessAt)return t('آخر نسخة ناجحة محفوظة على السيرفر','Dernière sauvegarde confirmée sur le serveur');
  return t('بانتظار أول نسخة ناجحة','En attente de la première sauvegarde réussie');
 }
 async function refresh(remote=false){
  if(!supported()){loaded=true;paint();return null}
  try{const value=await call('status',{refresh:remote});loaded=true;return update(value)}catch(e){loaded=true;error=friendly(e);paint();return null}
 }
 async function start(){
  try{const saved=await api.database.get('meta','cloud-backup-context');if(saved?.context){context=saved.context;if(!sameShop())context=null}if(context){await refresh(false);if(settings().consent)committed()}else{loaded=true;paint()}}catch{loaded=true;error=friendly('local-storage');paint()}
 }
 async function bind(){
  if(!context){context={shopId:api.state().originId,ownerId:api.actor().id};await api.database.put('meta',{id:'cloud-backup-context',context})}
  if(!sameShop())throw Error('owner');
 }
 async function refreshRemote(){
  if(typeof navigator!=='undefined'&&navigator.onLine===false)return status;
  if(remoteFlight)return remoteFlight;
  if(lastRemoteAttempt&&Date.now()-lastRemoteAttempt<60000)return status;
  lastRemoteAttempt=Date.now();
  remoteFlight=refresh(true);
  try{return await remoteFlight}finally{remoteFlight=null}
 }
 async function enter(){
  if(!isOwner()||!supported()){loaded=true;paint();return}
  try{await bind();if(!loaded||!status)await refresh(false);await refreshRemote()}catch(e){loaded=true;error=friendly(e);paint()}
 }
 if(typeof document!=='undefined'){
  const localTimer=setInterval(()=>{if(!document.hidden&&api.isVisible()&&context&&!pending)refresh(false).catch(()=>{})},15000);
  globalThis.addEventListener?.('online',()=>{if(api.isVisible())enter().catch(()=>{})});
  globalThis.addEventListener?.('alkarna-network-available',()=>{if(api.isVisible())enter().catch(()=>{})});
  globalThis.addEventListener?.('pagehide',()=>{clearInterval(localTimer);clearTimeout(timer)},{once:true});
 }
 function committed(){
  dirty=true;dirtyVersion++;if(!firstDirtyAt)firstDirtyAt=Date.now();
  const expectedGeneration=generation;
  if(context&&typeof api.database.cloudRevision==='function')api.database.cloudRevision().then(value=>{if(generation===expectedGeneration){observedRevision=value;paint()}}).catch(()=>{});
  clearTimeout(timer);timer=setTimeout(()=>stage().catch(()=>{}),snapshotDelay(firstDirtyAt,Date.now(),settings()));
 }
 async function stage(force=false,manual=false){
  const consent=manual?status?.manualConsentGranted||settings().consent:settings().consent;
  if(!supported()||!context||!sameShop()||!consent||(status?.paused&&!manual)){if(force)throw Error(status?.paused?'paused':'unconfigured');return false}
  if(staging){again=true;await staging;if(force)return stage(true,manual);return true}
  const currentGeneration=generation,currentContext={...context},stageVersion=dirtyVersion;
  staging=(async()=>{
   // Read one metadata row before cloning/validating/serializing the full shop.
   // The full snapshot remains one coherent readonly transaction when it is needed.
   if(typeof api.database.cloudRevision==='function'){
    observedRevision=await api.database.cloudRevision();
    if(!force&&observedRevision<=Number(status?.stagedRevision??-1)){
     if(dirtyVersion===stageVersion){dirty=false;firstDirtyAt=0}return;
    }
   }
   const snapshot=await api.database.cloudSnapshot();observedRevision=snapshot.revision;
   if(currentGeneration!==generation)throw Error('paused');
   if(snapshot.payload.state.originId!==currentContext.shopId)throw Error('owner');
   if(!force&&snapshot.revision<=Number(status?.stagedRevision??-1)){if(dirtyVersion===stageVersion){dirty=false;firstDirtyAt=0}return}
   const blob=new Blob([JSON.stringify(snapshot.payload)],{type:'application/json'});
   const value=await globalThis.NativeFiles.stageCloudBackup(manual?{...currentContext,manual:true}:currentContext,blob,snapshot.revision);
   if(currentGeneration!==generation)throw Error('paused');
   dirty=dirtyVersion!==stageVersion;if(!dirty)firstDirtyAt=0;update(value);
  })();
  try{await staging;return true}catch(e){error=friendly(e);paint();if(force)throw e;return false}finally{staging=null;if(again||dirty&&dirtyVersion!==stageVersion){again=false;committed()}}
 }
 async function pause(reason='restore'){
  generation++;clearTimeout(timer);again=false;firstDirtyAt=0;
  if(context&&supported()){await call('pause',{reason});await refresh(false)}
  dirty=true;
 }
 async function replaced(){generation++;context=null;status=null;versions=[];nextCursor=null;loaded=true;lastRemoteAttempt=0;firstDirtyAt=0;observedRevision=null;dirty=true;try{await api.database.put('meta',{id:'cloud-backup-context',context:null})}catch{}}
 function panel(){
  if(!isOwner())return '';
  const title=t('النسخ على السيرفر','Sauvegarde sur le serveur');
  return api.menu?api.menu([[title,esc(label()),'shield','cloud:overview']]):`<div class="panel"><button class="row" data-action="cloud:overview"><span class="copy"><strong>${title}</strong><small>${esc(label())}</small></span></button></div>`;
 }
 function overview(){
  const entitlement=status?.server?.entitlement||{},next=status?.retryAt||status?.nextRunAt;
  const uploadUnavailable=entitlement.enabled===false||entitlement.active===false;
  const pendingCount=pendingRevisionCount(observedRevision??status?.stagedRevision,status?.lastBackedUpRevision);
  return `<p class="notice" role="status">${esc(label())}</p>${error?`<button type="button" class="secondary" data-action="cloud:refresh">${t('إعادة المحاولة','Réessayer')}</button>`:''}<div class="panel"><div class="report-line"><span>${t('آخر نسخة ناجحة','Dernière sauvegarde réussie')}</span><b>${esc(date(status?.lastSuccessAt))}</b></div>${pendingCount!==null?`<div class="report-line"><span>${t('تغييرات محلية لم تصل للسيرفر','Modifications locales non sauvegardées')}</span><b>${esc(pendingCount)}</b></div>`:''}${settings().consent&&next?`<div class="report-line"><span>${t('الموعد التالي','Prochaine tentative')}</span><b>${esc(date(next))}</b></div>`:''}</div><div class="management-actions"><button class="secondary" data-action="cloud:run" ${uploadUnavailable?'disabled':''}>${t('نسخ الآن','Sauvegarder maintenant')}</button><button class="secondary" data-action="cloud:list">${t('النسخ المحفوظة','Sauvegardes disponibles')}</button><button class="secondary" data-action="cloud:settings">${t('إعداد النسخ التلقائي','Régler la sauvegarde')}</button></div><p class="muted">${t('النسخ خدمة اختيارية؛ العمل على الهاتف متاح دون إنترنت.','La sauvegarde est facultative ; le travail sur le téléphone reste disponible hors connexion.')}</p>${entitlement.endsAt||entitlement.downloadUntil||entitlement.quotaBytes?`<details class="feature-details" data-cloud-subscription-details><summary>${t('تفاصيل الاشتراك','Détails de l’abonnement')}</summary>${entitlement.endsAt?`<div class="report-line"><span>${t('نهاية اشتراك النسخ','Fin de l’abonnement')}</span><b>${esc(date(entitlement.endsAt))}</b></div>`:''}${entitlement.downloadUntil?`<div class="report-line"><span>${t('التنزيل متاح حتى','Téléchargement possible jusqu’au')}</span><b>${esc(date(entitlement.downloadUntil))}</b></div>`:''}${entitlement.quotaBytes?`<div class="report-line"><span>${t('المساحة المستخدمة','Espace utilisé')}</span><b dir="ltr">${esc(bytes(entitlement.usedBytes))} / ${esc(bytes(entitlement.quotaBytes))}</b></div>`:''}</details>`:''}`;
 }
 let versions=[],nextCursor=null;
 function sheet(){
  if(api.modal()==='cloud-overview')return api.modalMarkup(t('النسخ على السيرفر','Sauvegarde sur le serveur'),overview());
  if(api.modal()==='cloud-manual-consent')return api.modalMarkup(t('رفع نسخة الآن','Sauvegarder maintenant'),`<p class="notice">${t('ستُرفع نسخة من بيانات المحل وحسابات الدخول إلى السيرفر الخاص بالخدمة.','Une copie des données du commerce et des comptes de connexion sera envoyée au serveur du service.')}</p><p class="muted">${t('يبقى النسخ التلقائي حسب إعدادك الحالي.','La sauvegarde automatique conserve son réglage actuel.')}</p>`,'cloud:manual-confirm',t('أوافق وأرفع النسخة','Autoriser et sauvegarder'));
  if(api.modal()==='cloud-settings'){
   const s=settings();return api.modalMarkup(t('النسخ التلقائي','Sauvegarde automatique'),`<p class="notice">${esc(label())}</p>
<label class="feature-check"><input type="checkbox" name="cloudConsent" ${s.consent?'checked':''}><span>${t('أوافق على رفع نسخ بيانات المحل وحسابات الدخول إلى السيرفر الخاص بالخدمة','J’autorise l’envoi des données du commerce et des comptes de connexion vers le serveur du service')}</span></label>
<div class="feature-fields"><label class="field"><span>${t('موعد النسخ','Fréquence')}</span><select name="cloudSchedule"><option value="connected" ${s.schedule==='connected'?'selected':''}>${t('عند توفر الإنترنت مع وجود تغييرات','À la connexion si les données ont changé')}</option><option value="daily" ${s.schedule==='daily'?'selected':''}>${t('يوميًا','Tous les jours')}</option><option value="weekly" ${s.schedule==='weekly'?'selected':''}>${t('أسبوعيًا','Chaque semaine')}</option></select></label>
<div class="pair" data-cloud-schedule-pair ${s.schedule!=='weekly'?'style="grid-template-columns:minmax(0,1fr)"':''}><label class="field" data-cloud-time ${s.schedule==='connected'?'hidden style="display:none"':''}><span>${t('الوقت المفضل','Heure souhaitée')}</span><input type="time" name="cloudTime" value="${esc(s.time||'21:00')}"></label><label class="field" data-cloud-weekday ${s.schedule!=='weekly'?'hidden style="display:none"':''}><span>${t('اليوم للنسخ الأسبوعي','Jour de la sauvegarde hebdomadaire')}</span><select name="cloudWeekday">${[[1,'الاثنين','Lundi'],[2,'الثلاثاء','Mardi'],[3,'الأربعاء','Mercredi'],[4,'الخميس','Jeudi'],[5,'الجمعة','Vendredi'],[6,'السبت','Samedi'],[7,'الأحد','Dimanche']].map(([id,ar,fr])=>`<option value="${id}" ${Number(s.weekday)===id?'selected':''}>${t(ar,fr)}</option>`).join('')}</select></label></div></div>
<label class="field"><span>${t('تجميع التغييرات قبل تجهيز النسخة','Regrouper les modifications avant la copie')}</span><select name="cloudSnapshotWindow">${[[1500,'فوري تقريبًا (الإعداد السابق)','Quasi immédiat (réglage existant)'],[15000,'15 ثانية','15 secondes'],[60000,'دقيقة واحدة','Une minute'],[300000,'5 دقائق','5 minutes']].map(([id,ar,fr])=>`<option value="${id}" ${snapshotWindowMs(s)===id?'selected':''}>${t(ar,fr)}</option>`).join('')}</select></label><p class="muted">${t('التجميع يقلل تجهيز نسخ كاملة بعد كل بيع. تبقى التغييرات الجديدة على هذا الجهاز فقط حتى تُجهّز النسخة وتُرفع بنجاح. «نسخ الآن» يتجاوز نافذة التجميع؛ موعد النسخ والشبكة المختاران يبقيان كما هما.','Le regroupement réduit les copies complètes après chaque vente. Les nouvelles modifications restent uniquement sur cet appareil jusqu’à la préparation et l’envoi réussis. «Sauvegarder maintenant» ignore cette fenêtre ; la fréquence et le réseau choisis restent inchangés.')}</p>
<label class="feature-check"><input type="checkbox" name="cloudSpread" ${Number(s.startSpreadMs)===30000?'checked':''}><span>${t('توزيع بدء النسخ اليومي والأسبوعي بفارق حتى 30 ثانية لتخفيف الازدحام','Répartir le début des sauvegardes quotidiennes et hebdomadaires sur 30 secondes au maximum')}</span></label>
<label class="feature-check"><input type="checkbox" name="cloudWifi" ${s.wifiOnly?'checked':''}><span>${t('Wi-Fi فقط','Wi-Fi uniquement')}</span></label><p class="muted">${t('الموعد مفضل؛ قد يؤجله Android بسبب الشبكة أو توفير الطاقة. يُستدرك الموعد الفائت عند توفر الشروط. الإيقاف القسري للتطبيق قد يتطلب فتحه مجددًا.','L’heure est souhaitée : Android peut différer le travail selon le réseau et la batterie. Un horaire manqué est rattrapé dès que possible. Après un arrêt forcé, il peut être nécessaire de rouvrir l’application.')}</p>`,'cloud:save',t('حفظ إعداد النسخ','Enregistrer les réglages'));
  }
  if(api.modal()==='cloud-versions')return api.modalMarkup(t('النسخ المحفوظة','Sauvegardes disponibles'),`<p class="notice">${t('تنزيل النسخة يفتح معاينة؛ لن تُستبدل بياناتك دون تأكيد. الاستعادة لا تعيد مدة التفعيل ولا تنقل تفعيل جهاز آخر.','Le téléchargement ouvre un aperçu. Aucune donnée n’est remplacée sans confirmation. La restauration ne renouvelle pas la licence et ne transfère pas l’activation d’un autre appareil.')}</p>${versions.length?`<div class="feature-admin-list" data-scroll-key="cloud-versions">${versions.map(v=>`<button type="button" class="row" data-action="cloud:download:${esc(v.backupId||v.id)}"><span class="copy"><strong>${esc(date(v.createdAt||v.completedAt))}</strong><small>${esc(bytes(v.bytes||v.sizeBytes||v.size||0))}</small></span><span>${t('معاينة','Aperçu')}</span></button>`).join('')}</div>`:`<p>${t('لا توجد نسخ متاحة لهذا الهاتف والمحل.','Aucune sauvegarde disponible pour cet appareil et ce commerce.')}</p>`}${nextCursor!==null?`<button class="secondary" type="button" data-action="cloud:more">${t('عرض المزيد','Afficher plus')}</button>`:''}`);
  return null;
 }
 async function action(action){
  if(!isOwner())return api.fail(t('إدارة النسخ على السيرفر خاصة بمالك المحل.','La sauvegarde serveur est réservée au propriétaire.'));
  if(pending)return;
  pending=true;
  try{
   const command=action.split(':')[1];
   await bind();
   if(command==='overview'){await enter();api.show('cloud-overview');return}
   if(command==='settings'){await refreshRemote();api.show('cloud-settings');return}
   if(command==='refresh'){await refresh(true);return}
   if(command==='save'){
    const f=api.form(),s=settings(),value=await call('configure',{consent:f.cloudConsent==='on',schedule:f.cloudSchedule||s.schedule,time:f.cloudTime||s.time,weekday:Number(f.cloudWeekday??s.weekday),wifiOnly:f.cloudWifi==='on',snapshotWindowMs:Number(f.cloudSnapshotWindow??snapshotWindowMs(s)),startSpreadMs:f.cloudSpread==='on'?30000:0});
    update(value);api.show('cloud-overview');if(settings().consent)await stage(true);return;
   }
   if(command==='run'){
    await refresh(true);
    if(!settings().consent&&!status?.manualConsentGranted){api.show('cloud-manual-consent');return}
   }
   if(command==='run'||command==='manual-confirm'){
    update(await call('manual-consent'));
    if(api.modal()!=='cloud-overview')api.show('cloud-overview');
    await stage(true,true);
    update(await call('run',{manual:true}));return;
   }
   if(command==='list'||command==='more'){const response=await call('list',{limit:30,...(command==='more'&&nextCursor!==null?{cursor:nextCursor}:{})}),items=response.versions||response.items||[];versions=command==='more'?[...versions,...items]:items;nextCursor=Number.isSafeInteger(response.nextCursor)?response.nextCursor:null;api.show('cloud-versions');return}
   if(command==='download'){const id=action.slice('cloud:download:'.length),value=await call('download',{backupId:id});await api.preview(value.text);return}
  }catch(e){error=friendly(e);api.fail(error)}finally{pending=false;paint()}
 }
 document.addEventListener('change',event=>{if(event.target?.name!=='cloudSchedule')return;const sheet=event.target.closest('.sheet')||event.target.closest('form');if(!sheet)return;const schedule=event.target.value,time=sheet.querySelector('[data-cloud-time]'),weekday=sheet.querySelector('[data-cloud-weekday]'),pair=sheet.querySelector('[data-cloud-schedule-pair]');if(pair)pair.style.gridTemplateColumns=schedule==='weekly'?'':'minmax(0,1fr)';if(time){time.hidden=schedule==='connected';time.style.display=time.hidden?'none':''}if(weekday){weekday.hidden=schedule!=='weekly';weekday.style.display=weekday.hidden?'none':''}});
 return {start,enter,committed,pause,replaced,panel,sheet,action,refresh};
}
