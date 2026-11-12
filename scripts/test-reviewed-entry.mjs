import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const require=createRequire(import.meta.url);let chromium;
for(const candidate of [process.env.PLAYWRIGHT_MODULE,'playwright',fileURLToPath(new URL('../../Contatools/node_modules/playwright',import.meta.url))].filter(Boolean))try{({chromium}=require(candidate));break}catch{}
if(!chromium)throw Error('Playwright is required for the reviewed customer entry fixture');
const runtime=path.resolve(fileURLToPath(new URL('../approved-runtime/',import.meta.url)));
const origin='http://127.0.0.1:43131',cases=[],layouts=[],remote=[];
const directory=process.env.ENTRY_PROOF_DIR;
let browser;
async function open({language='ar',width=393,height=852,holdState=false,kind='company',withoutUuid=false,legacyAvailable=false,companyPendingState=false}={}){
 const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',colorScheme:'dark'}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==origin){remote.push(url.origin+url.pathname);return route.abort('blockedbyclient')}
  const relative=decodeURIComponent(url.pathname).slice(1),file=path.resolve(runtime,relative);assert(file.startsWith(runtime+path.sep));
  const input=/^assets\/StitchArabic(?:Bold)?\.ttf$/.test(relative)?path.resolve(runtime,'../assets/fonts',path.basename(relative)):file;
  let bytes;try{bytes=await readFile(input)}catch{return route.fulfill({status:404,body:''})}
  return route.fulfill({body:bytes,contentType:({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream'});
 });
 await page.clock.install({time:new Date('2026-11-12T14:00:00Z')});await page.clock.pauseAt(new Date('2026-11-12T14:01:00Z'));
 await page.addInitScript(({language,holdState,kind,withoutUuid,legacyAvailable,companyPendingState})=>{
  localStorage.setItem('alkarna-site-language',language);
  window.__entryFixture={calls:[],events:[],stateId:null,approved:false,randomCalls:0};
  const f=window.__entryFixture;
  if(withoutUuid){
   const original=crypto.getRandomValues.bind(crypto);Object.defineProperty(crypto,'randomUUID',{value:undefined});
   Object.defineProperty(crypto,'getRandomValues',{value:bytes=>{f.randomCalls++;return original(bytes)}});
   Math.random=()=>{throw Error('Insecure randomness is forbidden in this fixture')};
  }
  const reply=(id,value)=>queueMicrotask(()=>window.__nativeResult(id,value));
  window.__replyInitialState=value=>reply(f.stateId,value);
  window.NativeHost={
   language(){},theme(){},licenseAllowed:()=>false,openPrivacy:()=>f.events.push('privacy'),accountContinue:()=>f.events.push('continue'),
   accountAccess(id,command,serialized){
    const payload=JSON.parse(serialized);f.calls.push({id,command,identifier:payload.identifier,consent:payload.consent});
    if(command==='state'){f.stateId??=id;if(holdState&&f.calls.filter(c=>c.command==='state').length===1)return;return reply(id,{mode:'none',legacyAvailable,...(companyPendingState?{companyEnrollment:{stage:'pending',mode:'online',deviceStatus:'pending',installationId:'11111111-2222-4333-8444-555555555555',requestId:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',identifier:'company@example.invalid'}}:{})})}
    if(command==='login'){
     if(f.approved)return reply(id,{stage:'active',mode:kind==='phone'?'offline':'online'});
     if(kind==='phone')return reply(id,{stage:'pending',mode:'offline',phone:payload.identifier,activationRequired:true});
     return reply(id,{stage:'pending',mode:'online',deviceStatus:'pending',installationId:'11111111-2222-4333-8444-555555555555',requestId:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'});
    }
    if(command==='offline-status')return reply(id,{stage:f.approved?'active':'pending',mode:'offline',phone:'23456789'});
    if(command==='offline-activate')return reply(id,f.approved?{stage:'active',mode:'offline'}:{error:'Approval required',code:'ACCOUNT_AUTH_INVALID'});
    if(command==='legacy')return reply(id,legacyAvailable?{stage:'active',mode:'legacy'}:{error:'Local licence required',code:'LOCAL_LICENSE_REQUIRED'});
    return reply(id,{error:'Unexpected fixture operation',code:'ACCOUNT_OPERATION_INVALID'});
   },
  };
  const realOpen=indexedDB.open.bind(indexedDB);window.__entryDatabaseOpens=0;indexedDB.open=(...args)=>{window.__entryDatabaseOpens++;return realOpen(...args)};
 },{language,holdState,kind,withoutUuid,legacyAvailable,companyPendingState});
 await page.goto(origin+'/access.html',{waitUntil:'domcontentloaded'});await page.locator('#identifier,#company-retry').first().waitFor();
 return {context,page,errors};
}
async function check(name,fn){try{await fn();cases.push({name,passed:true});console.log('PASS '+name)}catch(error){cases.push({name,passed:false,error:error.message});console.error('FAIL '+name+'\n'+error.stack)}}
async function form(page,identifier,code='synthetic-company-password-2026'){
 await page.locator('#identifier').fill(identifier);await page.locator('#code').fill(code);await page.locator('#consent').check();
}
async function noStoredSecret(page){assert.equal(await page.evaluate(()=>[...Object.values(localStorage),...Object.values(sessionStorage)].some(v=>/synthetic-company-password|synthetic-phone-code/.test(v))),false)}
async function inspectLayout(page){return page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,font:getComputedStyle(document.body).fontFamily,background:getComputedStyle(document.body).backgroundColor,buttonHeight:document.querySelector('#login-form .primary').getBoundingClientRect().height,language:document.documentElement.lang,brand:document.querySelector('.entry-brand strong').textContent}))}
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:process.env.PLAYWRIGHT_USE_BUNDLED==='1'?{}:{channel:'chrome'})});
 await check('missing startup callback keeps fields and language usable before and after its deadline',async()=>{
  const x=await open({holdState:true});try{
   assert.equal(await x.page.locator('#identifier').isEnabled(),true);assert.equal(await x.page.locator('#code').isEnabled(),true);assert.equal(await x.page.locator('#login-form .primary').isEnabled(),true);
   await form(x.page,'company@example.invalid');await x.page.locator('#language').click();assert.equal(await x.page.locator('html').getAttribute('lang'),'fr');
   assert.equal(await x.page.locator('#identifier').inputValue(),'company@example.invalid');assert.equal(await x.page.locator('#code').inputValue(),'synthetic-company-password-2026');
   await x.page.clock.fastForward(60001);assert.equal(await x.page.locator('#identifier').isEnabled(),true);assert.equal(await x.page.locator('#code').inputValue(),'synthetic-company-password-2026');assert.equal(await x.page.locator('#consent').isChecked(),true);
   await noStoredSecret(x.page);assert.deepEqual(x.errors,[]);
  }finally{await x.context.close()}
 });
 await check('late initial state cannot replace the edited form or its focus',async()=>{
  const x=await open({holdState:true});try{
   await form(x.page,'company@example.invalid');await x.page.locator('#code').focus();
   await x.page.evaluate(()=>__replyInitialState({mode:'none',legacyAvailable:true,offline:{bound:true,status:'expired',phone:'34567890'}}));
   await x.page.evaluate(()=>Promise.resolve());assert.equal(await x.page.locator('#identifier').inputValue(),'company@example.invalid');assert.equal(await x.page.locator('#code').inputValue(),'synthetic-company-password-2026');assert.equal(await x.page.locator('#check').count(),0);
   assert.equal(await x.page.evaluate(()=>document.activeElement.id),'code');await noStoredSecret(x.page);assert.deepEqual(x.errors,[]);
  }finally{await x.context.close()}
 });
 await check('company pending is display-only with no data access, automatic polling or saved password',async()=>{
  const x=await open({holdState:true});try{
   await form(x.page,'company@example.invalid');await x.page.locator('#login-form .primary').click();await x.page.locator('#company-retry').waitFor();
   assert.equal(await x.page.locator('.entry-identity').innerText(),'company@example.invalid');assert.equal(await x.page.locator('#check,#activate,#legacy,#code').count(),0);assert.deepEqual(await x.page.evaluate(()=>__entryFixture.events),[]);assert.equal(await x.page.evaluate(()=>__entryDatabaseOpens),0);
   await x.page.evaluate(()=>__replyInitialState({mode:'none',legacyAvailable:true,companyEnrollment:{stage:'pending',mode:'online',deviceStatus:'pending',identifier:'other@example.invalid'}}));
   await x.page.clock.fastForward(180001);assert.equal(await x.page.locator('.entry-identity').innerText(),'company@example.invalid');assert.equal(await x.page.locator('#legacy').count(),1,'late valid-local metadata may expose only an explicit local route');assert.deepEqual(await x.page.evaluate(()=>__entryFixture.events),[]);
   assert.deepEqual(await x.page.evaluate(()=>__entryFixture.calls.map(c=>c.command)),['state','login']);await noStoredSecret(x.page);
   await x.page.locator('#company-retry').click();assert.equal(await x.page.locator('#identifier').inputValue(),'company@example.invalid');assert.equal(await x.page.locator('#code').inputValue(),'');assert.equal(await x.page.locator('#consent').isChecked(),false);
   await x.page.evaluate(()=>__entryFixture.approved=true);await form(x.page,'company@example.invalid');await x.page.locator('#login-form .primary').click();
   assert.deepEqual(await x.page.evaluate(()=>__entryFixture.events),['continue']);assert.equal(await x.page.evaluate(()=>__entryFixture.calls.filter(c=>c.command==='login').length),2);await noStoredSecret(x.page);assert.deepEqual(x.errors,[]);
  }finally{await x.context.close()}
 });
 await check('phone registration stays a single-device request and receives approval only by explicit action',async()=>{
  const x=await open({kind:'phone'});try{
   await form(x.page,'23456789','synthetic-phone-code');await x.page.locator('#login-form .primary').click();await x.page.locator('#check').waitFor();
   assert.equal(await x.page.locator('#company-retry,#legacy,#activate').count(),0);assert.match(await x.page.locator('h1').innerText(),/الهاتف/);assert.deepEqual(await x.page.evaluate(()=>__entryFixture.events),[]);assert.equal(await x.page.evaluate(()=>__entryDatabaseOpens),0);
   await x.page.evaluate(()=>__entryFixture.approved=true);await x.page.locator('#check').click();await x.page.locator('#activate').waitFor();assert.deepEqual(await x.page.evaluate(()=>__entryFixture.events),[]);
   await x.page.locator('#activate').click();assert.deepEqual(await x.page.evaluate(()=>__entryFixture.events),['continue']);await noStoredSecret(x.page);assert.deepEqual(x.errors,[]);
  }finally{await x.context.close()}
 });
 await check('the actual native bridge uses unique secure RFC4122 v4 IDs without randomUUID',async()=>{
  const x=await open({withoutUuid:true});try{
   await x.page.evaluate(()=>Promise.all(Array.from({length:100},()=>NativeFiles.accountAccess('state'))));
   const ids=await x.page.evaluate(()=>__entryFixture.calls.map(c=>c.id));assert.equal(ids.length,101);assert.equal(new Set(ids).size,101);
   assert(ids.every(id=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)));assert.equal(await x.page.evaluate(()=>__entryFixture.randomCalls),101);assert.deepEqual(x.errors,[]);
  }finally{await x.context.close()}
 });
 await check('reviewed entry has no manual license controls or activation contact destinations',async()=>{
  const x=await open();try{
   assert.equal(await x.page.locator('#manual,#license-file,#license-text,#install-text,a[href^="tel:"],a[href*="wa.me"],a[href*="whatsapp"]').count(),0);
   assert.equal(await x.page.locator('script[src*="activation.js"]').count(),0);await x.page.locator('#privacy').click();assert.deepEqual(await x.page.evaluate(()=>__entryFixture.events),['privacy']);assert.deepEqual(x.errors,[]);
  }finally{await x.context.close()}
 });
 await check('an existing local account remains directly available beside pending company metadata',async()=>{
  for(const companyPendingState of [false,true]){
   const x=await open({legacyAvailable:true,companyPendingState});try{
    if(!companyPendingState){await form(x.page,'company@example.invalid');await x.page.locator('#login-form .primary').click()}
    await x.page.locator('#company-retry').waitFor();await x.page.locator('#legacy').waitFor();assert.deepEqual(await x.page.evaluate(()=>__entryFixture.events),[]);
    await x.page.locator('#legacy').click();assert.deepEqual(await x.page.evaluate(()=>__entryFixture.events),['continue']);assert.equal(await x.page.evaluate(()=>__entryFixture.calls.filter(c=>c.command==='legacy').length),1);assert.equal(await x.page.evaluate(()=>__entryDatabaseOpens),0);await noStoredSecret(x.page);assert.deepEqual(x.errors,[]);
   }finally{await x.context.close()}
  }
 });
 for(const language of ['ar','fr'])for(const variant of [320,360,393,'short','large'])await check('responsive '+language+' '+variant,async()=>{
  const width=typeof variant==='number'?variant:variant==='short'?360:393,height=variant==='short'?420:852;
  const x=await open({language,width,height});try{
   await x.page.evaluate(()=>document.fonts.ready);
   if(variant==='large')await x.page.addStyleTag({content:'.access-entry{font-size:20px}.access-card p,.access-card label,.access-card button,.entry-brand small{font-size:18px!important}'});
   if(variant==='short'){await x.page.locator('#code').focus();await x.page.locator('#code').scrollIntoViewIfNeeded();assert.equal(await x.page.evaluate(()=>document.activeElement.id),'code')}
   const dimensions=await inspectLayout(x.page);assert(dimensions.scrollWidth<=width,'No horizontal clipping');assert(dimensions.buttonHeight>=48);assert.match(dimensions.font,/Arabic/);assert.equal(dimensions.background,'rgb(8, 14, 25)');assert.equal(dimensions.language,language);assert.equal(dimensions.brand,language==='fr'?'AlKarna':'الكرنه');assert.deepEqual(x.errors,[]);
   layouts.push({language,variant,...dimensions,scope:variant==='short'?'Shrunken viewport/focused input; not a physical keyboard':variant==='large'?'CSS large-font stress; not an Android OS setting':'Browser responsive viewport'});
   if(directory){await mkdir(directory,{recursive:true});await x.page.screenshot({path:path.join(directory,`reviewed-entry-${language}-${variant}.png`),fullPage:true})}
  }finally{await x.context.close()}
 });
}finally{await browser?.close()}
const sourceHashes={};for(const name of ['access.html','access.js','access.css','native-adapter.js'])sourceHashes[name]=createHash('sha256').update(await readFile(path.join(runtime,name))).digest('hex');
const result={scope:'Actual reviewed HTML/JS/native-adapter with controlled loopback-only native fixtures; UI behavior tests do not prove physical-phone or real-server admission.',passed:cases.every(c=>c.passed)&&remote.length===0,executed:cases.length,failed:cases.filter(c=>!c.passed).length,cases,layouts,sourceHashes,remoteRequests:remote,productionRequests:0,physicalPhone:false,accountingDataMigrated:false};
if(directory){await mkdir(directory,{recursive:true});await writeFile(path.join(directory,'reviewed-entry-ux-proof.json'),JSON.stringify(result,null,2)+'\n')}
assert.equal(remote.length,0);if(!result.passed)process.exitCode=1;
