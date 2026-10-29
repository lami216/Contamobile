(()=>{
 const waiting=new Map(),transfers=new Set();let pageActive=true;
 const uncertainExport='لم يتأكد حفظ الملف. تحقّق من المكان الذي اخترته قبل إعادة المحاولة.';
 const bridgeFailure=(code,exporting=false)=>Object.assign(new Error(exporting?uncertainExport:'لم يصل تأكيد من التطبيق. تحقّق من النتيجة ثم أعد المحاولة.'),{code,permanent:false,status:0});
 function settle(id,error,result){const request=waiting.get(id);if(!request)return;waiting.delete(id);window.clearTimeout(request.timer);error?request.reject(error):request.resolve(result)}
 window.__nativeResult=(id,result)=>{if(!waiting.has(id))return;result?.error?settle(id,Object.assign(new Error(result.error),{retryAt:result.retryAt||0,permanent:result.permanent===true,status:result.status||0})):settle(id,null,result)};
 function request(id,timeout,start,exporting=false){return new Promise((resolve,reject)=>{
  if(!pageActive){reject(bridgeFailure('NATIVE_PAGE_HIDDEN',exporting));return;}
  if(waiting.has(id)){reject(bridgeFailure('NATIVE_REQUEST_PENDING',exporting));return;}
  const timer=window.setTimeout(()=>settle(id,bridgeFailure('NATIVE_TIMEOUT',exporting)),timeout);waiting.set(id,{resolve,reject,timer});
  try{start()}catch(error){settle(id,error)}
 })}
 function call(method,...args){const id=crypto.randomUUID();return request(id,60000,()=>NativeHost[method](id,...args))}
 window.addEventListener('pagehide',()=>{pageActive=false;for(const [id]of waiting)settle(id,bridgeFailure('NATIVE_PAGE_HIDDEN'));for(const job of [...transfers])job.cancel()});
 window.addEventListener('pageshow',()=>{pageActive=true});
 window.NativeFiles={
  async saveBlob(name,blob){
   if(blob.size>64*1024*1024)throw new Error('حجم الملف أكبر من الحد المتاح');
   return new Promise((resolve,reject)=>{
    const id=crypto.randomUUID(),job={cancelled:false,cancel(){this.cancelled=true;transfers.delete(this);reject(bridgeFailure('NATIVE_PAGE_HIDDEN',true))}};transfers.add(job);
    const check=()=>{if(job.cancelled||!pageActive)throw bridgeFailure('NATIVE_PAGE_HIDDEN',true)};
    (async()=>{
     check();await request(id,30000,()=>NativeHost.beginExport(id,name,blob.type||'application/octet-stream'),true);
     for(let offset=0;offset<blob.size;offset+=49152){check();const bytes=new Uint8Array(await blob.slice(offset,offset+49152).arrayBuffer());check();let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);NativeHost.appendExport(id,btoa(binary))}
     check();return request(id,600000,()=>NativeHost.finishExport(id),true);
    })().then(resolve,reject).finally(()=>transfers.delete(job));
   });
  },
  scan:()=>call('scanBarcode'),
  licenseStatus:()=>call('activationStatus'),
  activation:()=>NativeHost.openActivation()
 };
 window.NativeFiles.ownerRecovery=(command,value='')=>call('ownerRecovery',command,value);
 window.print=()=>NativeHost.printDocument();
 let lastTheme='',lastLanguage='';new MutationObserver(()=>{const language=document.documentElement.lang==='fr'?'fr':'ar';if(language!==lastLanguage){lastLanguage=language;NativeHost.language(language)}const theme=document.querySelector('#phone')?.dataset.appearance||'dark';if(theme!==lastTheme){lastTheme=theme;NativeHost.theme(theme)}}).observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['data-appearance','lang']});
})();
