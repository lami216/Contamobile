import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);let chromium;
for(const name of [process.env.PLAYWRIGHT_MODULE,'playwright',fileURLToPath(new URL('../../Contatools-source/node_modules/playwright',import.meta.url))].filter(Boolean)){try{({chromium}=require(name));break}catch{}}
if(!chromium)throw Error('Playwright required');
const root=fileURLToPath(new URL('../approved-runtime/',import.meta.url));
const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://local.invalid').pathname,filename=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(path.relative(root,filename).startsWith('..'))throw Error('Invalid path');const content=await readFile(filename);res.setHeader('Content-Type',(/\.m?js$/.test(filename))?'text/javascript':filename.endsWith('.css')?'text/css':filename.endsWith('.html')?'text/html':'application/octet-stream');res.end(content)}catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const results=[];
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:process.env.PLAYWRIGHT_USE_BUNDLED==='1'?{}:{channel:'chrome'})});
 const origin='http://127.0.0.1:'+server.address().port;
 async function fixture(kind,language='ar'){
  const context=await browser.newContext({viewport:{width:393,height:851},serviceWorkers:'block'}),page=await context.newPage();
  await page.goto(origin+'/?lang='+language);await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');
  for(const [key,value]of Object.entries({name:'مالك التدقيق',shop:'تدقيق محاسبي',username:'audit',password:'1234'}))await page.locator('#site-auth-form [name='+key+']').fill(value);
  await page.locator('[data-action="site:setup"]').click();await page.locator('.nav').waitFor();
  await page.evaluate(async kind=>{
   const {ShopDatabase}=await import('/database.js'),db=await new ShopDatabase().open(),state=await db.load(),w=state.warehouse,date=new Date().toISOString().slice(0,10);
   state.products=[{id:1,name:'أرز',sku:'P1',price:10,cost:5,qty:0,stocks:{[w]:0}}];
   state.parties=[{id:1,name:'عميل',type:'customer',balance:0,archived:true},{id:2,name:'مورد',type:'supplier',balance:0,archived:true},{id:3,name:'غير مختار',type:'customer',balance:0,archived:true}];
   state.accounts=[{id:1,name:'نقدي',balance:0,active:true},{id:2,name:'مصرف',balance:0,archived:true,active:false},{id:3,name:'مصرف مؤرشف آخر',balance:0,archived:true,active:false}];
   state.opening={accounts:{1:0,2:100,3:0},parties:{1:100,2:100,3:0},stocks:{1:{[w]:0}}};
   const base={id:101,date,time:'10:00',paid:100,total:100,due:0,account:2,lines:[]};
   if(kind==='party')state.records=[{...base,kind:'pay',party:2}];
   if(kind==='customer'){state.opening.accounts[2]=-100;state.records=[{...base,kind:'receive',party:1}];}
   if(kind==='bank'){state.products[0].qty=1;state.products[0].stocks[w]=1;state.records=[{...base,kind:'purchase',warehouse:w,lines:[{product:1,name:'أرز',qty:1,price:100}]}];}
   if(kind==='stock'){
    state.parties=[];state.accounts=state.accounts.slice(0,1);state.accounts[0].balance=30;state.products[0].qty=9;state.products[0].stocks[w]=9;state.opening={accounts:{1:0},parties:{},stocks:{1:{[w]:10}}};
    state.records=[{id:101,kind:'adjustment',date,time:'09:00',warehouse:w,newQty:12,note:'أصلي',total:10,paid:0,due:0,lines:[{product:1,name:'أرز',qty:2,delta:2,price:5}]},{...base,id:102,kind:'sale',account:1,warehouse:w,paid:30,total:30,lines:[{product:1,name:'أرز',qty:3,price:10,costAtSale:5}]}];
   }
   if(kind==='migration'){state.accounts[1].balance=-45;state.parties[0].balance=80;state.parties[1].balance=-20;state.records=[];}
   delete state.stockEvents;delete state.stockEventSequence;
   await db.save(state);db.db.close();
  },kind);
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');await page.locator('.nav').waitFor();return {context,page};
 }
 const financial=page=>page.evaluate(()=>JSON.parse(JSON.stringify({accounts:S.accounts,parties:S.parties,products:S.products,records:S.records})));
 const waitForDurableFinancial=(page,expected)=>page.waitForFunction(async expected=>{
  // A rendered revision precedes transaction completion. Read the committed
  // snapshot before reloading, including when slow storage delays the click.
  const {ShopDatabase}=await import('/database.js'),db=await new ShopDatabase().open();
  try{const state=await db.load();return JSON.stringify({accounts:state.accounts,parties:state.parties,products:state.products,records:state.records})===JSON.stringify(expected)}finally{db.db.close()}
 },expected);
 const reload=async page=>{await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');await page.locator('.nav').waitFor()};
 async function check(name,kind,language,fn){let f;try{f=await fixture(kind,language);await fn(f.page);results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+': '+error.stack)}finally{await f?.context.close()}}
 for(const language of ['ar','fr']){
  await check(language+' void paid invoice restores and reveals archived payment account','bank',language,async page=>{
   await page.evaluate(async()=>{await act('void:101');await act('confirm-void')});let state=await financial(page);assert.equal(state.accounts[1].balance,100);assert.equal(state.accounts[1].archived,false);assert.equal(state.accounts[1].active,true);assert.equal(state.products[0].qty,0);assert.equal(state.records[0].voided,true);assert.equal(state.accounts[2].archived,true);await reload(page);assert.deepEqual(await financial(page),state);
  });
  await check(language+' void supplier payment restores debt and exposes it in totals','party',language,async page=>{
   await page.evaluate(async()=>{await act('void:101');await act('confirm-void')});let state=await financial(page);assert.equal(state.parties[1].balance,100);assert.equal(state.parties[1].archived,false);assert.equal(state.parties[0].archived,true);assert.equal(await page.evaluate(async()=>{const {partyFinancialSummary}=await import('/party-metrics.js');return partyFinancialSummary(S,'supplier').values.payable}),100);await reload(page);assert.deepEqual(await financial(page),state);
  });
  await check(language+' historical receipt edit can retain original archived entities without reactivating balanced customer','customer',language,async page=>{
   await page.evaluate(()=>act('source:101'));assert.equal(await page.locator('select[name=party] option[value="1"]').count(),1);assert.equal(await page.locator('select[name=party] option[value="3"]').count(),0);assert.equal(await page.locator('select[name=account] option[value="2"]').count(),1);assert.equal(await page.locator('select[name=account] option[value="3"]').count(),0);
   await page.locator('#sheet-form [name=note]').fill('note only');
   await page.evaluate(()=>{
    const put=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(value,...args){
     const request=put.call(this,value,...args);
     if(this.name==='snapshots'&&value.id==='shop'){
      IDBObjectStore.prototype.put=put;const until=performance.now()+200,store=this;
      const hold=()=>{const read=store.get('shop');read.onsuccess=()=>{if(performance.now()<until)hold()}};hold();
     }
     return request;
    };
   });
   await page.locator('[data-action="post-party"]').click();assert.equal(await page.locator('#form-error').count(),0);
   const state=await financial(page);assert.equal(state.records[0].revision,1);assert.equal(state.parties[0].balance,0);assert.equal(state.parties[0].archived,true);assert.equal(state.accounts[1].balance,0);assert.equal(state.accounts[1].archived,false);await waitForDurableFinancial(page,state);await reload(page);assert.deepEqual(await financial(page),state);
  });
  await check(language+' note-only correction edit preserves later sales and persists unchanged stock','stock',language,async page=>{
   await page.evaluate(()=>act('source:101'));assert.equal(await page.locator('#utility-form select[name=from]').isDisabled(),true);assert.equal(await page.locator('[data-action="site:feature:stock-add"]').count(),0);
   await page.locator('#utility-form [name=note]').fill('note only');await page.evaluate(async()=>{await act('review-utility');await act('site:feature:stock-confirm')});assert.equal(await page.locator('#form-error').count(),0);
   const state=await financial(page);assert.equal(state.products[0].qty,9);assert.equal(state.products[0].stocks[Object.keys(state.products[0].stocks)[0]],9);const correction=state.records.find(r=>r.id===101);assert.equal(correction.lines[0].delta,2);assert.equal(correction.lines[0].balanceBefore,10);assert.equal(correction.revision,1);await reload(page);assert.deepEqual(await financial(page),state);
  });
 }
 await check('archive repair is idempotent across cold reload and preserves all signed amounts','migration','ar',async page=>{
  const state=await financial(page);assert.equal(state.accounts[1].balance,-45);assert.equal(state.accounts[1].archived,false);assert.equal(state.parties[0].balance,80);assert.equal(state.parties[0].archived,false);assert.equal(state.parties[1].balance,-20);assert.equal(state.parties[1].archived,false);assert.equal(state.parties[2].archived,true);await reload(page);assert.deepEqual(await financial(page),state);
 });
 await check('failed durable cancellation rolls back archive flags, balances and invoice together','bank','ar',async page=>{
  const before=await financial(page);await page.evaluate(async()=>{await act('void:101');globalThis.__parityPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,...args){if(this.name==='snapshots'&&value.id==='shop')throw new DOMException('Synthetic no space','QuotaExceededError');return globalThis.__parityPut.call(this,value,...args)};await act('confirm-void');IDBObjectStore.prototype.put=globalThis.__parityPut;delete globalThis.__parityPut});assert.deepEqual(await financial(page),before);await reload(page);assert.deepEqual(await financial(page),before);
 });
 await mkdir('candidate-proof',{recursive:true});await writeFile('candidate-proof/accounting-parity-ux-proof.json',JSON.stringify({checks:results.length,results},null,2));
 if(results.some(r=>!r.passed))process.exitCode=1;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
