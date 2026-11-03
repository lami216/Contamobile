import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);let chromium;
for(const name of [process.env.PLAYWRIGHT_MODULE,'playwright',fileURLToPath(new URL('../../Contatools-source/node_modules/playwright',import.meta.url))].filter(Boolean)){try{({chromium}=require(name));break}catch{}}
if(!chromium)throw Error('Playwright is required for disposable signed-account checks');
const root=fileURLToPath(new URL('../approved-runtime/',import.meta.url));
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://local.invalid').pathname,filename=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!filename.startsWith(root))throw Error('Invalid path');const extension=path.extname(filename);res.setHeader('Content-Type',extension==='.js'?'text/javascript':extension==='.css'?'text/css':extension==='.html'?'text/html':'application/octet-stream');res.end(await readFile(filename))}catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const results=[];
const check=async(name,fn)=>{try{await fn();results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.message});console.error('FAIL '+name+': '+error.stack)}};
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:process.env.PLAYWRIGHT_USE_BUNDLED==='1'?{}:{channel:'chrome'})});
 const origin='http://127.0.0.1:'+server.address().port;
 for(const language of ['ar','fr']){
  const context=await browser.newContext({viewport:{width:393,height:851},serviceWorkers:'block'}),page=await context.newPage();
  try{
   await page.goto(origin+'/?lang='+language);await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');
   for(const [key,value]of Object.entries({name:'مالك',shop:'متجر معزول',username:'signed-owner',password:'1234'}))await page.locator('#site-auth-form [name='+key+']').fill(value);
   await page.locator('[data-action="site:setup"]').click();await page.locator('.nav').waitFor();
   let account;
   await check(language+' account creation accepts signed numeric opening and persists it',async()=>{
    await page.evaluate(async()=>{await act('go:accounts');await act('open:account')});assert.equal(await page.locator('#sheet-form [name=balance]').getAttribute('min'),null);assert.equal(await page.locator('#sheet-form [name=balance]').getAttribute('type'),'number');
    await page.locator('#sheet-form [name=name]').fill('مصرف الحساب');await page.locator('#sheet-form [name=balance]').fill('-100');await page.evaluate(()=>act('save-account'));
    account=await page.evaluate(()=>S.accounts.at(-1).id);const saved=await page.evaluate(id=>({balance:S.accounts.find(a=>a.id===id).balance,opening:S.opening.accounts[id],card:S.accounts.find(a=>a.id===id).openingBalance}),account);assert.deepEqual(saved,{balance:-100,opening:-100,card:-100});
    await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');assert.equal(await page.evaluate(id=>S.accounts.find(a=>a.id===id).balance,account),-100);
   });
   await check(language+' opening correction accepts signed target and keeps reason and historical baseline',async()=>{
    await page.evaluate(id=>act('site:feature:account-opening:'+id),account);assert.equal(await page.locator('#sheet-form [name=opening]').getAttribute('min'),null);
    await page.locator('#sheet-form [name=opening]').fill('-250');await page.locator('#sheet-form [name=reason]').fill('تصحيح البداية');await page.evaluate(()=>act('site:feature:account-opening-save'));
    const saved=await page.evaluate(id=>{const a=S.accounts.find(a=>a.id===id),r=S.records.find(r=>r.openingAccountCorrection&&r.account===id);return {balance:a.balance,opening:a.openingBalance,kind:r.kind,total:r.total,paid:r.paid,before:r.openingBalanceBefore,after:r.openingBalanceAfter,note:r.note}},account);
    assert.deepEqual(saved,{balance:-250,opening:-250,kind:'withdraw',total:150,paid:150,before:-100,after:-250,note:'تصحيح البداية'});
    await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');assert.equal(await page.evaluate(id=>S.accounts.find(a=>a.id===id).balance,account),-250);
   });
   await check(language+' current balance correction is signed and leaves opening metadata intact',async()=>{
    await page.evaluate(id=>act('site:account-adjust:'+id),account);assert.equal(await page.locator('#sheet-form [name=balance]').getAttribute('min'),null);
    await page.locator('#sheet-form [name=balance]').fill('-400');await page.locator('#sheet-form [name=note]').fill('تسوية الرصيد');await page.evaluate(()=>act('site:post-account-adjust'));
    assert.deepEqual(await page.evaluate(id=>{const a=S.accounts.find(a=>a.id===id);return {balance:a.balance,opening:a.openingBalance,corrections:S.records.filter(r=>r.account===id).map(r=>r.total).sort((a,b)=>a-b)}},account),{balance:-400,opening:-250,corrections:[150,150]});
   });
   await check(language+' signed corrections still require a reason and show translated feedback',async()=>{
    const before=await page.evaluate(()=>JSON.stringify(S));await page.evaluate(id=>act('site:account-adjust:'+id),account);await page.locator('#sheet-form [name=balance]').fill('-500');await page.evaluate(()=>act('site:post-account-adjust'));
    assert.equal(await page.evaluate(()=>JSON.stringify(S)),before);const error=await page.locator('#form-error').textContent();assert.match(error,language==='fr'?/Saisissez un solde valide et le motif de (?:la )?correction/:/أدخل رصيدًا صحيحًا وسبب التصحيح/);await page.evaluate(()=>act('close'));
   });
   await check(language+' restore preview and replacement preserve negative accounts and owner credentials',async()=>{
    const backup=await page.evaluate(async()=>{const {ShopDatabase}=await import('/database.js');globalThis.signedAuditDb=await new ShopDatabase().open();return JSON.stringify({format:'alkarna-web-backup',schemaVersion:1,createdAt:new Date().toISOString(),state:await signedAuditDb.load(),users:await signedAuditDb.all('users')})});const previous=JSON.parse(backup),owner=previous.users[0];
    await page.evaluate(()=>act('site:restore'));await page.locator('.paste-backup summary').click();await page.locator('#backup-json').fill(backup);await page.evaluate(()=>act('site:review-import'));
    assert.equal(await page.evaluate(()=>modal),'site-import-review');await page.evaluate(()=>act('site:confirm-import'));
    const restored=await page.evaluate(async id=>{const saved=await signedAuditDb.load(),users=await signedAuditDb.all('users'),safety=await signedAuditDb.get('meta','safety-backup');return {account:saved.accounts.find(a=>a.id===id),opening:saved.opening.accounts[id],records:saved.records,users,safety:safety?.backup?.state?.accounts.find(a=>a.id===id).balance}},account);
    assert.deepEqual(restored.account,previous.state.accounts.find(a=>a.id===account));assert.equal(restored.opening,-100);assert.deepEqual(restored.records,previous.state.records);assert.deepEqual(restored.users[0].password,owner.password);assert.equal(restored.users[0].id,owner.id);assert.equal(restored.safety,-400);
   });
  }finally{await context.close()}
 }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
await mkdir('candidate-proof',{recursive:true});await writeFile('candidate-proof/signed-accounts-ux-proof.json',JSON.stringify({checks:results.length,results},null,2));
console.log(JSON.stringify({tests:results.length,passed:results.filter(row=>row.passed).length,failed:results.filter(row=>!row.passed)}));assert(results.every(row=>row.passed),'Signed-account browser regressions failed');
