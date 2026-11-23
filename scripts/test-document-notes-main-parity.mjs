import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {documentSavedNote,appendDocumentNote} from '../approved-runtime/document-note.js';
import {invoiceDocument} from '../approved-runtime/invoice-view.js';
import {recordExportData,recordWorkbook} from '../approved-runtime/record-export.js';
import {invoicePdfModel,reportModel,reportHtml} from '../approved-runtime/report-output.js';
import {createPartyWithOpening} from '../approved-runtime/party-create.js';
import {installPartyOpeningFeatures} from '../approved-runtime/feature-party-opening.js';
import {validatePartyOpeningState} from '../approved-runtime/party-opening-domain.js';
import {desktopToMobileState} from '../approved-runtime/desktop-state-862.js';
import {translateText} from '../approved-runtime/i18n.js';
import {phoneFixture,memoryDesktop,uiHarness} from './party-category-862-harness.mjs';

const desktop=process.env.DESKTOP_MAIN_SOURCE||fileURLToPath(new URL('../../Desktop/',import.meta.url));
const pins={
 'app/domain.ts':'1e02a0e26639c9c5fd0c1485cfc31c21da130035fa872897fa4c0265e01220e2',
 'lib/party-opening.ts':'6f41cf877a9204fe049c0ca07045e0b41247b3e0b12abe7a65c152a81e1d8957',
 'app/party-balance.ts':'befecb80a99ee46acfd6a5e52a9eaf95c40619633299dd59fec5a8d04b443c1c',
 'lib/report-commerce.ts':'4fbbe6841ba2a147ebfad8e2c7b9de04353d1f4fe4e39244a3415bf83b91d6a9',
 'lib/document-notes.ts':'384525483826c8dd73bd4ea5e5c13364359be0385aab9b121ac2e16c8a64be09',
 'lib/movement-statement.ts':'c6ac6e693672ce1d8d7a935d994bba7923b03ce03cd713c834dcc6d08eebe0cc',
 'app/stock-movement.ts':'7810eafa46f03b4c9fd9eaa5da75c55f5eeeddfefa183be9e349f3f145fb1ea2',
 'app/conta-app.tsx':'51df3c7d5f0e419d0249aa54093f61b2d1746468072f2457333e702f928b763f',
 'app/api/command/route.ts':'72e5ff20914f3f0d52f97b801e51c50151d6966314cf0c21c970eb68fda0748a',
 'app/party-opening-panel.tsx':'6559270ae62e4206afafd74ddaa2699e4322332030feebda42960a1b105dc823'
};
const sources={};for(const[file,digest]of Object.entries(pins)){const code=(await readFile(path.join(desktop,file),'utf8')).replaceAll('\r\n','\n');assert.equal(createHash('sha256').update(code).digest('hex'),digest,'Pinned current Desktop source changed: '+file);sources[file]=code;}
const url=code=>'data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(code,{mode:'transform'})).toString('base64');
const statementUrl=url(sources['lib/movement-statement.ts']),noteUrl=url(sources['lib/document-notes.ts'].replace('"./movement-statement.ts"',JSON.stringify(statementUrl))),stockUrl=url(sources['app/stock-movement.ts']);
const resolver=sources['app/domain.ts'].match(/export function resolvePartyType[\s\S]*?\n}/)?.[0];assert(resolver);
const currentOpening=await import(url(sources['lib/party-opening.ts'].replace('"../app/party-balance.ts"',JSON.stringify(url(sources['app/party-balance.ts']))).replace('"../app/domain.ts"',JSON.stringify(url(resolver))).replace('"./report-commerce.ts"',JSON.stringify(url(sources['lib/report-commerce.ts'])))));
const body=sources['app/conta-app.tsx'].match(/function buildDocumentPresentation\([\s\S]*?\n}\nfunction buildDocumentBodyPresentation/)[0].replace(/\nfunction buildDocumentBodyPresentation$/,'').replace('function buildDocumentPresentation','export function buildDocumentPresentation');
const reference=await import(url(`import {statementNote} from ${JSON.stringify(statementUrl)};import {appendDocumentNote} from ${JSON.stringify(noteUrl)};import {isOpeningStockDocument} from ${JSON.stringify(stockUrl)};const tr=value=>value;const buildDocumentBodyPresentation=(_record,data)=>({meta:data.meta});\n${body}`));
const checks=[];let vectors=0;async function check(name,work){await work();checks.push(name);console.log('PASS '+name);}
const literal='إيداع <Client & Co.>\nسطر ثانٍ / deuxième ligne';
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const labels={sale:'فاتورة بيع',purchase:'فاتورة شراء',expense:'مصروف',stocktransfer:'تحويل مخزون',adjustment:'تصحيح مخزون',receive:'استلام',pay:'دفع',deposit:'إيداع',withdraw:'سحب',transfer:'تحويل',settlement:'تسوية يدوية للرصيد','party-opening':'رصيد بداية','employee-opening':'رصيد بداية العامل','employee-payment':'حركة عامل','employee-accrual':'استحقاق','employee-closure':'إقفال'};
const record=(kind,note=literal)=>({id:101,kind,number:'DOC-101',title:kind==='adjustment'?'سبب محفوظ':'عنوان محفوظ',date:'2026-11-23',time:'10:00',total:25,paid:0,due:0,lines:[],revision:0,note,party:1});
await check('actual current Desktop official note wrapper agrees on every string/blank/type/opening/archive vector',()=>{
 for(const kind of Object.keys(labels))for(const note of [undefined,null,'',' \n ',literal,'  إيداع  ',0,false,{},[]])for(const hints of [{},{openingStockAfter:0},{openingCorrection:true},{number:'OPEN-1'},{title:'رصيد بداية'},{title:'تصحيح رصيد البداية'},{productArchiveStockClearance:true}]){
  const raw={kind:kind==='stocktransfer'?'transfer':kind,title:'سبب محفوظ',...hints,...(note===undefined?{}:{note})},mobile={...raw,kind,desktop:{...raw}},before=structuredClone(mobile);
  const actual=appendDocumentNote([],documentSavedNote(mobile)),expected=reference.buildDocumentPresentation(raw,{meta:[]}).meta;
  assert.deepEqual(actual,expected);assert.deepEqual(mobile,before);vectors++;
 }
});
await check('native product/system titles never become notes and existing statement metadata is not duplicated',()=>{
 assert.equal(documentSavedNote({kind:'adjustment',title:'منتج',note:''}),null);
 for(const kind of ['sale','employee-payment','deposit']){
  const note=documentSavedNote(record(kind,' '+literal+' '));for(const label of ['ملاحظة','الملاحظة','ملاحظات','البيان']){const fields=[[label,literal]];assert.equal(appendDocumentNote(fields,note),fields);}
 }
 assert.deepEqual(documentSavedNote({kind:'adjustment',title:'سبب محفوظ',desktop:{kind:'adjustment',title:'سبب محفوظ'}}),{label:'البيان',value:'سبب محفوظ'});
});
await check('every preview/PDF/XLSX keeps normalized literal note once without changing any document state',async()=>{
 for(const language of ['ar','fr'])for(const kind of Object.keys(labels)){
  const s=phoneFixture(),r=record(kind,'  '+literal+'  ');s.records=[r];const before=structuredClone(s),t=value=>translateText(value,language);
  const html=invoiceDocument(s,r,{esc,money:value=>String(value),icon:()=>'',labels});assert.equal(html.split(esc(literal)).length-1,1,kind+' preview');assert.match(html,/data-user-content/);
  const model=invoicePdfModel(s,r,labels,{language}),values=model.blocks.flatMap(block=>block.rows?block.rows.flat():[block.text]).filter(value=>value===literal);assert.equal(values.length,1,kind+' PDF');
  const sheets=recordExportData(s,[r],labels,{language}),header=sheets[0].rows[0],row=sheets[0].rows[1];assert.equal(row.filter(value=>value===literal).length,1,kind+' XLSX');assert(!row.includes('  '+literal+'  '));
  const full=reportModel(s,[r],labels,'all',{language});assert.equal(full.blocks.filter(block=>block.header===false).flatMap(block=>block.rows.flat()).filter(value=>value===literal).length,1);
  assert(reportHtml(full).includes(esc(literal)));assert.equal(model.dir,language==='fr'?'ltr':'rtl');assert.deepEqual(s,before);
  if(kind==='settlement'){assert(model.blocks.flatMap(block=>block.rows||[]).some(row=>row[0]===t('نوع الحركة')&&row[1]===t('عملية غير نقدية')));assert.match(html,/لا توجد حركة نقدية/);}
  const workbook=await recordWorkbook(sheets,{language}).arrayBuffer();assert(Buffer.from(workbook).includes(Buffer.from(esc(literal))),kind+' workbook raw literal');
 }
});
await check('blank/non-string notes are absent from preview, PDF and Excel instead of leaked object or whitespace data',()=>{
 for(const note of [undefined,null,'',' \n ',0,false,{},[]]){const s=phoneFixture(),r={...record('sale'),note};s.records=[r];const html=invoiceDocument(s,r,{esc,money:String,icon:()=>'',labels});assert(!html.includes('<strong>ملاحظات</strong>'));
  const sheets=recordExportData(s,[r],labels),header=sheets[0].rows[0];assert(!header.includes('الملاحظة'));assert(!invoicePdfModel(s,r,labels).blocks.flatMap(block=>block.rows||[]).some(row=>['ملاحظة','الملاحظة'].includes(row[0])));
 }
});
await check('ordinary imported count reason is literal once while opening/archive source labels stay system metadata',()=>{
 for(const hints of [{},{openingStock:true},{openingCorrection:true},{productArchiveStockClearance:true}]){const s=phoneFixture(),r={...record('adjustment',null),party:null,title:literal,desktop:{kind:'adjustment',title:literal},...hints};s.records=[r];const html=invoiceDocument(s,r,{esc,money:String,icon:()=>'',labels}),model=invoicePdfModel(s,r,labels),sheets=recordExportData(s,[r],labels);
  assert.equal(html.split(esc(literal)).length-1,1);assert.equal(model.blocks.flatMap(block=>block.rows||[]).flat().filter(v=>v===literal).length,1);assert.equal(sheets[0].rows[1].filter(v=>v===literal).length,1);
  if(!Object.keys(hints).length)assert.match(html,/data-user-content dir="auto" style="white-space:pre-wrap"/);
 }
});
const owner={id:'owner',name:'Owner',role:'owner'},context={actor:owner,can:()=>true,now:'2026-11-23T12:00:00.000Z'};
await check('atomic customer/supplier creation with opening has identical Desktop signed contribution and no cash or stock effect',async()=>{
 const modules={opening:currentOpening};
 for(const type of ['customer','supplier'])for(const direction of ['receivable','payable']){
  const initial=phoneFixture();initial.parties=[];initial.opening.parties={};const before=structuredClone(initial),phone=createPartyWithOpening(initial,{type,name:' New ',phone:' 77 ',opening:{direction,amount:125,note:' '+literal+' '}},context);
  const db=memoryDesktop({parties:[{id:'desktop-party',partyType:type,name:'New',phone:'77',receivable:0,payable:0,net:0}],documents:[],auditEvents:[]});await modules.opening.postPartyOpening(db,{}, {partyId:'desktop-party',direction,amount:125,note:' '+literal+' '});
  const p=db.collections.parties[0],expected=p.receivable-p.payable;assert.equal(phone.party.balance*(type==='supplier'?-1:1),expected);assert.equal(phone.record.note,literal);assert.equal(phone.record.party,phone.party.id);assert.equal(phone.state.opening.parties[phone.party.id],0);assert.deepEqual(phone.state.accounts,initial.accounts);assert.deepEqual(phone.state.products,initial.products);assert.deepEqual(initial,before);
 }
});
await check('invalid opening or permission failure leaves no orphan party; no opening needs no opening permission',()=>{
 const initial=phoneFixture();initial.parties=[];initial.opening.parties={};const before=structuredClone(initial);
 for(const opening of [null,[],false,{direction:'wrong',amount:5},{direction:'receivable',amount:0},{direction:'payable',amount:'bad'},{direction:'receivable',amount:1,note:'x'.repeat(1001)}]){assert.throws(()=>createPartyWithOpening(initial,{type:'customer',name:'A',phone:'1',opening},context));assert.deepEqual(initial,before);}
 const restricted={...context,can:cap=>cap==='customers.create'};assert.throws(()=>createPartyWithOpening(initial,{type:'customer',name:'A',opening:{direction:'receivable',amount:10}},restricted),error=>error.status===403);assert.deepEqual(initial,before);
 const noOpening=createPartyWithOpening(initial,{type:'customer',name:'A'},restricted);assert.equal(noOpening.state.parties.length,1);assert.equal(noOpening.state.records.length,0);assert.equal(noOpening.record,null);assert.deepEqual(initial,before);
 const duplicate={...initial,parties:[{id:1,type:'customer',name:'Existing',phone:'1',balance:0}]};assert.throws(()=>createPartyWithOpening(duplicate,{type:'customer',name:'A',phone:'1',opening:{direction:'receivable',amount:1}},context));assert.equal(duplicate.parties.length,1);
 assert.match(sources['app/api/command/route.ts'],/if\(type==="party.create"&&body.opening!==undefined\).*requireCapability\(request,"party.opening.manage"\)/);
});
await check('valid historical opening baselines remain viewable without stale edit/void buttons or forged edit entry',async()=>{
 const modules={opening:currentOpening};
 const db=memoryDesktop({parties:[{id:'source-party',partyType:'customer',name:'Historical',phone:'',receivable:0,payable:0,net:0}],documents:[],auditEvents:[]});await modules.opening.postPartyOpening(db,{}, {partyId:'source-party',direction:'receivable',amount:30,note:literal});db.collections.documents[0].legacyKey='mobileBaseline:party-opening:source-party';
 const captured=desktopToMobileState({format:'conta-backup',schemaVersion:1,encoding:'json-v2',collections:{products:[],warehouses:[{_id:'w',id:'w',name:'المخزن الرئيسي',isSalesDefault:true}],paymentAccounts:[{id:'cash',name:'نقدي',code:'cash',isActive:true,balance:0}],financialMovements:[],stockMovements:[],accountTransfers:[],appSettings:[],counters:[],employees:[],expenseCategories:[],...db.collections}});
 for(const language of ['ar','fr'])for(const hints of [{legacyKey:'source-baseline'},{legacy:true},{importReadOnly:true}]){
  const result={state:structuredClone(captured)};result.party=result.state.parties[0];const r=result.state.records.find(r=>r.kind==='party-opening');Object.assign(r,hints);validatePartyOpeningState(result.state);
  const h=uiHarness(installPartyOpeningFeatures,result.state,language),html=h.group.panel(result.party.id);assert(html.includes('data-action="invoice:'+r.id+'"'));assert(!html.includes('data-action="site:feature:party-opening:'+result.party.id+'"'));assert(!html.includes('party-opening-edit:'));assert(!html.includes('party-opening-void:'));assert.throws(()=>h.group.openRecord(r.id));await assert.rejects(()=>h.group.action('party-opening',String(result.party.id)));await assert.rejects(()=>h.group.action('party-opening-void',String(r.id)));assert.deepEqual(h.state(),result.state);
 }
});
const output=new URL('../outputs/main-parity-qa/',import.meta.url);await mkdir(output,{recursive:true});await writeFile(new URL('document-notes-main-parity.json',output),JSON.stringify({sourceCommit:'2327ccc83b3f76f7a30d13c0ca8d356c4cd7483b',sourcePins:pins,checks:checks.length,passed:checks.length,noteVectorsCompared:vectors,cases:checks},null,2)+'\n');console.log(JSON.stringify({checks:checks.length,passed:checks.length,noteVectorsCompared:vectors}));
