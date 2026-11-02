import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const require=createRequire(import.meta.url);let chromium;
for(const candidate of [process.env.PLAYWRIGHT_MODULE,'playwright',fileURLToPath(new URL('../../Contatools-source/node_modules/playwright',import.meta.url))].filter(Boolean)){try{({chromium}=require(candidate));break}catch{}}
if(!chromium)throw Error('Playwright is required for owner recovery UX checks.');
const root=fileURLToPath(new URL('../approved-runtime/',import.meta.url)),cases=[];
const server=createServer(async(req,res)=>{try{
 const relative=new URL(req.url,'http://local.invalid').pathname.slice(1)||'index.html',file=path.resolve(root,relative);
 if(!file.startsWith(root))throw Error('Invalid path');
 const bytes=await readFile(file);res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(bytes);
}catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;let browser;
async function check(name,fn){try{await fn();cases.push({name,passed:true});console.log('PASS '+name)}catch(error){cases.push({name,passed:false,error:error.stack||error.message});console.error('FAIL '+name+'\n'+error.stack)}}
const panel=page=>page.locator('.owner-recovery-panel'),input=(page,name)=>panel(page).locator('[name='+name+']');
const save=page=>panel(page).locator('form button');
const status=page=>panel(page).locator('[role=status]');
async function stored(page){return page.evaluate(async()=>{const {ShopDatabase}=await import('/database.js'),db=await new ShopDatabase().open(),shop=await db.get('snapshots','shop'),users=await db.all('users'),meta=await db.all('meta');db.db.close();const business=structuredClone(shop.state);delete business.users;return {shop,users,meta,business}})}
async function fixture(lang='ar',width=393,height=851){
 const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'}),page=await context.newPage();
 const native={calls:[],context:null,ownerId:null,response:'approved',prepared:null,appliedComplete:null,grantId:'synthetic-local-grant',intentId:'synthetic-local-intent',prepares:0,claims:0,finishes:0,failFinish:false,resumeApproved:false};
 await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
 const approved=()=>({status:'approved',shopId:native.overrideShop??native.context.shopId,ownerId:native.overrideOwner??native.ownerId});
 await page.exposeFunction('syntheticOwnerRecovery',async(command,value='')=>{
  native.calls.push({command,value});
  if(command==='register'||command==='register-now'){native.context=JSON.parse(value);return {registered:true}}
  if(command==='resume-local')return native.prepared||native.appliedComplete||{stage:'idle'};
  if(command==='resume')return native.prepared||native.appliedComplete||(native.resumeApproved?approved():{stage:'idle'});
  if(command==='request'){native.ownerId=value;return native.response==='approved'?approved():{status:native.response}}
  if(command==='poll')return native.response==='approved'?approved():{status:native.response};
  if(command==='prepare'){
   const payload=JSON.parse(value);native.prepares++;
   if(native.appliedComplete)return structuredClone(native.appliedComplete);
   if(!native.prepared)native.claims++;
   native.prepared={stage:'prepared',shopId:native.context.shopId,ownerId:native.ownerId,requestId:'synthetic-local-request',grantId:native.grantId,intentId:native.intentId,password:payload.password,...(Object.hasOwn(payload,'username')?{username:payload.username}:{})};
   return structuredClone(native.prepared);
  }
  if(command==='finish'){native.finishes++;const p=native.prepared;native.appliedComplete={stage:'complete',shopId:p.shopId,ownerId:p.ownerId,requestId:p.requestId,grantId:p.grantId,intentId:p.intentId};native.prepared=null;native.resumeApproved=false;if(native.failFinish){native.failFinish=false;throw Error('Synthetic lost local completion response')}return structuredClone(native.appliedComplete)}
  if(command==='ack')return {stage:'complete'};
  throw Error('Unexpected synthetic command '+command);
 });
 await page.addInitScript(lang=>{
  localStorage.setItem('alkarna-site-language',lang);
  window.NativeFiles={ownerRecovery:async(command,value='')=>{
   if(command==='prepare'&&globalThis.__beforeRecoveryPrepare){const hook=globalThis.__beforeRecoveryPrepare;delete globalThis.__beforeRecoveryPrepare;await hook()}
   return globalThis.syntheticOwnerRecovery(command,value);
  }};
 },lang);
 await page.goto(origin+'/');await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');
 for(const [name,value]of Object.entries({name:'Owner Display',shop:'Recovery Shop',username:'private-login',password:'1234'}))await page.locator('#site-auth-form [name='+name+']').fill(value);
 await page.locator('[data-action="site:setup"]').click();await page.locator('.nav').waitFor();
 await page.waitForFunction(()=>!globalThis.karnaPersistenceBusy());
 await page.evaluate(async()=>{
  const {ShopDatabase,passwordDigest}=await import('/database.js'),db=await new ShopDatabase().open(),owner=(await db.all('users'))[0];
  await db.put('users',{...owner,id:'second-local-owner',name:'Second Display',username:'second-private',password:await passwordDigest('5678')});
  await db.put('users',{...owner,id:'inactive-worker',name:'Inactive Worker',username:'occupied',role:'sales',active:false,password:await passwordDigest('9090')});db.db.close();sessionStorage.clear();
 });
 await page.reload();await page.locator('[data-action="site:login"]').waitFor();
 // The native journal retains registration across launches; model that durable context
 // without depending on the foreground registration timer firing before the test click.
 native.context=await page.evaluate(async()=>{const {ShopDatabase}=await import('/database.js'),db=await new ShopDatabase().open(),shop=await db.get('snapshots','shop'),users=await db.all('users');db.db.close();return {shopId:shop.state.originId,owners:users.filter(u=>u.role==='owner'&&u.active!==false).map(u=>({id:u.id,name:u.name,role:'owner'}))}});
 return {context,page,native};
}
async function open(f){await f.page.locator('[data-owner-recovery]').click();await panel(f.page).waitFor();await panel(f.page).locator('select').waitFor()}
async function approve(f,ownerId){await open(f);if(ownerId)await panel(f.page).locator('select').selectOption(ownerId);await panel(f.page).locator('.recovery-actions > button').click();await input(f.page,'username').waitFor()}
async function credentials(f,username='new-login',password='4321',confirm=password){await input(f.page,'username').fill(username);await input(f.page,'password').fill(password);await input(f.page,'confirm').fill(confirm)}
async function complete(f){await save(f.page).click();await input(f.page,'recoveredUsername').waitFor()}
async function login(page,username,password){await panel(page).locator('header button').click();await page.locator('#site-auth-form [name=username]').fill(username);await page.locator('#site-auth-form [name=password]').fill(password);await page.locator('[data-action="site:login"]').click();}
async function noOverflow(page){assert(await page.evaluate(()=>{const p=document.querySelector('.owner-recovery-panel'),r=p.getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth+1&&r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1}),'Recovery panel exceeds the viewport')}
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:process.env.PLAYWRIGHT_USE_BUNDLED==='1'?{}:{channel:'chrome'})});
 for(const [lang,width]of [['ar',360],['ar',393],['fr',360],['fr',393]])await check(`approved username form preserves ${lang} layout at ${width}px without disclosure before approval`,async()=>{
  const f=await fixture(lang,width);try{
   await open(f);assert.equal(await input(f.page,'username').count(),0);assert(!/private-login|second-private/.test(await panel(f.page).innerText()));
   const optionTexts=await panel(f.page).locator('option').allTextContents();assert.deepEqual(optionTexts.sort(),['Owner Display','Second Display'].sort());
   await panel(f.page).locator('.recovery-actions > button').click();await input(f.page,'username').waitFor();assert.equal(await input(f.page,'username').inputValue(),'private-login');
   assert.equal(await f.page.locator('.owner-recovery-overlay').getAttribute('dir'),lang==='ar'?'rtl':'ltr');assert.equal(await panel(f.page).locator('form input').count(),3);
   assert.equal(await input(f.page,'username').getAttribute('autocomplete'),'username');assert.equal(await input(f.page,'username').getAttribute('autocapitalize'),'none');assert.equal(await input(f.page,'username').getAttribute('spellcheck'),'false');
   assert.equal(await input(f.page,'password').getAttribute('autocomplete'),'new-password');
   assert(f.native.context.owners.every(owner=>Object.keys(owner).sort().join(',')==='id,name,role'));
   if(lang==='fr')assert(!/[\u0600-\u06ff]/.test(await panel(f.page).innerText()),'French recovery contains Arabic system labels');
   await noOverflow(f.page);await mkdir('candidate-proof',{recursive:true});await f.page.screenshot({path:`candidate-proof/owner-recovery-ux-${lang}-${width}.png`});
  }finally{await f.context.close()}
 });
 await check('waiting, rejected, expired and used requests never reveal login names',async()=>{
  for(const reply of ['waiting','rejected','expired','used']){const f=await fixture();try{f.native.response=reply;await open(f);await panel(f.page).locator('.recovery-actions > button').click();await status(f.page).filter({hasText:reply==='waiting'?'ينتظر':reply==='rejected'?'رفضت':'انتهى'}).waitFor();assert.equal(await input(f.page,'username').count(),0);assert(!/private-login|second-private/.test(await panel(f.page).innerText()));assert.equal(f.native.prepares,0)}finally{await f.context.close()}}
 });
 await check('selected approved owner changes only its login credentials and can log in immediately',async()=>{
  const f=await fixture();try{
   const before=await stored(f.page);await approve(f,'second-local-owner');assert.equal(await input(f.page,'username').inputValue(),'second-private');await credentials(f,'  Second-NEW  ');await complete(f);
   assert.equal(await input(f.page,'recoveredUsername').inputValue(),'second-new');const after=await stored(f.page),a=after.users.find(u=>u.id==='second-local-owner'),b=before.users.find(u=>u.id===a.id);
   for(const key of ['id','name','role','active','capabilities'])assert.deepEqual(a[key],b[key]);assert.equal(a.username,'second-new');assert.deepEqual(after.users.find(u=>u.username==='private-login'),before.users.find(u=>u.username==='private-login'));assert.deepEqual(after.business,before.business);assert.equal(f.native.claims,1);assert.equal(f.native.finishes,1);
   assert(!f.native.calls.filter(c=>['register','register-now','request','poll'].includes(c.command)).some(c=>String(c.value).includes('second-new')),'Login username leaked into registration/approval requests');
   await login(f.page,'second-new','4321');await f.page.locator('.nav').waitFor();
  }finally{await f.context.close()}
 });
 await check('approved cold resume resolves exact owner without relying on a picker selection',async()=>{
  const f=await fixture();try{f.native.ownerId='second-local-owner';f.native.resumeApproved=true;await f.page.locator('[data-owner-recovery]').click();await input(f.page,'username').waitFor();assert.equal(await panel(f.page).locator('select').count(),0);assert.equal(await input(f.page,'username').inputValue(),'second-private');assert.equal(f.native.calls.filter(c=>c.command==='request').length,0)}finally{await f.context.close()}
 });
 await check('missing or mismatched approved scope fails closed without disclosing any username',async()=>{
  for(const override of [{overrideOwner:'missing-owner'},{overrideOwner:'inactive-worker'},{overrideShop:'another-shop'},{overrideOwner:''}]){const f=await fixture();try{Object.assign(f.native,override);await open(f);await panel(f.page).locator('.recovery-actions > button').click();await status(f.page).filter({hasText:'مطابقة'}).waitFor();assert.equal(await input(f.page,'username').count(),0);assert(!/private-login|second-private/.test(await panel(f.page).innerText()));assert.equal(f.native.prepares,0)}finally{await f.context.close()}}
 });
 await check('blank, inactive-user duplicate and password mismatch stay editable without claiming approval',async()=>{
  const f=await fixture();try{
   await approve(f);await credentials(f,'   ');await save(f.page).click();await status(f.page).filter({hasText:'أدخل اسم المستخدم'}).waitFor();assert.equal(f.native.prepares,0);
   await credentials(f,' OCCUPIED ');await save(f.page).click();await status(f.page).filter({hasText:'لحساب آخر'}).waitFor();assert.equal(await input(f.page,'password').inputValue(),'4321');assert.equal(f.native.prepares,0);
   await credentials(f,'new-login','4321','9999');await save(f.page).click();await status(f.page).filter({hasText:'متطابقتين'}).waitFor();assert.equal(f.native.prepares,0);
   await credentials(f,'  أحمد  ');await complete(f);assert.equal(await input(f.page,'recoveredUsername').inputValue(),'أحمد');assert.equal(f.native.claims,1);
  }finally{await f.context.close()}
 });
 await check('atomic username collision after local claim keeps approval retryable with the identical intent',async()=>{
  const f=await fixture();try{
   await approve(f);await credentials(f,'race-login');await f.page.evaluate(()=>{globalThis.__beforeRecoveryPrepare=async()=>{const {ShopDatabase}=await import('/database.js'),db=await new ShopDatabase().open(),other=(await db.all('users')).find(u=>u.id==='inactive-worker');await db.put('users',{...other,username:'race-login'});db.db.close()}});
   await save(f.page).click();await status(f.page).filter({hasText:'لحساب آخر'}).waitFor();assert.equal(f.native.claims,1);assert.equal(f.native.finishes,0);assert.equal(await input(f.page,'username').inputValue(),'race-login');assert.equal(await input(f.page,'password').inputValue(),'4321');
   await input(f.page,'username').fill('race-resolved');await complete(f);assert.equal(f.native.prepares,2);assert.equal(f.native.claims,1);assert.equal(await input(f.page,'recoveredUsername').inputValue(),'race-resolved');
  }finally{await f.context.close()}
 });
 await check('failed durable write shows local save error, retains credentials, and retries without a new claim',async()=>{
  const f=await fixture();try{
   const before=await stored(f.page);await approve(f);await credentials(f);await f.page.evaluate(()=>{const original=IDBObjectStore.prototype.put;globalThis.__restoreRecoveryPut=()=>{IDBObjectStore.prototype.put=original};IDBObjectStore.prototype.put=function(value,...args){if(this.name==='meta'&&String(value?.id).startsWith('owner-recovery:'))throw new DOMException('Synthetic quota failure','QuotaExceededError');return original.call(this,value,...args)}});
   await save(f.page).click();await status(f.page).filter({hasText:'تعذّر حفظ'}).waitFor();await f.page.evaluate(()=>globalThis.__restoreRecoveryPut());const failed=await stored(f.page);assert.deepEqual(failed.users,before.users);assert.deepEqual(failed.shop,before.shop);assert.deepEqual(failed.meta,before.meta);assert.equal(await input(f.page,'password').inputValue(),'4321');
   await complete(f);assert.equal(f.native.claims,1);assert.equal(f.native.prepares,2);assert.equal(await input(f.page,'recoveredUsername').inputValue(),'new-login');
  }finally{await f.context.close()}
 });
 await check('lost finish response cannot rename or reset the account twice on retry',async()=>{
  const f=await fixture();try{
   await approve(f);await credentials(f,'committed-login');f.native.failFinish=true;await save(f.page).click();await status(f.page).filter({hasText:'تعذّر الاتصال'}).waitFor();const committed=await stored(f.page);assert.equal(committed.users.find(u=>u.id===f.native.ownerId).username,'committed-login');
   await credentials(f,'must-not-replace','9876');await complete(f);const after=await stored(f.page);assert.deepEqual(after.users,committed.users);assert.deepEqual(after.shop,committed.shop);assert.equal(await input(f.page,'recoveredUsername').inputValue(),'committed-login');assert.equal(f.native.claims,1);
  }finally{await f.context.close()}
 });
 await check('existing password-only prepared recovery resumes without changing the login name',async()=>{
  const f=await fixture();try{
   const before=await stored(f.page),owner=before.users.find(u=>u.username==='private-login');f.native.ownerId=owner.id;f.native.prepared={stage:'prepared',shopId:before.shop.state.originId,ownerId:owner.id,requestId:'old-request',grantId:'old-grant',intentId:'old-intent',password:await f.page.evaluate(async()=>{const {passwordDigest}=await import('/database.js');return passwordDigest('5555')})};
   await f.page.locator('[data-owner-recovery]').click();await input(f.page,'recoveredUsername').waitFor();assert.equal(await input(f.page,'recoveredUsername').inputValue(),'private-login');const after=await stored(f.page);assert.deepEqual(after.business,before.business);assert.equal(after.users.find(u=>u.id===owner.id).username,owner.username);assert.equal(f.native.prepares,0);await login(f.page,'private-login','5555');await f.page.locator('.nav').waitFor();
  }finally{await f.context.close()}
 });
 await check('prepared recovery collision after reopening renders the authorized correction form',async()=>{
  const f=await fixture();try{
   const before=await stored(f.page),owner=before.users.find(u=>u.username==='private-login');f.native.ownerId=owner.id;f.native.prepared={stage:'prepared',shopId:before.shop.state.originId,ownerId:owner.id,requestId:'resumed-request',grantId:f.native.grantId,intentId:f.native.intentId,username:'occupied',password:await f.page.evaluate(async()=>{const {passwordDigest}=await import('/database.js');return passwordDigest('5555')})};
   await f.page.locator('[data-owner-recovery]').click();await input(f.page,'username').waitFor();await status(f.page).filter({hasText:'لحساب آخر'}).waitFor();assert.equal(await input(f.page,'username').inputValue(),'occupied');assert.equal(await input(f.page,'password').inputValue(),'');await credentials(f,'resumed-login','5555');await complete(f);assert.equal(await input(f.page,'recoveredUsername').inputValue(),'resumed-login');
  }finally{await f.context.close()}
 });
 await check('temporary local write failure on cold resume keeps an authorized save form for retry',async()=>{
  const f=await fixture();try{
   const before=await stored(f.page),owner=before.users.find(u=>u.username==='private-login');f.native.ownerId=owner.id;f.native.prepared={stage:'prepared',shopId:before.shop.state.originId,ownerId:owner.id,requestId:'retry-request',grantId:f.native.grantId,intentId:f.native.intentId,username:'resume-retry',password:await f.page.evaluate(async()=>{const {passwordDigest}=await import('/database.js');return passwordDigest('5555')})};
   await f.page.evaluate(()=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,...args){if(this.name==='meta'&&String(value?.id).startsWith('owner-recovery:')){IDBObjectStore.prototype.put=original;throw new DOMException('Synthetic interrupted storage','QuotaExceededError')}return original.call(this,value,...args)}});
   await f.page.locator('[data-owner-recovery]').click();await input(f.page,'username').waitFor();await status(f.page).filter({hasText:'تعذّر حفظ'}).waitFor();assert.equal(await save(f.page).isEnabled(),true);assert.equal(await input(f.page,'username').inputValue(),'resume-retry');assert.deepEqual((await stored(f.page)).users,before.users);await credentials(f,'resume-retry','5555');await complete(f);assert.equal(await input(f.page,'recoveredUsername').inputValue(),'resume-retry');
  }finally{await f.context.close()}
 });
 await check('cold applied recovery shows username only with matching durable receipt and native completed scope',async()=>{
  const f=await fixture();try{
   const prepared=await f.page.evaluate(async()=>{const {ShopDatabase,passwordDigest}=await import('/database.js'),db=await new ShopDatabase().open(),shop=await db.get('snapshots','shop'),owner=(await db.all('users')).find(u=>u.username==='private-login'),p={stage:'prepared',shopId:shop.state.originId,ownerId:owner.id,requestId:'cold-request',grantId:'cold-grant',intentId:'cold-intent',username:'cold-restored-login',password:await passwordDigest('5555')};await db.recoverOwner(p);db.db.close();return p});
   f.native.appliedComplete=Object.fromEntries(['shopId','ownerId','requestId','grantId','intentId'].map(k=>[k,prepared[k]]));f.native.appliedComplete.stage='complete';
   await f.page.reload();await f.page.locator('[data-action="site:login"]').waitFor();assert.equal(await f.page.locator('[name=recoveredUsername]').count(),0);await f.page.locator('[data-owner-recovery]').click();await input(f.page,'recoveredUsername').waitFor();assert.equal(await input(f.page,'recoveredUsername').inputValue(),'cold-restored-login');assert.equal(await input(f.page,'username').count(),0);assert.equal(f.native.prepares,0);
  }finally{await f.context.close()}
 });
 await check('completed scope with no receipt or mismatched receipt never reveals local username',async()=>{
  for(const key of ['ownerId','shopId','requestId','grantId','intentId']){const f=await fixture();try{
   const before=await stored(f.page),owner=before.users.find(u=>u.username==='private-login'),scope={shopId:before.shop.state.originId,ownerId:owner.id,requestId:'receipt-request',grantId:'receipt-grant',intentId:'receipt-intent'};
   await f.page.evaluate(async scope=>{const {ShopDatabase}=await import('/database.js'),db=await new ShopDatabase().open();await db.put('meta',{id:'owner-recovery:'+scope.grantId,shopId:scope.shopId,ownerId:scope.ownerId,requestId:scope.requestId,intentId:scope.intentId});db.db.close()},scope);
   f.native.appliedComplete={...scope,stage:'complete',[key]:'wrong-completed-value'};await f.page.locator('[data-owner-recovery]').click();await status(f.page).filter({hasText:'مطابقة إيصال'}).waitFor();assert.equal(await input(f.page,'recoveredUsername').count(),0);assert.equal(await input(f.page,'username').count(),0);assert(!/private-login|second-private/.test(await panel(f.page).innerText()));
  }finally{await f.context.close()}}
 });
 await check('legacy unscoped completed journal does not guess or expose an account username',async()=>{
  const f=await fixture();try{f.native.appliedComplete={stage:'complete'};await f.page.locator('[data-owner-recovery]').click();await status(f.page).filter({hasText:'حُفظت'}).waitFor();assert.equal(await input(f.page,'recoveredUsername').count(),0);assert.equal(await input(f.page,'username').count(),0);assert(!/private-login|second-private/.test(await panel(f.page).innerText()))}finally{await f.context.close()}
 });
 await check('short-screen and keyboard-height changes keep entered values and allow reaching save',async()=>{
  const f=await fixture('fr',360,520);try{
   await approve(f);await credentials(f,'typed-before-keyboard');await f.page.setViewportSize({width:360,height:360});await input(f.page,'confirm').focus();await f.page.evaluate(()=>{dispatchEvent(new Event('offline'));dispatchEvent(new Event('online'))});assert.equal(await input(f.page,'username').inputValue(),'typed-before-keyboard');assert.equal(await input(f.page,'confirm').inputValue(),'4321');await noOverflow(f.page);
   await save(f.page).scrollIntoViewIfNeeded();const bounds=await save(f.page).boundingBox();assert(bounds.y>=0&&bounds.y+bounds.height<=360);await complete(f);assert.equal(await input(f.page,'recoveredUsername').inputValue(),'typed-before-keyboard');
  }finally{await f.context.close()}
 });
}finally{
 await browser?.close();await new Promise(resolve=>server.close(resolve));await mkdir('candidate-proof',{recursive:true});const proof={passed:cases.every(c=>c.passed),syntheticOnly:true,widths:[360,393],languages:['ar','fr'],cases};await writeFile('candidate-proof/owner-recovery-ux-proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof,null,2));if(!proof.passed)process.exitCode=1;
}
