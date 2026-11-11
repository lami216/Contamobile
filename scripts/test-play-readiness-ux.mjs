import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);let chromium;
for(const candidate of [process.env.PLAYWRIGHT_MODULE,'playwright',fileURLToPath(new URL('../../Contatools-source/node_modules/playwright',import.meta.url))].filter(Boolean)){
 try{({chromium}=require(candidate));break}catch{}
}
if(!chromium)throw Error('Playwright is required for the disposable readiness UX regressions');
const runtime=fileURLToPath(new URL('../approved-runtime/',import.meta.url));
const server=createServer(async(req,res)=>{
 try{
  const relative=new URL(req.url,'http://local.invalid').pathname.slice(1)||'index.html',filename=path.resolve(runtime,relative);
  if(!filename.startsWith(runtime))throw Error('Invalid path');
  // Android packaging copies the bundled fonts beside the pinned runtime assets.
  const bytes=await readFile(filename).catch(error=>/^assets\/StitchArabic(?:Bold)?\.ttf$/.test(relative)?readFile(path.resolve(runtime,'../assets/fonts',path.basename(relative))):Promise.reject(error)),extension=path.extname(filename);
  res.setHeader('content-type',['.js','.mjs'].includes(extension)?'text/javascript':extension==='.css'?'text/css':extension==='.html'?'text/html':'application/octet-stream');res.end(bytes);
 }catch{res.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,results=[];
let browser;
async function check(name,fn){try{await fn();results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
async function evidence(page,name){if(process.env.PRIVACY_UX_EVIDENCE_DIR){await mkdir(process.env.PRIVACY_UX_EVIDENCE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PRIVACY_UX_EVIDENCE_DIR,name+'.png'),fullPage:true})}}
async function command(page,action){await page.evaluate(action=>act(action),action);await page.waitForFunction(()=>!globalThis.karnaPersistenceBusy())}
async function fixture(language='ar',viewport={width:393,height:851}){
 const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage();
 const bootErrors=[];page.on('pageerror',error=>bootErrors.push(error.message));page.on('response',response=>{if(response.status()>=400)bootErrors.push(response.status()+' '+new URL(response.url()).pathname)});
 await page.goto(origin+'/?lang='+language);await page.waitForFunction(()=>['ready','failed'].includes(document.documentElement.dataset.runtimeState));
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.runtimeState),'ready','Runtime startup failed: '+bootErrors.join('; '));
 for(const [key,value]of Object.entries({name:'مالك اختبار',shop:'محل مصطنع',username:'readiness-owner',password:'123456'}))await page.locator('#site-auth-form [name='+key+']').fill(value);
 await page.locator('[data-action="site:setup"]').click();await page.locator('.nav').waitFor();return {context,page};
}
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:process.env.PLAYWRIGHT_USE_BUNDLED==='1'?{}:{channel:'chrome'})});
 await check('expense receipt returns to its initiating home instead of an older settings page',async()=>{
  const {context,page}=await fixture();try{
   await command(page,'go:settings');await command(page,'go:home');
   const before=await page.evaluate(()=>({entries:history.length,count:S.records.length,cash:S.accounts[0].balance}));
   await command(page,'open:expense');await command(page,'post-cash');
   assert.deepEqual(await page.evaluate(()=>({entries:history.length,count:S.records.length,cash:S.accounts[0].balance})),before,'invalid expense must not change accounting or navigation');
   await page.locator('#sheet-form [name=name]').fill('READINESS-EXPENSE');await page.locator('#sheet-form [name=amount]').fill('13.37');
   await command(page,'post-cash');assert.equal(await page.evaluate(()=>view),'invoice');
   assert.equal(await page.evaluate(()=>S.records.find(row=>row.title==='READINESS-EXPENSE').total),13.37);
   await command(page,'back');assert.equal(await page.evaluate(()=>view),'home');
   await command(page,'back');assert.equal(await page.evaluate(()=>view),'settings','the pre-existing earlier route must remain intact');
  }finally{await context.close()}
 });
 await check('rejected expense save keeps its draft and original back route without a phantom receipt',async()=>{
  const {context,page}=await fixture();try{
   await command(page,'go:settings');await command(page,'go:home');await command(page,'open:expense');
   await page.locator('#sheet-form [name=name]').fill('REJECTED-EXPENSE');await page.locator('#sheet-form [name=amount]').fill('17.25');
   const before=await page.evaluate(()=>({route:view,entries:history.length,count:S.records.length,cash:S.accounts[0].balance}));
   await page.evaluate(async()=>{const {ShopDatabase}=await import('/database.js');ShopDatabase.prototype.save=async()=>{throw new DOMException('Synthetic quota refusal','QuotaExceededError')}});
   await command(page,'post-cash');
   assert.deepEqual(await page.evaluate(()=>({route:view,entries:history.length,count:S.records.length,cash:S.accounts[0].balance})),before);
   assert.equal(await page.locator('#sheet-form [name=name]').inputValue(),'REJECTED-EXPENSE');assert.equal(await page.locator('#sheet-form [name=amount]').inputValue(),'17.25');
   assert.equal(await page.evaluate(()=>S.records.some(row=>row.title==='REJECTED-EXPENSE')),false);
   await command(page,'close');await command(page,'back');assert.equal(await page.evaluate(()=>view),'settings');
  }finally{await context.close()}
 });
 for(const language of ['ar','fr'])await check('camera refusal stays visible beside barcode and preserves the '+language+' product draft on a short screen',async()=>{
  const {context,page}=await fixture(language,{width:320,height:520});try{
   await page.evaluate(()=>{
    window.BarcodeDetector=class{static async getSupportedFormats(){return ['code_128']}async detect(){return []}};
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{throw new DOMException('Synthetic permission refusal','NotAllowedError')}});
   });
   await command(page,'go:inventory');await command(page,'open:product');
   await page.locator('#sheet-form [name=name]').fill('منتج غير محفوظ');await page.locator('#sheet-form [name=price]').fill('150');await page.locator('#sheet-form [name=cost]').fill('60');
   await page.locator('.product-extra summary').click();await page.locator('#sheet-form [name=sku]').fill('KEEP-DRAFT-123');
   await page.locator('[data-product-scan]').click();await page.locator('#product-barcode-error .error').waitFor({state:'visible'});
   const text=await page.locator('#product-barcode-error').textContent();assert.match(text,language==='fr'?/Caméra|caméra/:/الكاميرا/);
   // Observe the product's own reveal after layout settles. The test never
   // scrolls the form or relaxes the requirement that the full notice is visible.
   await page.waitForFunction(()=>{
    const error=document.querySelector('#product-barcode-error').getBoundingClientRect(),body=document.querySelector('.sheet-body').getBoundingClientRect(),submit=document.querySelector('.sheet>.primary').getBoundingClientRect();
    return error.height>0&&error.top>=body.top-1&&error.bottom<=Math.min(body.bottom,submit.top)+1;
   },null,{timeout:2000});
   const boxes=await page.evaluate(()=>{
    const error=document.querySelector('#product-barcode-error').getBoundingClientRect(),body=document.querySelector('.sheet-body').getBoundingClientRect(),submit=document.querySelector('.sheet>.primary').getBoundingClientRect();
    return {top:error.top,bottom:error.bottom,height:error.height,bodyTop:body.top,bodyBottom:Math.min(body.bottom,submit.top)};
   });
   assert(boxes.height>0);assert(boxes.top>=boxes.bodyTop-1,JSON.stringify(boxes));assert(boxes.bottom<=boxes.bodyBottom+1,JSON.stringify(boxes));
   assert.equal(await page.locator('#sheet-form [name=sku]').inputValue(),'KEEP-DRAFT-123');assert.equal(await page.locator('#sheet-form [name=name]').inputValue(),'منتج غير محفوظ');
   await page.locator('#sheet-form [name=sku]').fill('MANUAL-AFTER-DENIAL');assert.equal(await page.locator('#sheet-form [name=sku]').inputValue(),'MANUAL-AFTER-DENIAL');
   assert.equal(await page.evaluate(()=>S.products.length),0,'testing refusal must not persist the unsaved product');
   await page.waitForFunction(()=>!document.querySelector('.toast'));
   await evidence(page,'camera-denied-'+language);
  }finally{await context.close()}
 });
 for(const language of ['ar','fr'])await check('privacy is readable without authentication and switches direction on a narrow '+language+' screen',async()=>{
  const context=await browser.newContext({viewport:{width:320,height:700},serviceWorkers:'block'}),page=await context.newPage();try{
   const external=[];page.on('request',request=>{if(!request.url().startsWith(origin))external.push(request.url())});
   await page.goto(origin+'/privacy.html?lang='+language+'&return=javascript:invalid');
   assert.equal(await page.locator('html').getAttribute('lang'),language);assert.equal(await page.locator('html').getAttribute('dir'),language==='fr'?'ltr':'rtl');
   assert.equal(await page.locator('article:visible h1').count(),1);assert.equal(await page.locator('article:visible .privacy-section').count(),9);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.match(await page.locator('#privacy-return').getAttribute('href'),/^activation\.html$/);
   assert.equal(await page.locator('article:visible a[href="tel:+22249823328"]').count(),1);
   const other=language==='ar'?'fr':'ar';await page.locator('[data-privacy-choice='+other+']').click();
   assert.equal(await page.locator('html').getAttribute('lang'),other);assert.equal(await page.locator('html').getAttribute('dir'),other==='fr'?'ltr':'rtl');
   assert.equal(await page.locator('[data-privacy-choice='+other+']').getAttribute('aria-pressed'),'true');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(external,[]);
   await page.evaluate(()=>{window.__privacyClosed=0;window.NativeHost={closePrivacy(){window.__privacyClosed++}}});
   await page.locator('#privacy-return').click();assert.equal(await page.evaluate(()=>window.__privacyClosed),1);assert.match(page.url(),/privacy\.html/);
   await evidence(page,'privacy-'+other);
  }finally{await context.close()}
 });
 for(const [language,viewport]of [['ar',{width:393,height:851}],['fr',{width:320,height:520}]])await check('expanded '+language+' account menu stays compact and every access, privacy and logout control remains reachable',async()=>{
  const {context,page}=await fixture(language,viewport);try{
   await page.evaluate(()=>{window.__accountSurfaceEvents=[];window.NativeHost={licenseAllowed:()=>true,openPrivacy:()=>__accountSurfaceEvents.push('privacy'),openActivation:()=>__accountSurfaceEvents.push('activation')};});
   await command(page,'site:account-menu');await page.evaluate(()=>document.fonts.ready);
   const sheet=await page.locator('.account-sheet').boundingBox();assert(sheet.height<Math.min(viewport.height-10,640),JSON.stringify(sheet));
   assert.equal(await page.locator('.account-links button').count(),4,'the native legacy owner must retain support, license, privacy and link-phone controls');
   for(const action of ['site:support','site:activation','site:privacy','site:offline-link','site:logout']){
    const control=page.locator('.account-sheet [data-action="'+action+'"]');await control.scrollIntoViewIfNeeded();
    const visible=await control.evaluate(node=>{const r=node.getBoundingClientRect(),body=node.closest('.sheet-body').getBoundingClientRect();return r.top>=body.top-1&&r.bottom<=body.bottom+1&&r.width>0&&r.height>=40;});
    assert.equal(visible,true,'unreachable account control: '+action);
   }
   await page.locator('.account-sheet [data-action="site:privacy"]').click();await page.waitForFunction(()=>!karnaPersistenceBusy());assert.deepEqual(await page.evaluate(()=>__accountSurfaceEvents),['privacy']);
   await page.locator('.account-sheet [data-action="site:offline-link"]').click();await page.locator('.sheet [name=phone]').waitFor();assert.equal(await page.locator('.sheet [name=consent]').isChecked(),false,'linking must still require explicit consent');await command(page,'close');
   await command(page,'site:support');assert.equal((await page.locator('.support-hint').innerText()).trim(),language==='fr'?'Pour obtenir de l’aide sur l’utilisation de l’application, contactez l’assistance.':'للمساعدة في استخدام التطبيق، تواصل مع الدعم.');await command(page,'close');
   await command(page,'site:account-menu');await page.locator('.account-sheet [data-action="site:logout"]').scrollIntoViewIfNeeded();await page.locator('.account-sheet').evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));await evidence(page,'account-menu-'+language);await page.locator('.account-sheet [data-action="site:logout"]').click();await page.locator('[data-action="site:login"]').waitFor();
   assert.equal(await page.locator('.nav').count(),0,'logout must leave the authenticated accounting interface');
  }finally{await context.close()}
 });
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
console.log(JSON.stringify({tests:results.length,passed:results.filter(row=>row.passed).length,failed:results.filter(row=>!row.passed)}));
assert(results.every(row=>row.passed),'Play readiness UX regressions failed');
