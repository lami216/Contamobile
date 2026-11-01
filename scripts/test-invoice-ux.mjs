import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);let chromium;
for(const name of [process.env.PLAYWRIGHT_MODULE,'playwright',fileURLToPath(new URL('../../Contatools-source/node_modules/playwright',import.meta.url))].filter(Boolean)){try{({chromium}=require(name));break}catch{}}
if(!chromium)throw Error('Playwright is required for disposable browser tests');
const root=fileURLToPath(new URL('../approved-runtime/',import.meta.url));
const server=createServer(async(req,res)=>{try{const request=new URL(req.url,'http://local.invalid').pathname,filename=path.resolve(root,'.'+(request==='/'?'/index.html':request));if(!filename.startsWith(root))throw Error('Invalid path');const content=await readFile(filename),extension=path.extname(filename);res.setHeader('Content-Type',extension==='.js'?'text/javascript':extension==='.css'?'text/css':extension==='.html'?'text/html':'application/octet-stream');res.end(content)}catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const results=[];
const check=async(name,fn)=>{try{await fn();results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.message});console.error('FAIL '+name+': '+error.stack)}};
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:process.env.PLAYWRIGHT_USE_BUNDLED==='1'?{}:{channel:'chrome'})});
 const origin='http://127.0.0.1:'+server.address().port;
 async function fixture(language='ar'){
  const context=await browser.newContext({viewport:{width:393,height:851},serviceWorkers:'block'}),page=await context.newPage();await page.goto(origin+'/?lang='+language);await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');
  for(const [key,value]of Object.entries({name:'مالك التدقيق',shop:'محل تدقيق مصطنع',username:'ux-owner',password:'123456'}))await page.locator('#site-auth-form [name='+key+']').fill(value);
  await page.locator('[data-action="site:setup"]').click();await page.locator('.nav').waitFor();return {context,page};
 }
 async function addProduct(page,{name='زيت',qty=3,price=500,cost=400}={}){await page.evaluate(async()=>{await act('go:inventory');await act('open:product')});await page.evaluate(values=>{for(const [key,value]of Object.entries({...values,openingWarehouse:S.warehouse})){const input=document.querySelector('#sheet-form [name="'+key+'"]');if(input)input.value=String(value)}},{name,qty,price,cost});await page.evaluate(()=>act('save-product'));return page.evaluate(()=>S.products.at(-1).id)}
 await check('open/back restores query, invoice type, sort, page and both scroll positions without restoring source highlight',async()=>{
  const {context,page}=await fixture();try{
   await page.evaluate(async()=>{await act('go:operations');const date=new Date().toISOString().slice(0,10);S.records=Array.from({length:115},(_,index)=>({id:500+index,kind:'sale',number:String(index+1),date,time:'10:00',title:'عميل التدقيق',subtitle:'بيع مباشر',total:100,paid:100,due:0,lines:[]}));period='all';filter='sale';recordSort='oldest';search='عميل التدقيق';render();const key=document.querySelector('table[data-window-key]').dataset.windowKey;listWindowPages.set(key,2);render()});
   const before=await page.evaluate(()=>{const content=document.querySelector('#content'),scroll=document.querySelector('table[data-window-key]').closest('.register-scroll');content.scrollTop=150;scroll.scrollTop=220;return {outer:content.scrollTop,inner:scroll.scrollTop,key:document.querySelector('table[data-window-key]').dataset.windowKey,page:listWindowPages.get(document.querySelector('table[data-window-key]').dataset.windowKey)}});
   assert(before.inner>0);await page.evaluate(async()=>{await act('invoice:550');await act('back')});
   const after=await page.evaluate(()=>({search,filter,recordSort,view,outer:document.querySelector('#content').scrollTop,inner:document.querySelector('table[data-window-key]').closest('.register-scroll').scrollTop,key:document.querySelector('table[data-window-key]').dataset.windowKey,page:listWindowPages.get(document.querySelector('table[data-window-key]').dataset.windowKey),highlight:document.querySelectorAll('.source-record-focus').length}));
   assert.equal(after.search,'عميل التدقيق');assert.equal(after.filter,'sale');assert.equal(after.recordSort,'oldest');assert.equal(after.view,'operations');assert.equal(after.key,before.key);assert.equal(after.page,2);assert.equal(after.outer,before.outer);assert.equal(after.inner,before.inner);assert.equal(after.highlight,0);
   await page.evaluate(async()=>{await act('source-location:550');await act('invoice:550');await act('back')});assert.equal(await page.locator('.source-record-focus').count(),0);
  }finally{await context.close()}
 });
 await check('new purchase and dependent cancellation show actionable account/product details and keep posting rules',async()=>{
  const {context,page}=await fixture();try{
   const product=await addProduct(page);await page.evaluate(async id=>{await act('new:purchase');await act('pos:add:'+id);cart[0].qty=2;render();await act('pos:checkout')},product);
   const paymentTop=await page.locator('.sheet').evaluate(async element=>{await Promise.all(element.getAnimations().map(animation=>animation.finished.catch(()=>{})));return element.getBoundingClientRect().top});await page.evaluate(()=>act('post-sale'));
   assert.match(await page.locator('#form-error').textContent(),/رصيد حساب نقدي غير كافٍ.*المتاح 0.*المطلوب 800/);assert.equal(await page.evaluate(()=>S.records.filter(r=>r.kind==='purchase').length),0);
   assert.equal(await page.locator('.sheet').evaluate(element=>element.getBoundingClientRect().top),paymentTop);
   await page.evaluate(async()=>{S.accounts[0].balance=1000;S.opening.accounts[S.accounts[0].id]=1000;await act('post-sale')});const purchase=await page.evaluate(()=>selected);
   await page.evaluate(async id=>{await act('new:sale');await act('pos:add:'+id);cart[0].qty=4;render();await act('pos:checkout');await act('post-sale')},product);const sale=await page.evaluate(()=>selected);
   await page.evaluate(async id=>{await act('void:'+id);await act('confirm-void')},purchase);
   const error=await page.locator('#form-error').textContent();assert.match(error,/زيت/);assert.match(error,/المخزن الرئيسي/);assert.match(error,/النقص 1/);assert.equal(await page.evaluate(id=>S.records.find(r=>r.id===id).voided||false,purchase),false);
   assert.equal(await page.locator('#form-error [data-action="source-location:'+sale+'"]').count(),1);
   await page.locator('#form-error [data-action="source-location:'+sale+'"]').click();assert.equal(await page.evaluate(()=>view),'sale-source');assert.equal(await page.evaluate(()=>editingId),null);assert.equal(await page.locator('.source-record-focus').count(),1);
   await page.evaluate(async({sale,purchase})=>{await act('void:'+sale);await act('confirm-void');await act('void:'+purchase);await act('confirm-void')},{sale,purchase});
   const ending=await page.evaluate(id=>({stock:S.products.find(p=>p.id===id).stocks[S.warehouse],cash:S.accounts[0].balance,cancelled:S.records.filter(r=>r.kind==='sale'||r.kind==='purchase').every(r=>r.voided),actors:S.records.filter(r=>r.voided).map(r=>r.voidedByName)}),product);
   assert.equal(ending.stock,3);assert.equal(ending.cash,1000);assert.equal(ending.cancelled,true);assert(ending.actors.every(name=>name==='مالك التدقيق'));
  }finally{await context.close()}
 });
 await check('editing records line quantity, unit price, settlement, stable number and actual actor/time through persistence',async()=>{
  const {context,page}=await fixture();try{
   const oil=await addProduct(page,{name:'زيت',qty:10}),rice=await addProduct(page,{name:'أرز',qty:10,price:150,cost:100});
   await page.evaluate(async()=>{await act('new:sale');await act('pos:new-party');for(const [key,value]of Object.entries({name:'عميل التدقيق',phone:'22001122'}))document.querySelector('#sheet-form [name="'+key+'"]').value=value;await act('pos:save-party')});
   await page.evaluate(async({oil,rice})=>{await act('pos:add:'+oil);await act('pos:add:'+rice);cart.find(line=>line.id===rice).qty=2;render();await act('pos:checkout');await act('pos:settlement:note');await act('post-sale')},{oil,rice});
   const original=await page.evaluate(()=>({id:selected,number:S.records.find(r=>r.id===selected).number,total:S.records.find(r=>r.id===selected).total}));assert.equal(original.total,800);assert.equal(original.number,'1');
   await page.evaluate(async({id,rice})=>{await act('source-location:'+id);await act('invoice:'+id);await act('source:'+id);await act('pos:line:'+rice);document.querySelector('#sheet-form [name=quantity]').value='3';document.querySelector('#sheet-form [name=price]').value='140';await act('pos:save-line');await act('pos:checkout');await act('pos:settlement:paid');await act('post-sale');await act('explain:document:'+id)},{id:original.id,rice});
   const text=await page.locator('.sheet-body').textContent();for(const change of ['2 → 3','150 → 140','800 → 0','0 → 920'])assert(text.includes(change),change);assert(text.includes('مالك التدقيق'));assert(!text.includes('SALE-'+original.id));
   const revised=await page.evaluate(id=>{const r=S.records.find(r=>r.id===id);return {number:r.number,revision:r.revision,actor:r.updatedByName,time:r.updatedAt,total:r.total,due:r.due}},original.id);assert.equal(revised.number,'1');assert.equal(revised.revision,1);assert.equal(revised.actor,'مالك التدقيق');assert(revised.time);assert.equal(revised.total,920);assert.equal(revised.due,0);
   await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');assert.deepEqual(await page.evaluate(id=>{const r=S.records.find(r=>r.id===id);return {number:r.number,revision:r.revision,actor:r.updatedByName,time:r.updatedAt,total:r.total,due:r.due}},original.id),revised);
  }finally{await context.close()}
 });
 await check('French POS empty, draft-leave and below-cost warning are fully translated while product names stay original',async()=>{
  const {context,page}=await fixture('fr');try{
   await page.evaluate(()=>act('new:sale'));assert.equal(await page.locator('.pos-empty strong').textContent(),'Commencez votre facture');
   const product=await addProduct(page,{name:'منتج التدقيق',qty:5,price:150,cost:100});await page.evaluate(async id=>{await act('new:sale');await act('pos:add:'+id);cart[0].price=90;render()},product);
   assert.equal(await page.locator('.pos-table-name strong').textContent(),'منتج التدقيق');assert.equal(await page.locator('.pos-table-warning').textContent(),'Le prix est inférieur au coût d’achat');
   await page.evaluate(()=>act('go:inventory'));assert.equal(await page.locator('.sheet-head h2').textContent(),'La facture n’est pas enregistrée');assert(!/[\u0600-\u06ff]/u.test(await page.locator('.sheet').textContent()));
   await page.evaluate(async()=>{await act('close');await act('pos:checkout');await act('post-sale')});assert.equal(await page.locator('.sheet-head h2').textContent(),'Vente en dessous du coût d’achat');assert.equal(await page.locator('[data-action="pos:confirm-below-cost"]').textContent(),'Confirmer la vente à ce prix');
  }finally{await context.close()}
 });
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
console.log(JSON.stringify({tests:results.length,passed:results.filter(row=>row.passed).length,failed:results.filter(row=>!row.passed)}));assert(results.every(row=>row.passed),'Invoice UX browser regressions failed');
