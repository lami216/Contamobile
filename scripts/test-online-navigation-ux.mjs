import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {emptyState,domainApply,commandHash} from '../approved-runtime/platform/shared/accounting-domain.mjs';
import {viewHash} from '../approved-runtime/shared-delta.mjs';
const require=createRequire(import.meta.url);let chromium;
for(const module of [process.env.PLAYWRIGHT_MODULE,'playwright',fileURLToPath(new URL('../../Contatools/node_modules/playwright',import.meta.url))].filter(Boolean))try{({chromium}=require(module));break}catch{}
if(!chromium)throw Error('Playwright required');
const runtime=fileURLToPath(new URL('../approved-runtime/',import.meta.url)),origin='http://127.0.0.1:43933',cases=[],metrics=[],remote=[];
const scope={organizationId:'fixture-org',branchId:'fixture-branch',originId:'fixture-origin'};
function fixture(){
 const state=emptyState(scope);state.products=Array.from({length:1000},(_,i)=>({id:i+1,globalId:'fixture-product-'+i,name:'منتج '+i,sku:'P'+i,barcode:'',price:2000,cost:1000-i,stocks:{[state.warehouse]:i<137?0:20+i},syncVersion:1}));
 const context={organization:{id:scope.organizationId,name:'مؤسسة اختبار'},member:{id:'fixture-member',name:'موظف اختبار',username:'fixture@example.invalid',role:'org-admin',capabilities:['*'],branchIds:[scope.branchId],membershipVersion:1},branches:[{id:scope.branchId,name:'الفرع',originId:scope.originId}],protocolCapabilities:{sharedDeltaVersion:1,salesViewVersion:1},entitlement:{payload:{expiresAt:new Date(Date.now()+300000).toISOString()}}};
 return {state,context,cursor:0,calls:[],hold:{},waiters:{},pushes:[],completed:null,revoked:false};
}
async function dispatch(f,command,input){
 f.calls.push({command,operation:input?.operation});const type=command==='online-status'?'status':command==='online-call'&&input.operation==='online.delta'?'delta':command==='online-call'&&input.operation==='sync.push'?'push':null;
 if(type&&f.hold[type])await new Promise(resolve=>(f.waiters[type]??=[]).push(resolve));
 if(command==='online-status'){if(f.revoked)throw Object.assign(Error('REVOKED'),{code:'REVOKED'});return structuredClone(f.context);}
 if(command==='bootstrap')return {mode:'online',context:structuredClone(f.context)};
 if(command==='online-pending')return {pending:false};
 if(command==='online-ack'){assert.deepEqual(input.operationIds,f.completed.payload.commands.map(c=>c.operationId));f.completed=null;return {acknowledged:true};}
 if(command==='online-call'){
  const {operation,payload}=input;
  if(operation==='online.bootstrap')return {...scope,mode:'online',epoch:1,cursor:f.cursor,state:structuredClone(f.state),view:'full',viewHash:viewHash(f.state)};
  if(operation==='online.delta')return {organizationId:scope.organizationId,branchId:scope.branchId,epoch:1,fromCursor:payload.cursor,cursor:f.cursor,view:'full',viewHash:viewHash(f.state),patches:[],hasMore:false};
  if(operation==='sync.status')return {epoch:1,cursor:f.cursor,needsSettlement:0};
  assert.equal(operation,'sync.push');f.pushes.push(structuredClone(payload));const receipts=payload.commands.map(c=>{f.state=domainApply(f.state,c,{...scope,memberId:f.context.member.id,role:'org-admin',capabilities:['*'],branchIds:[scope.branchId],epoch:1}).state;f.cursor++;return {operationId:c.operationId,hash:commandHash(c),status:'accepted'};});
  f.completed={payload:structuredClone(payload),result:{epoch:1,cursor:f.cursor,receipts}};return f.completed.result;
 }
 throw Error('Unexpected '+command);
}
function release(f,type){f.hold[type]=false;for(const resolve of f.waiters[type]||[])resolve();f.waiters[type]=[];}
let browser;
async function open(language='ar'){
 const f=fixture(),context=await browser.newContext({viewport:{width:393,height:852},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin!==origin){remote.push(u.href);return route.abort();}
  if(u.pathname==='/native'){const {command,input}=route.request().postDataJSON();try{return route.fulfill({json:await dispatch(f,command,input)});}catch(e){return route.fulfill({json:{error:e.message,code:e.code||e.message}});}}
  const relative=u.pathname.slice(1)||'index.html',file=path.resolve(runtime,relative);assert(file.startsWith(runtime));let body;try{body=await readFile(file).catch(e=>/^assets\/StitchArabic(?:Bold)?\.ttf$/.test(relative)?readFile(path.resolve(runtime,'../assets/fonts',path.basename(relative))):Promise.reject(e));}catch{return route.fulfill({status:404,body:''});}
  return route.fulfill({body,contentType:({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream'});
 });
 await context.addInitScript(({language})=>{
  localStorage.setItem('alkarna-site-language',language);const invoke=async(command,input={})=>{const r=await(await fetch('/native',{method:'POST',body:JSON.stringify({command,input})})).json();if(r.error)throw Object.assign(Error(r.error),{code:r.code});return r;};
  window.NativeFiles={accountAccess:invoke,licenseStatus:async()=>({valid:true})};window.NativeHost={licenseAllowed:()=>true,language(){},theme(){},openPrivacy(){},accountAccess(id,command,input){invoke(command,JSON.parse(input)).then(r=>__nativeResult(id,r),e=>__nativeResult(id,{error:e.message,code:e.code}));}};
 },{language});
 await page.goto(origin+'/index.html');await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready'&&!!document.querySelector('.nav'));await page.waitForFunction(()=>document.querySelector('.online-access-gate')?.hidden===true);await page.evaluate(()=>document.fonts.ready);return {f,context,page,errors};
}
async function check(name,fn){try{await fn();cases.push({name,passed:true});console.log('PASS '+name);}catch(e){cases.push({name,passed:false,error:e.stack});console.error('FAIL '+name+'\n'+e.stack);}}
async function nav(page,target){const start=await page.evaluate(target=>{window.__navPaint=null;const button=document.querySelector('.nav [data-action="go:'+target+'"]');button.addEventListener('click',()=>{const began=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>window.__navPaint=performance.now()-began));},{once:true,capture:true});return performance.now();},target);await page.locator(`.nav [data-action="go:${target}"]`).click();await page.waitForFunction(target=>view===target&&Number.isFinite(window.__navPaint),target);return page.evaluate(start=>({elapsedMs:Math.round(performance.now()-start),inputToFrameMs:Math.round(window.__navPaint),renderedProductRows:document.querySelectorAll('.warehouse-products-table tbody tr').length}),start);}
async function pending(f,type){for(let i=0;i<100&&!f.waiters[type]?.length;i++)await new Promise(r=>setTimeout(r,10));assert.ok(f.waiters[type]?.length,'held '+type+' request must really start');}
async function homeDraftsWithoutNetwork(page,f){
 const ledger=await page.evaluate(()=>JSON.stringify({products:S.products,accounts:S.accounts,records:S.records,opening:S.opening})),requests=f.calls.length;
 const tap=async action=>{await page.locator('[data-action="'+action+'"]').first().click({timeout:5000});await page.waitForFunction(()=>!karnaPersistenceBusy());};
 await tap('new:sale');await page.waitForFunction(()=>view==='sale');await page.locator('#pos-search').fill('P137');await tap('pos:add:138');await tap('pos:line:138');await page.locator('#sheet-form [name=quantity]').fill('2');await tap('pos:save-line');assert.deepEqual(await page.evaluate(()=>cart.map(({id,qty})=>({id,qty}))),[{id:138,qty:2}]);
 await tap('pos:note');await page.locator('#sheet-form [name=note]').fill('مسودة فاتورة أثناء انتظار الشبكة');await tap('pos:save-note');assert.equal(await page.evaluate(()=>posNote),'مسودة فاتورة أثناء انتظار الشبكة');
 await tap('back');assert.equal(await page.evaluate(()=>modal),'pos-leave');assert.equal(await page.evaluate(()=>cart[0].qty),2);await tap('pos:confirm-leave');await page.waitForFunction(()=>view==='home');
 await tap('new:purchase');assert.equal(await page.evaluate(()=>modal),'pos-leave');assert.equal(await page.evaluate(()=>cart[0].qty),2);await tap('pos:confirm-leave');await page.waitForFunction(()=>view==='purchase');await page.locator('#pos-search').fill('P138');await tap('pos:add:139');assert.deepEqual(await page.evaluate(()=>cart.map(({id,qty})=>({id,qty}))),[{id:139,qty:1}]);
 assert.equal(f.calls.length,requests,'opening invoices, typing and cart drafts must not await any native request');assert.ok(f.waiters.status?.length,'background status is still held until after all editor assertions');assert.equal(f.pushes.length,0);assert.equal(f.state.records.length,0);assert.equal(await page.evaluate(()=>JSON.stringify({products:S.products,accounts:S.accounts,records:S.records,opening:S.opening})),ledger);
}
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:process.env.PLAYWRIGHT_USE_BUNDLED==='1'?{}:{channel:'chrome'})});
 for(const language of ['ar','fr'])await check(language+' real navigation buttons remain responsive behind a held background status with 1000 products',async()=>{
  const x=await open(language);try{x.f.hold.status=true;await x.page.evaluate(()=>dispatchEvent(new Event('alkarna-network-available')));await pending(x.f,'status');const count=x.f.calls.length;for(const target of ['inventory','parties','operations','home']){const timing=await nav(x.page,target);metrics.push({language,target,...timing,held:'status',products:1000});console.log(JSON.stringify(metrics.at(-1)));assert(timing.inputToFrameMs<700,'actual input-to-paint must be bounded: '+timing.inputToFrameMs);assert(timing.elapsedMs<2000,'automation delivery plus paint must complete while network remains held');if(target==='inventory'){assert.equal(timing.renderedProductRows,50);assert.equal(await x.page.evaluate(()=>S.products.length),1000);if(language==='ar'){const full=await x.page.evaluate(()=>JSON.stringify({products:S.products,accounts:S.accounts,records:S.records}));await x.page.locator('[data-action^="list-page:next:"]').click();await x.page.waitForFunction(()=>document.querySelector('.warehouse-products-table tbody tr')?.getAttribute('data-action')==='product:51');assert.equal(await x.page.evaluate(()=>JSON.stringify({products:S.products,accounts:S.accounts,records:S.records})),full);await x.page.locator('[data-action^="list-page:previous:"]').click();await x.page.waitForFunction(()=>document.querySelector('.warehouse-products-table tbody tr')?.getAttribute('data-action')==='product:1');}const beforeSort=await x.page.evaluate(()=>JSON.stringify({products:S.products,accounts:S.accounts,records:S.records}));await x.page.locator('.warehouse-products-table .column-sort').last().click();await x.page.waitForFunction(()=>document.querySelector('.warehouse-products-table tbody tr')?.getAttribute('data-action')==='product:1000');await x.page.locator('.warehouse-products-table .column-sort').nth(1).click();await x.page.waitForFunction(()=>document.querySelector('.warehouse-products-table tbody tr')?.getAttribute('data-action')==='product:1');assert.deepEqual(await x.page.locator('.warehouse-products-table tbody tr').evaluateAll(rows=>rows.map(row=>Number(row.dataset.action.split(':')[1]))),Array.from({length:50},(_,i)=>i+1));await x.page.locator('[data-action="inventorytab:low"]').click();await x.page.waitForFunction(()=>inventoryTab==='low');assert.match(await x.page.locator('.list-page-controls span').innerText(),/137/);assert.equal(await x.page.locator('.warehouse-products-table tbody tr').count(),50);assert.equal(await x.page.evaluate(()=>S.products.filter(p=>!p.archived&&p.qty<=10).length),137);assert.equal(await x.page.evaluate(()=>JSON.stringify({products:S.products,accounts:S.accounts,records:S.records})),beforeSort);}}await homeDraftsWithoutNetwork(x.page,x.f);assert.equal(x.f.calls.length,count,'navigation adds no network round trip');assert.equal(x.f.waiters.status.length,1);assert.deepEqual(x.errors,[]);}finally{release(x.f,'status');await x.context.close();}
 });
 await check('held delta refresh neither drops tab clicks nor replaces a focused editor',async()=>{
  const x=await open();try{x.f.hold.delta=true;await x.page.evaluate(()=>dispatchEvent(new Event('alkarna-network-available')));await pending(x.f,'delta');await nav(x.page,'inventory');await x.page.evaluate(()=>act('open:product'));await x.page.locator('#sheet-form [name=name]').fill('مسودة لا تتغير');await x.page.locator('#sheet-form [name=name]').focus();release(x.f,'delta');await x.page.waitForTimeout(80);assert.equal(await x.page.locator('#sheet-form [name=name]').inputValue(),'مسودة لا تتغير');assert.equal(await x.page.locator('#sheet-form [name=name]').evaluate(e=>e===document.activeElement),true);assert.equal(x.f.pushes.length,0);assert.deepEqual(x.errors,[]);}finally{release(x.f,'delta');await x.context.close();}
 });
 await check('a confirmed revocation masks and clears cached projections while preserving unresolved input',async()=>{
  const x=await open();try{x.f.revoked=true;await x.page.evaluate(()=>dispatchEvent(new Event('alkarna-network-available')));await x.page.locator('.online-access-gate').waitFor({state:'visible'});assert.equal(await x.page.evaluate(()=>document.querySelector('#phone').inert),true);assert.equal(await x.page.evaluate(()=>S.products.length),1000);assert.equal(x.f.pushes.length,0);await x.page.locator('.nav [data-action="go:inventory"]').evaluate(e=>e.click());assert.equal(await x.page.evaluate(()=>view),'home');}finally{await x.context.close();}
 });
 await check('expired presentation admission cannot be extended by tab clicks',async()=>{
  const x=await open();try{await x.page.clock.install();await x.page.evaluate(()=>{window.__freezeAdmission=true;});x.f.hold.status=true;await x.page.clock.fastForward(14500);await x.page.locator('.online-access-gate').waitFor({state:'visible'});assert.equal(await x.page.evaluate(()=>document.querySelector('#phone').inert),true);assert.equal(x.f.pushes.length,0);}finally{release(x.f,'status');await x.context.close();}
 });
 await check('financial submit remains pending until the authoritative server receipt and applies once',async()=>{
  const x=await open();try{await x.page.evaluate(()=>act('open:expense'));await x.page.locator('#sheet-form [name=name]').fill('مصروف مصطنع');await x.page.locator('#sheet-form [name=amount]').fill('12');x.f.hold.push=true;await x.page.locator('[data-action="post-cash"]').click();await pending(x.f,'push');assert.equal(x.f.state.records.length,0);assert.equal(await x.page.evaluate(()=>document.body.classList.contains('online-confirming')),true);assert.equal(await x.page.locator('.toast').count(),0);assert.equal(x.f.pushes.length,0);assert.equal(await x.page.evaluate(()=>karnaPersistenceBusy()),true);release(x.f,'push');await x.page.waitForFunction(()=>!karnaPersistenceBusy());assert.equal(x.f.pushes.length,1);assert.equal(x.f.state.records.length,1);assert.deepEqual(x.errors,[]);}finally{release(x.f,'push');await x.context.close();}
 });
}finally{await browser?.close();}
const sourceHashes=Object.fromEntries(await Promise.all(['app.js','online-runtime.mjs','online-database.mjs','engine.js'].map(async name=>[name,createHash('sha256').update(await readFile(path.join(runtime,name))).digest('hex')])));
const report={passed:cases.every(c=>c.passed),executed:cases.length,failed:cases.filter(c=>!c.passed).length,cases,metrics,sourceHashes,scriptSha256:createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'),remoteRequests:remote,scope:'Actual runtime DOM with 1000 synthetic products and held synthetic native transport; not production or physical device acceptance'};
if(process.env.ONLINE_NAVIGATION_PROOF_DIR){await mkdir(process.env.ONLINE_NAVIGATION_PROOF_DIR,{recursive:true});await writeFile(path.join(process.env.ONLINE_NAVIGATION_PROOF_DIR,'online-navigation-ux-proof.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));if(!report.passed||remote.length)process.exitCode=1;
