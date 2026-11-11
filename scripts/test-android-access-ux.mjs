import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
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
 if(command==='state')return {mode:f.mode,legacyAvailable:true,deviceId:'SYNTHETIC',...(f.mode==='pending'?{offline:{phone:binding.phone,status:'pending'}}:{})};
 if(command==='bootstrap')return f.mode==='online'?{mode:'online',context:ctx,connected:true,pendingOnline:!!(f.pending||f.completed),pendingBranchId:f.completed?.payload.branchId||f.pending?.branchId}:{mode:'offline',binding,...(f.credential?{credential:{phone:binding.phone,code:'synthetic-code'}}:{})};
 if(command==='bootstrap-complete'){f.credential=false;return {completed:true};}
 if(command==='login')return f.mode==='pending'?{stage:f.approval?'active':'pending',mode:'offline',phone:payload.identifier,activationRequired:true}:{stage:'active',mode:'online'};
 if(command==='offline-status')return {stage:f.approval?'active':'pending',phone:binding.phone};
 if(command==='offline-activate')return {stage:'active',mode:'offline'};
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
async function open(f,entry='index.html',language='ar',blockLocal=false){
 const id=String(++sequence);fixtures.set(id,f);const context=await browser.newContext({viewport:{width:360,height:700},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(({id,language,blockLocal})=>{
  localStorage.setItem('alkarna-site-language',language);window.__accessEvents=[];
  const invoke=async(command,payload={})=>{const result=await(await fetch('/native?id='+id,{method:'POST',body:JSON.stringify({command,payload})})).json();if(result.error)throw Object.assign(Error(result.error),{code:result.code});return result;};
  window.NativeFiles={accountAccess:invoke,licenseStatus:async()=>({valid:true,license:{customerName:'مالك اختبار',storeName:'محل اختبار'}})};
  window.NativeHost={licenseAllowed:()=>true,language(){},theme(){},openPrivacy(){window.__accessEvents.push('privacy')},openActivation(){window.__accessEvents.push('activation')},openAccountAccess(){window.__accessEvents.push('entry')},accountContinue(){window.__accessEvents.push('continue')},accountAccess(id,command,json){invoke(command,JSON.parse(json)).then(value=>window.__nativeResult(id,value),e=>window.__nativeResult(id,{error:e.message,code:e.code}));}};
  if(blockLocal){window.__localOpens=0;indexedDB.open=()=>{window.__localOpens++;throw Error('ONLINE_LOCAL_DB_OPENED')};}
 },{id,language,blockLocal});
 await page.goto(origin+'/'+entry);return {context,page,errors,id};
}
async function action(page,value){await page.evaluate(value=>act(value),value);await page.waitForFunction(()=>!karnaPersistenceBusy());}
async function check(name,fn){try{await fn();console.log('PASS '+name)}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack)}}
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
 for(const language of ['ar','fr'])await check('pending '+language+' entry re-authenticates then requires an explicit activation tap',async()=>{
  const f=fixture('pending');f.approval=true;const x=await open(f,'access.html',language);try{
   await x.page.waitForFunction(()=>!document.querySelector('#content').getAttribute('aria-busy')||document.querySelector('#content').getAttribute('aria-busy')==='false');await x.page.locator('#identifier').fill(binding.phone);await x.page.locator('#code').fill('synthetic-code');await x.page.locator('#consent').check();await x.page.locator('#login-form .primary').click();await x.page.locator('#activate').waitFor();
   assert.deepEqual(await x.page.evaluate(()=>__accessEvents),[]);assert.equal(f.calls.some(c=>c.command==='offline-activate'),false);await x.page.locator('#activate').click();await x.page.waitForFunction(()=>__accessEvents.includes('continue'));assert(f.calls.some(c=>c.command==='offline-activate'));assert.deepEqual(x.errors,[]);
  }finally{await x.context.close()}
 });
}finally{await browser?.close();server.close();}
if(failed)process.exitCode=1;
