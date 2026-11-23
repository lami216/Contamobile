import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {desktopToMobileState} from '../approved-runtime/desktop-state-862.js';
import {references,commit,pins} from './desktop-0130-test-fixture.mjs';
const refs=await references(),state=desktopToMobileState(refs.backup.convertMobileBackup(refs.fixture.mobileBackupV23()));
const require=createRequire(import.meta.url);let chromium;for(const name of [process.env.PLAYWRIGHT_MODULE,'playwright'].filter(Boolean)){try{({chromium}=require(name));break}catch{}}if(!chromium)throw Error('Playwright required');
const root=fileURLToPath(new URL('../approved-runtime/',import.meta.url)),out=fileURLToPath(new URL('../outputs/desktop0130-qa/',import.meta.url));await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://local.invalid').pathname,filename=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(path.relative(root,filename).startsWith('..'))throw Error('path');res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.ttf':'font/ttf','.png':'image/png'})[path.extname(filename)]||'application/octet-stream');res.end(await readFile(filename));}catch{res.writeHead(404).end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const action=(page,value)=>page.evaluate(value=>act(value),value),checks=[];let browser;
const finances=page=>page.evaluate(()=>JSON.stringify({products:S.products,parties:S.parties,accounts:S.accounts,records:S.records,original:S.desktopOriginal,stockEvents:S.stockEvents,financialMovements:S.financialMovements,audit:S.auditEvents}));
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:process.env.PLAYWRIGHT_USE_BUNDLED==='1'?{}:{channel:'chrome'})});
 for(const [language,width,appearance]of [['ar',360,'dark'],['fr',393,'light']]){
  const context=await browser.newContext({viewport:{width,height:851},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  try{
   await page.goto('http://127.0.0.1:'+server.address().port+'/?lang='+language);await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');
   for(const [name,value]of Object.entries({name:'مالك',shop:'تدقيق السجل',username:'owner',password:'1234'}))await page.locator('#site-auth-form [name='+name+']').fill(value);
   await action(page,'site:setup');await page.locator('.nav').waitFor();await page.waitForFunction(()=>!karnaPersistenceBusy());await action(page,'appearance:'+appearance);
   await page.evaluate(async source=>{const{ShopDatabase}=await import('./database.js'),db=await new ShopDatabase().open(),old=await db.load();source.originId=old.originId;source.users=old.users;await db.save(source);db.db.close();},state);
   await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');await page.locator('.nav').waitFor();await page.waitForFunction(()=>!karnaPersistenceBusy());
   const before=await finances(page);
   for(const route of ['settings','more']){await action(page,'go:'+route);assert.equal(await page.locator('[data-action*="health-"]').count(),0);}
   for(const command of ['site:feature:health-open','site:feature:health-automatic','site:feature:health-confirm'])await action(page,command);
   assert.equal(await page.evaluate(()=>view==='accounting-health'||modal==='accounting-health-review'),false);assert.equal(await finances(page),before);checks.push(language+' removed cost-review workbench has no button, installed route or reachable mutation');console.log('PASS '+checks.at(-1));
   for(const record of state.records.filter(r=>r.kind==='settlement')){
    await action(page,'ledger:'+record.party);assert.equal(await page.locator('tr[data-action="invoice:'+record.id+'"]').count(),1);await action(page,'invoice:'+record.id);
    assert.equal(await page.locator('[data-action="source:'+record.id+'"]').count(),0);assert.equal(await page.locator('[data-action="void:'+record.id+'"]').count(),0);
    assert.equal(await page.locator('.invoice-document .document-note').textContent().then(value=>value.includes('تقاص تاريخي غير نقدي')),true);
    for(const blocked of ['source:'+record.id,'void:'+record.id,'confirm-void'])await action(page,blocked);
    assert.equal(await finances(page),before);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   }
   await page.screenshot({path:path.join(out,'historical-settlement-'+language+'.png'),fullPage:true});assert.deepEqual(errors,[]);checks.push(language+' historical customer and supplier settlements retain own ledger rows, literal note and read-only mobile preview');console.log('PASS '+checks.at(-1));
  }catch(error){console.error(JSON.stringify({language,errors,body:(await page.locator('body').innerText()).slice(-2500)}));throw error;}
  finally{await context.close();}
 }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
await writeFile(path.join(out,'history-parity-0130-ux.json'),JSON.stringify({sourceCommit:commit,sourceHashes:pins,tests:checks.length,passed:checks.length,cases:checks},null,2)+'\n');console.log(JSON.stringify({tests:checks.length,passed:checks.length}));
