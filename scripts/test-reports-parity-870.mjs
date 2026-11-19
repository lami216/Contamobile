import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import {upgradeState,moneyAccountDelta,cashAccount} from '../approved-runtime/upgrade-state.js';
import {commandPayroll,materializePayroll,payrollCanonicalDocuments} from '../approved-runtime/payroll-domain.js';
import * as accounting from '../approved-runtime/business-accounting.js';
import * as identity from '../approved-runtime/business-identity.js';
import * as commerce from '../approved-runtime/commerce-facts.js';
import * as costs from '../approved-runtime/cost-provenance.js';
import * as amounts from '../approved-runtime/invoice-amount.js';
import {recordNumber,recordReference} from '../approved-runtime/document-presentation.js';
import {invoiceDocument} from '../approved-runtime/invoice-view.js';
import {reportDataset,reportOutputModel,reportWorkbookData,reportTitles} from '../approved-runtime/report-data.js';
import {invoicePdfModel,reportModel,reportHtml} from '../approved-runtime/report-output.js';
import {recordExportData,recordWorkbook} from '../approved-runtime/record-export.js';
import {translateText,formatNumber} from '../approved-runtime/i18n.js';

const commit='e4cbe46fd59e302140e6d885c69ca98376d4a00d';
const desktop=process.env.DESKTOP_870_ROOT||process.env.DESKTOP_870_SOURCE||fileURLToPath(new URL('../../Desktop/',import.meta.url));
const pins={'lib/payroll.ts':'30ac7afb51e6ed690cc4e55932f7d1aa2f71a5c7524e4e80aac7cd59df30ef61','lib/employee-ledger.ts':'d1de3d2e7003ed7e5d38889d5d51924b1c9727af4090dd6e2dd896dafcf96993','lib/document-read-model.ts':'fe360929a44698d4521ccacfd36da9d8cb7f6b1d416824576b2718853f9ed01f','lib/document-sequences.ts':'fb238d965eb33f82fb4b0670756ff500ac16c066137a0c797a18f3267386f3d5','app/stock-settlement.ts':'f6c51282e1b820de7376bbb204d64cd6d263dbedf3f40a56de5af53aa4087182','app/stock-movement.ts':'7810eafa46f03b4c9fd9eaa5da75c55f5eeeddfefa183be9e349f3f145fb1ea2'};
async function reference(name,prefix=''){
 const source=(await readFile(path.join(desktop,name),'utf8')).replaceAll('\r\n','\n');assert.equal(createHash('sha256').update(source).digest('hex'),pins[name],'Pinned source changed: '+name);
 const transformed=stripTypeScriptTypes(source,{mode:'transform'}).replace(/^import .*from ["']\..*;\r?\n/gm,'');
 const url='data:text/javascript;base64,'+Buffer.from(prefix+transformed).toString('base64');return {url,module:await import(url)};
}
const payrollReference=await reference('lib/payroll.ts'),movementReference=await reference('app/stock-movement.ts'),stockReference=await reference('app/stock-settlement.ts',`const {isOpeningStockDocument}=await import(${JSON.stringify(movementReference.url)});\n`);
const numberingReference=await reference('lib/document-sequences.ts',`const {isStockSettlementDocument,validSettlementSequence}=await import(${JSON.stringify(stockReference.url)});\n`);
const ledgerReference=await reference('lib/employee-ledger.ts',`const {displayDocumentNumber}=await import(${JSON.stringify(numberingReference.url)});const {employeePaymentDirection}=await import(${JSON.stringify(payrollReference.url)});\n`);
const readReference=(await reference('lib/document-read-model.ts')).module;
const clone=value=>structuredClone(value),at=day=>day+'T12:00:00.000Z',actor={id:'owner',name:'مالك',role:'owner'};
const labels={sale:'فاتورة بيع',expense:'مصروف','employee-accrual':'استحقاق راتب','employee-payment':'حركة حساب موظف','employee-closure':'إقفال حساب عامل محذوف',adjustment:'تصحيح المخزون'};
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const money=(value,size='',color='')=>`<b class="${size} ${color}">${value} MRU</b>`,icon=()=>'';
let state={products:[{id:1,name:'أرز',price:500,cost:200,openingCost:200,openingTotal:10,openingWarehouse:'Main',qty:10,stocks:{Main:10}}],parties:[],accounts:[{id:1,name:'نقدي',balance:10000,code:'cash',active:true,archived:false}],records:[],warehouses:['Main'],warehouse:'Main',opening:{accounts:{1:10000},parties:{},stocks:{1:{Main:10}}},users:[],branding:'مؤسسة الحساب',originId:'report-test-870',stockEvents:[]};
upgradeState(state);
async function run(action,input,day){const result=await commandPayroll(state,action,input,{actor,now:at(day)});state=result.state;return result;}
await run('employee.create',{name:'عامل <خاص>',phone:'22001122',startDate:'2026-11-01',amount:1000,intervalMonths:1,entitlement:'beginning'},'2026-11-01');
state=(await materializePayroll(state,{actor,asOf:'2026-11-01',now:at('2026-11-01')})).state;
const employeeId=state.employees[0].id;
await run('employee-payment.post',{employeeId,paymentMethod:1,amount:400,direction:'withdraw',occurredAt:'2026-11-02'},'2026-11-02');
await run('employee.archive',{employeeId,expectedRevision:state.employees[0].revision},'2026-11-03');
await run('employee.delete',{employeeId,expectedRevision:state.employees[0].revision,reason:'انتهاء العمل'},'2026-11-04');
let lastId=Math.max(...state.records.map(r=>r.id));
const sale={id:++lastId,kind:'sale',number:'SALE-SOURCE',sequence:1,title:'بيع مباشر',total:1000,paid:1000,due:0,account:1,party:null,warehouse:'Main',date:'2026-11-02',time:'13:00',occurredAt:'2026-11-02T13:00:00.000Z',lines:[{id:'sale-line',product:1,name:'أرز',qty:2,price:500,lineTotal:1000,lineTotalMode:'exact',costAtSale:200}]};
const expense={id:++lastId,kind:'expense',number:'EXPENSE-SOURCE',sequence:1,title:'نقل',total:50,paid:50,due:0,account:1,party:null,date:'2026-11-02',time:'14:00',occurredAt:'2026-11-02T14:00:00.000Z',lines:[]};
const settlement={id:++lastId,kind:'adjustment',canonicalId:'adjustment-canonical-870',number:'ADJ-ORIGINAL-KEEP',settlementSequence:73,title:'جرد',total:0,paid:0,due:0,account:null,party:null,warehouse:'Main',date:'2026-11-03',time:'12:00',occurredAt:at('2026-11-03'),lines:[{id:'settlement-line',product:1,name:'أرز',qty:2,delta:2,price:200,lineTotal:0,balanceBefore:8,balanceAfter:10}]};
state.records.unshift(settlement,expense,sale);state.accounts[0].balance+=950;
state.stockEvents=[{id:'sale-proof',productId:'1',documentId:String(sale.id),documentNumber:'SALE-SOURCE',warehouseId:'Main',type:'sale',quantityDelta:-2,balanceBefore:10,balanceAfter:8,occurredAt:sale.occurredAt},{id:'settlement-proof',productId:'1',documentId:String(settlement.id),documentNumber:'ADJ-ORIGINAL-KEEP',warehouseId:'Main',type:'adjustment',quantityDelta:2,balanceBefore:8,balanceAfter:10,occurredAt:settlement.occurredAt}];
upgradeState(state);
const closure=state.records.find(r=>r.kind==='employee-closure'),payment=state.records.find(r=>r.kind==='employee-payment'),baseline=JSON.stringify(state),results=[];
function metric(data,key){const row=data.metrics.find(row=>row.key===key);assert(row,'Missing metric '+key);return row.value;}
async function check(name,work){try{await work();assert.equal(JSON.stringify(state),baseline,'Read/output mutated accounting state');results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:String(error.stack).split('\n').map(line=>line.length>600?line.slice(0,600)+'…':line).join('\n')});console.error('FAIL '+name+'\n'+results.at(-1).error);}}

