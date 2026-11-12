import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {emptyState,domainApply,commandHash,canonical} from '../approved-runtime/platform/shared/accounting-domain.mjs';
const require=createRequire(import.meta.url);let chromium;
for(const item of [process.env.PLAYWRIGHT_MODULE,'playwright',fileURLToPath(new URL('../../Contatools/node_modules/playwright',import.meta.url))].filter(Boolean))try{({chromium}=require(item));break}catch{}
if(!chromium)throw Error('Playwright is required');
const runtime=fileURLToPath(new URL('../approved-runtime/',import.meta.url)),cases=[],remoteRequests=[];
const organization={id:'org-synthetic-normal-login',name:'مؤسسة منفصلة'},member={id:'member-synthetic-normal-login',name:'موظف المؤسسة',username:'central@example.invalid',role:'org-admin',capabilities:['*'],branchIds:['branch-synthetic-normal-login'],membershipVersion:1},branch={id:'branch-synthetic-normal-login',name:'الفرع',originId:'origin-synthetic-normal-login'};
function fixture(){return {mode:'legacy',approved:false,calls:[],events:[],pushes:[],state:emptyState({originId:branch.originId,organizationId:organization.id,branchId:branch.id}),cursor:0,completed:null};}
function dispatch(f,command,payload){
 f.calls.push({command,payload});
 if(command==='bootstrap')return f.mode==='online'?{mode:'online',context:{organization,member,branches:[branch]},connected:true,pendingOnline:false}:{mode:'legacy'};
 if(command==='legacy'){f.mode='legacy';return {stage:'active',mode:'legacy'};}
 if(command==='login'){
  if(payload.identifier==='23456789')return {stage:'pending',mode:'offline',requestId:'synthetic-offline-request'};
  if(payload.identifier!==member.username||payload.code!=='synthetic-company-password')throw Error('ACCOUNT_AUTH_INVALID');
  if(!f.approved)return {stage:'pending',mode:'online',deviceStatus:'pending',installationId:'installation-synthetic',requestId:'request-synthetic'};
  f.mode='online';return {stage:'active',mode:'online'};
 }
 if(command==='online-status')return {organization,member,branches:[branch],connected:true};
 if(command==='online-pending')return f.completed?{pending:true,completed:true,operation:'sync.push',payload:f.completed.payload,result:f.completed.result}:{pending:false};
 if(command==='online-ack'){assert.deepEqual(payload.operationIds,f.completed.payload.commands.map(c=>c.operationId));f.completed=null;return {acknowledged:true};}
 if(command==='logout'){f.mode='legacy';return {signedOut:true};}
 if(command==='online-call'){
  if(payload.operation==='online.bootstrap')return {mode:'online',organizationId:organization.id,branchId:branch.id,epoch:1,cursor:f.cursor,state:f.state};
  if(payload.operation==='sync.status')return {epoch:1,cursor:f.cursor,needsSettlement:0};
  assert.equal(payload.operation,'sync.push');const p=payload.payload;if(f.completed){assert.equal(canonical(p),canonical(f.completed.payload));return f.completed.result;}
  f.pushes.push(structuredClone(p));const receipts=p.commands.map(command=>{f.state=domainApply(f.state,command,{organizationId:organization.id,branchId:branch.id,memberId:member.id,epoch:1,role:'org-admin',capabilities:['*'],branchIds:[branch.id]}).state;f.cursor++;return {operationId:command.operationId,hash:commandHash(command),status:'accepted'};});
  const result={epoch:1,cursor:f.cursor,receipts};f.completed={payload:structuredClone(p),result:structuredClone(result)};return result;
 }
 throw Error('Unexpected native command '+command);
}
const server=createServer((req,res)=>res.writeHead(404).end());await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;let browser;
async function action(page,value){await page.evaluate(value=>act(value),value);await page.waitForFunction(()=>!karnaPersistenceBusy());}
async function open(language='ar',username='old-local-owner',password='local-old-password'){
 const f=fixture(),context=await browser.newContext({viewport:{width:360,height:740},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==origin){remoteRequests.push(url.href);return route.abort();}
  if(url.pathname==='/native'){const {command,payload}=route.request().postDataJSON();let result;try{result=dispatch(f,command,payload)}catch(error){result={error:error.message,code:error.message}}return route.fulfill({json:result});}
  if(url.pathname==='/continue'){f.events.push('continue');return route.fulfill({status:204,body:''});}
  const relative=url.pathname.slice(1)||'index.html',filename=path.resolve(runtime,relative);assert(filename.startsWith(runtime));
  let bytes;try{bytes=await readFile(filename).catch(error=>/^assets\/StitchArabic(?:Bold)?\.ttf$/.test(relative)?readFile(path.resolve(runtime,'../assets/fonts',path.basename(relative))):Promise.reject(error))}catch{return route.fulfill({status:404,body:''});}
  const extension=path.extname(filename);return route.fulfill({body:bytes,contentType:['.js','.mjs'].includes(extension)?'text/javascript':extension==='.css'?'text/css':extension==='.html'?'text/html':'application/octet-stream'});
 });
 await context.addInitScript(({language})=>{
  localStorage.setItem('alkarna-site-language',language);window.__entryEvents=[];
  const invoke=async(command,payload={})=>{const value=await(await fetch('/native',{method:'POST',body:JSON.stringify({command,payload})})).json();if(value.error)throw Object.assign(Error(value.error),{code:value.code});return value;};
  window.NativeFiles={accountAccess:invoke,licenseStatus:async()=>({valid:true,license:{customerName:'مالك محلي',storeName:'محل محلي'}})};
  window.NativeHost={licenseAllowed:()=>true,language(){},theme(){},openPrivacy(){__entryEvents.push('privacy');},openActivation(){__entryEvents.push('activation');},openAccountAccess(){__entryEvents.push('special-entry');},accountContinue(){fetch('/continue').then(()=>location.reload());},accountAccess(id,command,json){invoke(command,JSON.parse(json)).then(value=>__nativeResult(id,value),error=>__nativeResult(id,{error:error.message,code:error.code}));}};
  const nativeOpen=indexedDB.open.bind(indexedDB);window.__localOpens=0;indexedDB.open=(...args)=>{window.__localOpens++;return nativeOpen(...args);};
 },{language});
 await page.goto(origin+'/index.html');await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');
 for(const [name,value]of Object.entries({username,password}))await page.locator('#site-auth-form [name='+name+']').fill(value);
 await action(page,'site:setup');await page.locator('.nav').waitFor();
 await action(page,'open:expense');await page.locator('#sheet-form [name=name]').fill('سجل محلي محفوظ');await page.locator('#sheet-form [name=amount]').fill('17.25');await action(page,'post-cash');
 await action(page,'site:logout');await page.locator('#site-auth-form').waitFor();return {f,context,page,errors,username,password};
}
async function snapshot(page){return page.evaluate(async()=>{const {ShopDatabase}=await import('/database.js'),db=new ShopDatabase(),state=await db.load();return {users:await db.all('users'),originId:state.originId,records:state.records,accounts:state.accounts,products:state.products,parties:state.parties,currency:state.currency};});}
async function fill(page,username,password,consent=false){await page.locator('#site-auth-form [name=username]').fill(username);await page.locator('#site-auth-form [name=password]').fill(password);await page.locator('#site-service-consent').setChecked(consent);}
async function check(name,fn){try{await fn();cases.push({name,passed:true});console.log('PASS '+name)}catch(error){cases.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack);}}
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:process.env.PLAYWRIGHT_USE_BUNDLED==='1'?{}:{channel:'chrome'})});
 for(const language of ['ar','fr'])await check('one '+language+' normal login form has generic fields without account-type or activation instructions',async()=>{
  const x=await open(language);try{assert.equal(await x.page.locator('#site-auth-form [name=username]').count(),1);assert.equal(await x.page.locator('#site-auth-form [name=password]').count(),1);assert.equal(await x.page.locator('[data-action="site:account-entry"]').count(),0);assert.equal(await x.page.locator('#site-service-consent').isChecked(),false);assert.doesNotMatch(await x.page.locator('#phone .auth-card').innerText(),/رقم.*8|يبدأ.*[234]|طلب تفعيل|دخول حساب منشأة آخر|8 chiffres|activation/i);assert(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(x.errors,[]);}finally{await x.context.close();}
 });
 await check('old local four-character password works offline without service consent and preserves every local business value',async()=>{
  const x=await open('ar','old-local-owner','1234');try{const before=await snapshot(x.page),calls=x.f.calls.length;await fill(x.page,x.username,x.password);await action(x.page,'site:login');await x.page.locator('.nav').waitFor();await action(x.page,'site:account-menu');assert.equal(await x.page.locator('.account-links button').count(),3);assert.equal(await x.page.locator('[data-action="site:offline-link"]').count(),0);assert.doesNotMatch(await x.page.locator('.account-sheet').innerText(),/ربط هاتف|رقم.*8|Lier le téléphone|8 chiffres/);await action(x.page,'site:offline-link');assert.equal(await x.page.locator('.sheet [name=phone]').count(),0);await action(x.page,'close');assert.deepEqual(await snapshot(x.page),before);assert.equal(x.f.calls.slice(calls).some(c=>c.command==='login'),false);assert.equal(x.f.calls.some(c=>c.payload?.code==='1234'),false);assert.deepEqual(x.errors,[]);}finally{await x.context.close();}
 });
 await check('known email usernames never replay wrong or inactive local passwords to the service',async()=>{
  const x=await open('ar','existing@example.invalid');try{const before=await snapshot(x.page);await fill(x.page,x.username,'wrong-company-looking-secret',true);await action(x.page,'site:login');assert.equal(x.f.calls.some(c=>c.command==='login'),false);assert.equal(await x.page.locator('.nav').count(),0);assert.deepEqual(await snapshot(x.page),before);await x.page.evaluate(async username=>{const {ShopDatabase}=await import('/database.js'),db=new ShopDatabase(),users=await db.all('users'),u=users.find(u=>u.username===username);u.active=false;await db.put('users',u);},x.username);await fill(x.page,x.username,x.password,true);await action(x.page,'site:login');assert.equal(x.f.calls.some(c=>c.command==='login'),false);assert.equal(await x.page.locator('.nav').count(),0);assert.deepEqual(x.errors,[]);}finally{await x.context.close();}
 });
 await check('arbitrary unknown input stays on the same normal form and creates no remote activation or organization',async()=>{
  const x=await open();try{const before=await snapshot(x.page);await fill(x.page,'arbitrary-user','random-long-password',true);await action(x.page,'site:login');assert.equal(x.f.calls.some(c=>['login','offline-request','offline-activate'].includes(c.command)),false);assert.equal(await x.page.locator('#site-auth-form [name=username]').inputValue(),'arbitrary-user');assert.match(await x.page.locator('.auth-error').innerText(),/مسؤول منشأتك/);assert.deepEqual(await x.page.evaluate(()=>__entryEvents),[]);assert.deepEqual(await snapshot(x.page),before);assert.deepEqual(x.errors,[]);}finally{await x.context.close();}
 });
 await check('organization credentials require generic explicit service consent before any transmission',async()=>{
  const x=await open();try{await fill(x.page,member.username,'synthetic-company-password');await action(x.page,'site:login');assert.equal(x.f.calls.some(c=>c.command==='login'),false);assert.match(await x.page.locator('.auth-error').innerText(),/وافق|الموافقة/);assert.equal(await x.page.locator('#site-auth-form [name=username]').inputValue(),member.username);assert.deepEqual(x.errors,[]);}finally{await x.context.close();}
 });
 await check('organization pending remains inline and a subsequent real old local login preserves the local ledger',async()=>{
  const x=await open();try{const before=await snapshot(x.page);await fill(x.page,member.username,'synthetic-company-password',true);const handle=await x.page.locator('#site-auth-form').elementHandle();await action(x.page,'site:login');assert(await handle.evaluate(element=>element.isConnected));assert.match(await x.page.locator('.auth-entry-status').innerText(),/انتظر الموافقة/);assert.equal(await x.page.locator('#site-auth-form [name=password]').inputValue(),'');assert.equal(await x.page.locator('.nav').count(),0);assert.deepEqual(await x.page.evaluate(()=>__entryEvents),[]);assert.equal(x.f.events.length,0);assert.deepEqual(await snapshot(x.page),before);await fill(x.page,x.username,x.password);await action(x.page,'site:login');await x.page.locator('.nav').waitFor();assert.deepEqual(await snapshot(x.page),before);assert.equal(x.f.state.records.length,0);assert.deepEqual(x.errors,[]);}finally{await x.context.close();}
 });
 await check('approved credentials reload the same index with central context and return to untouched old local data',async()=>{
  const x=await open();try{const before=await snapshot(x.page);x.f.approved=true;await fill(x.page,member.username,'synthetic-company-password',true);await x.page.evaluate(()=>act('site:login'));await x.page.locator('.nav').waitFor();await x.page.waitForFunction(()=>globalThis.karnaCurrentActor()?.name==='موظف المؤسسة');assert.equal(x.f.events.length,1);assert.equal(await x.page.evaluate(()=>__localOpens),0);assert.equal(await x.page.evaluate(()=>S.records.length),0);await action(x.page,'open:expense');await x.page.locator('#sheet-form [name=name]').fill('سجل المؤسسة المستقل');await x.page.locator('#sheet-form [name=amount]').fill('8.5');await action(x.page,'post-cash');assert.equal(x.f.state.records.length,1);const central=structuredClone(x.f.state.records);x.f.mode='legacy';await x.page.reload();await x.page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');await fill(x.page,x.username,x.password);await action(x.page,'site:login');await x.page.locator('.nav').waitFor();assert.deepEqual(await snapshot(x.page),before);assert.deepEqual(x.f.state.records,central);assert.equal(x.f.pushes.length,1);assert.deepEqual(x.errors,[]);}finally{await x.context.close();}
 });
 await check('numeric trigger submits only on explicit consent and keeps its pending response generic on the same form',async()=>{
  const x=await open();try{const before=await snapshot(x.page);await fill(x.page,'23456789','synthetic-private-code',true);await action(x.page,'site:login');assert.equal(x.f.calls.filter(c=>c.command==='login').length,1);assert.equal(x.f.calls.some(c=>['offline-activate','online-call'].includes(c.command)),false);assert.match(await x.page.locator('.auth-error').innerText(),/مسؤول منشأتك/);assert.equal(await x.page.locator('.auth-entry-status').isVisible(),false);assert.equal(x.f.events.length,0);assert.deepEqual(await snapshot(x.page),before);assert.deepEqual(x.errors,[]);}finally{await x.context.close();}
 });
}finally{await browser?.close();server.close();}
const sourceHashes={};for(const name of ['app.js','database.js','platform/shared/android-access.mjs'])sourceHashes[name]=createHash('sha256').update(await readFile(path.join(runtime,name))).digest('hex');
const result={scope:'Actual index.html/app.js/IndexedDB/password verification with strictly loopback synthetic native/organization transport; no physical-phone or production claim.',passed:cases.every(c=>c.passed)&&remoteRequests.length===0,executed:cases.length,failed:cases.filter(c=>!c.passed).length,cases,sourceHashes,remoteRequests,productionRequests:0,physicalPhone:false};
if(process.env.NORMAL_LOGIN_PROOF_DIR){await mkdir(process.env.NORMAL_LOGIN_PROOF_DIR,{recursive:true});await writeFile(path.join(process.env.NORMAL_LOGIN_PROOF_DIR,'normal-login-ux-proof.json'),JSON.stringify(result,null,2)+'\n');}
assert.equal(remoteRequests.length,0);if(!result.passed)process.exitCode=1;
