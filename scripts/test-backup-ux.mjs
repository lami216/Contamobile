import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const require=createRequire(import.meta.url);let chromium;
for(const candidate of [process.env.PLAYWRIGHT_MODULE,'playwright',fileURLToPath(new URL('../../Contatools-source/node_modules/playwright',import.meta.url))].filter(Boolean)){try{({chromium}=require(candidate));break}catch{}}
if(!chromium)throw Error('Playwright is required for backup UX tests.');
const root=fileURLToPath(new URL('../approved-runtime/',import.meta.url));
const server=createServer(async(req,res)=>{try{
 const relative=new URL(req.url,'http://local.invalid').pathname.slice(1)||'index.html',file=path.resolve(root,relative);
 if(!file.startsWith(root))throw Error('Invalid path');
 let bytes=await readFile(file);
 if(relative==='app.js')bytes=Buffer.from(bytes.toString().replace('const localBackupScreen=backupScreen;','globalThis.__backupUxController=cloudBackup;\nconst localBackupScreen=backupScreen;'));
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(bytes);
}catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,results=[];
let browser;
const check=async(name,fn)=>{try{await fn();results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack||error.message});console.error('FAIL '+name+'\n'+error.stack)}};
const idle=page=>page.waitForFunction(()=>!globalThis.karnaPersistenceBusy());
async function command(page,action){await page.evaluate(action=>act(action),action);await idle(page)}
async function fixture(lang='ar',width=393){
 const context=await browser.newContext({viewport:{width,height:851},serviceWorkers:'block'}),page=await context.newPage();
 await page.addInitScript(lang=>{
  localStorage.setItem('alkarna-site-language',lang);
  globalThis.__backupCalls=[];globalThis.__backupFiles=[];
  globalThis.__backupStatus={settings:{consent:false,schedule:'daily',time:'21:00',weekday:1,wifiOnly:false},stage:'disabled',lastSuccessAt:0,server:{entitlement:{enabled:true,active:true,endsAt:Date.now()+86400000,downloadUntil:Date.now()+31*86400000,usedBytes:1024,quotaBytes:10485760}}};
  window.NativeFiles={
   async saveBlob(name,blob){globalThis.__backupFiles.push({name,text:await blob.text()});return {saved:true}},
   async cloudBackup(command,data){
    globalThis.__backupCalls.push({command,data:structuredClone(data)});
    if(globalThis.__backupOffline&&data.refresh)throw Error('Synthetic offline');
    if(command==='configure')Object.assign(globalThis.__backupStatus.settings,data);
    if(command==='pause')globalThis.__backupStatus.paused=true;
    if(command==='run'){globalThis.__backupStatus.lastSuccessAt=Date.now();globalThis.__backupStatus.changesPending=false;globalThis.__backupStatus.stage='up-to-date'}
    if(command==='list')return {versions:[{id:'synthetic-copy',sizeBytes:2048,createdAt:Date.now()-3600000}],nextCursor:null};
    if(command==='download')return {text:globalThis.__backupSnapshot,version:{id:data.backupId}};
    return structuredClone(globalThis.__backupStatus);
   },
   async stageCloudBackup(){globalThis.__backupCalls.push({command:'stage'});return structuredClone(globalThis.__backupStatus)}
  };
 },lang);
 await page.goto(origin+'/');await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');
 for(const [key,value]of Object.entries({name:'مالك النسخ',shop:'محل النسخ',username:'backup-owner',password:'1234'}))await page.locator('#site-auth-form [name='+key+']').fill(value);
 await page.locator('[data-action="site:setup"]').click();await page.locator('.nav').waitFor();await idle(page);
 await page.evaluate(async()=>{const {ShopDatabase}=await import('./database.js'),db=await new ShopDatabase().open();globalThis.__backupSnapshot=JSON.stringify((await db.cloudSnapshot()).payload);db.db.close()});
 await command(page,'go:backup');
 await page.waitForFunction(()=>globalThis.__backupCalls.some(call=>call.command==='status'&&call.data.refresh===true));
 return {context,page};
}
async function noOverflow(page){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&[...document.querySelectorAll('.sheet,.panel,.feature-details')].every(e=>e.getBoundingClientRect().right<=innerWidth+1&&e.getBoundingClientRect().left>=-1)),'Backup UI overflows viewport')}
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:process.env.PLAYWRIGHT_USE_BUNDLED==='1'?{}:{channel:'chrome'})});
 for(const [lang,width]of [['ar',360],['ar',393],['fr',360],['fr',393]])await check(`three clear tasks and advanced import fit ${lang} ${width}px`,async()=>{
  const {context,page}=await fixture(lang,width);try{
   assert.equal(await page.locator('#content [data-action="site:backup"],#content [data-action="site:restore"],#content [data-action="cloud:overview"]').count(),3);
   assert.equal(await page.locator('[data-action="site:desktop-import"],[data-action="site:previous-backup"],[data-action="site:feature:import-resume"],[data-action="cloud:refresh"]').count(),0);
   assert.equal(await page.locator('#phone').getAttribute('dir'),lang==='ar'?'rtl':'ltr');
   assert.equal(await page.locator('[data-action="site:feature:import"]').isVisible(),false);
   assert(!await page.locator('#content').innerText().then(text=>text.includes('جارٍ قراءة الحالة')));
   await noOverflow(page);await page.locator('.feature-details>summary').click();assert.equal(await page.locator('[data-action="site:feature:import"]').isVisible(),true);
   if(lang==='fr')assert(!/[\u0600-\u06ff]/.test(await page.locator('#content').innerText()),'Arabic system labels remain in French backup page');
   if(width===393){await mkdir('candidate-proof',{recursive:true});await page.screenshot({path:`candidate-proof/backup-ux-${lang}-393.png`})}
   if(lang==='fr'){await command(page,'site:restore');assert(!/[\u0600-\u06ff]/.test(await page.locator('.sheet').innerText()),'Arabic labels remain in French restore');await noOverflow(page)}
  }finally{await context.close()}
 });
 await check('offline file export keeps a complete usable backup and does not call server upload',async()=>{
  const {context,page}=await fixture();try{
   await context.setOffline(true);await page.evaluate(()=>{globalThis.__backupOffline=true});
   await command(page,'site:backup');
   const file=await page.evaluate(()=>globalThis.__backupFiles.at(-1)),payload=JSON.parse(file.text);
   assert.equal(payload.format,'alkarna-web-backup');assert.equal(payload.users[0].username,'backup-owner');assert(payload.state.originId);
   assert.equal(await page.evaluate(()=>globalThis.__backupCalls.filter(x=>x.command==='run'||x.command==='stage').length),0);
   await command(page,'site:restore');assert.equal(await page.locator('#backup-file').count(),1);
  }finally{await context.close()}
 });
 await check('dated safety copy appears inside restore only when durable safety data exists',async()=>{
  const {context,page}=await fixture();try{
   await command(page,'site:restore');assert.equal(await page.locator('[data-action="site:previous-backup"]').count(),0);
   await command(page,'close');await page.evaluate(async()=>{const {ShopDatabase}=await import('./database.js'),db=await new ShopDatabase().open(),payload=JSON.parse(globalThis.__backupSnapshot);await db.put('meta',{id:'safety-backup',backup:{state:payload.state,users:payload.users},savedAt:'2026-10-21T13:45:00Z'});db.db.close()});
   await command(page,'site:restore');const details=page.locator('.sheet .feature-details');assert.equal(await details.count(),1);await details.locator('summary').click();assert.match(await details.innerText(),/2026/);
   await page.locator('[data-action="site:previous-backup"]').click();await idle(page);
   const result=await page.evaluate(()=>JSON.parse(globalThis.__backupFiles.at(-1).text));assert.equal(result.state.originId,JSON.parse(await page.evaluate(()=>globalThis.__backupSnapshot)).state.originId);
  }finally{await context.close()}
 });
 await check('a saved merge is resumed from import without adding duplicate main-page controls',async()=>{
  const {context,page}=await fixture();try{
   await command(page,'site:feature:import');assert.equal(await page.locator('[data-action="site:feature:import-resume"]').count(),0);
   const snapshot=await page.evaluate(()=>globalThis.__backupSnapshot);await page.locator('#feature-import-file').setInputFiles({name:'existing.json',mimeType:'application/json',buffer:Buffer.from(snapshot)});
   await command(page,'site:feature:import-review');assert.equal(await page.locator('[data-action="site:feature:import-commit"]').count(),1);
   await command(page,'close');assert.equal(await page.locator('#content [data-action="site:feature:import-resume"]').count(),0);
   await command(page,'site:feature:import');assert.equal(await page.locator('[data-action="site:feature:import-resume"]').count(),1);
   await command(page,'site:feature:import-resume');assert.equal(await page.locator('[data-action="site:feature:import-commit"]').count(),1);
  }finally{await context.close()}
 });
 await check('unified restore enforces legacy permission while local backup management stays available',async()=>{
  const {context,page}=await fixture();try{
   await page.evaluate(async()=>{const {ShopDatabase}=await import('./database.js'),db=await new ShopDatabase().open(),saved=await db.load(),owner=(await db.all('users'))[0];await db.save(saved,null,[{user:{...owner,id:'limited-backup',username:'limited',role:'custom',capabilities:['settings.view','settings.backup.manage']},expectedUser:null}]);db.db.close()});
   await command(page,'site:logout');await page.locator('#site-auth-form [name=username]').fill('limited');await page.locator('#site-auth-form [name=password]').fill('1234');await command(page,'site:login');await command(page,'go:backup');
   assert.equal(await page.locator('[data-action="cloud:overview"],[data-action="site:feature:import"]').count(),0);
   await command(page,'site:restore');await page.locator('#backup-file').setInputFiles({name:'desktop.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'conta-backup',schemaVersion:1,collections:{}}))});
   await command(page,'site:review-import');assert.equal(await page.locator('[data-action="site:confirm-import"]').count(),0);
   assert.match(await page.locator('#phone').innerText(),/لا تسمح صلاحيات حسابك باستيراد النظام السابق/);
   await command(page,'close');await command(page,'site:backup');assert.equal(await page.evaluate(()=>globalThis.__backupFiles.length),1);
  }finally{await context.close()}
 });
 await check('server grace copies remain previewable without active upload entitlement or consent',async()=>{
  const {context,page}=await fixture('fr',360);try{
   await page.evaluate(async()=>{globalThis.__backupStatus.server.entitlement={enabled:false,active:false,endsAt:Date.now()-1000,downloadUntil:Date.now()+86400000};await globalThis.__backupUxController.refresh(false)});
   await page.locator('[data-action="cloud:overview"]').click();assert.equal(await page.locator('[data-action="cloud:run"]').isDisabled(),true);
   assert.equal(await page.locator('[data-action="cloud:list"]').isEnabled(),true);await page.locator('[data-action="cloud:list"]').click();
   assert.match(await page.locator('.sheet').innerText(),/2 KB/);await page.locator('[data-action="cloud:download:synthetic-copy"]').click();
   assert.equal(await page.locator('[data-action="site:confirm-import"]').count(),1);assert.equal(await page.evaluate(()=>globalThis.__backupCalls.filter(x=>x.command==='configure'||x.command==='run').length),0);await noOverflow(page);
  }finally{await context.close()}
 });
 await check('schedule hides irrelevant controls while keeping unsaved time and weekday values',async()=>{
  const {context,page}=await fixture('fr',360);try{
   await page.locator('[data-action="cloud:overview"]').click();await page.locator('[data-action="cloud:settings"]').click();
   assert.equal(await page.locator('[name=cloudWeekday]').isVisible(),false);assert.equal(await page.locator('[name=cloudTime]').isVisible(),true);
   const width=await page.locator('[name=cloudTime]').evaluate(e=>e.getBoundingClientRect().width);assert(width>250,'Daily time needlessly occupies half the row');
   await page.locator('[name=cloudSchedule]').selectOption('weekly');await page.locator('[name=cloudWeekday]').selectOption('7');await page.locator('[name=cloudTime]').fill('05:45');
   await page.locator('[name=cloudSchedule]').selectOption('connected');assert.equal(await page.locator('[name=cloudTime]').isVisible(),false);assert.equal(await page.locator('[name=cloudWeekday]').isVisible(),false);
   await page.locator('[data-action="cloud:save"]').click();await idle(page);
   const payload=await page.evaluate(()=>globalThis.__backupCalls.find(x=>x.command==='configure').data);assert.equal(payload.time,'05:45');assert.equal(payload.weekday,7);assert.equal(payload.schedule,'connected');
   await page.locator('[data-action="cloud:settings"]').click();await page.locator('[name=cloudSchedule]').selectOption('weekly');assert.equal(await page.locator('[name=cloudTime]').inputValue(),'05:45');assert.equal(await page.locator('[name=cloudWeekday]').inputValue(),'7');await noOverflow(page);
  }finally{await context.close()}
 });
 await check('live overview updates after run and passive status without closing details or resetting scroll',async()=>{
  const {context,page}=await fixture();try{
   await page.setViewportSize({width:360,height:520});
   await page.evaluate(async()=>{globalThis.__backupStatus.settings.consent=true;globalThis.__backupStatus.changesPending=true;await globalThis.__backupUxController.refresh(false)});
   await page.locator('[data-action="cloud:overview"]').click();await page.locator('[data-cloud-subscription-details]>summary').click();
   const body=page.locator('.sheet-body'),before=await body.evaluate(e=>{e.scrollTop=30;return e.scrollTop});assert(before>0,'Small overview must exercise real scroll preservation');
   await page.evaluate(()=>globalThis.__backupUxController.refresh(false));assert.equal(await page.locator('[data-cloud-subscription-details]').evaluate(e=>e.open),true);assert.equal(await body.evaluate(e=>e.scrollTop),before);
   await page.locator('[data-action="cloud:run"]').click();await idle(page);assert.equal(await page.locator('[data-cloud-subscription-details]').evaluate(e=>e.open),true);assert.match(await page.locator('.sheet').innerText(),/آخر نسخة ناجحة محفوظة على السيرفر/);
   await page.evaluate(async()=>{globalThis.__backupStatus.server.entitlement.active=false;await globalThis.__backupUxController.refresh(false)});assert.equal(await page.locator('[data-action="cloud:run"]').isDisabled(),true);
  }finally{await context.close()}
 });
 await check('entry and reconnect status requests are bounded and first entry does not remain loading',async()=>{
  const {context,page}=await fixture();try{
   await page.locator('[data-action="cloud:overview"]').click();await command(page,'close');await command(page,'go:backup');
   await page.evaluate(()=>{window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('alkarna-network-available'))});
   assert.equal(await page.evaluate(()=>globalThis.__backupCalls.filter(x=>x.command==='status'&&x.data.refresh).length),1);
   await page.evaluate(async()=>{await globalThis.__backupUxController.refresh(false);await globalThis.__backupUxController.refresh(false)});
   assert.equal(await page.evaluate(()=>globalThis.__backupCalls.filter(x=>x.command==='status'&&x.data.refresh).length),1);
   await page.evaluate(()=>{const now=Date.now;Date.now=()=>now()+61000;window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('alkarna-network-available'))});
   await page.waitForFunction(()=>globalThis.__backupCalls.filter(x=>x.command==='status'&&x.data.refresh).length===2);
   assert(!/جارٍ قراءة الحالة/.test(await page.locator('#content').innerText()));
  }finally{await context.close()}
 });
 await check('exit reminder explicitly concerns an external file and keeps server copies separate',async()=>{
  const {context,page}=await fixture('fr');try{
   await command(page,'site:feature:exit-reminder');assert.match(await page.locator('.sheet').innerText(),/indépendant des sauvegardes serveur/);assert.equal(await page.locator('[data-action="site:feature:exit-backup"]').innerText(),'Enregistrer un fichier et quitter');
  }finally{await context.close()}
 });
 await mkdir('candidate-proof',{recursive:true});await writeFile('candidate-proof/backup-ux-proof.json',JSON.stringify({passed:results.every(x=>x.passed),cases:results,widths:[360,393],languages:['ar','fr'],syntheticOnly:true},null,2)+'\n');
 console.log(JSON.stringify({tests:results.length,passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length}));assert(results.every(x=>x.passed),'Backup UX regressions remain');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
