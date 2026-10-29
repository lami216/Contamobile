/* Keep the accounting surface closed until its modules and durable store are ready. */
(()=>{
 const phone=document.querySelector('#phone'),status=document.querySelector('#runtime-status');
 let phase='loading',fr=false;
 try{fr=localStorage.getItem('alkarna-site-language')==='fr'||new URLSearchParams(location.search).get('lang')==='fr'}catch{}
 const copy=fr?{title:'Ouverture du commerce',wait:'Vérification des données locales…',failed:'Impossible d’ouvrir le commerce',detail:'Fermez puis rouvrez l’application. Si le problème persiste, contactez le support avant de créer un autre commerce.',retry:'Réessayer'}:{title:'جارٍ فتح المحل',wait:'جارٍ التحقق من البيانات المحلية…',failed:'تعذّر فتح المحل',detail:'أغلق التطبيق وافتحه من جديد. إذا استمرت المشكلة، تواصل مع الدعم قبل إنشاء محل آخر.',retry:'إعادة المحاولة'};
 function paint(error=''){
  phone.hidden=true;phone.inert=true;status.hidden=false;status.dir=fr?'ltr':'rtl';status.replaceChildren();
  const card=document.createElement('section');card.className='auth-card';const title=document.createElement('h1');title.textContent=error?copy.failed:copy.title;card.append(title);
  const text=document.createElement('p');text.setAttribute('role',error?'alert':'status');text.textContent=error||copy.wait;card.append(text);
  if(error){const detail=document.createElement('p');detail.textContent=copy.detail;const retry=document.createElement('button');retry.type='button';retry.className='primary';retry.textContent=copy.retry;retry.onclick=()=>location.reload();card.append(detail,retry)}
  status.append(card);document.documentElement.dataset.runtimeState=phase;
 }
 function failed(message){if(phase!=='loading')return;phase='failed';paint(fr&&/[\u0600-\u06ff]/.test(message||'')?copy.detail:message||copy.detail)}
 globalThis.__approvedRuntimeBoot=Object.freeze({
  get phase(){return phase},
  ready(){if(phase!=='loading')return;phase='ready';status.hidden=true;phone.hidden=false;phone.inert=false;document.documentElement.dataset.runtimeState=phase},
  failed
 });
 for(const type of ['click','submit','keydown','input','change'])document.addEventListener(type,event=>{if(phase!=='ready'&&event.target instanceof Element&&event.target.closest('#phone')){event.preventDefault();event.stopImmediatePropagation()}},true);
 window.addEventListener('error',event=>{
  const target=event.target;
  // Resource errors bubble in capture mode too. A missing logo/media file must not
  // lock a healthy accounting store; failed scripts/styles and runtime errors do.
  if(target instanceof Element){
   if(target.tagName==='SCRIPT'||target.tagName==='LINK'&&(target.relList.contains('stylesheet')||target.relList.contains('modulepreload')))failed();
   return;
  }
  if(event instanceof ErrorEvent)failed();
 },true);
 window.addEventListener('unhandledrejection',()=>failed());
 paint();
})();
