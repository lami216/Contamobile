import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {currentMobileBusinessFixture} from './desktop-business-fixture.mjs';
import {readBusinessInterchange} from '../approved-runtime/business-interchange.js';
import {desktopToMobileState} from '../approved-runtime/desktop-state-862.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../approved-runtime/',import.meta.url)),out=new URL('../outputs/desktop0130-qa/',import.meta.url),saved=[];
const server=createServer(async(req,res)=>{try{
 const pathname=new URL(req.url,'http://local.invalid').pathname;
 if(req.method==='POST'&&pathname==='/api/export'){const chunks=[];for await(const chunk of req)chunks.push(chunk);saved.push(JSON.parse(Buffer.concat(chunks).toString()));res.setHeader('content-type','application/json');return res.end(JSON.stringify({url:'/synthetic-export-'+saved.length+'.json'}));}
 const filename=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(path.relative(root,filename).startsWith('..'))throw Error('path');
 res.setHeader('content-type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.ttf':'font/ttf'})[path.extname(filename)]||'application/octet-stream');res.end(await readFile(filename));
}catch{res.writeHead(404).end()}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;const checks=[],state=await currentMobileBusinessFixture();
const command=async(page,value)=>{await page.evaluate(value=>act(value),value);await page.waitForFunction(()=>!karnaPersistenceBusy());};
const business=page=>page.evaluate(()=>JSON.stringify({products:S.products,parties:S.parties,accounts:S.accounts,records:S.records,opening:S.opening,employees:S.employees}));
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 for(const [language,width]of [['ar',360],['fr',393]]){
  const context=await browser.newContext({viewport:{width,height:851},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto('http://127.0.0.1:'+server.address().port+'/?lang='+language);await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');
   for(const [key,value]of Object.entries({name:'مالك الاختبار',shop:'حساب معزول',username:'kept-owner',password:'4826'}))await page.locator('#site-auth-form [name='+key+']').fill(value);
   await command(page,'site:setup');await page.locator('.nav').waitFor();
   await page.evaluate(async source=>{const{ShopDatabase}=await import('./database.js'),db=await new ShopDatabase().open(),old=await db.load();source.users=old.users;await db.save(source);db.db.close()},state);
   await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');await page.locator('.nav').waitFor();await page.waitForFunction(()=>!karnaPersistenceBusy());
   const unchangedWarehouseBusiness=await business(page);
   const warehouseBefore=await page.evaluate(async()=>{const{createDesktopBusinessBackup}=await import('./desktop-backup-export.js');return createDesktopBusinessBackup(S).backup.collections.warehouses.map(w=>({name:w.name,id:w.id}));});
   const warehouseName=warehouseBefore[0].name;
   await command(page,'go:warehouses');await command(page,'warehouse-edit:'+warehouseName);await page.locator('#sheet-form [name=name]').fill(warehouseName);await command(page,'save-warehouse');
   assert.equal(await business(page),unchangedWarehouseBusiness,'Saving the unchanged name cannot delete stock or opening balances');
   assert.equal(await page.evaluate(name=>S.warehouseMeta[name].canonicalId,warehouseName),warehouseBefore[0].id);
   assert.equal(await page.evaluate(name=>S.warehouseMeta[name].canonicalId,warehouseBefore[1].name),warehouseBefore[1].id);
   const warehouseDurable=await page.evaluate(async()=>{const{ShopDatabase}=await import('./database.js');return JSON.stringify(await new ShopDatabase().get('snapshots','shop'));});
   await command(page,'warehouse-edit:'+warehouseName);await page.locator('#sheet-form [name=name]').fill(warehouseBefore[1].name);await command(page,'save-warehouse');
   assert.equal(await page.evaluate(()=>modal),'warehouse-editor');
   assert.equal(await page.evaluate(async()=>{const{ShopDatabase}=await import('./database.js');return JSON.stringify(await new ShopDatabase().get('snapshots','shop'));}),warehouseDurable);
   const renamed=language==='fr'?'Dépôt principal':'المخزن المتجدد';await page.locator('#sheet-form [name=name]').fill(renamed);await command(page,'save-warehouse');
   const warehouseAfter=await page.evaluate(async()=>{const{createDesktopBusinessBackup}=await import('./desktop-backup-export.js');return createDesktopBusinessBackup(S).backup.collections.warehouses.map(w=>({name:w.name,id:w.id}));});
   assert.equal(warehouseAfter.find(w=>w.name===renamed).id,warehouseBefore[0].id);assert.equal(warehouseAfter.find(w=>w.name===warehouseBefore[1].name).id,warehouseBefore[1].id);
   checks.push(language+' actual warehouse unchanged-name save, rejected duplicate and rename retain canonical identities without orphan references');
   const before=await business(page),usersBefore=await page.evaluate(async()=>{const{ShopDatabase}=await import('./database.js');return JSON.stringify(await new ShopDatabase().all('users'))});
   await command(page,'go:backup');assert.equal(await page.locator('[data-action="site:feature:export-desktop-business"]').count(),1);
   await command(page,'site:feature:export-desktop-business');assert.equal(await page.evaluate(()=>modal),'site-export-ready');
   const payload=saved.at(-1);assert.ok(payload);readBusinessInterchange(payload);const decoded=desktopToMobileState(payload);assert(decoded.accounts.some(a=>a.balance<0));assert(decoded.employees.length);assert.deepEqual(payload.backup.collections.users,[]);assert(!JSON.stringify(payload).includes('PBKDF2-SHA256'));assert.equal(await business(page),before);
   checks.push(language+' current business export is reachable and preserves source accounting without credentials');
   await command(page,'close');await command(page,'site:feature:import');await page.locator('#feature-import-file').setInputFiles({name:'own-business.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});await command(page,'site:feature:import-review');assert.equal(await page.evaluate(()=>modal),'site-import-review');assert.equal(await page.locator('[data-action="site:feature:import-commit"]').count(),0);assert.equal(await business(page),before);checks.push(language+' native JSON selected from legacy import follows the existing full-restore preview before any replacement');
   await command(page,'close');await command(page,'site:restore');await page.locator('.paste-backup > summary').click();await page.locator('#backup-json').fill(JSON.stringify(payload));await command(page,'site:review-import');assert.equal(await page.locator('[data-action="site:confirm-import"]').count(),1);
   await command(page,'site:confirm-import');await page.locator('#site-auth-form').waitFor();
   const usersAfter=await page.evaluate(async()=>{const{ShopDatabase}=await import('./database.js');return JSON.stringify(await new ShopDatabase().all('users'))});assert.equal(usersAfter,usersBefore);
   await page.locator('#site-auth-form [name=username]').fill('kept-owner');await page.locator('#site-auth-form [name=password]').fill('4826');await command(page,'site:login');await page.locator('.nav').waitFor();assert.equal(await page.evaluate(()=>S.accounts.some(a=>a.balance<0)),true);
   await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');await page.locator('.nav').waitFor();assert.equal(await page.evaluate(()=>S.employees.length),decoded.employees.length);
   checks.push(language+' actual restore retains the destination username and password then survives real relogin and cold reload');
   await command(page,'go:reports');assert.equal(await page.evaluate(()=>Object.keys(browseReports).length),9);assert.equal(await page.evaluate(()=>Object.hasOwn(browseReports,'profit')),false);assert.equal(await page.locator('[data-action^="site:feature:report-metric:"]').count()>0,true);
   checks.push(language+' nine Desktop report destinations retain overview metric drilldowns');assert.deepEqual(errors,[]);
  }finally{await context.close()}
 }
 await mkdir(out,{recursive:true});await writeFile(new URL('business-interchange-ux.json',out),JSON.stringify({source:'2327ccc',checks,passed:checks.length},null,2));console.log(JSON.stringify({checks:checks.length,passed:checks.length}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
