import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {adjustmentLineCount,stockOperationRecord,recordStockEvents} from '../approved-runtime/stock-domain.js';
import {translateText} from '../approved-runtime/i18n.js';
import {reportDataset,reportWorkbookData} from '../approved-runtime/report-data.js';

const fixture=()=>({warehouse:'A',warehouses:['A','B'],warehouseMeta:{A:{},B:{}},products:[{id:1,name:'Rice',price:10,cost:4,qty:10,stocks:{A:10,B:5}},{id:2,name:'Oil',price:20,cost:8,qty:20,stocks:{A:20,B:7}}],accounts:[{id:1,name:'Cash',balance:100}],parties:[],records:[],opening:{accounts:{1:100},parties:{},stocks:{1:{A:10,B:5},2:{A:20,B:7}}},stockEvents:[]});
const draft=(quantities,from='A',note='Count correction')=>({from,note,lines:Object.entries(quantities).map(([product,quantity])=>({product:Number(product),quantity}))});
const record=(s,d,old=null,id=101)=>stockOperationRecord(s,'adjustment',d,old,id,'2026-11-03','10:00');
let checks=0;const check=(label,fn)=>{fn();checks++;console.log('PASS '+label)};
let engine=fs.readFileSync('approved-runtime/engine.js','utf8').split("document.addEventListener('click'")[0];
engine=engine.replace(/const form=[^\r\n]*/,"const form=()=>({}),error=t=>{lastError=t},toast=()=>{};\n");
function runtime(s=fixture()){
 const c={assert,console,structuredClone,crypto,lastError:null,inputState:s,recordStockEvents,document:{addEventListener(){},querySelector(){return null}},localStorage:{getItem(){return null}},matchMedia:()=>({matches:true}),karnaCurrentActor:()=>({id:7,name:'Stock audit'}),karnaLocale:{text:value=>value,tag:()=> 'en-US'}};
 vm.createContext(c);vm.runInContext(engine+'\nS=inputState;render=()=>{};syncStock();',c);return c;
}
const state=c=>vm.runInContext('structuredClone(S)',c);
function commit(c,r){c.candidate=r;return vm.runInContext('commitRecord(candidate)',c)}
function sale(c,id,qty,warehouse='A'){return commit(c,{id,kind:'sale',date:'2026-11-03',time:'11:00',warehouse,paid:0,due:0,total:qty*10,lines:[{product:1,name:'Rice',qty,price:10}]})}
function voidRecord(c,id){c.voidId=id;vm.runInContext("selected=voidId;act('void:'+voidId);act('confirm-void');",c)}

