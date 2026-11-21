import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {lifecycleFixture} from './desktop-882-lifecycle-test-fixture.mjs';
const require=createRequire(import.meta.url);let chromium;
for(const name of [process.env.PLAYWRIGHT_MODULE,'playwright'].filter(Boolean)){try{({chromium}=require(name));break}catch{}}
if(!chromium)throw Error('Playwright is required');
const root=fileURLToPath(new URL('../approved-runtime/',import.meta.url)),output=fileURLToPath(new URL('../outputs/desktop882-qa/',import.meta.url));await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://local.invalid').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const action=(page,name)=>page.evaluate(name=>act(name),name),state=page=>page.evaluate(()=>structuredClone(S));
async function fields(page,values,form='#sheet-form'){await page.evaluate(({values,form})=>{for(const[name,value]of Object.entries(values)){const input=document.querySelector(form+' [name="'+name+'"]');if(!input)throw Error('Missing input '+name);input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));}},{values,form});}
async function durable(page){return page.evaluate(async()=>{const{ShopDatabase}=await import('./database.js'),db=await new ShopDatabase().open();try{return{state:await db.load(),revision:db.revision};}finally{db.db.close();}});}
async function reload(page){await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');if(!await page.locator('.nav').count()){await fields(page,{username:'owner',password:'1234'},'#site-auth-form');await action(page,'site:login');}await page.locator('.nav').waitFor();await page.waitForFunction(()=>!karnaPersistenceBusy());}
async function noError(page){const error=page.locator('#form-error');if(await error.count())assert(!(await error.textContent())?.trim(),await error.textContent());}
const persistable=value=>{value=structuredClone(value);delete value.saleParty;return value;};
let browser;const results=[];
const check=async(name,fn)=>{try{await fn();results.push({name,passed:true});console.log('PASS '+name);}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack);}};
const literal='إيداع Client & Co. <texte> / سحب محفوظ';
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:process.env.PLAYWRIGHT_USE_BUNDLED==='1'?{}:{channel:'chrome'})});const origin='http://127.0.0.1:'+server.address().port;
 async function fixture(language='ar',width=393,appearance='dark'){
  const context=await browser.newContext({viewport:{width,height:851},serviceWorkers:'block'}),page=await context.newPage(),errors=[];context.setDefaultTimeout(9000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/?lang='+language);await page.waitForFunction(()=>document.documentElement.dataset.runtimeState==='ready');await fields(page,{name:'المالك',shop:'متجر المراجعة',username:'owner',password:'1234'},'#site-auth-form');await action(page,'site:setup');await page.locator('.nav').waitFor();await page.waitForFunction(()=>!karnaPersistenceBusy());await action(page,'appearance:'+appearance);return{context,page,errors};
 }
 async function bank(page,kind,note=literal){await action(page,'open:'+kind);if(kind==='cashtransfer'){
   const id=await page.evaluate(async()=>{await act('close');await act('go:accounts');await act('open:account');return true;});await fields(page,{name:'مصرف',balance:'200'});await action(page,'save-account');await noError(page);await action(page,'open:cashtransfer');
  }await fields(page,{account:1,amount:25,note,...(kind==='cashtransfer'?{to:await page.evaluate(()=>S.accounts.at(-1).id)}:{})});await action(page,'post-cash');await noError(page);assert.equal(await page.evaluate(()=>view),'invoice');return page.evaluate(()=>selected);}
 async function party(page,type,direction){await action(page,'go:parties');await page.evaluate(type=>{partyType=type;},type);await action(page,'open:party');await fields(page,{name:type==='customer'?'عميل':'مورد',phone:''});await action(page,'save-party');await noError(page);const id=await page.evaluate(()=>S.parties.at(-1).id);await action(page,'open:receive');await fields(page,{partyType:type,direction});await action(page,'cash:change');await fields(page,{party:id,account:1,amount:20,note:literal});await action(page,'post-party');await noError(page);assert.equal(await page.evaluate(()=>view),'invoice');return page.evaluate(()=>selected);}
 async function edit(page,id,{note,omit=false,amount}={}){await action(page,'source:'+id);if(note!==undefined)await fields(page,{note});if(amount!==undefined)await fields(page,{amount});if(omit)await page.locator('#sheet-form [name=note]').evaluate(el=>el.remove());await action(page,await page.evaluate(()=>modal==='partyCash'?'post-party':'post-cash'));await noError(page);}
 await check('native bank cash and account-transfer forms preserve omitted notes, explicitly clear them and keep amounts unchanged across cold starts',async()=>{
  for(const kind of ['deposit','withdraw','cashtransfer']){const{context,page,errors}=await fixture();try{
   const id=await bank(page,kind),before=(await state(page)).accounts;await edit(page,id,{omit:true});let r=(await state(page)).records.find(r=>r.id===id);assert.equal(r.note,literal);assert.equal(r.revision,1);assert.deepEqual((await state(page)).accounts,before);
   await edit(page,id,{note:'   '});r=(await state(page)).records.find(r=>r.id===id);assert.equal(r.note,null);await edit(page,id,{omit:true});assert.equal((await state(page)).records.find(r=>r.id===id).note,null);await reload(page);assert.equal((await state(page)).records.find(r=>r.id===id).note,null);assert.deepEqual((await state(page)).accounts,before);assert.deepEqual(errors,[]);
  }finally{await context.close();}}
 });
 await check('all four customer and supplier receive/pay directions retain notes without a second posting and reverse their own balance once',async()=>{
  for(const type of ['customer','supplier'])for(const direction of ['receive','pay']){const{context,page,errors}=await fixture();try{
   const id=await party(page,type,direction),before=await state(page);await edit(page,id,{omit:true});const s=await state(page),r=s.records.find(r=>r.id===id);assert.equal(r.note,literal);assert.deepEqual(s.accounts,before.accounts);assert.deepEqual(s.parties,before.parties);
   await edit(page,id,{note:''});assert.equal((await state(page)).records.find(r=>r.id===id).note,null);await action(page,'void:'+id);await action(page,'confirm-void');const canceled=await state(page);assert.equal(canceled.records.find(r=>r.id===id).note,null);assert.equal(canceled.accounts[0].balance,0);assert.equal(canceled.parties[0].balance,0);await reload(page);assert.equal((await state(page)).records.find(r=>r.id===id).voided,true);assert.deepEqual(errors,[]);
  }finally{await context.close();}}
 });
 await check('failed note correction restores all durable financial/history state and retries once while keeping the entered literal text',async()=>{
  const{context,page,errors}=await fixture();try{const id=await bank(page,'withdraw');await action(page,'source:'+id);await fields(page,{note:'تصحيح <نصي> Client',amount:30});const before=await state(page),stored=await durable(page);
   await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;let once=true;IDBObjectStore.prototype.put=function(value,...args){if(this.name==='snapshots'&&once){once=false;throw Error('Synthetic movement-note persistence failure');}return put.call(this,value,...args);};});
   await action(page,'post-cash');assert.deepEqual(await durable(page),stored);assert.deepEqual(persistable(await state(page)),persistable(before));assert.equal(await page.locator('#sheet-form [name=note]').inputValue(),'تصحيح <نصي> Client');
   await action(page,'post-cash');await noError(page);const s=await state(page),r=s.records.find(r=>r.id===id);assert.equal(r.revision,1);assert.equal(r.note,'تصحيح <نصي> Client');assert.equal(s.accounts[0].balance,-30);assert.equal(r.revisions.length,1);await reload(page);assert.equal((await state(page)).accounts[0].balance,-30);assert.deepEqual(errors,[]);
  }finally{await context.close();}
 });
 await check('failed new party cash retains its selected direction party method amount and note then discards recovery on deliberate leave',async()=>{
  const{context,page,errors}=await fixture();try{
   await action(page,'go:parties');await page.evaluate(()=>{partyType='supplier';});await action(page,'open:party');await fields(page,{name:'مورد',phone:''});await action(page,'save-party');await noError(page);const partyId=await page.evaluate(()=>S.parties.at(-1).id);
   await action(page,'open:receive');await fields(page,{partyType:'supplier',direction:'receive'});await action(page,'cash:change');await fields(page,{party:partyId,account:1,amount:20,note:literal});const before=await state(page),stored=await durable(page);
   await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;let once=true;IDBObjectStore.prototype.put=function(value,...args){if(this.name==='snapshots'&&once){once=false;throw Error('Synthetic party-note save failure');}return put.call(this,value,...args);};});
   await action(page,'post-party');assert.deepEqual(await durable(page),stored);assert.deepEqual(persistable(await state(page)),persistable(before));for(const[name,value]of Object.entries({partyType:'supplier',direction:'receive',party:String(partyId),account:'1',amount:'20',note:literal}))assert.equal(await page.locator('#sheet-form [name='+name+']').inputValue(),value);
   await action(page,'close');await action(page,'open:receive');assert.equal(await page.locator('#sheet-form [name=note]').inputValue(),'');assert.equal(await page.locator('#sheet-form [name=amount]').inputValue(),'');assert.equal((await state(page)).records.length,0);assert.deepEqual(errors,[]);
  }finally{await context.close();}
 });
 async function official(page,{nullNote=false,journalOnly=false,healed=false}={}){
  const f=await lifecycleFixture(),sourceId=(await f.command({type:'account-adjustment.post',accountId:'cash',direction:'withdrawal',amount:25,note:literal})).result;
  const doc=f.document(sourceId);if(nullNote)doc.note=null;else delete doc.note;if(journalOnly)await f.db.collection('documents').deleteOne({id:sourceId});
  const raw={format:'conta-backup',schemaVersion:1,encoding:'json-v2',createdAt:'2026-11-21T10:00:00Z',collections:{products:[],parties:f.db.rows.parties,warehouses:[{_id:'w',name:'المخزن الرئيسي',isSalesDefault:true}],documents:f.db.rows.documents,paymentAccounts:f.db.rows.paymentAccounts,financialMovements:f.db.rows.financialMovements,accountTransfers:[],employees:[],expenseCategories:[],auditEvents:[],stockMovements:[],appSettings:[],counters:[]}};
  const result=await page.evaluate(async({raw,healed})=>{const{desktopToMobileState}=await import('./desktop-state-862.js'),{ShopDatabase}=await import('./database.js');const s=desktopToMobileState(raw),r=s.records.find(r=>r.kind==='withdraw');if(healed)r.note='';const db=await new ShopDatabase().open();try{await db.load();await db.save(s);}finally{db.db.close();}return{id:r.id,source:structuredClone(s)};},{raw,healed});await reload(page);return result;
 }
 await check('old37 missing-note projections recover the current journal but explicit null does not resurrect an older source',async()=>{
  for(const nullNote of [false,true]){const{context,page,errors}=await fixture();try{const{id}=await official(page,{nullNote,healed:true});await action(page,'source:'+id);assert.equal(await page.locator('#sheet-form [name=note]').inputValue(),nullNote?'':literal);await page.locator('#sheet-form [name=note]').evaluate(el=>el.remove());await action(page,'post-cash');await noError(page);const s=await state(page),r=s.records.find(r=>r.id===id);assert.equal(r.note,nullNote?null:literal);assert.equal(s.accounts[0].balance,975);await reload(page);assert.equal((await state(page)).records.find(r=>r.id===id).note,nullNote?null:literal);assert.deepEqual(errors,[]);}finally{await context.close();}}
 });
 await check('eligible historical journal-only withdrawals edit and void from their existing source while retaining untouched original provenance',async()=>{
  const{context,page,errors}=await fixture();try{const{id,source}=await official(page,{journalOnly:true});const raw=source.records.find(r=>r.id===id).desktop;await action(page,'source:'+id);assert.equal(await page.locator('#sheet-form [name=note]').inputValue(),literal);await fields(page,{amount:30});await page.locator('#sheet-form [name=note]').evaluate(el=>el.remove());await action(page,'post-cash');await noError(page);let s=await state(page),r=s.records.find(r=>r.id===id);assert.equal(r.note,literal);assert.equal(s.accounts[0].balance,970);assert.deepEqual(r.desktop,raw);
   await action(page,'source:'+id);await fields(page,{amount:25});await action(page,'post-cash');await noError(page);assert.equal((await state(page)).accounts[0].balance,975);await action(page,'void:'+id);await action(page,'confirm-void');await noError(page);s=await state(page);assert.equal(s.accounts[0].balance,1000);assert.equal(s.records.find(r=>r.id===id).note,literal);assert.deepEqual(s.records.find(r=>r.id===id).desktop,raw);assert.deepEqual(s.financialMovements,source.financialMovements);await reload(page);assert.equal((await state(page)).accounts[0].balance,1000);assert.deepEqual(errors,[]);
  }finally{await context.close();}
 });
 await check('existing narrow Arabic French forms keep literal content, numeric keyboard inputs and current styling',async()=>{
  for(const[language,width,appearance]of [['ar',360,'dark'],['ar',393,'light'],['fr',360,'light'],['fr',393,'dark']]){const{context,page,errors}=await fixture(language,width,appearance);try{const id=await bank(page,'deposit','إيداع');await action(page,'source:'+id);assert.equal(await page.locator('#sheet-form [name=note]').inputValue(),'إيداع');assert.equal(await page.locator('#sheet-form [name=amount]').getAttribute('inputmode'),'decimal');const size=await page.locator('.sheet').evaluate(el=>({width:el.getBoundingClientRect().width,scroll:el.scrollWidth,client:el.clientWidth}));assert(size.width<=width+1&&size.scroll<=size.client+1);if(language==='fr'){assert.equal(await page.locator('#phone').getAttribute('dir'),'ltr');assert.doesNotMatch(await page.locator('.sheet [data-action=post-cash]').textContent(),/[\u0600-\u06ff]/);}await page.locator('.sheet').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));await page.screenshot({path:path.join(output,`movement-note-882-${language}-${width}-${appearance}.png`)});assert.deepEqual(errors,[]);}finally{await context.close();}}
 });
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
await writeFile(path.join(output,'movement-notes-882-ux.json'),JSON.stringify({tests:results.length,passed:results.filter(r=>r.passed).length,cases:results},null,2)+'\n');
console.log(JSON.stringify({tests:results.length,passed:results.filter(r=>r.passed).length}));assert(results.every(r=>r.passed),'Movement note workflow failed');
