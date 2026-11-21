import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const require=createRequire(import.meta.url);
let chromium;
for(const module of [process.env.PLAYWRIGHT_MODULE,'playwright',fileURLToPath(new URL('../../Contatools-source/node_modules/playwright',import.meta.url))].filter(Boolean)){
  try{({chromium}=require(module));break}catch{}
}
if(!chromium)throw Error('Playwright is required for device lifecycle checks');
const root=fileURLToPath(new URL('../approved-runtime/',import.meta.url));
const server=createServer(async(req,res)=>{
  try{
    const relative=new URL(req.url,'http://test.invalid').pathname.slice(1)||'index.html',file=path.resolve(root,relative);
    if(!file.startsWith(root))throw Error('Invalid test path');
    let bytes=await readFile(file);
    if(relative==='app.js')bytes=Buffer.from(bytes.toString().replace('deviceLifecycle.resume().catch(()=>{});','globalThis.__testLifecycleResume=deviceLifecycle.resume();globalThis.__testLifecycleResume.catch(()=>{});'));
    res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(bytes);
  }catch{res.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,results=[];
let browser;
const check=async(name,action)=>{
  try{await action();results.push({name,passed:true});console.log('PASS '+name)}
  catch(error){results.push({name,passed:false,error:error.stack||error.message});console.error('FAIL '+name+'\n'+error.stack)}
};
const idle=page=>page.waitForFunction(()=>!globalThis.karnaPersistenceBusy());
async function fixture({snapshot=null,language='ar',width=393}={}){
  const context=await browser.newContext({viewport:{width,height:851},serviceWorkers:'block'}),page=await context.newPage();
  await page.addInitScript(({snapshot,language})=>{
    localStorage.setItem('alkarna-site-language',language);
    globalThis.__lifecycleCalls=[];globalThis.__restoreSnapshot=snapshot;
    globalThis.__localBootstrap=null;globalThis.__finishFailures=0;globalThis.__terminalAt=null;globalThis.__grantId='grant-new-phone';
    const scope=async()=>({stage:'preview',grantId:globalThis.__grantId,shopId:JSON.parse(globalThis.__restoreSnapshot).state.originId,ownerId:JSON.parse(globalThis.__restoreSnapshot).users[0].id,backupId:'approved-version',sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(globalThis.__restoreSnapshot)))].map(byte=>byte.toString(16).padStart(2,'0')).join(''),localRevision:'40',text:globalThis.__restoreSnapshot});
    globalThis.NativeFiles={
      async deviceLifecycle(command,payload={}){
        globalThis.__lifecycleCalls.push({command,payload:structuredClone(payload)});
        if(command===globalThis.__terminalAt){
          globalThis.__localBootstrap={...await scope(),stage:'terminal',purpose:'cloud-bootstrap',intentId:'restore-intent',localPhase:command==='bootstrap-finish'?'applied':'prepared',ackPending:false,outcome:{status:'superseded-unknown',reasonCode:'REPLACEMENT_PHONE_LOST',decisionId:'recorded-owner-review',decidedAt:Date.now(),chainGeneration:1,minVersionCode:26}};
          return structuredClone(globalThis.__localBootstrap);
        }
        if(command==='resume-local')return globalThis.__localBootstrap||{stage:'idle'};
        if(command==='status')return {status:'active',bootstrapAvailable:!!globalThis.__restoreSnapshot,bootstrapMeta:{grantId:globalThis.__grantId}};
        if(command==='bootstrap-list'){
          if(payload.grantId!==globalThis.__grantId)throw Error('Grant is required');
          return {grantId:payload.grantId,versions:[{id:'approved-version',createdAt:Date.now()}]};
        }
        if(command==='bootstrap-preview')return scope();
        if(command==='bootstrap-prepare'){
          if(!payload.accepted)throw Error('Acceptance is required');
          globalThis.__localBootstrap={...await scope(),stage:'prepared',purpose:'cloud-bootstrap',intentId:'restore-intent'};return structuredClone(globalThis.__localBootstrap);
        }
        if(command==='bootstrap-finish'){
          if(globalThis.__finishFailures>0){globalThis.__finishFailures--;throw Error('Synthetic acknowledgement failure')}
          globalThis.__localBootstrap={...globalThis.__localBootstrap,stage:'complete',ackPending:false};return structuredClone(globalThis.__localBootstrap);
        }
        if(command==='resume')return globalThis.__localBootstrap||{stage:'idle'};
        throw Error('Unexpected lifecycle command '+command);
      }
    };
  },{snapshot,language});
  await page.goto(origin+'/');await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');await idle(page);await page.evaluate(()=>globalThis.__testLifecycleResume?.catch(()=>{}));
  return {context,page};
}
async function createOwner(page){
  for(const [key,value]of Object.entries({name:'مالك محفوظ',shop:'محل محفوظ',username:'saved-owner',password:'1234'}))await page.locator('#site-auth-form [name='+key+']').fill(value);
  await page.locator('[data-action="site:setup"]').click();await page.locator('.nav').waitFor();await idle(page);
}
async function snapshotFrom(page){
  return page.evaluate(async()=>{const {ShopDatabase}=await import('./database.js'),db=await new ShopDatabase().open();const snapshot=await db.cloudSnapshot();db.db.close();return JSON.stringify(snapshot.payload)});
}
try{
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:process.env.PLAYWRIGHT_USE_BUNDLED==='1'?{}:{channel:'chrome'})});
  const source=await fixture();await createOwner(source.page);const savedSnapshot=await snapshotFrom(source.page);await source.context.close();
  await check('saved activation receipts reconcile on boot and reconnect without installing offers or repeated foreground requests',async()=>{
    const {context,page}=await fixture();
    try{
      await page.waitForFunction(()=>globalThis.__lifecycleCalls.some(call=>call.command==='status'));
      assert.equal(await page.evaluate(()=>globalThis.__lifecycleCalls.filter(call=>call.command==='status').length),1);
      await page.evaluate(()=>{for(let i=0;i<6;i++){dispatchEvent(new Event('online'));dispatchEvent(new Event('alkarna-network-available'));document.dispatchEvent(new Event('visibilitychange'))}});
      await idle(page);
      assert.equal(await page.evaluate(()=>globalThis.__lifecycleCalls.filter(call=>call.command==='status').length),1);
      await page.evaluate(()=>{const now=Date.now;Date.now=()=>now()+61000;dispatchEvent(new Event('alkarna-network-available'));dispatchEvent(new Event('online'))});
      await page.waitForFunction(()=>globalThis.__lifecycleCalls.filter(call=>call.command==='status').length===2);
      assert.equal(await page.evaluate(()=>globalThis.__lifecycleCalls.filter(call=>['activate','bootstrap-prepare','bootstrap-finish'].includes(call.command)).length),0);
      assert.equal(await page.locator('[data-action="site:setup"]').count(),1);
    }finally{await context.close()}
  });
  for(const [language,width]of [['ar',360],['fr',393]])await check(`blank replacement previews before restoring actual saved owner data ${language} ${width}px`,async()=>{
    const {context,page}=await fixture({snapshot:savedSnapshot,language,width});
    try{
      await page.locator('[data-cloud-bootstrap]').click();
      const overlay=page.locator('.owner-recovery-overlay');await overlay.getByRole('button',{name:language==='fr'?'Voir la sauvegarde du serveur':'معاينة نسخة السيرفر',exact:true}).click();
      assert.match(await overlay.innerText(),/محل محفوظ/);
      assert.equal(await page.evaluate(()=>globalThis.__lifecycleCalls.filter(call=>call.command==='bootstrap-prepare').length),0);
      assert.equal(await page.evaluate(async()=>{const {ShopDatabase}=await import('./database.js'),db=await new ShopDatabase().open(),state=await db.load();db.db.close();return state}),null);
      assert(await overlay.evaluate(element=>element.getBoundingClientRect().right<=innerWidth+1&&element.scrollWidth<=element.clientWidth+1),'Restore overlay overflow');
      await mkdir('candidate-proof',{recursive:true});await page.screenshot({path:`candidate-proof/cloud-bootstrap-${language}-${width}.png`});
      await overlay.getByRole('button',{name:language==='fr'?'Restaurer cette sauvegarde':'استعادة هذه النسخة',exact:true}).click();await idle(page);
      assert.equal(await page.locator('[data-action="site:setup"]').count(),0);assert.equal(await page.locator('[data-action="site:login"]').count(),1);
      await overlay.getByRole('button',{name:language==='fr'?'Fermer':'إغلاق',exact:true}).click();assert.equal(await overlay.count(),0);
      const restored=JSON.parse(await snapshotFrom(page)),before=JSON.parse(savedSnapshot);assert.deepEqual(restored.users,before.users);assert.equal(restored.state.originId,before.state.originId);
      assert.equal(await page.evaluate(()=>globalThis.__lifecycleCalls.filter(call=>call.command==='bootstrap-finish').length),1);
      await page.locator('#site-auth-form [name=username]').fill('saved-owner');await page.locator('#site-auth-form [name=password]').fill('1234');await page.locator('[data-action="site:login"]').click();await page.locator('.nav').waitFor();await idle(page);
    }finally{await context.close()}
  });
  await check('failed server acknowledgement preserves committed restore and resumes after reload',async()=>{
    const {context,page}=await fixture({snapshot:savedSnapshot});
    try{
      await page.evaluate(()=>{globalThis.__finishFailures=1});await page.locator('[data-cloud-bootstrap]').click();
      const overlay=page.locator('.owner-recovery-overlay');await overlay.getByRole('button',{name:'معاينة نسخة السيرفر',exact:true}).click();await overlay.getByRole('button',{name:'استعادة هذه النسخة',exact:true}).click();await idle(page);
      assert.equal(await page.locator('[data-action="site:setup"]').count(),0);assert.match(await overlay.innerText(),/حُفظت البيانات/);
      const prepared=await page.evaluate(()=>globalThis.__localBootstrap),before=JSON.parse(await snapshotFrom(page));
      await context.addInitScript(value=>{globalThis.__localBootstrap=value},prepared);
      await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');await idle(page);
      await page.waitForFunction(()=>globalThis.__lifecycleCalls.some(call=>call.command==='bootstrap-finish'));
      assert.deepEqual(JSON.parse(await snapshotFrom(page)).users,before.users);assert.equal(await page.locator('[data-action="site:setup"]').count(),0);
    }finally{await context.close()}
  });
  await check('atomic bootstrap rejects populated stores, corruption, wrong scope and interrupted writes',async()=>{
    const {context,page}=await fixture({snapshot:savedSnapshot});
    try{
      const results=await page.evaluate(async()=>{
        const {ShopDatabase}=await import('./database.js'),prepared=await NativeFiles.deviceLifecycle('bootstrap-prepare',{accepted:true});
        const empty=()=>new ShopDatabase('bootstrap-'+crypto.randomUUID()).open();
        const db=await empty();await db.applyCloudBootstrap(prepared);const before=JSON.stringify((await db.cloudSnapshot()).payload.users);
        const replay=await db.applyCloudBootstrap(prepared);if(!replay.alreadyApplied)throw Error('Retry was not idempotent');
        let rejected=false;try{await db.applyCloudBootstrap({...prepared,intentId:'another-intent'})}catch{rejected=true}if(!rejected)throw Error('Wrong receipt accepted');
        if(JSON.stringify((await db.cloudSnapshot()).payload.users)!==before)throw Error('Retry changed users');
        const populated=await empty(),payload=JSON.parse(prepared.text);await populated.replace(payload.state,payload.users);
        rejected=false;try{await populated.applyCloudBootstrap(prepared)}catch{rejected=true}if(!rejected)throw Error('Populated phone overwritten');
        const tampered=await empty();rejected=false;try{await tampered.applyCloudBootstrap({...prepared,text:prepared.text+' '})}catch{rejected=true}if(!rejected||await tampered.load()!==null)throw Error('Tampered text was imported');
        const interrupted=await empty(),put=IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put=function(value,...args){if(this.name==='users')throw new DOMException('Synthetic disk full','QuotaExceededError');return put.call(this,value,...args)};
        rejected=false;try{await interrupted.applyCloudBootstrap(prepared)}catch{rejected=true}finally{IDBObjectStore.prototype.put=put}
        if(!rejected||await interrupted.load()!==null||await interrupted.get('meta','cloud-bootstrap:'+prepared.grantId))throw Error('Interrupted transaction left partial data');
        await interrupted.applyCloudBootstrap(prepared);if((await interrupted.cloudSnapshot()).revision!==41)throw Error('Source backup revision not preserved');
        for(const database of [db,populated,tampered,interrupted])database.db.close();return true;
      });
      assert.equal(results,true);
    }finally{await context.close()}
  });
  await check('a post-commit read failure cannot expose stale first-owner setup',async()=>{
    const {context,page}=await fixture({snapshot:savedSnapshot});
    try{
      await page.evaluate(async()=>{
        const {ShopDatabase}=await import('./database.js'),apply=ShopDatabase.prototype.applyCloudBootstrap,load=ShopDatabase.prototype.load;
        let failNextRead=false;
        ShopDatabase.prototype.applyCloudBootstrap=async function(...args){const result=await apply.apply(this,args);failNextRead=true;return result};
        ShopDatabase.prototype.load=async function(...args){if(failNextRead){failNextRead=false;throw Error('Synthetic post-commit read failure')}return load.apply(this,args)};
      });
      await page.locator('[data-cloud-bootstrap]').click();const overlay=page.locator('.owner-recovery-overlay');
      await overlay.getByRole('button',{name:'معاينة نسخة السيرفر',exact:true}).click();await overlay.getByRole('button',{name:'استعادة هذه النسخة',exact:true}).click();await idle(page);
      assert.equal(await page.locator('[data-action="site:setup"]').count(),0);
      assert.equal(await page.evaluate(()=>globalThis.__lifecycleCalls.filter(call=>call.command==='bootstrap-finish').length),0);
      await overlay.getByRole('button',{name:'إعادة تأكيد الربط',exact:true}).click();await page.locator('[data-action="site:login"]').waitFor();
      assert.deepEqual(JSON.parse(await snapshotFrom(page)).users,JSON.parse(savedSnapshot).users);
    }finally{await context.close()}
  });
  for(const language of ['ar','fr'])await check(`online activation page enrolls only on request and accepts offered license ${language}`,async()=>{
    const context=await browser.newContext({viewport:{width:360,height:851}}),page=await context.newPage();
    try{
      await page.addInitScript(language=>{
        localStorage.setItem('alkarna-site-language',language);globalThis.__activationCalls=[];let active=false;
        const license=()=>({valid:active,code:active?'LICENSE_VALID':'LICENSE_REQUIRED',deviceId:'TEST-DEVICE-CODE',license:active?{customerName:'صاحب الترخيص',storeName:'محل التفعيل',remainingSeconds:86400}:null});
        globalThis.NativeHost={language(){},copyDeviceCode(){},activationContinue(){},activationStatus(id){queueMicrotask(()=>__nativeResult(id,license()))},deviceLifecycle(id,command,payload){globalThis.__activationCalls.push({command,payload:JSON.parse(payload)});queueMicrotask(()=>{if(command==='activate'){active=true;__nativeResult(id,{stage:'activated',license:license()})}else __nativeResult(id,{status:'pending',remoteEnabled:command!=='local-status',activationAvailable:command==='status'})})}};
      },language);
      await page.goto(origin+'/activation.html');await page.locator('#device-code').filter({hasText:'TEST-DEVICE-CODE'}).waitFor();
      assert.deepEqual(await page.evaluate(()=>globalThis.__activationCalls.map(call=>call.command)),['local-status']);
      assert.equal(await page.locator('#online-connect').isDisabled(),true);
      await page.locator('#remote-consent').check();
      await page.locator('#online-connect').click();await page.waitForFunction(()=>globalThis.__activationCalls.some(call=>call.command==='enroll'));
      assert.equal(await page.evaluate(()=>globalThis.__activationCalls.find(call=>call.command==='enroll').payload.consent),true);
      assert.equal(await page.locator('#online-accept').isVisible(),false);
      await page.locator('#online-connect').click();await page.locator('#online-accept').waitFor({state:'visible'});
      assert.equal(await page.evaluate(()=>globalThis.__activationCalls.filter(call=>call.command==='activate').length),0);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Activation page overflow');
      await page.screenshot({path:`candidate-proof/online-activation-${language}-360.png`});
      await page.locator('#online-accept').click();await page.locator('#continue').waitFor({state:'visible'});
      assert.equal(await page.evaluate(()=>globalThis.__activationCalls.filter(call=>call.command==='activate').length),1);
    }finally{await context.close()}
  });
  for(const language of ['ar','fr'])await check(`superseded prepared restore stays terminal without importing or retrying ${language}`,async()=>{
    const {context,page}=await fixture({snapshot:savedSnapshot,language,width:360});
    try{
      await page.evaluate(async()=>{globalThis.__localBootstrap=await NativeFiles.deviceLifecycle('bootstrap-prepare',{accepted:true});globalThis.__terminalAt='bootstrap-prepare';globalThis.__lifecycleCalls=[]});
      await page.locator('[data-cloud-bootstrap]').click();const overlay=page.locator('.owner-recovery-overlay');
      await overlay.getByRole('button',{name:language==='fr'?'Restaurer cette sauvegarde':'استعادة هذه النسخة',exact:true}).click();await idle(page);
      assert.match(await overlay.innerText(),language==='fr'?/remplacée|remplacée/i:/استُبدلت/);
      assert.equal(await overlay.getByRole('button',{name:language==='fr'?'Restaurer cette sauvegarde':'استعادة هذه النسخة',exact:true}).count(),0);
      const state=await page.evaluate(async()=>{const {ShopDatabase}=await import('./database.js'),db=await new ShopDatabase().open();const result={state:await db.load(),receipt:await db.get('meta','cloud-bootstrap:grant-new-phone')};db.db.close();return result});
      assert.equal(state.state,null);assert(!state.receipt);
      assert.equal(await page.evaluate(()=>globalThis.__lifecycleCalls.filter(call=>call.command==='bootstrap-finish').length),0);
      assert.equal(await page.locator('[data-action="site:setup"]').count(),1);
      assert(await overlay.evaluate(n=>n.scrollWidth<=n.clientWidth+1));
      await page.screenshot({path:`candidate-proof/bootstrap-terminal-${language}-360.png`});
      await overlay.getByRole('button',{name:language==='fr'?'Fermer':'إغلاق',exact:true}).click();
      await page.evaluate(()=>{globalThis.__terminalAt=null;globalThis.__lifecycleCalls=[]});await page.locator('[data-cloud-bootstrap]').click();
      await overlay.getByRole('button',{name:language==='fr'?'Vérifier une nouvelle autorisation':'التحقق من موافقة جديدة',exact:true}).waitFor();
      assert.match(await overlay.innerText(),language==='fr'?/remplacée/i:/استُبدلت/);
      assert.equal(await page.evaluate(()=>globalThis.__lifecycleCalls.filter(call=>/^bootstrap-/.test(call.command)).length),0);
    }finally{await context.close()}
  });
  await check('a superseded finish preserves locally committed users and receipt across cold restart without another import',async()=>{
    const {context,page}=await fixture({snapshot:savedSnapshot});
    try{
      await page.evaluate(()=>{globalThis.__terminalAt='bootstrap-finish'});
      await page.locator('[data-cloud-bootstrap]').click();const overlay=page.locator('.owner-recovery-overlay');
      await overlay.getByRole('button',{name:'معاينة نسخة السيرفر',exact:true}).click();await overlay.getByRole('button',{name:'استعادة هذه النسخة',exact:true}).click();await idle(page);
      assert.match(await overlay.innerText(),/إيصال الحفظ المحلي موجود/);assert.equal(await page.locator('[data-action="site:setup"]').count(),0);
      const terminal=await page.evaluate(()=>globalThis.__localBootstrap),before=JSON.parse(await snapshotFrom(page));
      assert.deepEqual(before.users,JSON.parse(savedSnapshot).users);
      await context.addInitScript(value=>{globalThis.__localBootstrap=value},terminal);await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');await idle(page);
      assert.equal(await page.locator('[data-action="site:login"]').count(),1);
      assert.equal(await page.evaluate(()=>globalThis.__lifecycleCalls.filter(call=>['bootstrap-prepare','bootstrap-finish'].includes(call.command)).length),0);
      assert.deepEqual(JSON.parse(await snapshotFrom(page)).users,before.users);
      assert(await page.evaluate(async()=>{const {ShopDatabase}=await import('./database.js'),db=await new ShopDatabase().open();const receipt=await db.get('meta','cloud-bootstrap:grant-new-phone');db.db.close();return receipt?.intentId==='restore-intent'}));
      await page.locator('#site-auth-form [name=username]').fill('saved-owner');await page.locator('#site-auth-form [name=password]').fill('1234');await page.locator('[data-action="site:login"]').click();await page.locator('.nav').waitFor();await idle(page);
      await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');await page.evaluate(()=>globalThis.__testLifecycleResume?.catch(()=>{}));await idle(page);
      assert.equal(await page.locator('.nav').count(),1,'A cached terminal receipt must not log an already loaded account out on reopening');
    }finally{await context.close()}
  });
  await check('a terminal preview never exposes final confirmation or starts a local import',async()=>{
    const {context,page}=await fixture({snapshot:savedSnapshot});
    try{
      await page.evaluate(()=>{globalThis.__terminalAt='bootstrap-preview'});await page.locator('[data-cloud-bootstrap]').click();const overlay=page.locator('.owner-recovery-overlay');
      await overlay.getByRole('button',{name:'معاينة نسخة السيرفر',exact:true}).click();await idle(page);
      await overlay.getByRole('button',{name:'التحقق من موافقة جديدة',exact:true}).waitFor();
      assert.match(await overlay.innerText(),/استُبدلت/);assert.equal(await overlay.getByRole('button',{name:'استعادة هذه النسخة',exact:true}).count(),0);
      assert.equal(await page.evaluate(()=>globalThis.__lifecycleCalls.filter(call=>['bootstrap-prepare','bootstrap-finish'].includes(call.command)).length),0);
    }finally{await context.close()}
  });
  await check('an empty terminal phone can explicitly check a different new approval without retrying or consuming the old attempt',async()=>{
    const {context,page}=await fixture({snapshot:savedSnapshot});
    try{
      await page.evaluate(async()=>{const saved=await NativeFiles.deviceLifecycle('bootstrap-prepare',{accepted:true});globalThis.__localBootstrap={...saved,stage:'terminal',ackPending:false,outcome:{status:'expired-unclaimed'}};globalThis.__grantId='different-new-approval';globalThis.__lifecycleCalls=[]});
      await page.locator('[data-cloud-bootstrap]').click();const overlay=page.locator('.owner-recovery-overlay');
      await overlay.getByRole('button',{name:'التحقق من موافقة جديدة',exact:true}).click();await overlay.getByRole('button',{name:'معاينة نسخة السيرفر',exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>globalThis.__lifecycleCalls.filter(call=>['bootstrap-prepare','bootstrap-finish'].includes(call.command)).length),0);
      await overlay.getByRole('button',{name:'معاينة نسخة السيرفر',exact:true}).click();await overlay.getByRole('button',{name:'استعادة هذه النسخة',exact:true}).waitFor();
      assert.equal(await page.evaluate(async()=>{const {ShopDatabase}=await import('./database.js'),db=await new ShopDatabase().open();const state=await db.load();db.db.close();return state}),null);
      await overlay.getByRole('button',{name:'استعادة هذه النسخة',exact:true}).click();await idle(page);
      assert.equal(await page.locator('[data-action="site:login"]').count(),1);assert.deepEqual(JSON.parse(await snapshotFrom(page)).users,JSON.parse(savedSnapshot).users);
      assert(await page.evaluate(async()=>{const {ShopDatabase}=await import('./database.js'),db=await new ShopDatabase().open();const receipt=await db.get('meta','cloud-bootstrap:different-new-approval');db.db.close();return !!receipt}));
    }finally{await context.close()}
  });
  await mkdir('candidate-proof',{recursive:true});await writeFile('candidate-proof/device-lifecycle-ux-proof.json',JSON.stringify({passed:results.every(item=>item.passed),cases:results,syntheticOnly:true},null,2)+'\n');
  assert(results.every(item=>item.passed),'Device lifecycle browser regressions remain');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
