import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);let chromium;
for(const name of [process.env.PLAYWRIGHT_MODULE,'playwright',fileURLToPath(new URL('../../Contatools-source/node_modules/playwright',import.meta.url))].filter(Boolean)){try{({chromium}=require(name));break}catch{}}
if(!chromium)throw Error('Playwright required');
const root=fileURLToPath(new URL('../approved-runtime/',import.meta.url)),results=[];
const server=createServer(async(req,res)=>{try{const requested=new URL(req.url,'http://local.invalid').pathname,file=path.resolve(root,'.'+(requested==='/'?'/index.html':requested));if(!file.startsWith(root))throw Error();const bytes=await readFile(file);res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(bytes)}catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
const check=async(name,fn)=>{try{await fn();results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.message});console.error('FAIL '+name+'\n'+error.stack)}};
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:process.env.PLAYWRIGHT_USE_BUNDLED==='1'?{}:{channel:'chrome'})});
 const origin='http://127.0.0.1:'+server.address().port;
 async function fixture(lang='ar'){
  const context=await browser.newContext({viewport:{width:393,height:851},serviceWorkers:'block'}),page=await context.newPage();
  const native={enabled:false,prepared:null,finished:false,prepares:0,declines:0,polls:0,forceOwner:null,expired:false,licenseReads:0,acks:0,ackPending:false,lostClaimOnce:false,awaiting:false};
  await page.exposeFunction('syntheticResetNative',async(command,payload)=>{(native.trace??=[]).push(command);
   if(command==='license'){native.licenseReads++;return {valid:true,license:{customerName:'مالك مصطنع',storeName:'محل مصطنع',type:'perpetual',licenseId:'synthetic-license'}}}
   if(command==='poll'){native.polls++;if(!native.enabled)return {stage:'none'};native.target={requestId:'synthetic-request',shopId:payload.shopId,ownerId:native.forceOwner||payload.ownerId,reason:lang==='fr'?'Repartir avec une comptabilité vide':'بداية جديدة بطلب صاحب المحل',expiresAt:Date.now()+(native.expired?-1000:3600000)};return {stage:'pending',request:native.target}}
   if(command==='resume-local')return native.finished?{stage:'complete',ackPending:native.ackPending}:native.awaiting?{stage:'awaiting-network'}:native.prepared?native.prepared:{stage:'none'};
   if(command==='resume'){native.awaiting=false;return native.prepared||{stage:'idle'}}
   if(command==='prepare'){if(native.failBeforePrepare)throw Error('Synthetic rejection before durable prepare');assert.equal(payload.accepted,true);native.prepares++;native.prepared={...native.target,stage:'prepared',grantId:'synthetic-grant',intentId:'synthetic-intent',accountingResetId:native.target.requestId};if(native.lostClaimOnce){native.lostClaimOnce=false;native.awaiting=true;throw Error('Synthetic lost claim response')}return native.prepared}
   if(command==='decline'){native.declines++;native.enabled=false;return {stage:'declined'}}
   if(command==='finish'){if(native.finishFailOnce){native.finishFailOnce=false;throw Error('Synthetic native journal failure')}native.finished=true;native.enabled=false;native.ackPending=true;return {stage:'complete',ackPending:true}}
   if(command==='ack'){native.acks++;native.ackPending=false;return {stage:'complete'}}
   return {stage:'none'};
  });
  await page.exposeFunction('syntheticResetStats',()=>({acks:native.acks,prepares:native.prepares}));
  await page.addInitScript(()=>{window.NativeFiles={licenseStatus:()=>window.syntheticResetNative('license',{}),accountingReset:(command,payload)=>window.syntheticResetNative(command,payload)}});
  await page.goto(origin+'/?lang='+lang);await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');
  await page.locator('#site-auth-form [name=username]').fill('old-owner');await page.locator('#site-auth-form [name=password]').fill('1234');await page.locator('[data-action="site:setup"]').click();await page.locator('.nav').waitFor();
  await page.evaluate(async()=>{await act('go:inventory');await act('open:product')});
  for(const [name,value]of Object.entries({name:'منتج',price:'50',cost:'30'}))await page.locator('#sheet-form [name='+name+']').fill(value);
  await page.evaluate(()=>act('save-product'));
  return {context,page,native};
 }
 const enable=async fixture=>{fixture.native.enabled=true;await fixture.page.evaluate(()=>dispatchEvent(new Event('online')))};
 const dialog=page=>page.locator('[data-accounting-reset=review]');
 const stored=page=>page.evaluate(async()=>{const {ShopDatabase}=await import('/database.js'),d=await new ShopDatabase().open();return {snapshots:await d.all('snapshots'),users:await d.all('users'),meta:await d.all('meta')}});
 await check('receiving a signed request never wipes; refusal retains business data, credentials and activation',async()=>{
  const f=await fixture();try{const before=await stored(f.page);await enable(f);await dialog(f.page).waitFor();assert.equal(f.native.prepares,0);assert.deepEqual(await stored(f.page),before);await f.page.getByRole('button',{name:'رفض الطلب',exact:true}).click();await dialog(f.page).waitFor({state:'detached'});assert.equal(f.native.declines,1);assert.deepEqual(await stored(f.page),before);assert((await f.page.evaluate(()=>NativeFiles.licenseStatus())).valid)}finally{await f.context.close()}
 });
 await check('explicit owner consent clears local accounting and old snapshots, then recreates only username/PIN with the same activation/shop/owner',async()=>{
  const f=await fixture();try{
   const before=await stored(f.page),shopId=before.snapshots.find(x=>x.id==='shop').state.originId,ownerId=before.users[0].id;
   await f.page.evaluate(async()=>{const {ShopDatabase}=await import('/database.js'),d=await new ShopDatabase().open();await d.put('meta',{id:'safety-backup',backup:{secret:'old credentials'}});await d.put('snapshots',{id:'old-import',state:{secret:'old business'}});localStorage.setItem('alkarna-pos-draft:old','sensitive');localStorage.setItem('alkarna-workflow-draft:old:expense','sensitive');localStorage.setItem('alkarna-site-appearance','light')});
   await enable(f);await dialog(f.page).waitFor();const confirm=f.page.getByRole('button',{name:'مسح البيانات وبدء محاسبة جديدة',exact:true});assert.equal(await confirm.isEnabled(),false);await f.page.locator('[name=accountingResetConsent]').check();await confirm.click();await f.page.locator('[data-action="site:setup"]').waitFor();
   const blank=await stored(f.page);assert.equal(blank.users.length,0);assert.equal(blank.snapshots.length,1);const state=blank.snapshots[0].state;assert.equal(state.originId,shopId);assert.equal(state.records.length,0);assert.equal(state.products.length,0);assert.equal(state.parties.length,0);assert(state.accounts.every(a=>a.balance===0));assert(!blank.meta.some(x=>x.id==='safety-backup'||x.id.startsWith('session:')));assert.equal(blank.meta.find(x=>x.id==='accounting-reset-bootstrap').ownerId,ownerId);assert(f.native.finished);assert((await f.page.evaluate(()=>NativeFiles.licenseStatus())).valid);
   assert.deepEqual(await f.page.locator('#site-auth-form input').evaluateAll(inputs=>inputs.map(x=>x.name)),['username','password']);assert.equal(await f.page.evaluate(()=>Object.keys(localStorage).filter(k=>k.includes('draft')).length),0);
   await f.page.locator('#site-auth-form [name=username]').fill('fresh-owner');await f.page.locator('#site-auth-form [name=password]').fill('4321');await f.page.locator('[data-action="site:setup"]').click();await f.page.locator('.nav').waitFor();const fresh=await stored(f.page);assert.equal(fresh.users[0].id,ownerId);assert.equal(fresh.users[0].username,'fresh-owner');assert.equal(fresh.snapshots[0].state.originId,shopId);assert(!fresh.meta.some(x=>x.id==='accounting-reset-bootstrap'));assert.equal(fresh.snapshots[0].state.products.length,0);
   await f.page.evaluate(()=>sessionStorage.clear());await f.page.reload();await f.page.locator('[data-action="site:login"]').waitFor();await f.page.locator('#site-auth-form [name=username]').fill('fresh-owner');await f.page.locator('#site-auth-form [name=password]').fill('4321');await f.page.locator('[data-action="site:login"]').click();await f.page.locator('.nav').waitFor();assert.equal(f.native.prepares,1);
  }finally{await f.context.close()}
 });
 await check('request does not rebuild an unsaved product sheet or permit a worker to approve',async()=>{
  const f=await fixture();try{await f.page.evaluate(async()=>{await act('go:inventory');await act('open:product')});await f.page.locator('#sheet-form [name=name]').fill('مسودة غير محفوظة');await enable(f);await f.page.waitForFunction(()=>document.querySelector('#sheet-form [name=name]')?.value==='مسودة غير محفوظة');assert.equal(await dialog(f.page).count(),0);await f.page.evaluate(()=>act('close'));await f.page.locator('.sheet').waitFor({state:'detached'});await f.page.evaluate(()=>document.activeElement.blur());await f.page.evaluate(()=>dispatchEvent(new Event('online')));await dialog(f.page).waitFor();await f.page.getByRole('button',{name:'ليس الآن',exact:true}).click();await f.page.evaluate(()=>{actor={id:'worker',role:'sales'};dispatchEvent(new Event('online'))});assert.equal(await dialog(f.page).count(),0);assert.equal(f.native.prepares,0)}finally{await f.context.close()}
 });
 await check('wrong-owner and expired grants never present destructive confirmation',async()=>{
  const f=await fixture();try{f.native.forceOwner='another-owner';await enable(f);await f.page.waitForFunction(()=>true);await new Promise(resolve=>setTimeout(resolve,1300));assert.equal(await dialog(f.page).count(),0);f.native.forceOwner=null;f.native.expired=true;await f.page.evaluate(()=>dispatchEvent(new Event('online')));await new Promise(resolve=>setTimeout(resolve,1300));assert.equal(await dialog(f.page).count(),0);assert.equal(f.native.prepares,0)}finally{await f.context.close()}
 });
 await check('atomic reset abort, replay, stale writers and stale password-recovery grant preserve the new ledger',async()=>{
  const f=await fixture();try{
   const result=await f.page.evaluate(async()=>{
    const {ShopDatabase}=await import('/database.js'),d=await new ShopDatabase().open(),old=await d.load(),users=await d.all('users'),snapshot=async()=>JSON.stringify([await d.all('snapshots'),await d.all('users'),await d.all('meta')]);
    const p={stage:'prepared',shopId:old.originId,ownerId:users[0].id,requestId:'atomic-request',grantId:'atomic-grant',intentId:'atomic-intent',accountingResetId:'atomic-request'},blank=structuredClone(old);blank.products=[];blank.parties=[];blank.records=[];blank.users=[];blank.categories=[];blank.stockEvents=[];blank.accounts.forEach(a=>a.balance=0);blank.opening={stocks:{},parties:{},accounts:Object.fromEntries(blank.accounts.map(a=>[a.id,0]))};
    const before=await snapshot(),nativePut=IDBObjectStore.prototype.put;let rejected=false;
    IDBObjectStore.prototype.put=function(value,...rest){if(this.name==='meta'&&value.id==='accounting-reset-bootstrap')throw new DOMException('Synthetic quota','QuotaExceededError');return nativePut.call(this,value,...rest)};
    try{await d.resetAccounting(p,blank)}catch{rejected=true}finally{IDBObjectStore.prototype.put=nativePut}
    if(!rejected||await snapshot()!==before)throw Error('Destructive reset was not atomic');
    const other=await new ShopDatabase().open();await other.load();const first=await d.resetAccounting(p,blank);if(first.alreadyApplied)throw Error('First reset replayed');
    let stale=false;try{await other.save(old)}catch{stale=true}if(!stale)throw Error('Stale writer resurrected old data');
    const bootstrap=await d.accountingResetBootstrap();if(bootstrap.ownerId!==p.ownerId)throw Error('Lost owner identity');await d.replace(blank,users);const fresh=await d.load();fresh.products=[...old.products];await d.save(fresh);const after=await snapshot();
    const replay=await d.resetAccounting(p,blank);if(!replay.alreadyApplied||after!==await snapshot())throw Error('Replayed reset wiped new data');
    let oldRecovery=false;try{await d.recoverOwner({stage:'prepared',shopId:p.shopId,ownerId:p.ownerId,requestId:'old-password-request',grantId:'old-password-grant',intentId:'old-password-intent',password:users[0].password})}catch{oldRecovery=true}if(!oldRecovery||after!==await snapshot())throw Error('Old password grant survived reset');
    return {atomic:true,replay:true,stale:true,oldRecovery:true};
   });assert.deepEqual(result,{atomic:true,replay:true,stale:true,oldRecovery:true});
  }finally{await f.context.close()}
 });
 await check('French consent is LTR, explicit, readable and bounded at393px',async()=>{
  const f=await fixture('fr');try{await enable(f);await dialog(f.page).waitFor();assert.equal(await f.page.locator('.owner-recovery-overlay').getAttribute('dir'),'ltr');assert.match(await dialog(f.page).innerText(),/La licence, sa durée/);const bounds=await dialog(f.page).boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=394);const checkbox=await f.page.locator('[name=accountingResetConsent]').boundingBox();assert(checkbox.width>=18&&checkbox.width<=24&&checkbox.height>=18&&checkbox.height<=24,JSON.stringify(checkbox));await mkdir('candidate-proof',{recursive:true});await f.page.screenshot({path:'candidate-proof/accounting-reset-fr-393.png'});assert.equal(f.native.prepares,0)}finally{await f.context.close()}
 });
 await check('lost claim response survives reload, blocks new sales and completes ACK even before a new user exists',async()=>{
  const f=await fixture();try{f.native.lostClaimOnce=true;await enable(f);await dialog(f.page).waitFor();await f.page.locator('[name=accountingResetConsent]').check();await f.page.getByRole('button',{name:'مسح البيانات وبدء محاسبة جديدة',exact:true}).click();await f.page.locator('[data-accounting-reset=progress]').waitFor();assert((await stored(f.page)).users.length>0);await f.page.reload();await f.page.locator('[data-action="site:setup"]').waitFor();await new Promise((resolve,reject)=>{const deadline=Date.now()+10000;const timer=setInterval(()=>{if(f.native.acks===1&&!f.native.ackPending){clearInterval(timer);resolve()}else if(Date.now()>deadline){clearInterval(timer);reject(Error('Native ACK missing: '+JSON.stringify(f.native.trace)))}},50)});assert.equal(f.native.prepares,1);assert.equal((await stored(f.page)).users.length,0);assert.equal(f.native.ackPending,false,JSON.stringify(f.native.trace))}finally{await f.context.close()}
 });
 await check('prepare rejection before any durable intent releases the progress lock without deleting data',async()=>{
  const f=await fixture();try{f.native.failBeforePrepare=true;await enable(f);await dialog(f.page).waitFor();const before=await stored(f.page);await f.page.locator('[name=accountingResetConsent]').check();await f.page.getByRole('button',{name:'مسح البيانات وبدء محاسبة جديدة',exact:true}).click();await f.page.locator('[data-accounting-reset=progress]').waitFor();await f.page.locator('[data-accounting-reset=progress]').waitFor({state:'detached'});assert.deepEqual(await stored(f.page),before);assert.equal(await f.page.evaluate(()=>karnaPersistenceBusy()),false);assert.equal(f.native.prepares,0)}finally{await f.context.close()}
 });
 await check('post-commit draft or native-receipt failure blocks stale memory and retries without resurrecting accounting',async()=>{
  for(const failure of ['draft','receipt']){
   const f=await fixture();try{
    if(failure==='receipt')f.native.finishFailOnce=true;
    else await f.page.evaluate(()=>{localStorage.setItem('alkarna-sensitive-draft','old');const remove=Storage.prototype.removeItem;let failed=false;Storage.prototype.removeItem=function(key){if(key==='alkarna-sensitive-draft'&&!failed){failed=true;throw Error('Synthetic draft cleanup failure')}return remove.call(this,key)}});
    await enable(f);await dialog(f.page).waitFor();await f.page.locator('[name=accountingResetConsent]').check();await f.page.getByRole('button',{name:'مسح البيانات وبدء محاسبة جديدة',exact:true}).click();await f.page.locator('[data-accounting-reset=progress]').waitFor();assert.equal(await f.page.evaluate(()=>karnaPersistenceBusy()),true);assert.equal((await stored(f.page)).users.length,0);
    await f.page.evaluate(()=>act('go:home'));assert.equal((await stored(f.page)).snapshots.find(x=>x.id==='shop').state.products.length,0);
    await f.page.getByRole('button',{name:'إعادة المحاولة',exact:true}).click();await f.page.locator('[data-action="site:setup"]').waitFor();assert.equal((await stored(f.page)).users.length,0);assert.equal((await stored(f.page)).snapshots.find(x=>x.id==='shop').state.products.length,0);assert.equal(await f.page.evaluate(()=>Object.keys(localStorage).filter(x=>x.includes('draft')).length),0);assert(f.native.finished);
   }finally{await f.context.close()}
  }
 });
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
console.log(JSON.stringify({passed:results.filter(x=>x.passed).length,total:results.length,results},null,2));if(results.some(x=>!x.passed))process.exitCode=1;