await check('employee closures use the exact Desktop private document read authority',()=>{
 for(const capabilities of [[],['records.view'],['pos.view'],['reports.view'],['employees.manage'],['employees.pay'],['employees.view'],['records.view','employees.view']]){
  const can=cap=>capabilities.includes(cap),access={can,customerPartyIds:new Set(),supplierPartyIds:new Set()};
  for(const row of state.records.filter(r=>r.kind.startsWith('employee-'))){assert.equal(identity.canReadRecord(state,row,can),readReference.canReadDocument({...row,partyId:null},access));assert.equal(identity.recordReadCapability(state,row,can),'employees.view');}
 }
});

await check('closure reports preserve expense recognition, release reserve and never fabricate a financial movement',()=>{
 const canonical=payrollCanonicalDocuments(state);payrollReference.module.validatePayrollSnapshot(state.employees,canonical,state.payrollFinancialMovements,state.auditEvents);
 for(const period of [{},{from:'2026-11-01',to:'2026-11-03'},{from:'2026-11-04',to:'2026-11-04'}]){
  const filters=Object.keys(period).length?{allTime:false,...period}:{allTime:true},data=reportDataset(state,{type:'overview',...filters}),expected=payrollReference.module.payrollSummary(state.employees,canonical,period);
  assert.equal(metric(data,'workersExpense'),expected.paidPeriod);assert.equal(metric(data,'workersAccrued'),expected.accrualPeriod);assert.equal(metric(data,'workersReserve'),expected.reserveChange);assert.equal(metric(data,'ownerAvailable'),metric(data,'netProfit')-expected.reserveChange);assert(!data.currentParties.some(row=>row.employeeId===employeeId));assert(!data.expenseRows.some(row=>row.kind==='employee-closure'));
 }
 const all=reportDataset(state,{type:'overview'});assert.deepEqual(['sales','expenses','netProfit','workersExpense','workersReserve','ownerAvailable'].map(key=>metric(all,key)),[1000,450,150,400,0,150]);
 const day=reportDataset(state,{type:'overview',allTime:false,from:'2026-11-04',to:'2026-11-04'});assert.deepEqual(['expenses','netProfit','workersReserve','ownerAvailable'].map(key=>metric(day,key)),[0,0,-600,600]);
 assert.equal(reportDataset(state,{type:'financial'}).rows.filter(row=>row.action==='invoice:'+closure.id).length,0);assert.equal(accounting.cashDelta(closure,1),0);assert.equal(moneyAccountDelta(closure,1),0);
});

