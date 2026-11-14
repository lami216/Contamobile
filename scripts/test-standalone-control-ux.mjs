import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const require=createRequire(import.meta.url);let chromium;
for(const name of [process.env.PLAYWRIGHT_MODULE,'playwright',fileURLToPath(new URL('../../Contatools/node_modules/playwright',import.meta.url))].filter(Boolean)){try{({chromium}=require(name));break}catch{}}
if(!chromium)throw Error('Playwright is required for standalone activation UI verification');
const runtime=fileURLToPath(new URL('../approved-runtime/',import.meta.url)),output=process.env.STANDALONE_CONTROL_PROOF_DIR||'candidate-proof';
const server=createServer(async(req,res)=>{try{const relative=new URL(req.url,'http://fixture.invalid').pathname.slice(1)||'activation.html',target=path.resolve(runtime,relative);if(path.relative(runtime,target).startsWith('..'))throw Error('Invalid fixture path');res.setHeader('content-type',target.endsWith('.js')?'text/javascript':target.endsWith('.css')?'text/css':target.endsWith('.html')?'text/html':'application/octet-stream');res.end(await readFile(target));}catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const cases=[],remoteRequests=[],pageErrors=[];let browser;
const check=async(name,action)=>{try{await action();cases.push({name,passed:true});console.log('PASS '+name)}catch(error){cases.push({name,passed:false,error:error.stack||String(error)});console.error('FAIL '+name+'\n'+error.stack)}};
async function fixture(language='ar',mode='fresh',width=360){
 const context=await browser.newContext({viewport:{width,height:851},serviceWorkers:'block'}),page=await context.newPage();
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){remoteRequests.push(route.request().url());return route.abort()}return route.continue()});page.on('pageerror',error=>pageErrors.push(String(error)));
 await page.addInitScript(({language,mode})=>{
  localStorage.setItem('alkarna-site-language',language);sessionStorage.setItem('activation-draft','retained synthetic document');globalThis.__calls=[];globalThis.__manualFailure=true;globalThis.__continued=0;
  globalThis.__license={deviceId:'AKD-1111-2222-3333-4444-5555',valid:false,code:mode==='banned'?'DEVICE_BANNED':'LICENSE_REQUIRED',...(mode==='banned'?{control:{banned:true,controlGeneration:1,activationFence:1}}:{})};
  globalThis.__server={status:'pending',remoteEnabled:mode!=='fresh',activationAvailable:mode==='offer',...(mode==='banned'?{control:{banned:true,documentStatus:'revoked'}}:{})};
  const answer=(id,value)=>queueMicrotask(()=>globalThis.__nativeResult(id,structuredClone(value)));
  const activated=()=>{globalThis.__license={deviceId:globalThis.__license.deviceId,valid:true,license:{licenseId:'approved-new-exact-document',customerName:'صاحب الفحص · Société '.repeat(3),storeName:'متجر العطور · Boutique '.repeat(3),type:'temporary',remainingSeconds:3590}};globalThis.__server={status:'active',remoteEnabled:true,activationAvailable:false};};
  globalThis.NativeHost={language(){},copyDeviceCode(){globalThis.__calls.push({command:'copy'})},openPrivacy(){location.href='privacy.html?lang='+language},activationContinue(){globalThis.__continued++},activationStatus(id){answer(id,globalThis.__license)},
   installActivation(id,content){globalThis.__calls.push({command:'manual',content});setTimeout(()=>{if(globalThis.__manualFailure){answer(id,{error:'Online admission unavailable',code:'CONTROL_ADMISSION_UNAVAILABLE'});return}activated();answer(id,globalThis.__license)},80)},
   deviceLifecycle(id,command,content){globalThis.__calls.push({command,payload:JSON.parse(content)});if(command==='enroll'){setTimeout(()=>{globalThis.__server.remoteEnabled=true;answer(id,globalThis.__server)},80);return}if(command==='activate'){setTimeout(()=>{if(globalThis.__server.control?.banned){answer(id,{error:'banned',code:'DEVICE_BANNED'});return}activated();answer(id,{stage:'activated',ackPending:false})},80);return}answer(id,globalThis.__server)}
  };
 },{language,mode});
 await page.goto(origin+'/activation.html');await page.waitForFunction(()=>document.querySelector('#device-code')?.textContent.startsWith('AKD-'));
 return {context,page};
}
async function noOverflow(page,activation=true){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);if(activation)assert.equal(await page.locator('input[name=username],input[name=password],#contact-whatsapp,a[href^="https://wa.me"],a[href^="tel:"]').count(),0);}
try{
 const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||process.env.CHROMIUM_PATH;browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});await mkdir(output,{recursive:true});
 for(const language of ['ar','fr']){
  await check(`unregistered phone needs explicit disclosed consent and has one local activation screen ${language}`,async()=>{const {context,page}=await fixture(language);try{
   assert.equal(await page.getAttribute('html','dir'),language==='fr'?'ltr':'rtl');assert.equal(await page.locator('#online-connect').isDisabled(),true);assert.equal(await page.locator('#manual-activation').getAttribute('open'),null);assert.equal(await page.evaluate(()=>__calls.filter(x=>x.command==='enroll'||x.command==='activate').length),0);await noOverflow(page);await page.screenshot({path:path.join(output,`standalone-fresh-${language}-360.png`),fullPage:true});
  }finally{await context.close()}});
  await check(`enrollment double tap sends one consent request and preserves pending local state ${language}`,async()=>{const {context,page}=await fixture(language,'fresh',393);try{
   await page.locator('#remote-consent').check();await page.evaluate(()=>{document.querySelector('#online-connect').click();document.querySelector('#online-connect').click()});await page.waitForFunction(()=>__calls.filter(x=>x.command==='enroll').length===1&&!document.querySelector('#online-connect').disabled);assert.equal(await page.evaluate(()=>__calls.find(x=>x.command==='enroll').payload.consent),true);assert.equal(await page.locator('#continue').isVisible(),false);assert.equal(await page.locator('#online-accept').isVisible(),false);await noOverflow(page);
  }finally{await context.close()}});
  await check(`owner approved activation needs one explicit acceptance and explicit application opening ${language}`,async()=>{const {context,page}=await fixture(language,'offer');try{
   await page.locator('#online-accept').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>__calls.filter(x=>x.command==='activate').length),0);await page.evaluate(()=>{document.querySelector('#online-accept').click();document.querySelector('#online-accept').click()});await page.locator('#continue').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>__calls.filter(x=>x.command==='activate').length),1);assert.equal(await page.evaluate(()=>__continued),0);await noOverflow(page);await page.screenshot({path:path.join(output,`standalone-active-${language}-360.png`),fullPage:true});
  }finally{await context.close()}});
  await check(`ban and subsequent unban leave revoked activation locked and preserve stored identity ${language}`,async()=>{const {context,page}=await fixture(language,'banned');try{
   await page.waitForFunction(()=>document.querySelector('#remote-consent').checked);assert.equal(await page.locator('#continue').isVisible(),false);assert.equal(await page.locator('#manual-activation').isVisible(),false);assert.equal(await page.locator('#online-accept').isVisible(),false);await noOverflow(page);await page.screenshot({path:path.join(output,`standalone-banned-${language}-360.png`),fullPage:true});
   const device=await page.locator('#device-code').textContent();await page.evaluate(()=>{__license={...__license,valid:false,code:'ACTIVATION_REVOKED',control:{banned:false,activationFence:1,controlGeneration:2}};__server={...__server,control:{banned:false,documentStatus:'revoked'},activationAvailable:false};dispatchEvent(new Event('alkarna-control-updated'))});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes(document.documentElement.lang==='fr'?'révoquée':'أُبطل'));assert.equal(await page.locator('#continue').isVisible(),false);assert.equal(await page.locator('#device-code').textContent(),device);assert.equal(await page.evaluate(()=>__calls.filter(x=>x.command==='activate').length),0);
  }finally{await context.close()}});
 }
 await check('manual online admission failure preserves the draft and never reports a completed activation',async()=>{const {context,page}=await fixture('ar');try{
  await page.locator('#remote-consent').check();await page.locator('#manual-title').click();await page.locator('#paste-title').click();await page.locator('#license-text').fill('synthetic approved document');await page.locator('#install-text').click();await page.waitForFunction(()=>!document.querySelector('#install-text').disabled&&document.querySelector('#status').classList.contains('error'));assert.equal(await page.locator('#license-text').inputValue(),'synthetic approved document');assert.equal(await page.locator('#continue').isVisible(),false);assert.equal(await page.evaluate(()=>__continued),0);await page.evaluate(()=>__manualFailure=false);await page.locator('#install-text').click();await page.locator('#continue').waitFor({state:'visible'});assert.equal(await page.locator('#license-text').inputValue(),'');assert.equal(await page.evaluate(()=>__calls.filter(x=>x.command==='manual').length),2);
 }finally{await context.close()}});
 await check('public local privacy page stays readable in Arabic and French without any account or external request',async()=>{const {context,page}=await fixture('ar');try{
  await page.locator('#privacy').click();await page.waitForURL('**/privacy.html?lang=ar');assert.equal(await page.locator('[data-privacy-language=ar]').isVisible(),true);await noOverflow(page,false);await page.locator('[data-privacy-choice=fr]').click();assert.equal(await page.getAttribute('html','dir'),'ltr');assert.equal(await page.locator('[data-privacy-language=fr]').isVisible(),true);assert.equal(await page.locator('input').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:path.join(output,'standalone-privacy-fr-360.png'),fullPage:true});
 }finally{await context.close()}});
}finally{
 await browser?.close();await new Promise(resolve=>server.close(resolve));await mkdir(output,{recursive:true});
 const sourceHashes={};for(const filename of ['activation.html','activation.js','activation.css','privacy.html','privacy.css'])sourceHashes[filename]=createHash('sha256').update(await readFile(path.join(runtime,filename))).digest('hex');
 const scriptSha256=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
 await writeFile(path.join(output,'standalone-control-ux-proof.json'),JSON.stringify({scope:'Actual local HTML/CSS/JS in Chromium with an explicitly simulated native bridge; native signed protocol and APK execution are separate gates',scriptSha256,sourceHashes,remoteRequests,pageErrors,passed:cases.length===10&&cases.every(x=>x.passed)&&remoteRequests.length===0&&pageErrors.length===0,cases},null,2)+'\n');
}
assert(cases.length===10&&cases.every(x=>x.passed)&&remoteRequests.length===0&&pageErrors.length===0,'All ten standalone activation UI cases must pass without external requests or page errors');