check('new corrections preserve original count and fractional quantity',()=>{
 const s=fixture();s.products[0].stocks.A=0;const r=record(s,draft({1:1.234}));assert.equal(r.lines[0].delta,1.234);assert.equal(r.lines[0].balanceBefore,0);assert.equal(r.lines[0].balanceAfter,1.234);const c=runtime(s);assert(commit(c,r));assert.equal(state(c).products[0].stocks.A,1.234);
});
check('note-only edit retains later sales and original baseline',()=>{
 const c=runtime();assert(commit(c,record(state(c),draft({1:12}))));assert(sale(c,102,3));let s=state(c);assert.equal(s.products[0].stocks.A,9);const old=s.records.find(r=>r.id===101),next=record(s,draft({1:12},'A','Note only'),old);assert.equal(next.lines[0].delta,2);assert(commit(c,next));s=state(c);assert.equal(s.products[0].stocks.A,9);assert.equal(s.records.find(r=>r.id===101).lines[0].balanceBefore,10);assert.equal(s.records.find(r=>r.id===101).revisions.length,1);
});
check('unchanged fractional corrections are exact no-ops even after almost all stock was consumed',()=>{
 const s=fixture();s.products[0].stocks.A=0;const old=record(s,draft({1:100.1}));s.records=[old];s.products[0].stocks.A=0.0001;
 const c=runtime(s);assert(commit(c,record(s,draft({1:100.1},'A','Fractional note only'),old)));assert.equal(state(c).products[0].stocks.A,0.0001);
});
check('quantity edits and repeated edits apply only the change to the original count',()=>{
 const c=runtime();assert(commit(c,record(state(c),draft({1:12}))));assert(sale(c,102,3));let s=state(c),old=s.records.find(r=>r.id===101);assert(commit(c,record(s,draft({1:11}),old)));assert.equal(state(c).products[0].stocks.A,8);s=state(c);old=s.records.find(r=>r.id===101);assert(commit(c,record(s,draft({1:11},'A','Again'),old)));assert.equal(state(c).products[0].stocks.A,8);
});
check('legacy actualQuantity rows derive original baseline without today stock',()=>{
 const s=fixture();s.products[0].stocks.A=9;const old={id:101,kind:'adjustment',warehouse:'A',lines:[{product:1,name:'Rice',actualQuantity:12,delta:2,qty:2,price:4}]};assert.deepEqual(adjustmentLineCount(s,old,old.lines[0]),{before:10,after:12});const r=record(s,draft({1:12}),old);assert.equal(r.lines[0].delta,2);assert.equal(r.lines[0].balanceBefore,10);
});
check('legacy single-line newQty rows keep the original count in the editor and record',()=>{
 const s=fixture();s.products[0].stocks.A=9;const old={id:101,kind:'adjustment',warehouse:'A',newQty:12,lines:[{product:1,name:'Rice',delta:2,qty:2,price:4}]};assert.deepEqual(adjustmentLineCount(s,old,old.lines[0]),{before:10,after:12});assert.equal(record(s,draft({1:12}),old).lines[0].delta,2);
});
check('earliest trustworthy saved revision repairs the baseline from a prior buggy edit',()=>{
 const s=fixture(),original={id:101,kind:'adjustment',warehouse:'A',newQty:12,lines:[{product:1,name:'Rice',actualQuantity:12,delta:2,qty:2,price:4}]};
 const old={...original,lines:[{...original.lines[0],delta:5,qty:5}],revision:1,revisions:[original]};s.records=[old];s.products[0].stocks.A=12;
 assert.deepEqual(adjustmentLineCount(s,old,old.lines[0]),{before:10,after:12});const c=runtime(s),r=record(s,draft({1:12}),old);assert.equal(r.lines[0].delta,2);assert(commit(c,r));assert.equal(state(c).products[0].stocks.A,9);assert.equal(state(c).records[0].lines[0].balanceBefore,10);
});
check('an explicitly persisted baseline remains authoritative across repeated edits',()=>{
 const s=fixture(),old=record(s,draft({1:12}));old.revisions=[{...old,lines:[{product:1,actualQuantity:50,delta:5,qty:5}]}];assert.equal(adjustmentLineCount(s,old,old.lines[0]).before,10);
});
check('desktop-imported multi-line corrections recover each baseline by desktop product ID',()=>{
 const s=fixture();s.products[0].desktopId='p1';s.products[1].desktopId='p2';s.products[0].stocks.A=9;s.products[1].stocks.A=19;const old={id:101,kind:'adjustment',warehouse:'A',lines:[{product:1,delta:2,qty:2,price:4},{product:2,delta:3,qty:3,price:8}],desktop:{lines:[{productId:'p2',balanceBefore:20,balanceAfter:23},{productId:'p1',balanceBefore:10,balanceAfter:12}]}};const r=record(s,draft({1:12,2:23}),old);assert.deepEqual(r.lines.map(l=>l.delta),[2,3]);assert.equal(adjustmentLineCount(s,old,old.lines[1]).after,23);
});
check('ambiguous legacy corrections refuse mutation rather than guessing current stock',()=>{
 const s=fixture(),old={id:101,kind:'adjustment',warehouse:'A',lines:[{product:1,delta:2,qty:2,price:4}]},before=JSON.stringify(s);assert.throws(()=>record(s,draft({1:12}),old),/بيانات كافية/);assert.equal(JSON.stringify(s),before);
});
check('multi-product edits preserve independent historical baselines',()=>{
 const s=fixture(),old=record(s,draft({1:12,2:25}));s.records=[old];s.products[0].stocks.A=9;s.products[1].stocks.A=23;const r=record(s,draft({1:13,2:24}),old),c=runtime(s);assert(commit(c,r));assert.deepEqual(state(c).products.map(p=>p.stocks.A),[10,22]);
});
check('multi-product net edits match products by identity even when line order changes',()=>{
 const s=fixture(),old=record(s,draft({1:12,2:25}));s.records=[old];s.products[0].stocks.A=9;s.products[1].stocks.A=23;const next=record(s,draft({2:24,1:13}),old),c=runtime(s);assert(commit(c,next));assert.deepEqual(state(c).products.map(p=>p.stocks.A),[10,22]);assert.deepEqual(state(c).products.map(p=>p.stocks.B),[5,7]);assert.equal(state(c).accounts[0].balance,100);
});
check('non-default warehouse changes never affect the sales-default stock',()=>{
 const s=fixture(),old=record(s,draft({1:8},'B'));s.records=[old];s.products[0].stocks.B=6;const c=runtime(s);assert(commit(c,record(s,draft({1:8},'B','Note only'),old)));assert.equal(state(c).products[0].stocks.A,10);assert.equal(state(c).products[0].stocks.B,6);
});
check('zero counts are retained, and cancellation restores the original stock',()=>{
 const c=runtime();assert(commit(c,record(state(c),draft({1:0}))));assert.equal(state(c).products[0].stocks.A,0);voidRecord(c,101);assert.equal(state(c).products[0].stocks.A,10);assert.equal(state(c).records.find(r=>r.id===101).voided,true);
});
check('voiding an edited correction leaves later movements intact',()=>{
 const c=runtime();assert(commit(c,record(state(c),draft({1:12}))));assert(sale(c,102,3));let s=state(c);assert(commit(c,record(s,draft({1:13}),s.records.find(r=>r.id===101))));assert.equal(state(c).products[0].stocks.A,10);voidRecord(c,101);assert.equal(state(c).products[0].stocks.A,7);
});
check('consumed stock blocks correction edits atomically for all products',()=>{
 const s=fixture(),old=record(s,draft({1:12,2:25}));s.records=[old];s.products[0].stocks.A=1;s.products[1].stocks.A=23;const c=runtime(s),before=JSON.stringify(state(c));assert.equal(commit(c,record(s,draft({1:10,2:24}),old)),false);assert.equal(JSON.stringify(state(c)),before);assert.match(c.lastError,/غير كاف/);
});
check('an exception after the first product net edit restores the complete snapshot',()=>{
 const s=fixture(),old=record(s,draft({1:12,2:25})),next=record(s,draft({1:13,2:24}),old);s.records=[old];s.products[0].stocks.A=9;s.products=s.products.filter(p=>p.id!==2);
 const c=runtime(s),before=JSON.stringify(state(c));assert.equal(commit(c,next),false);assert.equal(JSON.stringify(state(c)),before);assert.equal(state(c).records[0].revision,undefined);
});
check('consumed correction stock blocks cancellation without losing its history',()=>{
 const c=runtime();assert(commit(c,record(state(c),draft({1:12}))));assert(sale(c,102,11));const before=JSON.stringify(state(c));voidRecord(c,101);assert.equal(JSON.stringify(state(c)),before);assert.match(c.lastError,/تعذر إلغاء العملية/);
});
check('posted corrections cannot replace, add or remove original products or warehouse',()=>{
 const s=fixture(),old=record(s,draft({1:12}));for(const d of [draft({2:12}),draft({1:12,2:20}),draft({1:12},'B')])assert.throws(()=>record(s,d,old),/لا يمكن تغيير/);assert.throws(()=>record(s,{from:'A',note:'Count',lines:[]},old));
});
check('fractional transfer validation and adjustment financial rounding remain separate',()=>{
 const s=fixture(),transfer=stockOperationRecord(s,'transfer',{from:'A',to:'B',lines:[{product:1,quantity:1.234}]},null,101,'2026-11-03','10:00');assert.equal(transfer.lines[0].qty,1.234);assert.equal(transfer.total,4.94);const r=record(s,draft({1:11.234}));assert.equal(r.total,4.94);assert(Math.abs(r.lines[0].delta-1.234)<1e-12);assert.throws(()=>stockOperationRecord(s,'transfer',{from:'A',to:'B',lines:[{product:1,quantity:100}]},null,101,'2026-11-03','10:00'));
});
check('stock ledger preserves fractional quantities before and after each movement',()=>{
 const s=fixture();s.products=[s.products[0]];s.opening.stocks={1:{A:0,B:0}};s.products[0].stocks={A:1.123,B:0};s.records=[record({...s,products:[{...s.products[0],stocks:{A:0,B:0}}]},draft({1:1.234})),{id:102,kind:'sale',date:'2026-11-03',time:'11:00',warehouse:'A',total:1.11,paid:0,due:1.11,profit:0.67,lines:[{product:1,name:'Rice',qty:0.111,price:10,costAtSale:4}]}];
 const data=reportDataset(s,{type:'stock',warehouse:'A'});assert.equal(data.rows[0].before,0);assert.equal(data.rows[0].after,1.234);assert.equal(data.rows[1].before,1.234);assert.equal(data.rows[1].delta,-0.111);assert.equal(data.rows[1].after,1.123);assert.equal(data.metrics.find(m=>m.label==='الوحدات').value,1.123);assert.equal(data.metrics.find(m=>m.label==='الداخل').value,1.234);assert.equal(data.metrics.find(m=>m.label==='الخارج').value,0.111);assert.equal(data.metrics.find(m=>m.label==='قيمة المخزون').value,4.49);const workbook=reportWorkbookData(s,data);assert.equal(workbook[1].rows[1][6],1.234);assert.equal(workbook[1].rows[2][6],1.123);
});
check('stock and overview valuations multiply unrounded stock quantities then round money only',()=>{
 const s=fixture();s.products=[s.products[0]];s.products[0].stocks={A:1.234,B:0.111};s.products[0].cost=100;
 const stock=reportDataset(s,{type:'stock'}),overview=reportDataset(s,{type:'overview'});assert.equal(stock.stockBalances[0].quantity,1.345);assert.equal(stock.stockBalances[0].value,134.5);assert.equal(stock.metrics.find(m=>m.label==='الوحدات').value,1.345);assert.equal(stock.metrics.find(m=>m.label==='قيمة المخزون').value,134.5);assert.equal(overview.metrics.find(m=>m.label==='قيمة المخزون').value,134.5);
});
check('product-sales unit totals retain quantity precision independently of sales money',()=>{
 const s=fixture();s.records=[{id:101,kind:'sale',date:'2026-11-03',warehouse:'A',total:1.23,paid:1.23,due:0,account:1,profit:0.74,lines:[{product:1,name:'Rice',qty:0.1234,price:10,costAtSale:4}]}];const data=reportDataset(s,{type:'product-sales'});assert.equal(data.rows[0].quantity,0.1234);assert.equal(data.metrics.find(m=>m.label==='الوحدات المباعة').value,0.1234);assert.equal(data.metrics.find(m=>m.label==='المبيعات').value,1.23);
});
check('new safety errors have French translations',()=>{
 for(const message of ['سند التصحيح القديم لا يحتوي بيانات كافية للتعديل الآمن؛ راجع سجل المخزون','لا يمكن تغيير مخزن سند التصحيح بعد اعتماده','لا يمكن تغيير منتجات سند التصحيح بعد اعتماده؛ عدّل الكميات فقط أو ألغ السند وأنشئ سندًا جديدًا','رصيد البداية يُصحح من شاشة رصيد البداية'])assert(!/[\u0600-\u06ff]/.test(translateText(message,'fr')));
});

