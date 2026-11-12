import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {emptyState,domainApply,commandHash,makeCommand,canonical} from '../approved-runtime/platform/shared/accounting-domain.mjs';
const require=createRequire(import.meta.url);let chromium;
for(const candidate of [process.env.PLAYWRIGHT_MODULE,'playwright',fileURLToPath(new URL('../../Contatools/node_modules/playwright',import.meta.url)),fileURLToPath(new URL('../../../Contatools-source/node_modules/playwright',import.meta.url))].filter(Boolean))try{({chromium}=require(candidate));break}catch{}
if(!chromium)throw Error('Playwright is required for disposable Android access UX tests');
const runtime=fileURLToPath(new URL('../approved-runtime/',import.meta.url)),fixtures=new Map();let sequence=0;
const c={organization:{id:'org-synthetic',name:'مؤسسة اختبار'},member:{id:'member-synthetic',name:'موظف اختبار',username:'test@example.invalid',role:'org-admin',capabilities:['*'],branchIds:['branch-synthetic'],membershipVersion:1},branches:[{id:'branch-synthetic',name:'الفرع',originId:'origin-synthetic'}]};
const binding={phone:'23456789',localOwnerId:'owner-synthetic',localShopId:'shop-synthetic',ownerName:'مالك اختبار',shopName:'محل اختبار'};
function fixture(mode='online'){return {mode,context:structuredClone(c),state:emptyState({originId:'origin-synthetic',organizationId:c.organization.id,branchId:c.branches[0].id}),cursor:0,calls:[],pushes:[],network:true,failRead:false,loseResponse:false,dropCompletedResponse:false,ackFails:false,pending:null,completed:null,approval:false,reject:false,credential:true};}
function dispatch(f,command,payload){
 f.calls.push({command,payload});const ctx=f.context;
 if(command==='state')return {mode:f.mode,legacyAvailable:f.localValid!==false,deviceId:'SYNTHETIC',...(f.boundRecord?{offline:structuredClone(f.boundRecord)}:f.mode==='pending'?{offline:{phone:binding.phone,status:'pending'}}:{})};
 if(command==='bootstrap')return f.mode==='online'?{mode:'online',context:ctx,connected:true,pendingOnline:!!(f.pending||f.completed),pendingBranchId:f.completed?.payload.branchId||f.pending?.branchId}:{mode:'offline',binding,...(f.credential?{credential:{phone:binding.phone,code:'synthetic-code'}}:{})};
 if(command==='bootstrap-complete'){if(f.failCompleteOnce){f.failCompleteOnce=false;f.boundRecord={phone:binding.phone,bound:true,status:'active',setupRequired:true,renewalAvailable:false};throw Error('SYNTHETIC_COMPLETE_WRITE_FAILURE');}f.credential=false;if(f.boundRecord)f.boundRecord.setupRequired=false;return {completed:true};}
 if(command==='login')return f.boundRecord&&payload.identifier===binding.phone?{stage:'active',mode:'offline'}:f.mode==='pending'?{stage:f.approval?'active':'pending',mode:'offline',phone:payload.identifier,activationRequired:true}:{stage:'active',mode:'online'};
 if(command==='offline-status'){if(f.statusError)throw Error(f.statusError);return {stage:f.approval?'active':'pending',phone:binding.phone};}
 if(command==='offline-activate')return {stage:'active',mode:'offline'};
 if(command==='offline-current'){if(f.statusError)throw Error(f.statusError);return structuredClone(f.currentRecord||f.boundRecord);}
 if(command==='offline-renew'){if(f.renewalResult){f.boundRecord=structuredClone(f.renewalResult);f.localValid=true;return structuredClone(f.renewalResult);}return {stage:'active',mode:'legacy'};}
 if(command==='legacy')return {stage:'active',mode:'legacy'};
 if(command==='logout')return {signedOut:true};
 if(!f.network)throw Error('NETWORK');
 if(command==='online-status')return {...ctx,connected:true};
 if(command==='online-pending')return f.completed?{pending:true,operation:'sync.push',payload:f.completed.payload,completed:true,result:f.completed.result}:f.pending?{pending:true,operation:'sync.push',payload:f.pending}:{pending:false};
 if(command==='online-ack'){if(f.ackFails)throw Error('NETWORK');assert.deepEqual(payload.operationIds,f.completed?.payload.commands.map(c=>c.operationId));f.completed=null;return {acknowledged:true};}
 assert.equal(command,'online-call');
 if(payload.operation==='online.bootstrap'){if(f.failRead)throw Error('NETWORK');return {mode:'online',organizationId:ctx.organization.id,branchId:payload.payload.branchId,epoch:1,cursor:f.cursor,state:f.state};}
 if(payload.operation==='sync.status')return {epoch:1,cursor:f.cursor,needsSettlement:f.reject?1:0};
 assert.equal(payload.operation,'sync.push');const push=payload.payload;if(f.completed){assert.equal(canonical(push),canonical(f.completed.payload));return f.completed.result;}f.pushes.push(structuredClone(push));f.pending=structuredClone(push);
 if(f.loseResponse)throw Error('NETWORK');
 const receipts=push.commands.map(command=>{if(!f.reject){f.state=domainApply(f.state,command,{organizationId:ctx.organization.id,branchId:push.branchId,memberId:ctx.member.id,epoch:1,role:'org-admin',capabilities:['*'],branchIds:ctx.member.branchIds}).state;f.cursor++;}return {operationId:command.operationId,hash:commandHash(command),status:f.reject?'needs-settlement':'accepted',...(f.reject?{error:{code:'VERSION_CONFLICT'}}:{})};});
 const result={epoch:1,cursor:f.cursor,receipts};f.pending=null;f.completed={payload:structuredClone(push),result:structuredClone(result)};if(f.dropCompletedResponse)throw Error('NETWORK');return result;
}
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://fixture.invalid');
  if(url.pathname==='/native'){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const {command,payload}=JSON.parse(Buffer.concat(chunks)),f=fixtures.get(url.searchParams.get('id'));let result;
   try{result=dispatch(f,command,payload)}catch(error){result={error:error.message,code:error.message};}
   res.setHeader('content-type','application/json');res.end(JSON.stringify(result));return;
  }
  const relative=url.pathname.slice(1)||'index.html',filename=path.resolve(runtime,relative);if(!filename.startsWith(runtime))throw Error('Invalid path');
  const bytes=await readFile(filename).catch(error=>/^assets\/StitchArabic(?:Bold)?\.ttf$/.test(relative)?readFile(path.resolve(runtime,'../assets/fonts',path.basename(relative))):Promise.reject(error));
  const extension=path.extname(filename);res.setHeader('content-type',['.js','.mjs'].includes(extension)?'text/javascript':extension==='.css'?'text/css':extension==='.html'?'text/html':'application/octet-stream');res.end(bytes);
 }catch(error){res.writeHead(500).end(error.message)}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;let browser,failed=0;