await check('deleted employee account remains auditable with exact period opening, closure and reserve sources',()=>{
 for(const period of [{},{from:'2026-11-01',to:'2026-11-03'},{from:'2026-11-04',to:'2026-11-04'}]){
  const expected=ledgerReference.module.buildEmployeeLedger(state.employees[0],payrollCanonicalDocuments(state),period),data=reportDataset(state,{type:'party-ledger',partyType:'employee',partyId:employeeId,...(Object.keys(period).length?{allTime:false,...period}:{})});
  assert.deepEqual(data.payrollLedgerSummary,expected.summary);assert.equal(data.opening,expected.summary.openingBalance);assert.equal(data.closing,expected.summary.closingBalance);assert.equal(metric(data,'workersReserveReleased'),expected.summary.workersReserveReleased);assert.equal(data.records.some(row=>row.id===closure.id),!period.to||period.to>='2026-11-04');
  if(!period.to||period.to>='2026-11-04'){const row=data.rows.find(row=>row.id===closure.id);assert(row.noncash);assert.equal(row.action,'invoice:'+closure.id);assert.equal(row.change,600);assert.equal(row.balance,0);}
 }
});

await check('closure details, PDF models and spreadsheets distinguish noncash closure and preserve evidence',()=>{
 for(const atSource of [false,true]){const html=invoiceDocument(state,closure,{esc,money,icon,labels,atSource});assert(html.includes('عملية غير نقدية'));assert(html.includes('لا توجد حركة نقدية'));assert(html.includes('احتياطي الأجور المحرر'));assert(!html.includes('data-action="source:'+closure.id+'"'));assert(!html.includes('data-action="void:'+closure.id+'"'));assert(!html.includes('document-total-amount positive'));assert(!html.includes('document-total-amount negative'));assert(!html.includes('عامل <خاص>'));assert(html.includes('عامل &lt;خاص&gt;'));}
 assert(accounting.financialRecordReadOnly(state,closure));assert(accounting.financialRecordReadOnly(state,payment));
 for(const language of ['ar','fr']){const model=invoicePdfModel(state,closure,labels,{language}),fields=model.blocks.filter(b=>b.kind==='table').flatMap(b=>b.rows),t=v=>translateText(v,language);assert(fields.some(row=>row[0]===t('نوع الحركة')&&row[1]===t('عملية غير نقدية')));assert(fields.some(row=>row[0]===t('احتياطي الأجور المحرر')&&row[1]===600));assert.equal(model.dir,language==='fr'?'ltr':'rtl');const workbook=recordExportData(state,[closure],labels,{language}),headers=workbook[0].rows[0],values=workbook[0].rows[1];assert.equal(values[headers.indexOf(t('احتياطي الأجور المحرر'))],600);}
});

