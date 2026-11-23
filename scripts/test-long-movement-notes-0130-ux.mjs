import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {references,commit,pins} from './desktop-0130-test-fixture.mjs';
await references();
const require=createRequire(import.meta.url);let chromium;for(const module of [process.env.PLAYWRIGHT_MODULE,'playwright'].filter(Boolean)){try{({chromium}=require(module));break}catch{}}if(!chromium)throw Error('Playwright required');
const root=fileURLToPath(new URL('../approved-runtime/',import.meta.url)),output=fileURLToPath(new URL('../outputs/desktop0130-qa/',import.meta.url));await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://local.invalid').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(path.relative(root,file).startsWith('..'))throw Error('path');res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.ttf':'font/ttf','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const action=(page,value)=>page.evaluate(value=>act(value),value),cases=[];
const state=page=>page.evaluate(()=>structuredClone(S));
async function fields(page,values,form='#sheet-form'){for(const[name,value]of Object.entries(values)){const element=page.locator(form+' [name="'+name+'"]');if(await element.evaluate(el=>el.tagName)==='SELECT')await element.selectOption(String(value));else await element.fill(String(value));}}
async function noError(page){const field=page.locator('#form-error');if(await field.count())assert(!(await field.textContent())?.trim(),await field.textContent());}
async function reload(page){await page.waitForFunction(()=>!karnaPersistenceBusy());await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');await page.locator('.nav').waitFor();await page.waitForFunction(()=>!karnaPersistenceBusy());}
const financial=value=>JSON.stringify({products:value.products,parties:value.parties,accounts:value.accounts,opening:value.opening,stock:value.stockEvents});
const text=(language,kind,suffix)=>((language+' '+kind+' '+suffix+' العميل Client & Co. <texte> ').repeat(130)).slice(0,3999)+'X';
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:process.env.PLAYWRIGHT_USE_BUNDLED==='1'?{}:{channel:'chrome'})});
 for(const[language,width,appearance]of [['ar',360,'dark'],['fr',393,'light']]){
  const context=await browser.newContext({viewport:{width,height:851},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  try{
   await page.goto('http://127.0.0.1:'+server.address().port+'/?lang='+language);await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');await fields(page,{name:'مالك',shop:'تدقيق النص',username:'owner',password:'1234'},'#site-auth-form');await action(page,'site:setup');await page.locator('.nav').waitFor();await page.waitForFunction(()=>!karnaPersistenceBusy());await action(page,'appearance:'+appearance);
   await action(page,'go:accounts');await action(page,'open:account');await fields(page,{name:'مصرف',balance:200});await action(page,'save-account');await noError(page);const bankId=await page.evaluate(()=>S.accounts.at(-1).id),partyIds={};
   for(const type of ['customer','supplier']){await action(page,'go:parties');await page.evaluate(type=>{partyType=type;},type);await action(page,'open:party');await fields(page,{name:type==='customer'?'العميل':'المورد',phone:''});await action(page,'save-party');await noError(page);partyIds[type]=await page.evaluate(()=>S.parties.at(-1).id);}
   for(const kind of ['deposit','withdraw','cashtransfer','customer:receive','customer:pay','supplier:receive','supplier:pay']){
    const isParty=kind.includes(':'),[type,direction]=kind.split(':'),note=text(language,kind,'أصل'),changed=text(language,kind,'تعديل');assert.equal(note.length,4000);assert.equal(changed.length,4000);
    await action(page,'open:'+(isParty?'receive':kind));if(isParty){await fields(page,{partyType:type,direction});await action(page,'cash:change');await fields(page,{party:partyIds[type]});}
    const noteField=page.locator('#sheet-form [name=note]');assert.equal(await noteField.getAttribute('maxlength'),null);await fields(page,{account:1,amount:20,note,...(kind==='cashtransfer'?{to:bankId}:{})});assert.equal(await noteField.inputValue(),note);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await action(page,isParty?'post-party':'post-cash');await noError(page);const id=await page.evaluate(()=>selected),before=await state(page);assert.equal(before.records.find(r=>r.id===id).note,note);const financialBefore=financial(before),count=before.records.length;
    await action(page,'source:'+id);await fields(page,{note:changed});await action(page,isParty?'post-party':'post-cash');await noError(page);let saved=await state(page);assert.equal(saved.records.find(r=>r.id===id).note,changed);assert.equal(saved.records.length,count);assert.equal(financial(saved),financialBefore);
    const roundTrip=await page.evaluate(async id=>{const{createDesktopBusinessBackup}=await import('./desktop-backup-export.js'),{desktopToMobileState}=await import('./desktop-state-862.js');const exported=createDesktopBusinessBackup(structuredClone(S)),document=exported.backup.collections.documents.find(d=>d.mobileSource?.id===id),restored=desktopToMobileState(JSON.parse(JSON.stringify(exported)));return {exported:document.note,restored:restored.records.find(r=>r.desktopId===document.id).note};},id);assert.deepEqual(roundTrip,{exported:changed,restored:changed});
    await reload(page);assert.equal((await state(page)).records.find(r=>r.id===id).note,changed);await action(page,'source:'+id);assert.equal(await page.locator('#sheet-form [name=note]').inputValue(),changed);await fields(page,{note:''});await action(page,isParty?'post-party':'post-cash');await noError(page);saved=await state(page);assert.equal(saved.records.find(r=>r.id===id).note,null);assert.equal(financial(saved),financialBefore);cases.push(language+' '+kind+' 4000-character post, edit, exact exchange, cold reopen and explicit clear');console.log('PASS '+cases.at(-1));
   }
   await reload(page);assert((await state(page)).records.filter(r=>['deposit','withdraw','transfer','receive','pay'].includes(r.kind)).every(r=>r.note===null));assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
await writeFile(path.join(output,'long-movement-notes-0130-ux.json'),JSON.stringify({sourceCommit:commit,sourceHashes:pins,tests:cases.length,passed:cases.length,noteLength:4000,cases},null,2)+'\n');console.log(JSON.stringify({tests:cases.length,passed:cases.length,noteLength:4000}));
