import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);let chromium;
for(const name of [process.env.PLAYWRIGHT_MODULE,'playwright',fileURLToPath(new URL('../../Contatools-source/node_modules/playwright',import.meta.url))].filter(Boolean)){try{({chromium}=require(name));break}catch{}}
if(!chromium)throw Error('Playwright is required for disposable browser tests');
const root=path.resolve(fileURLToPath(new URL('../approved-runtime/',import.meta.url))),output=fileURLToPath(new URL('../outputs/desktop862-qa/',import.meta.url));
await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://local.invalid').pathname,filename=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!filename.startsWith(root+path.sep))throw Error('Invalid path');const content=await readFile(filename),extension=path.extname(filename);res.setHeader('Content-Type',extension==='.js'?'text/javascript':extension==='.css'?'text/css':extension==='.html'?'text/html':'application/octet-stream');res.end(content)}catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const results=[];
const action=(page,command)=>page.evaluate(command=>act(command),command),shop=page=>page.evaluate(()=>structuredClone(S));
async function fields(page,values,form='#sheet-form'){for(const[name,value]of Object.entries(values)){const target=page.locator(`${form} [name="${name}"]`);if(await target.evaluate(el=>el.tagName)==='SELECT')await target.selectOption(String(value));else await target.fill(String(value))}}
async function noError(page){const target=page.locator('#form-error');if(await target.count())assert(!(await target.textContent())?.trim(),await target.textContent())}
async function reload(page){await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');await page.locator('.nav').waitFor()}
const check=async(name,fn)=>{try{await fn();results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.message});console.error('FAIL '+name+': '+error.stack)}};
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:process.env.PLAYWRIGHT_USE_BUNDLED==='1'?{}:{channel:'chrome'})});
 const origin='http://127.0.0.1:'+server.address().port;
 async function fixture(){
  const context=await browser.newContext({viewport:{width:393,height:851},serviceWorkers:'block'}),page=await context.newPage(),errors=[],exports=[];context.setDefaultTimeout(6000);page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/export',async route=>{exports.push(route.request().postDataBuffer());await route.fulfill({json:{url:'/download-'+exports.length}})});
  await page.goto(origin+'/?lang=ar');await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');await fields(page,{name:'مالك الاختبار',shop:'متجر الاختبار',username:'owner',password:'1234'},'#site-auth-form');await action(page,'site:setup');await page.locator('.nav').waitFor();return{context,page,errors,exports};
 }
 async function seed(page,{micro=false,bankFirst=false}={}){
  await page.evaluate(async({micro,bankFirst})=>{const{ShopDatabase}=await import('./database.js');const db=new ShopDatabase();await db.open();const s=await db.load(),w=s.warehouses[0];
   s.parties=[{id:11,type:'customer',name:'الاسم القديم',phone:'22001122',balance:0},{id:12,type:'customer',name:'حساب مؤرشف',phone:'33001122',balance:0,archived:true},{id:13,type:'supplier',name:'مورد المراجعة',phone:'44001122',balance:0}];
   s.products=[{id:1,name:'سكر',sku:'P1',price:100,cost:40,openingCost:40,qty:3,stocks:Object.fromEntries(s.warehouses.map(x=>[x,x===w?3:0]))}];
   s.accounts=bankFirst?[{id:1,code:'bank-1',desktopId:'bank',name:'حساب البنك',balance:0},{id:2,code:'cash',desktopId:'cash',desktop:{code:'cash'},name:'نقدي',balance:60}]:s.accounts.map((a,i)=>({...a,balance:i===0?60:0}));
   const account=bankFirst?2:s.accounts[0].id,base={date:new Date().toISOString().slice(0,10),time:'10:00',status:'posted',revision:0,warehouse:w,account,note:'',due:0};
   s.records=[{...base,id:101,kind:'sale',number:'SALE-101',title:'الاسم القديم',party:11,total:100,paid:100,lines:[{id:'L1',product:1,name:'سكر',qty:1,price:100,lineTotal:100,lineTotalMode:'exact',costAtSale:40}]},{...base,id:102,kind:'purchase',number:'PUR-102',title:'مورد المراجعة',party:13,total:40,paid:40,lines:[{id:'L2',product:1,name:'سكر',qty:1,price:40,lineTotal:40,lineTotalMode:'exact'}]}];
   s.opening={stocks:{1:Object.fromEntries(s.warehouses.map(x=>[x,x===w?3:0]))},accounts:Object.fromEntries(s.accounts.map(a=>[a.id,0])),parties:Object.fromEntries(s.parties.map(p=>[p.id,0]))};s.stockEvents=[];
   if(micro){s.parties[0].balance=.0001;s.opening.parties[11]=.0001;}
   await db.save(s);db.db.close();
  },{micro,bankFirst});await reload(page);
 }
 async function createParty(page,type,phone,name='حساب جديد'){
  await page.evaluate(async type=>{await act('go:parties');partyType=type;await act('open:party')},type);await fields(page,{name,phone});await action(page,'save-party');
 }
 await check('sales preset opens its sale and exports it without records rights while purchase and payroll remain private',async()=>{const{context,page,errors,exports}=await fixture();try{
  await seed(page);await action(page,'site:feature:employees-new');const startDate=await page.locator('#sheet-form [name=startDate]').inputValue();await fields(page,{name:'اسم موظف خاص',phone:'55001122',startDate,amount:'500',intervalMonths:'1',entitlement:'beginning'});await action(page,'site:feature:employees-save');await noError(page);await action(page,'site:feature:employees-payment-new');await fields(page,{amount:'1',direction:'withdraw',paymentMethod:'1',note:'حركة خاصة'});await action(page,'site:feature:employees-payment-save');await noError(page);const employeeRecord=await page.evaluate(()=>S.records.find(r=>r.kind==='employee-payment').id);
  await action(page,'site:new-user');await fields(page,{name:'موظف البيع',username:'seller',password:'1234'});await action(page,'site:feature:permission-preset:sales');await action(page,'site:feature:user-save');await noError(page);await action(page,'site:logout');await fields(page,{username:'seller',password:'1234'},'#site-auth-form');await action(page,'site:login');await page.locator('.nav').waitFor();
  await action(page,'go:sale-source');assert(await page.locator('[data-action="invoice:101"]').count());assert.equal(await page.locator('[data-action="invoice:102"]').count(),0);await action(page,'invoice:101');assert.equal(await page.evaluate(()=>view),'invoice');assert.match(await page.locator('#content').textContent(),/SALE-101/);
  await action(page,'site:feature:document-output');assert.equal(await page.evaluate(()=>modal),'feature-document-output');await action(page,'site:feature:document-excel');assert.equal(exports.length,1);assert.equal(exports[0].subarray(0,2).toString(),'PK');await action(page,'close');
  for(const id of [102,employeeRecord]){await action(page,'go:home');await action(page,'invoice:'+id);assert.notEqual(await page.evaluate(()=>view),'invoice');await page.evaluate(id=>{selected=id},id);await action(page,'site:feature:document-output');assert.notEqual(await page.evaluate(()=>modal),'feature-document-output');await action(page,'site:feature:document-excel');assert.equal(exports.length,1)}assert.deepEqual(errors,[]);
 }finally{await context.close()}});
 await check('normal and POS forms reject duplicate active or archived same-role phone and permit cross-role reuse',async()=>{const{context,page,errors}=await fixture();try{
  await seed(page);const original=(await shop(page)).parties.length;
  for(const phone of ['22001122','33001122']){await createParty(page,'customer',phone);assert.match(await page.locator('#form-error').textContent(),/رقم الهاتف مستخدم/);assert.equal((await shop(page)).parties.length,original);await action(page,'close')}
  await createParty(page,'supplier','22001122','مورد بنفس الهاتف');await noError(page);assert.equal((await shop(page)).parties.length,original+1);
  await action(page,'new:sale');for(const phone of ['22001122','33001122']){await action(page,'pos:new-party');await fields(page,{name:'عميل مكرر',phone});await action(page,'pos:save-party');assert.match(await page.locator('#form-error').textContent(),/رقم الهاتف مستخدم/);assert.equal((await shop(page)).parties.length,original+1);await action(page,'close')}
  await action(page,'new:purchase');await action(page,'pos:new-party');await fields(page,{name:'مورد جديد',phone:'33001122'});await action(page,'pos:save-party');await noError(page);assert.equal((await shop(page)).parties.length,original+2);await reload(page);assert.equal((await shop(page)).parties.length,original+2);assert.deepEqual(errors,[]);
 }finally{await context.close()}});
 await check('renamed party is current in invoice, register search, workbook and PDF model with original financial values preserved',async()=>{const{context,page,errors,exports}=await fixture();try{
  await seed(page);const original=(await shop(page)).records.find(r=>r.id===101);await action(page,'ledger:11');await action(page,'open:partyedit');await fields(page,{name:'الاسم الجديد',phone:'22001122'});await action(page,'save-party');await noError(page);await action(page,'invoice:101');assert.match(await page.locator('#content').textContent(),/الاسم الجديد/);await action(page,'go:operations');
  const search=page.locator('#content input[type=search],#content input[placeholder]').first();await search.fill('الاسم الجديد');assert(await page.locator('[data-action="invoice:101"]').count(),'register search must find current name');
  const data=await page.evaluate(async()=>{const{recordExportData}=await import('./record-export.js'),{invoicePdfModel,reportModel}=await import('./report-output.js');const r=S.records.find(r=>r.id===101);return {excel:recordExportData(S,[r],documentLabels),pdf:invoicePdfModel(S,r,documentLabels),register:reportModel(S,[r],documentLabels,'الكل'),record:structuredClone(r)}});
  for(const key of ['excel','pdf','register'])assert(JSON.stringify(data[key]).includes('الاسم الجديد'),key+' must resolve current party name');for(const key of ['total','paid','due','lines'])assert.deepEqual(data.record[key],original[key],key+' must remain unchanged');
  await action(page,'invoice:101');await action(page,'site:feature:document-pdf');assert.equal(exports.length,1);assert.equal(exports[0].subarray(0,5).toString(),'%PDF-');await reload(page);await action(page,'invoice:101');assert.match(await page.locator('#content').textContent(),/الاسم الجديد/);assert.deepEqual(errors,[]);
 }finally{await context.close()}});
 await check('bank-first import protects semantic cash including legacy code placement and a nonzero micro-debt cannot archive',async()=>{const{context,page,errors}=await fixture();try{
  await page.evaluate(async()=>{const{desktopToMobileState}=await import('./desktop-state-862.js'),{ShopDatabase}=await import('./database.js');const db=new ShopDatabase();await db.open();const prior=await db.load();const s=desktopToMobileState({format:'conta-backup',schemaVersion:1,collections:{products:[],parties:[],warehouses:[{id:'w',name:'المخزن الرئيسي',isSalesDefault:true}],documents:[],paymentAccounts:[{id:'bank',code:'bank-1',name:'حساب البنك',balance:0,isActive:true},{id:'cash',code:'cash',name:'نقدي',balance:0,isActive:true}],financialMovements:[]}});s.originId=prior.originId;s.users=prior.users;await db.save(s);db.db.close()});await reload(page);
  const imported=await shop(page),bank=imported.accounts.find(a=>a.code==='bank-1'),cash=imported.accounts.find(a=>a.code==='cash');assert.notEqual(bank.id,cash.id);assert.equal(await page.evaluate(()=>karnaBusiness.cashAccount(S).id),cash.id);
  await action(page,'site:archive-account:'+cash.id);assert.notEqual((await shop(page)).accounts.find(a=>a.id===cash.id).archived,true);await action(page,'site:archive-account:'+bank.id);assert.equal((await shop(page)).accounts.find(a=>a.id===bank.id).archived,true);
  await seed(page,{bankFirst:true});await page.evaluate(async()=>{const{ShopDatabase}=await import('./database.js');const db=new ShopDatabase();await db.open();const s=await db.load(),a=s.accounts.find(a=>a.id===2);a.desktop={...a.desktop,code:'cash'};delete a.code;await db.save(s);db.db.close()});await reload(page);assert.equal(await page.evaluate(()=>karnaBusiness.cashAccount(S).id),2);await action(page,'site:archive-account:2');assert.notEqual((await shop(page)).accounts.find(a=>a.id===2).archived,true);
  await seed(page,{micro:true,bankFirst:true});await action(page,'ledger:11');await action(page,'site:feature:party-archive:11');assert.notEqual(await page.evaluate(()=>modal),'feature-confirm');assert.notEqual((await shop(page)).parties.find(p=>p.id===11).archived,true);await reload(page);assert.equal((await shop(page)).parties.find(p=>p.id===11).balance,.0001);assert.deepEqual(errors,[]);
 }finally{await context.close()}});
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
const report={suite:'business-identity-ux-862',tests:results.length,passed:results.filter(row=>row.passed).length,failed:results.filter(row=>!row.passed),results};await writeFile(path.join(output,'business-identity-ux-862.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));assert(results.every(row=>row.passed),'Business identity UX regressions failed');