const stockFeature=fs.readFileSync('approved-runtime/feature-stock.js','utf8').replace(/^import .*;\r?\n/gm,'').replace('export function installStockFeatures','function installStockFeatures');
check('historical edit UI keeps saved count, fixed product set and warehouse without new styling',()=>{
 const s=fixture(),old=record(s,draft({1:12}));delete old.lines[0].actualQuantity;delete old.lines[0].balanceBefore;delete old.lines[0].balanceAfter;s.records=[old];s.products[0].stocks.A=9;const c=runtime(s);c.adjustmentLineCount=adjustmentLineCount;c.stockOperationRecord=stockOperationRecord;c.activeWarehouses=state=>state.warehouses;vm.runInContext(stockFeature+"\nview='adjustment';editingId=101;const stockFeatureTest=installStockFeatures({actor:{id:7},boundedTableHtml:html=>html,form:()=>({}),today:()=> '2026-11-03'});",c);const html=vm.runInContext('stockEditor()',c);assert.match(html,/data-feature-stock-field disabled/);assert(!html.includes('site:feature:stock-add'));assert(!html.includes('site:feature:stock-remove'));assert.match(html,/stock-line:1">12<\/button>/);assert.match(html,/<td>9<\/td>/);
});
console.log(JSON.stringify({checks,status:'passed'}));