await check('stock report projects settlement serial while keeping raw document and movement references',()=>{
 const source=clone(state.stockEvents[1]);assert.equal(recordNumber(settlement),numberingReference.module.displayDocumentNumber(settlement));assert.equal(recordReference(settlement),'ADJ-ORIGINAL-KEEP');
 for(const proof of [true,false]){const s=clone(state);if(!proof)s.stockEvents=[];const data=reportDataset(s,{type:'stock'}),row=data.rows.find(row=>row.action==='invoice:'+settlement.id);assert.equal(row.number,'73');assert.equal(row.documentReference,'ADJ-ORIGINAL-KEEP');assert.deepEqual([row.before,row.delta,row.after],[8,2,10]);assert(data.columns.some(c=>c.key==='documentReference'));}
 assert.deepEqual(state.stockEvents[1],source);const restricted=reportDataset(state,{type:'stock',allTime:false,from:'2026-11-03',to:'2026-11-03'});assert.equal(restricted.rows.length,1);assert.equal(restricted.rows[0].before,8);
 for(const language of ['ar','fr']){const pdf=invoicePdfModel(state,settlement,labels,{language}),fields=pdf.blocks.filter(b=>b.kind==='table').flatMap(b=>b.rows);assert(pdf.blocks.some(b=>b.text?.startsWith('73 ·')));assert(fields.some(row=>row[1]==='ADJ-ORIGINAL-KEEP'));const sheets=recordExportData(state,[settlement],labels,{language}),headers=sheets[0].rows[0],row=sheets[0].rows[1];assert.equal(row[headers.indexOf(translateText('رقم المستند',language))],'73');assert.equal(row[headers.indexOf(translateText('المرجع الأصلي',language))],'ADJ-ORIGINAL-KEEP');assert.equal(row[headers.indexOf('canonicalId')],'adjustment-canonical-870');}
});

await check('report PDF content and real XLSX bytes retain closure summary and stock source columns in both directions',async()=>{
 for(const language of ['ar','fr'])for(const filters of [{type:'party-ledger',partyType:'employee',partyId:employeeId},{type:'stock'},{type:'overview'}]){
  const data=reportDataset(state,filters),model=reportOutputModel(state,data,{language,labels}),sheets=reportWorkbookData(state,data,{language,labels});assert.equal(model.dir,language==='fr'?'ltr':'rtl');const html=reportHtml(model);assert(!html.includes('NaN'));assert(html.includes('dir="'+model.dir+'"'));const workbook=recordWorkbook(sheets,{language}),bytes=new Uint8Array(await workbook.arrayBuffer()),text=new TextDecoder().decode(bytes);assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);assert(text.includes('xl/workbook.xml'));assert(text.includes('rightToLeft="'+(language==='fr'?0:1)+'"'));
  if(filters.type==='stock'){const rows=model.blocks.filter(b=>b.kind==='table').flatMap(b=>b.rows);assert(rows.some(row=>row.includes('ADJ-ORIGINAL-KEEP')));assert(rows.some(row=>row.includes('73')));assert(text.includes('ADJ-ORIGINAL-KEEP'));}
  if(filters.type==='party-ledger'){assert(html.includes(translateText('احتياطي الأجور المحرر',language)));assert(text.includes('600'));}
 }
 const register=reportModel(state,[settlement,closure],labels);assert(register.blocks.some(block=>block.text?.endsWith(' — 73')));
});

