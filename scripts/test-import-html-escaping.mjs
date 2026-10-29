import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);let chromium;
for(const name of [process.env.PLAYWRIGHT_MODULE,'playwright',fileURLToPath(new URL('../../Contatools-source/node_modules/playwright',import.meta.url))].filter(Boolean)){try{({chromium}=require(name));break}catch{}}
if(!chromium)throw Error('Playwright is required for synthetic imported-text tests');
const root=fileURLToPath(new URL('../approved-runtime/',import.meta.url));
const server=createServer(async(req,res)=>{try{const requestPath=new URL(req.url,'http://local.invalid').pathname,filename=path.resolve(root,'.'+(requestPath==='/'?'/index.html':requestPath));if(!filename.startsWith(root))throw Error('Invalid path');const content=await readFile(filename),extension=path.extname(filename);res.setHeader('Content-Type',extension==='.js'?'text/javascript':extension==='.css'?'text/css':extension==='.html'?'text/html':'application/octet-stream');res.end(content)}catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const results=[];
const marker='<img src="missing-synthetic-audit-image" onerror="window.__importMarkupMarker=typeof NativeHost===\'object\'?1:2">';
async function check(name,fn){try{await fn();results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.message});console.error('FAIL '+name+': '+error.message)}}
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:process.env.PLAYWRIGHT_USE_BUNDLED==='1'?{}:{channel:'chrome'})});
 const origin='http://127.0.0.1:'+server.address().port;
 async function fixture(language='ar'){
  const context=await browser.newContext({viewport:{width:393,height:851},serviceWorkers:'block'}),page=await context.newPage();
  await page.addInitScript(()=>{window.__importMarkupMarker=0;window.print=()=>{};window.NativeHost={licenseAllowed:()=>true,openActivation(){},closeApp(){}}});
  await page.goto(origin+'/?lang='+language);await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');
  for(const [name,value]of Object.entries({name:'Synthetic owner',shop:'Synthetic shop',username:'synthetic-owner',password:'123456'}))await page.locator('#site-auth-form [name='+name+']').fill(value);
  await page.locator('[data-action="site:setup"]').click();await page.locator('.nav').waitFor();return {context,page};
 }
 async function storeImportedRecord(page,kind,fields){
  await page.evaluate(async({kind,fields})=>{
   const {ShopDatabase,validateState}=await import('/database.js'),state=structuredClone(S),warehouse=state.warehouse;
   const record={id:101,kind,date:'2026-10-01',time:'10:00',number:'FAC-FR/2026-Été-001',title:'Synthetic imported record',total:0,paid:0,due:0,lines:[],...fields};
   if(kind==='stocktransfer'){state.warehouses.push('B');state.warehouseMeta.B={archived:false};state.products=[{id:1,name:'Synthetic product',price:10,cost:5,qty:9,stocks:{[warehouse]:9,B:1}}];state.opening.stocks={1:{[warehouse]:10,B:0}};record.from=warehouse;record.toWarehouse='B';record.lines=[{product:1,name:'Synthetic product',qty:1,price:5}];}
   state.records=[record];validateState(state);
   const db=await new ShopDatabase().open();await db.load();await db.replace(state,await db.all('users'));db.db.close();
  },{kind,fields});
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');
  if(await page.locator('[data-action="site:login"]').count()){await page.locator('#site-auth-form [name=username]').fill('synthetic-owner');await page.locator('#site-auth-form [name=password]').fill('123456');await page.locator('[data-action="site:login"]').click();}
  await page.locator('.nav').waitFor();
 }
 async function assertNoExecution(page,scope,literal){await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.__importMarkupMarker),0,'Imported markup executed in the trusted application');assert.equal(await page.locator(scope+' img[src="missing-synthetic-audit-image"]').count(),0);if(literal)assert((await page.locator(scope).textContent()).includes(literal),'Imported reference text was not preserved');}
 for(const field of ['number','time'])await check('validated imported '+field+' prints literally without executing trusted-page markup',async()=>{const {context,page}=await fixture();try{await storeImportedRecord(page,'expense',{[field]:marker});await page.evaluate(async()=>{selected=101;await act('site:print')});await assertNoExecution(page,'#print-root',marker);}finally{await context.close()}});
 await check('stock edit notice escapes the imported document reference',async()=>{const {context,page}=await fixture();try{await storeImportedRecord(page,'stocktransfer',{number:marker});await page.evaluate(()=>act('source:101'));await assertNoExecution(page,'.feature-stock-editor',marker);}finally{await context.close()}});
 await check('invoice history renders imported revision metadata as text',async()=>{const {context,page}=await fixture();try{await storeImportedRecord(page,'expense',{revision:marker});await page.evaluate(()=>act('invoice:101'));await assertNoExecution(page,'.invoice-document');await assertNoExecution(page,'.document-history',marker);await page.evaluate(()=>act('explain:document:101'));await assertNoExecution(page,'.sheet',marker);}finally{await context.close()}});
 await check('movement renderer escapes imported time metadata',async()=>{const {context,page}=await fixture();try{await storeImportedRecord(page,'expense',{time:marker});await page.evaluate(()=>{const node=document.createElement('section');node.id='audit-movement';node.innerHTML=movementRecord12({r:S.records[0],delta:-1,label:'Synthetic movement',amount:1,before:1,after:0},'account');document.body.append(node)});await assertNoExecution(page,'#audit-movement',marker);}finally{await context.close()}});
 await check('invoice preview escapes imported time metadata',async()=>{const {context,page}=await fixture();try{await storeImportedRecord(page,'expense',{time:marker});await page.evaluate(async()=>{await act('invoice:101');await act('open:print')});await assertNoExecution(page,'.paper',marker);}finally{await context.close()}});
 await check('French document references retain accents, punctuation and alphanumeric formatting',async()=>{const {context,page}=await fixture('fr');try{const number='FAC-FR/2026-Été & "Client" <réf> 001';await storeImportedRecord(page,'expense',{number});await page.evaluate(async()=>{selected=101;await act('site:print')});await assertNoExecution(page,'#print-root',number);assert.equal(await page.evaluate(()=>document.documentElement.lang),'fr');assert.equal(await page.evaluate(()=>S.records[0].number),number);}finally{await context.close()}});
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
console.log(JSON.stringify({tests:results.length,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed)}));assert(results.every(r=>r.passed),'Imported text escaping regressions failed');
