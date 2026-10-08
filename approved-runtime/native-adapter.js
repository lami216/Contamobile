(()=>{
 const waiting=new Map();
 window.__nativeResult=(id,result)=>{const request=waiting.get(id);if(!request)return;waiting.delete(id);result.error?request.reject(new Error(result.error)):request.resolve(result)};
 function call(method,...args){const id=crypto.randomUUID();return new Promise((resolve,reject)=>{waiting.set(id,{resolve,reject});try{NativeHost[method](id,...args)}catch(e){waiting.delete(id);reject(e)}})}
 window.NativeFiles={
  async saveBlob(name,blob){if(blob.size>64*1024*1024)throw new Error('حجم الملف أكبر من الحد المتاح');const id=crypto.randomUUID();await new Promise((resolve,reject)=>{waiting.set(id,{resolve,reject});try{NativeHost.beginExport(id,name,blob.type||'application/octet-stream');}catch(e){waiting.delete(id);reject(e)}});for(let offset=0;offset<blob.size;offset+=49152){const bytes=new Uint8Array(await blob.slice(offset,offset+49152).arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);NativeHost.appendExport(id,btoa(binary))}return new Promise((resolve,reject)=>{waiting.set(id,{resolve,reject});NativeHost.finishExport(id)})},
  scan:()=>call('scanBarcode')
 };
 window.print=()=>NativeHost.printDocument();
 let lastTheme='';new MutationObserver(()=>{const theme=document.querySelector('#phone')?.dataset.appearance||'dark';if(theme!==lastTheme){lastTheme=theme;NativeHost.theme(theme)}}).observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['data-appearance']});
})();