async function runtimeHarness(){
 let engine=(await readFile(new URL('../approved-runtime/engine.js',import.meta.url),'utf8')).split("document.addEventListener('click'")[0];engine=engine.replace(/const form=[^\r\n]*/,"const form=()=>({}),error=()=>{},toast=()=>{};\n");
 const context={console,structuredClone,crypto,assert,document:{addEventListener(){},querySelector(){return null}},localStorage:{getItem(){return null}},matchMedia:()=>({matches:true}),...accounting,...identity,...commerce,...costs,...amounts,cashAccount,recordNumber,materializePayroll,reportDataset,reportOutputModel,reportWorkbookData,reportTitles,invoicePdfModel,reportModel,recordExportData,recordWorkbook,translateText,formatNumber,appLanguage:()=> 'ar',fixture:clone(state)};vm.createContext(context);vm.runInContext(engine+'\nrender=()=>{};reset();S=fixture;period="all";view="reports";',context);
 const business=(await readFile(new URL('../approved-runtime/business-runtime.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace('export function installBusinessRuntime','function installBusinessRuntime');vm.runInContext(business,context);
 vm.runInContext(`globalThis.capabilities=['records.view'];globalThis.dispatched=[];globalThis.opened=[];globalThis.groups={employees:{ownsView:()=>false,clearHighlight(){},openRecord(record,mode){opened.push({id:record.id,mode});}},partyOpening:{panel:()=>''},categories:{snapshot:()=>({}),before:async()=>false}};globalThis.api={can:cap=>capabilities.includes(cap),permissionFor:()=> 'records.view',engineDispatch:async action=>{dispatched.push(action)},actor:{role:'owner'},form:()=>({}),today:()=> '2026-11-04',modalMarkup:(title,html)=>title+html};installBusinessRuntime(api,groups);`,context);
 return context;
}

await check('installed runtime removes payroll from generic lists and blocks direct edit/cancel without side effects',async()=>{
 const c=await runtimeHarness();vm.runInContext(`assert(liveRecords().every(row=>!row.kind.startsWith('employee-')));assert(!rows(S.records).includes('عامل &lt;خاص&gt;'));capabilities=['employees.view','employees.manage','employees.pay'];assert(liveRecords().some(row=>row.kind==='employee-closure'));`,c);
 for(const command of ['invoice:','source-location:','explain:document:'])assert.equal(vm.runInContext(`api.permissionFor(${JSON.stringify(command+closure.id)})`,c),'employees.view');
 const before=vm.runInContext('JSON.stringify(S)',c);for(const action of ['source:'+closure.id,'void:'+closure.id,'confirm-void:'+closure.id,'source:'+payment.id])await assert.rejects(()=>vm.runInContext(`api.engineDispatch(${JSON.stringify(action)})`,c),/للعرض فقط/);assert.equal(vm.runInContext('JSON.stringify(S)',c),before);assert.equal(vm.runInContext('dispatched.length',c),0);await vm.runInContext(`api.engineDispatch('source-location:${closure.id}')`,c);assert.equal(vm.runInContext('opened.at(-1).mode',c),'source');assert.equal(vm.runInContext('opened.at(-1).id',c),closure.id);
});

await check('report UI preserves selected deleted ledger and shows an actionable reserve-release source',async()=>{
 const c=await runtimeHarness(),feature=(await readFile(new URL('../approved-runtime/feature-reports.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace('export function installReportFeatures','function installReportFeatures');vm.runInContext(feature+'\nglobalThis.features=installReportFeatures(api);capabilities=["reports.view","employees.view"];',c);
 await vm.runInContext(`features.action('employee-statement',${JSON.stringify(employeeId)})`,c);assert.equal(vm.runInContext('features.dataset().party.id',c),employeeId);assert.equal(vm.runInContext('features.dataset().closing',c),0);const index=vm.runInContext('features.dataset().metrics.findIndex(m=>m.key==="workersReserveReleased")',c);await vm.runInContext(`features.action('report-metric',${JSON.stringify(String(index))})`,c);const html=vm.runInContext('features.sheet()',c);assert(html.includes('لا ينشئ حركة نقدية'));assert(html.includes('invoice:'+closure.id));assert(html.includes('600'));assert(!html.includes('NaN'));
 await vm.runInContext("features.action('report-filters')",c);assert(vm.runInContext('features.sheet()',c).includes(esc(state.employees[0].name)));await vm.runInContext("features.action('report-reset')",c);await vm.runInContext("features.action('report-party-type','employee')",c);await vm.runInContext("features.action('report-filters')",c);assert(!vm.runInContext('features.sheet()',c).includes('value="'+employeeId+'"'));
});

const output=new URL('../outputs/desktop870-qa/',import.meta.url);await mkdir(output,{recursive:true});const evidence={suite:'reports-parity-870',desktopCommit:commit,sourcePins:pins,tests:results.length,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed),results};await writeFile(new URL('reports-parity-870.json',output),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({tests:evidence.tests,passed:evidence.passed}));assert.equal(evidence.passed,evidence.tests,'Report870 integration checks failed');
