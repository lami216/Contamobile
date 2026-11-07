import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url);let chromium;
for(const module of [process.env.PLAYWRIGHT_MODULE,'playwright',fileURLToPath(new URL('../../Contatools-source/node_modules/playwright',import.meta.url))].filter(Boolean)){try{({chromium}=require(module));break}catch{}}
if(!chromium)throw Error('Playwright is required for replacement activation UX');
const root=fileURLToPath(new URL('../approved-runtime/',import.meta.url));
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://test.invalid').pathname.slice(1)||'activation.html',file=path.resolve(root,name);if(!file.startsWith(root))throw Error('Invalid fixture path');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,results=[];let browser;
const check=async(name,work)=>{try{await work();results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack||String(error)});console.error('FAIL '+name+'\n'+error.stack)}};
async function fixture(language,width,role='pending'){
 const context=await browser.newContext({viewport:{width,height:851},serviceWorkers:'block'}),page=await context.newPage();
 await page.addInitScript(({language,role})=>{
  localStorage.setItem('alkarna-site-language',language);sessionStorage.setItem('activation-draft','retained draft');
  globalThis.__phoneCalls=[];globalThis.__activationFailures=0;
  globalThis.__license={deviceId:'AKD-1111-2222-3333-4444-5555',valid:false,code:role==='replaced'?'ENTITLEMENT_REPLACED':'ENTITLEMENT_PENDING',entitlement:{status:role,endsAt:Date.now()+86400000}};
  globalThis.__server={status:'pending',entitlement:{status:role},entitlementAvailable:role!=='replaced',entitlementKind:'replacement',activationAvailable:role!=='replaced'};
  const respond=(id,value)=>queueMicrotask(()=>globalThis.__nativeResult(id,value));
  globalThis.NativeHost={language(){},copyDeviceCode(){},activationContinue(){globalThis.__phoneCalls.push({command:'open-app'})},
   activationStatus(id){respond(id,structuredClone(globalThis.__license))},
   deviceLifecycle(id,command,content){globalThis.__phoneCalls.push({command,payload:JSON.parse(content)});if(command==='activate'){
    setTimeout(()=>{if(globalThis.__activationFailures>0){globalThis.__activationFailures--;respond(id,{error:'network',code:'NETWORK_ERROR'});return}
     globalThis.__license={...globalThis.__license,valid:true,code:'',entitlement:{status:'active',endsAt:Date.now()+86400000},license:{licenseId:'device-bound-license',customerName:'اسم صاحب المحل '.repeat(5),storeName:'اسم المحل '.repeat(7),type:'temporary',remainingSeconds:86390}};
     respond(id,{stage:'activated',entitlement:globalThis.__license.entitlement,ackPending:false});
    },80);
   }else respond(id,structuredClone(globalThis.__server));}
  };
 },{language,role});
 await page.goto(origin+'/activation.html');await page.waitForFunction(()=>!document.querySelector('#online-connect').disabled);
 return {context,page};
}
try{
 const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||process.env.CHROMIUM_PATH;
 browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});await mkdir('candidate-proof',{recursive:true});
 for(const language of ['ar','fr'])for(const width of [360,393]){
  await check(`replaced phone preserves a clear activation gate and disables file bypass ${language} ${width}px`,async()=>{const {context,page}=await fixture(language,width,'replaced');try{
   await page.waitForFunction(()=>document.querySelector('#title').textContent.includes(document.documentElement.lang==='fr'?'remplacé':'استُبدل'));
   assert.equal(await page.getAttribute('html','dir'),language==='fr'?'ltr':'rtl');assert.equal(await page.locator('#license-file').isDisabled(),true);assert.equal(await page.locator('#install-text').isDisabled(),true);assert.equal(await page.locator('#continue').isVisible(),false);assert.equal(await page.locator('#online-accept').isVisible(),false);
   assert.equal(await page.evaluate(()=>globalThis.__phoneCalls.filter(x=>x.command==='activate').length),0);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:`candidate-proof/phone-replacement-replaced-${language}-${width}.png`,fullPage:true});
  }finally{await context.close()}});
  await check(`replacement needs one explicit acceptance and leaves opening the app explicit ${language} ${width}px`,async()=>{const {context,page}=await fixture(language,width);try{
   await page.locator('#online-accept').waitFor({state:'visible'});assert.match(await page.locator('#online-accept').textContent(),language==='fr'?/remplacement/:/استبدال/);assert.equal(await page.evaluate(()=>globalThis.__phoneCalls.filter(x=>x.command==='activate').length),0);
   await page.evaluate(()=>{const b=document.querySelector('#online-accept');b.click();b.click()});await page.locator('#continue').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>globalThis.__phoneCalls.filter(x=>x.command==='activate').length),1);assert.equal(await page.evaluate(()=>globalThis.__phoneCalls.filter(x=>x.command==='open-app').length),0);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`candidate-proof/phone-replacement-accepted-${language}-${width}.png`,fullPage:true});
  }finally{await context.close()}});
 }
 await check('a failed acceptance preserves the offer and draft and allows an explicit retry',async()=>{const {context,page}=await fixture('ar',393);try{
  await page.locator('#online-accept').waitFor({state:'visible'});await page.evaluate(()=>globalThis.__activationFailures=1);await page.locator('#online-accept').click();await page.waitForFunction(()=>!document.querySelector('#online-accept').disabled&&document.querySelector('#online-status').textContent.includes('تعذّر'));
  assert.equal(await page.locator('#license-text').inputValue(),'retained draft');assert.equal(await page.locator('#continue').isVisible(),false);await page.locator('#online-accept').click();await page.locator('#continue').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>globalThis.__phoneCalls.filter(x=>x.command==='activate').length),2);
 }finally{await context.close()}});
 await check('offline refresh cannot turn a replaced phone into an active phone',async()=>{const {context,page}=await fixture('fr',360,'replaced');try{
  await context.setOffline(true);await page.locator('#online-connect').click();assert.equal(await page.locator('#continue').isVisible(),false);assert.equal(await page.locator('#license-file').isDisabled(),true);assert.equal(await page.evaluate(()=>globalThis.__phoneCalls.filter(x=>x.command==='activate').length),0);
 }finally{await context.close()}});
}finally{
 await browser?.close();await new Promise(resolve=>server.close(resolve));await mkdir('candidate-proof',{recursive:true});await writeFile('candidate-proof/phone-replacement-ux-proof.json',JSON.stringify({scope:'Browser-only activation UI with simulated native bridge; not Android or a real service',passed:results.every(r=>r.passed),cases:results},null,2)+'\n');
}
assert(results.length===10&&results.every(r=>r.passed),'All ten phone replacement UX cases must pass');
