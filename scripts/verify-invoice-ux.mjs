import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {translateText} from '../approved-runtime/i18n.js';
import {invoiceDocument} from '../approved-runtime/invoice-view.js';

let engine=fs.readFileSync('approved-runtime/engine.js','utf8').split("document.addEventListener('click'")[0];
engine=engine.replace(/const form=[^\r\n]*/,"const form=()=>({}),error=t=>{lastError=t},toast=()=>{};\n");
const context={assert,console,structuredClone,crypto,lastError:null,document:{addEventListener(){},querySelector(){return null}},localStorage:{getItem(){return null}},matchMedia:()=>({matches:true}),karnaCurrentActor:()=>({id:7,name:'مستخدم التدقيق'}),karnaLocale:{text:value=>translateText(value,'ar'),tag:()=> 'en-US'}};
vm.createContext(context);vm.runInContext(engine+'\nrender=()=>{};reset();',context);
vm.runInContext(`
// Desktop parity: a paid purchase can take its payment account below zero.
S.accounts[0].balance=0;
const purchase={...newRecord('purchase'),id:900,total:800,paid:800,due:0,warehouse:S.warehouse,account:1,lines:[{product:1,name:S.products[0].name,qty:2,price:400}]};
assert.equal(commitRecord(purchase),true);assert.equal(S.accounts[0].balance,-800);assert.equal(S.records.find(r=>r.id===900).paid,800);

// Initial three units + purchase two - sale four leaves one; cancelling the purchase must explain the dependency.
reset();S.records=[];S.products[0].stocks[S.warehouse]=3;S.accounts[0].balance=1000;syncStock();
const wh=S.warehouse;
assert(commitRecord({...newRecord('purchase'),id:901,total:200,paid:200,account:1,warehouse:wh,lines:[{product:1,name:'أرز',qty:2,price:100}]}));
assert(commitRecord({...newRecord('sale'),id:902,total:600,paid:600,account:1,warehouse:wh,lines:[{product:1,name:'أرز',qty:4,price:150}]}));
const beforeCancellation=JSON.stringify(S);selected=901;act('void:901');act('confirm-void');
assert.equal(JSON.stringify(S),beforeCancellation);assert.match(lastError,/رصيد/);assert.match(lastError,new RegExp(wh));assert.match(lastError,/النقص 1/);
selected=902;act('void:902');act('confirm-void');assert.equal(S.records.find(r=>r.id===902).voided,true);assert.equal(S.records.find(r=>r.id===902).voidedByName,'مستخدم التدقيق');
selected=901;act('void:901');act('confirm-void');assert.equal(S.records.find(r=>r.id===901).voided,true);assert.equal(S.products[0].stocks[wh],3);assert.equal(S.accounts[0].balance,1000);

// Revision history compares the actual price, quantity and settlement and retains the displayed document number.
reset();S.records=[];const first={...newRecord('sale'),id:903,number:'1',title:'عميل التدقيق',total:800,paid:0,due:800,party:1,warehouse:S.warehouse,lines:[{product:2,name:'زيت',qty:1,price:500},{product:1,name:'أرز',qty:2,price:150}]};
assert(commitRecord(first));assert.equal(first.updatedByName,'مستخدم التدقيق');assert(first.createdAt);const oldCreated=first.createdAt;
assert(commitRecord({...first,total:920,paid:920,due:0,account:1,lines:[{product:2,name:'زيت',qty:1,price:500},{product:1,name:'أرز',qty:3,price:140}]}));
const revised=S.records[0],markup=invoiceRevisionMarkup(revised);assert.equal(revised.createdAt,oldCreated);assert.equal(revised.revisions.length,1);assert(markup.includes('2 → 3'));assert(markup.includes('150 → 140'));assert(markup.includes('800 → 0'));assert(markup.includes('0 → 920'));assert(markup.includes('مستخدم التدقيق'));assert(markup.includes('<p>1 ·'));assert(!markup.includes('SALE-903'));
delete revised.revisions[0].updatedByName;delete revised.updatedByName;delete revised.updatedAt;assert(invoiceRevisionMarkup(revised).includes('المستخدم غير متوفر'));assert(invoiceRevisionMarkup(revised).includes('وقت التعديل غير متوفر'));

// Return navigation keeps the same query, sorting and page; transient source highlighting is never restored.
view='operations';activeTab='operations';selected=0;search='عميل التدقيق';filter='sale';period='all';recordSort='oldest';const key=listWindowKey('سجل المستندات');listWindowPages.set(key,2);listWindowSorts.set('saved',{label:'المبلغ',direction:-1});tableSorts19.set('saved',{direction:1});
go('invoice',903);search='';filter='all';recordSort='newest';listWindowPages.clear();listWindowSorts.clear();tableSorts19.clear();back();
assert.equal(view,'operations');assert.equal(search,'عميل التدقيق');assert.equal(filter,'sale');assert.equal(recordSort,'oldest');assert.equal(listWindowPages.get(key),2);assert.equal(listWindowSorts.get('saved').label,'المبلغ');assert.equal(tableSorts19.get('saved').direction,1);assert.equal(consumeNavigationPosition().selected,'0');assert.equal(consumeNavigationPosition(),null);assert.equal(sourceRecordFocus,null);

// Opening balances remain in stock records and no longer widen or populate the home invoice list.
reset();S.records=[{...S.records[0],id:999,kind:'adjustment',total:0,openingStock:true}];assert(!home().includes('invoice:999'));
`,context);

const state={accounts:[{id:1,name:'نقدي'}],parties:[{id:1,type:'customer',name:'عميل',balance:20}],branding:'المحل'};
const options={esc:value=>String(value??''),money:value=>String(value),icon:()=>'',labels:{sale:'فاتورة بيع',receive:'سند استلام'}};
const record={id:1,number:'1',kind:'sale',party:1,total:30,due:30,date:'2026-11-01',time:'10:00',lines:[]};
const original=JSON.stringify({state,record});
assert(invoiceDocument(state,record,options).includes('إلغاء الفاتورة'));
assert(!invoiceDocument(state,record,options).includes('data-action="ledger:1"'));
assert(invoiceDocument(state,record,{...options,canViewPartyBalance:true}).includes('data-action="ledger:1"'));
assert(invoiceDocument(state,{...record,kind:'receive',due:0,account:1},options).includes('استلام مسجل'));
assert.equal(JSON.stringify({state,record}),original);
for(const text of ['الفاتورة لم تُحفظ','ابدأ فاتورتك','السعر أقل من تكلفة الشراء','تأكيد الاستعادة','استعادة النسخة','التغييرات قبل التعديل وبعده','تأكيد إلغاء العملية'])assert(!/[\u0600-\u06ff]/u.test(translateText(text,'fr')),text);
assert.equal(translateText('متابعة مسودة البيع · 2 أصناف','fr'),'Reprendre le brouillon vente · 2 articles');
console.log('PASS invoice UX: contextual safe failures, dependency cancellation, revision differences and provenance, list state, recent invoices, non-allocating account explanation and French feedback');