async function localOnly(context){await context.route('**/*',async route=>{
 const url=new URL(route.request().url());assert.equal(url.origin,origin,'Disposable browser fixtures must never contact a remote service');
 if(url.pathname==='/native'){const {command,payload}=route.request().postDataJSON(),f=fixtures.get(url.searchParams.get('id'));let result;try{result=dispatch(f,command,payload)}catch(error){result={error:error.message,code:error.message}}return route.fulfill({json:result});}
 const relative=url.pathname.slice(1)||'index.html',filename=path.resolve(runtime,relative);assert(filename.startsWith(runtime));
 let bytes;try{bytes=await readFile(filename).catch(error=>/^assets\/StitchArabic(?:Bold)?\.ttf$/.test(relative)?readFile(path.resolve(runtime,'../assets/fonts',path.basename(relative))):Promise.reject(error))}catch{return route.fulfill({status:404,body:''})}
 return route.fulfill({body:bytes,contentType:['.js','.mjs'].includes(path.extname(filename))?'text/javascript':path.extname(filename)==='.css'?'text/css':path.extname(filename)==='.html'?'text/html':'application/octet-stream'});
});}
async function open(f,entry='index.html',language='ar',blockLocal=false,viewport={width:360,height:700},clock=false){
 const id=String(++sequence);fixtures.set(id,f);const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('FIXTURE PAGE ERROR '+e.message)});
 await localOnly(context);
 if(clock)await page.clock.install();
 await context.addInitScript(({id,language,blockLocal})=>{
  localStorage.setItem('alkarna-site-language',language);window.__accessEvents=[];
  const invoke=async(command,payload={})=>{const result=await(await fetch('/native?id='+id,{method:'POST',body:JSON.stringify({command,payload})})).json();if(result.error)throw Object.assign(Error(result.error),{code:result.code});return result;};
  window.NativeFiles={accountAccess:invoke,licenseStatus:async()=>({valid:true,license:{customerName:'مالك اختبار',storeName:'محل اختبار'}})};
  window.NativeHost={licenseAllowed:()=>true,language(){},theme(){},openPrivacy(){window.__accessEvents.push('privacy')},openActivation(){window.__accessEvents.push('activation')},openAccountAccess(){window.__accessEvents.push('entry')},accountContinue(){window.__accessEvents.push('continue')},accountAccess(id,command,json){invoke(command,JSON.parse(json)).then(value=>window.__nativeResult(id,value),e=>window.__nativeResult(id,{error:e.message,code:e.code}));}};
  const originalOpen=indexedDB.open.bind(indexedDB);window.__localOpens=0;indexedDB.open=(...args)=>{window.__localOpens++;if(blockLocal)throw Error('ONLINE_LOCAL_DB_OPENED');return originalOpen(...args)};
 },{id,language,blockLocal});
 await page.goto(origin+'/'+entry);return {context,page,errors,id};
}
async function action(page,value){await page.evaluate(value=>act(value),value);await page.waitForFunction(()=>!karnaPersistenceBusy());}
async function check(name,fn){try{await fn();console.log('PASS '+name)}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack)}}
async function proof(page,name){if(process.env.ACCESS_PROOF_DIR){await mkdir(process.env.ACCESS_PROOF_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.ACCESS_PROOF_DIR,name+'.png'),fullPage:true})}}
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:process.env.PLAYWRIGHT_USE_BUNDLED==='1'?{}:{channel:'chrome'})});
 await check('online boot never opens the legacy database and disconnect masks a preserved editor',async()=>{
  const f=fixture(),x=await open(f,'index.html','ar',true);try{
   await x.page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');await x.page.locator('.nav').waitFor();assert.deepEqual(x.errors,[]);assert.equal(await x.page.evaluate(()=>__localOpens),0);
   await action(x.page,'open:expense');await x.page.locator('[name=name]').fill('مسودة اتصال');await x.page.locator('[name=amount]').fill('7.25');
   f.network=false;await x.page.evaluate(()=>window.dispatchEvent(new Event('alkarna-account-offline')));assert.equal(await x.page.locator('.online-access-gate').isVisible(),true);assert.equal(await x.page.locator('#phone').evaluate(e=>e.inert),true);
   f.network=true;await x.page.locator('[data-online-check]').click();await x.page.waitForFunction(()=>document.querySelector('.online-access-gate').hidden);assert.equal(await x.page.locator('[name=name]').inputValue(),'مسودة اتصال');assert.equal(await x.page.locator('[name=amount]').inputValue(),'7.25');assert.equal(f.pushes.length,0);
   await action(x.page,'post-cash');assert.equal(f.pushes.length,1);assert.equal(f.state.records.length,1);assert.equal(await x.page.evaluate(()=>S.records.length),1);assert.equal(await x.page.evaluate(()=>__localOpens),0);
  }finally{await x.context.close()}
 });
 await check('initial online bootstrap failure is recoverable without showing demo/local data',async()=>{
  const f=fixture();f.failRead=true;const x=await open(f,'index.html','fr',true);try{
   await x.page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');await x.page.locator('.online-access-gate').waitFor();assert.deepEqual(x.errors,[]);assert.equal(await x.page.locator('#phone').textContent(),'');
   f.failRead=false;await x.page.locator('[data-online-check]').click();await x.page.locator('.nav').waitFor();assert.equal(await x.page.locator('.online-access-gate').isVisible(),false);assert.equal(await x.page.evaluate(()=>S.records.length),0);assert.equal(await x.page.evaluate(()=>__localOpens),0);
  }finally{await x.context.close()}
 });
 await check('online new product and opening stock are one atomic semantic batch',async()=>{
  const f=fixture(),x=await open(f);try{
   await x.page.locator('.nav').waitFor();await action(x.page,'go:inventory');await action(x.page,'open:product');
   await x.page.locator('#sheet-form [name=name]').fill('منتج مؤسسة');await x.page.locator('#sheet-form [name=price]').fill('20');await x.page.locator('#sheet-form [name=cost]').fill('10');await x.page.locator('#sheet-form [name=qty]').fill('3');await action(x.page,'save-product');
   assert.deepEqual(x.errors,[]);assert.equal(f.pushes.length,1);assert.equal(f.pushes[0].commands[0].kind,'batch');assert.equal(f.state.products.length,1);assert.equal(f.state.records.length,1);assert.equal(f.state.products[0].stocks[f.state.warehouse],3);
   assert.equal(await x.page.evaluate(()=>S.products.length),1);assert.equal(await x.page.evaluate(()=>S.products[0].stocks[S.warehouse]),3);assert.equal(await x.page.locator('.online-access-gate').isVisible(),false);
  }finally{await x.context.close()}
 });
 await check('known rejected online write keeps form, navigation and confirmed balances',async()=>{
  const f=fixture(),x=await open(f);try{
   await x.page.locator('.nav').waitFor();await action(x.page,'open:expense');await x.page.locator('[name=name]').fill('رفض مصطنع');await x.page.locator('[name=amount]').fill('12.5');f.reject=true;
   const before=await x.page.evaluate(()=>({route:view,history:history.length,records:S.records.length,balance:S.accounts[0].balance}));await action(x.page,'post-cash');
   assert.deepEqual(await x.page.evaluate(()=>({route:view,history:history.length,records:S.records.length,balance:S.accounts[0].balance})),before);assert.equal(await x.page.locator('[name=name]').inputValue(),'رفض مصطنع');assert.equal(await x.page.locator('[name=amount]').inputValue(),'12.5');assert.equal(await x.page.locator('.online-access-gate').isVisible(),true);assert.equal(f.pushes.length,1);
  }finally{await x.context.close()}
 });
 await check('accepted commit survives ACK failure and recovery never resubmits it',async()=>{
  const f=fixture(),x=await open(f);try{
   await x.page.locator('.nav').waitFor();await action(x.page,'open:expense');await x.page.locator('[name=name]').fill('تأكيد محفوظ');await x.page.locator('[name=amount]').fill('9.5');f.ackFails=true;await action(x.page,'post-cash');
   assert.equal(f.state.records.length,1);assert.equal(await x.page.evaluate(()=>S.records.length),1);assert.equal(await x.page.locator('#sheet-form').count(),0,'accepted write must not restore its input form');assert.equal(await x.page.locator('.online-access-gate').isVisible(),true);
   f.ackFails=false;await x.page.locator('[data-online-check]').click();await x.page.waitForFunction(()=>document.querySelector('.online-access-gate').hidden);assert.equal(f.pushes.length,1);assert.equal(f.state.records.length,1);assert.equal(await x.page.locator('#sheet-form').count(),0);assert.equal(f.completed,null);assert.deepEqual(x.errors,[]);
  }finally{await x.context.close()}
 });
 await check('lost bridge callback recovers durable completed receipt and removes the old actionable draft',async()=>{
  const f=fixture(),x=await open(f);try{
   await x.page.locator('.nav').waitFor();await action(x.page,'open:expense');await x.page.locator('[name=name]').fill('رد مفقود');await x.page.locator('[name=amount]').fill('8.75');f.dropCompletedResponse=true;await action(x.page,'post-cash');
   assert.equal(f.state.records.length,1);assert.equal(await x.page.evaluate(()=>S.records.length),0);assert.equal(await x.page.locator('[name=name]').inputValue(),'رد مفقود');assert.equal(await x.page.locator('.online-access-gate').isVisible(),true);
   f.dropCompletedResponse=false;await x.page.locator('[data-online-check]').click();await x.page.waitForFunction(()=>document.querySelector('.online-access-gate').hidden);assert.equal(f.pushes.length,1);assert.equal(await x.page.evaluate(()=>S.records.length),1);assert.equal(await x.page.locator('#sheet-form').count(),0);assert.equal(f.completed,null);assert.deepEqual(x.errors,[]);
  }finally{await x.context.close()}
 });
 await check('missing native pending state requires ledger review and preserves only read-only draft details',async()=>{
  const f=fixture(),x=await open(f);try{
   await x.page.locator('.nav').waitFor();await action(x.page,'open:expense');await x.page.locator('[name=name]').fill('مسودة للمراجعة');await x.page.locator('[name=amount]').fill('11.25');f.loseResponse=true;await action(x.page,'post-cash');f.loseResponse=false;f.pending=null;
   await x.page.locator('[data-online-check]').click();await x.page.waitForFunction(()=>document.querySelector('.online-access-gate').hidden);assert.equal(await x.page.evaluate(()=>view),'operations');assert.equal(await x.page.locator('#sheet-form').count(),0);assert.match(await x.page.locator('.online-review-panel').textContent(),/مسودة للمراجعة/);
   await action(x.page,'open:expense');assert.equal(await x.page.locator('#sheet-form').count(),0,'new entry stays closed until explicit review');assert.equal(f.pushes.length,1);
   await x.page.locator('[data-online-reviewed]').click();await action(x.page,'open:expense');assert.equal(await x.page.locator('[name=name]').inputValue(),'');assert.equal(f.pushes.length,1);assert.deepEqual(x.errors,[]);
  }finally{await x.context.close()}
 });
 await check('completed settlement resets the live editor before an explicit ledger review',async()=>{
  const f=fixture(),x=await open(f);try{
   await x.page.locator('.nav').waitFor();await action(x.page,'open:expense');await x.page.locator('[name=name]').fill('مراجعة التسوية');await x.page.locator('[name=amount]').fill('6.5');f.reject=true;await action(x.page,'post-cash');assert.equal(await x.page.locator('[name=name]').inputValue(),'مراجعة التسوية');
   // Simulate the responsible employee accepting the effect during settlement.
   const command=f.pushes[0].commands[0];f.state=domainApply(f.state,command,{organizationId:c.organization.id,branchId:c.branches[0].id,memberId:c.member.id,epoch:1,role:'org-admin',capabilities:['*'],branchIds:c.member.branchIds}).state;f.cursor++;f.reject=false;
   await x.page.locator('[data-online-check]').click();await x.page.waitForFunction(()=>document.querySelector('.online-access-gate').hidden);assert.equal(await x.page.evaluate(()=>view),'operations');assert.equal(await x.page.locator('#sheet-form').count(),0);assert.match(await x.page.locator('.online-review-panel').textContent(),/مراجعة التسوية/);assert.equal(await x.page.evaluate(()=>S.records.length),1);assert.equal(f.pushes.length,1);
   await action(x.page,'open:expense');assert.equal(await x.page.locator('#sheet-form').count(),0);await x.page.locator('[data-online-reviewed]').click();await action(x.page,'open:expense');assert.equal(await x.page.locator('[name=name]').inputValue(),'');assert.equal(f.pushes.length,1);assert.deepEqual(x.errors,[]);
  }finally{await x.context.close()}
 });
 await check('restart recovers completed work in its original non-first branch',async()=>{
  const f=fixture();f.context.branches.push({id:'branch-second',name:'الفرع الثاني',originId:'origin-second'});f.context.member.branchIds.push('branch-second');f.state=emptyState({originId:'origin-second',organizationId:c.organization.id,branchId:'branch-second'});
  const command=makeCommand('record.post',{record:{globalId:'record-second',number:'SECOND-ONE',kind:'deposit',date:'2026-11-11',time:'12:00',account:f.state.accounts[0].globalId,total:4,paid:4,due:0,lines:[]}},{organizationId:c.organization.id,branchId:'branch-second',memberId:c.member.id,epoch:1,operationId:crypto.randomUUID()});
  f.state=domainApply(f.state,command,{organizationId:c.organization.id,branchId:'branch-second',memberId:c.member.id,epoch:1,role:'org-admin',capabilities:['*'],branchIds:f.context.member.branchIds}).state;f.cursor=1;f.completed={payload:{branchId:'branch-second',epoch:1,commands:[command]},result:{epoch:1,cursor:1,receipts:[{operationId:command.operationId,hash:commandHash(command),status:'accepted'}]}};
  const x=await open(f);try{
   await x.page.locator('.online-access-gate').waitFor();await x.page.locator('[data-online-check]').click();await x.page.waitForFunction(()=>document.querySelector('.online-access-gate').hidden);assert.equal(await x.page.evaluate(()=>S.originId),'origin-second');assert.equal(await x.page.evaluate(()=>S.records.length),1);assert.equal(f.pushes.length,0);assert.equal(f.completed,null);assert(f.calls.filter(v=>v.command==='online-call'&&v.payload.operation==='online.bootstrap').every(v=>v.payload.payload.branchId==='branch-second'));assert.deepEqual(x.errors,[]);
  }finally{await x.context.close()}
 });
 await check('fresh offline activation creates exact approved owner with PBKDF2 and reuses the same database',async()=>{
  const f=fixture('offline'),x=await open(f);try{
   await x.page.locator('.nav').waitFor();assert.deepEqual(x.errors,[]);assert.equal(await x.page.evaluate(()=>S.originId),binding.localShopId);
   const before=await x.page.evaluate(async()=>{const {ShopDatabase}=await import('/database.js');const db=new ShopDatabase();const users=await db.all('users');return users.map(u=>({id:u.id,username:u.username,password:u.password}));});assert.equal(before[0].id,binding.localOwnerId);assert.equal(before[0].password.algorithm,'PBKDF2-SHA256');assert.equal(JSON.stringify(before).includes('synthetic-code'),false);assert(f.calls.some(c=>c.command==='bootstrap-complete'));
   await x.page.reload();await x.page.locator('.nav').waitFor();const after=await x.page.evaluate(async()=>{const {ShopDatabase}=await import('/database.js');return(await new ShopDatabase().all('users')).map(u=>({id:u.id,username:u.username,password:u.password}));});assert.deepEqual(after,before);
  }finally{await x.context.close()}
 });
 await check('local users and ledger remain separate through organization login and return to the old local account',async()=>{
  const f=fixture('offline'),x=await open(f);try{
   await x.page.locator('.nav').waitFor();await action(x.page,'open:expense');await x.page.locator('[name=name]').fill('قيد محلي مستقل');await x.page.locator('[name=amount]').fill('17.25');await action(x.page,'post-cash');
   const snapshot=()=>x.page.evaluate(async()=>{const {ShopDatabase}=await import('/database.js'),db=new ShopDatabase(),state=await db.load();return {users:await db.all('users'),originId:state.originId,records:state.records,accounts:state.accounts,products:state.products,parties:state.parties,currency:state.currency}});
   const before=await snapshot();assert.equal(before.originId,binding.localShopId);assert.equal(before.users.length,1);assert.equal(before.users[0].id,binding.localOwnerId);assert.equal(before.users[0].password.algorithm,'PBKDF2-SHA256');assert.equal(before.records.length,1);assert.equal(f.state.records.length,0);
   f.mode='online';await x.page.reload();await x.page.locator('.nav').waitFor();assert.equal(await x.page.evaluate(()=>__localOpens),0,'organization entry must not open or import the local database');assert((await x.page.locator('.app-head .sub').innerText()).includes(c.member.name));assert.equal(await x.page.evaluate(()=>S.records.length),0);assert.notEqual(await x.page.evaluate(()=>S.originId),before.originId);
   await action(x.page,'open:expense');await x.page.locator('[name=name]').fill('قيد المؤسسة فقط');await x.page.locator('[name=amount]').fill('8.5');await action(x.page,'post-cash');assert.equal(f.state.records.length,1);assert.equal(f.pushes.length,1);assert.equal(await x.page.evaluate(()=>__localOpens),0);
   const central=structuredClone(f.state.records);f.mode='offline';await x.page.reload();await x.page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');
   if(!await x.page.locator('.nav').isVisible()){await x.page.locator('#site-auth-form [name=username]').fill(binding.phone);await x.page.locator('#site-auth-form [name=password]').fill('synthetic-code');await action(x.page,'site:login')}
   await x.page.locator('.nav').waitFor();assert((await x.page.locator('.app-head .sub').innerText()).includes(binding.ownerName));assert.deepEqual(await snapshot(),before,'old local users/password hashes/ledger/balances must be byte-equivalent business values after the organization round trip');assert.deepEqual(f.state.records,central);assert.equal(f.pushes.length,1,'local re-entry must not migrate a record into the organization');assert.equal(await x.page.evaluate(()=>S.records.some(r=>r.title==='قيد المؤسسة فقط')),false);assert.deepEqual(x.errors,[]);
  }finally{await x.context.close()}
 });
 for(const language of ['ar','fr'])await check('pending '+language+' entry re-authenticates then requires an explicit activation tap',async()=>{
  const f=fixture('pending');f.approval=true;const x=await open(f,'access.html',language);try{
   await x.page.waitForFunction(()=>!document.querySelector('#content').getAttribute('aria-busy')||document.querySelector('#content').getAttribute('aria-busy')==='false');await x.page.locator('#identifier').fill(binding.phone);await x.page.locator('#code').fill('synthetic-code');await x.page.locator('#consent').check();await x.page.locator('#login-form .primary').click();await x.page.locator('#activate').waitFor();
   assert.deepEqual(await x.page.evaluate(()=>__accessEvents),[]);assert.equal(f.calls.some(c=>c.command==='offline-activate'),false);await x.page.locator('#activate').click();await x.page.waitForFunction(()=>__accessEvents.includes('continue'));assert(f.calls.some(c=>c.command==='offline-activate'));assert.deepEqual(x.errors,[]);
  }finally{await x.context.close()}
 });
 for(const language of ['ar','fr'])await check('one '+language+' establishment login preserves the identifier and secret when changing language',async()=>{
  const f=fixture('pending'),x=await open(f,'access.html',language,false,{width:320,height:620});try{
   await x.page.locator('#identifier').fill(binding.phone);await x.page.locator('#code').fill('synthetic-code');await x.page.locator('#consent').check();
   assert.match(await x.page.locator('h1').innerText(),language==='ar'?/تسجيل الدخول/:/Connexion/);
   assert.match(await x.page.locator('.entry-note').innerText(),language==='ar'?/رقم الهاتف.*جهاز واحد.*المسؤول/:/Un numéro.*un appareil.*responsable/);
   assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await proof(x.page,'establishment-entry-'+language);
   await x.page.locator('#language').click();assert.equal(await x.page.locator('#identifier').inputValue(),binding.phone);assert.equal(await x.page.locator('#code').inputValue(),'synthetic-code');assert.equal(await x.page.locator('#consent').isChecked(),true);
   assert.equal(await x.page.evaluate(()=>Object.values(localStorage).some(value=>value.includes('synthetic-code'))),false);assert.equal(await x.page.locator('a[href*="wa.me"]').count(),0);
   assert.equal(await x.page.locator('#manual,#license-file,#license-text,#install-text,a[href^="tel:"]').count(),0);assert.deepEqual(await x.page.evaluate(()=>__accessEvents),[]);assert.deepEqual(x.errors,[]);
  }finally{await x.context.close()}
 });
 await check('visible pending approval refreshes automatically and never installs without the explicit receive action',async()=>{
  const f=fixture('pending'),x=await open(f,'access.html','ar',true,{width:320,height:620},true);try{
   await x.page.locator('#identifier').fill(binding.phone);await x.page.locator('#code').fill('synthetic-code');await x.page.locator('#consent').check();await x.page.locator('#login-form .primary').click();await x.page.locator('#check').waitFor();
   assert.equal(f.calls.filter(row=>row.command==='offline-status').length,0);f.approval=true;await x.page.clock.fastForward(45001);await x.page.locator('#activate').waitFor();
   assert.equal(f.calls.filter(row=>row.command==='offline-status').length,1);assert.equal(f.calls.some(row=>row.command==='offline-activate'),false);assert.deepEqual(await x.page.evaluate(()=>__accessEvents),[]);
   await x.page.clock.fastForward(90000);assert.equal(f.calls.filter(row=>row.command==='offline-status').length,1,'ready approval must not keep polling');
   await x.page.locator('#activate').click();await x.page.waitForFunction(()=>__accessEvents.includes('continue'));assert.equal(f.calls.filter(row=>row.command==='offline-activate').length,1);assert.equal(await x.page.evaluate(()=>__localOpens),0);
  }finally{await x.context.close()}
 });
 await check('bound expiry shows a direct approval without auto-login or touching the local database',async()=>{
  const f=fixture('local-bound');f.localValid=false;f.boundRecord={bound:true,phone:binding.phone,status:'expired',renewalAvailable:false};f.currentRecord={...f.boundRecord,status:'expired',stage:'expired',renewalAvailable:true};const x=await open(f,'access.html','ar',true);try{
   await x.page.locator('#check').waitFor();assert.match(await x.page.locator('#content').innerText(),/انتهت مدة التفعيل.*بياناتك المحلية محفوظة/);assert.equal(await x.page.locator('#legacy').count(),0);
   await x.page.locator('#check').click();await x.page.locator('#renew').waitFor();assert.deepEqual(await x.page.evaluate(()=>__accessEvents),[]);assert.equal(await x.page.evaluate(()=>__localOpens),0);await proof(x.page,'establishment-local-approval-ar');
   await x.page.locator('#renew').click();await x.page.waitForFunction(()=>__accessEvents.includes('continue'));assert.equal(f.calls.filter(row=>row.command==='offline-renew').length,1);assert.equal(f.calls.some(row=>['bootstrap','bootstrap-complete','offline-activate'].includes(row.command)),false,'license receipt must not create an owner or bypass the local login');assert.deepEqual(x.errors,[]);
  }finally{await x.context.close()}
 });
 await check('a signed suspended account remains blocked during a network failure without manual activation bypass',async()=>{
  const f=fixture('local-bound');f.localValid=false;f.boundRecord={bound:true,phone:binding.phone,status:'suspended',renewalAvailable:false};f.statusError='NETWORK';const x=await open(f,'access.html','fr',true);try{
   await x.page.locator('#check').waitFor();assert.match(await x.page.locator('#content').innerText(),/suspendu.*données locales sont conservées/);await x.page.locator('#check').click();await x.page.waitForFunction(()=>document.querySelector('#error').textContent.length>0);
   assert.equal(await x.page.locator('#legacy').count(),0);assert.equal(await x.page.locator('#activate').count(),0);assert.equal(await x.page.locator('#renew').count(),0);assert.equal(await x.page.evaluate(()=>__localOpens),0);
   assert.equal(await x.page.locator('#manual,#license-file,#license-text,#install-text,a[href^="tel:"],a[href*="wa.me"]').count(),0);assert.deepEqual(await x.page.evaluate(()=>__accessEvents),[]);assert.equal(f.calls.some(row=>row.command==='legacy'),false);assert.deepEqual(x.errors,[]);
  }finally{await x.context.close()}
 });
 await check('native local status updates only the matching phone and cannot authorize a login by themselves',async()=>{
  const f=fixture('local-bound');f.boundRecord={bound:true,phone:binding.phone,status:'active',renewalAvailable:false};const x=await open(f,'access.html','ar',true);try{
   await x.page.locator('#legacy').waitFor();
   await x.page.evaluate(()=>dispatchEvent(new CustomEvent('alkarna-local-account-status',{detail:{phone:'34567890',bound:true,status:'suspended'}})));assert.equal(await x.page.locator('#legacy').count(),1,'another phone must not alter the current card');
   await x.page.evaluate(phone=>dispatchEvent(new CustomEvent('alkarna-local-account-status',{detail:{phone,bound:true,status:'suspended'}})),binding.phone);assert.equal(await x.page.locator('#legacy').count(),0);assert.match(await x.page.locator('#content').innerText(),/أوقف المسؤول.*بياناتك المحلية محفوظة/);
   await x.page.evaluate(phone=>dispatchEvent(new CustomEvent('alkarna-local-account-status',{detail:{phone,bound:true,status:'expired',renewalAvailable:true}})),binding.phone);assert.equal(await x.page.locator('#renew').count(),1);assert.equal(await x.page.locator('#legacy').count(),0);assert.deepEqual(await x.page.evaluate(()=>__accessEvents),[]);assert.equal(await x.page.evaluate(()=>__localOpens),0);assert.equal(f.calls.some(row=>row.command==='offline-renew'),false);
  }finally{await x.context.close()}
 });
 await check('an unverified known phone never pretends that a new approval request was sent',async()=>{
  const f=fixture('local-bound');f.localValid=false;f.boundRecord={bound:true,phone:binding.phone,status:'unavailable',renewalAvailable:false};const x=await open(f,'access.html','ar',true);try{
   await x.page.locator('#check').waitFor();const text=await x.page.locator('#content').innerText();assert.match(text,/تعذّر تأكيد حالة الهاتف.*بياناتك المحلية محفوظة/);assert.doesNotMatch(text,/أُرسل طلب|بانتظار موافقة/);
   assert.equal(await x.page.locator('#legacy').count(),0);assert.equal(await x.page.locator('#activate').count(),0);assert.equal(await x.page.locator('#renew').count(),0);assert.deepEqual(await x.page.evaluate(()=>__accessEvents),[]);assert.equal(await x.page.evaluate(()=>__localOpens),0);
   await x.page.locator('#different').click();await x.page.locator('#login-form').waitFor();assert.equal(await x.page.locator('#consent').isChecked(),false);assert.equal(f.calls.some(row=>row.command==='offline-request'),false);assert.deepEqual(x.errors,[]);
  }finally{await x.context.close()}
 });
 await check('cold initial setup recovery requires the secret and preserves an owner already committed before native completion failed',async()=>{
  const f=fixture('offline');f.failCompleteOnce=true;const x=await open(f);try{
   await x.page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='failed');
   const before=await x.page.evaluate(async()=>{const {ShopDatabase}=await import('/database.js'),db=new ShopDatabase();return {users:await db.all('users'),originId:(await db.load()).originId};});assert.equal(before.users.length,1);assert.equal(before.users[0].id,binding.localOwnerId);assert.equal(before.originId,binding.localShopId);
   await x.page.addInitScript(()=>{const original=indexedDB.open.bind(indexedDB);window.__setupDbOpens=0;indexedDB.open=(...args)=>{window.__setupDbOpens++;return original(...args)}});
   const bootstrapCount=f.calls.filter(row=>row.command==='bootstrap').length;await x.page.goto(origin+'/access.html');await x.page.locator('#login-form').waitFor();await x.page.waitForFunction(()=>document.querySelector('#content').getAttribute('aria-busy')==='false');
   assert.match(await x.page.locator('h1').innerText(),/أكمل إعداد هاتفك/);assert.equal(await x.page.locator('#identifier').inputValue(),binding.phone);assert.equal(await x.page.locator('#code').inputValue(),'');assert.equal(await x.page.locator('#consent').isChecked(),false);assert.equal(await x.page.locator('#legacy').count(),0,'raw valid license must not bypass incomplete owner setup');assert.equal(await x.page.locator('#activate').count(),0);assert.deepEqual(await x.page.evaluate(()=>__accessEvents),[]);assert.equal(await x.page.evaluate(()=>__setupDbOpens),0);assert.equal(f.calls.filter(row=>row.command==='bootstrap').length,bootstrapCount);
   await x.page.locator('#code').fill('synthetic-code');await x.page.locator('#consent').check();await x.page.locator('#login-form .primary').click();await x.page.waitForFunction(()=>__accessEvents.includes('continue'));
   assert.equal(f.calls.at(-1).command,'login');await x.page.goto(origin+'/index.html');await x.page.locator('.nav').waitFor();const after=await x.page.evaluate(async()=>{const {ShopDatabase}=await import('/database.js'),db=new ShopDatabase();return {users:await db.all('users'),originId:(await db.load()).originId};});assert.deepEqual(after,before,'a retry must recognize the exact committed owner/shop and retain its verifier rather than resetting setup');assert.equal(f.boundRecord.setupRequired,false);assert.equal(f.credential,false);assert.deepEqual(x.errors,[]);
  }finally{await x.context.close()}
 });
 await check('an expired incomplete setup receives renewal before requesting its secret and never bootstraps from public metadata',async()=>{
  const f=fixture('offline');f.localValid=false;f.boundRecord={bound:true,phone:binding.phone,status:'expired',stage:'expired',setupRequired:true,renewalAvailable:true};f.renewalResult={...f.boundRecord,status:'active',stage:'setup-required',mode:'none',renewalAvailable:false};const x=await open(f,'access.html','fr');try{
   await x.page.locator('#renew').waitFor();assert.match(await x.page.locator('#content').innerText(),/expiré/);assert.equal(await x.page.locator('#login-form').count(),0);assert.equal(await x.page.locator('#legacy').count(),0);assert.equal(await x.page.evaluate(()=>__localOpens),0);assert.deepEqual(await x.page.evaluate(()=>__accessEvents),[]);
   await x.page.locator('#renew').click();await x.page.locator('#login-form').waitFor();assert.match(await x.page.locator('h1').innerText(),/Terminer la configuration/);assert.equal(await x.page.locator('#identifier').inputValue(),binding.phone);assert.equal(await x.page.locator('#code').inputValue(),'');assert.equal(await x.page.locator('#consent').isChecked(),false);assert.equal(await x.page.locator('#legacy').count(),0);assert.equal(await x.page.evaluate(()=>__localOpens),0);assert.deepEqual(await x.page.evaluate(()=>__accessEvents),[]);assert.equal(f.calls.some(row=>['bootstrap','bootstrap-complete'].includes(row.command)),false);
   await x.page.locator('#code').fill('synthetic-code');await x.page.locator('#consent').check();await x.page.locator('#login-form .primary').click();await x.page.waitForFunction(()=>__accessEvents.includes('continue'));assert.equal(f.calls.some(row=>row.command==='bootstrap'),false);await x.page.goto(origin+'/index.html');await x.page.locator('.nav').waitFor();
   const users=await x.page.evaluate(async()=>{const {ShopDatabase}=await import('/database.js');return new ShopDatabase().all('users');});assert.equal(users.length,1);assert.equal(users[0].id,binding.localOwnerId);assert.equal(await x.page.evaluate(()=>S.originId),binding.localShopId);assert.equal(f.boundRecord.setupRequired,false);assert.equal(f.credential,false);assert.deepEqual(x.errors,[]);
  }finally{await x.context.close()}
 });
 for(const [language,valid] of [['ar',false],['fr',true]])await check('reviewed '+language+' customer entry removes manual import and preactivation contact destinations',async()=>{
  const f=fixture('local-bound');f.localValid=valid;const x=await open(f,'access.html',language,false,{width:320,height:620});try{
   await x.page.locator('#identifier').waitFor();assert.equal(await x.page.locator('#manual,#license-file,#license-text,#install-text,a[href^="tel:"],a[href*="wa.me"],a[href^="http"]').count(),0);
   await x.page.locator('#privacy').click();assert.deepEqual(await x.page.evaluate(()=>__accessEvents),['privacy']);
   assert.equal(await x.page.locator('#legacy').count(),valid?1:0);if(valid){await x.page.locator('#legacy').click();await x.page.waitForFunction(()=>__accessEvents.includes('continue'));assert.equal(f.calls.filter(row=>row.command==='legacy').length,1);}
   assert.equal(f.calls.some(row=>['offline-activate','offline-renew'].includes(row.command)),false);assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(x.errors,[]);
  }finally{await x.context.close()}
 });
}finally{await browser?.close();server.close();}
if(failed)process.exitCode=1;
