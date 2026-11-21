import {reportDataset} from '../approved-runtime/report-data.js';
import {moneyAccountDelta} from '../approved-runtime/upgrade-state.js';
import assert from 'node:assert/strict';
import {postingLines,mobileInvoiceTotal,applyRecordEffect,invoiceDraftLine,invoiceProfit} from '../approved-runtime/business-accounting.js';
import {validateState} from '../approved-runtime/database.js';
import {upgradeState} from '../approved-runtime/upgrade-state.js';
import {recordStockRevision,stockOperationRecord} from '../approved-runtime/stock-domain.js';
const fixture=()=>({warehouse:'A',warehouses:['A'],products:[{id:1,name:'زيت',price:10,cost:999,openingCost:4,stocks:{A:10},qty:10}],parties:[],accounts:[{id:1,name:'نقدي',balance:0}],records:[],users:[],opening:{stocks:{1:{A:10}},parties:{},accounts:{1:0}}});
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS '+name)};
check('unchanged pre-862 mobile invoices preserve rounded-cent agreements, including sub-unit totals',()=>{
 for(const [price,total]of [[1.005,1.01],[.149,.15],[1.234,1.23]]){
  const s=fixture(),old={id:101,kind:'sale',total,lines:[{product:1,name:'زيت',qty:1,price,costAtSale:0}]};s.records=[old];
  const before=JSON.stringify(s),cart=[invoiceDraftLine(old.lines[0])],lines=postingLines(s,cart,'sale','A',old);
  assert.equal(mobileInvoiceTotal(lines),total);assert.equal(lines[0].lineTotalMode,'mobile-legacy');assert.equal(JSON.stringify(s),before);
  const edited=postingLines(s,[{...cart[0],qty:2}],'sale','A',old);assert.equal(edited[0].lineTotalMode,'exact');assert.equal(mobileInvoiceTotal(edited),price*2);
 }
});
check('new native exact invoices retain sub-cent totals and unknown-cost semantics',()=>{
 const s=fixture();delete s.products[0].openingCost;
 const lines=postingLines(s,[{id:1,qty:1,price:.149}],'sale','A');assert.equal(mobileInvoiceTotal(lines),.149);assert.equal(invoiceProfit(lines),null);assert.equal(lines[0].costAtSale,null);
});
check('exact header and policy validation reject corrupted restoration before any replacement',()=>{
 const s=fixture();upgradeState(s);s.records=[{id:101,kind:'sale',date:'2026-11-16',total:100,paid:100,due:0,account:1,warehouse:'A',lines:[{product:1,qty:1,price:100,lineTotal:100,lineTotalMode:'exact'}]}];
 validateState(s);const bad=structuredClone(s);bad.records[0].total=200;assert.throws(()=>validateState(bad),/مجموع سطورها/);
 const policy=structuredClone(s);policy.records[0].lines[0].lineTotalMode='bogus';assert.throws(()=>validateState(policy),/نمط/);
 const old=structuredClone(s);delete old.records[0].lines[0].lineTotalMode;old.records[0].total=75;old.records[0].paid=75;validateState(old);
});
check('decimal physical stock distinguishes cancellation residue and a genuine shortage',()=>{
 const s=fixture();s.products[0].stocks.A=.3;
 const sale=qty=>({id:101,kind:'sale',warehouse:'A',paid:qty,total:qty,account:1,lines:[{product:1,qty,price:1}]});
 applyRecordEffect(s,sale(.1),1);applyRecordEffect(s,sale(.2),1);assert.equal(s.products[0].stocks.A,0);assert.equal(s.accounts[0].balance,.30000000000000004);
 const bad=fixture();bad.products[0].stocks.A=.2;applyRecordEffect(bad,sale(.200001),1);assert(bad.products[0].stocks.A<0,'actual shortages remain visible to the transaction conflict guard');
});
check('prospective stock journals record one net revision at the original and update timestamps',()=>{
 const before=fixture(),s=structuredClone(before),original={id:101,kind:'sale',number:'1',revision:0,occurredAt:'2026-11-16T12:00:00.001Z',updatedAt:'2026-11-16T12:00:00.002Z',warehouse:'A',total:10,paid:10,account:1,lines:[{id:'line-1',product:1,qty:1,price:10}]};
 applyRecordEffect(s,original,1);s.records=[original];recordStockRevision(s,null,original,before);assert.equal(s.stockEvents[0].occurredAt,original.occurredAt);assert.equal(s.stockEvents[0].balanceAfter,9);
 const prior=structuredClone(s),edited={...original,revision:1,updatedAt:'2026-11-16T13:00:00.000Z',lines:[{...original.lines[0],qty:3}]};
 applyRecordEffect(s,original,-1);applyRecordEffect(s,edited,1);s.records=[edited];recordStockRevision(s,original,edited,prior,'edit');
 const event=s.stockEvents.at(-1);assert.equal(event.quantityDelta,-2);assert.equal(event.balanceBefore,9);assert.equal(event.balanceAfter,7);assert.equal(event.documentRevision,1);assert.equal(event.occurredAt,edited.updatedAt);assert.equal(s.stockEvents.length,2);
 const beforeVoid=structuredClone(s);applyRecordEffect(s,edited,-1);s.records[0]={...edited,revision:2,voided:true,voidedAt:'2026-11-16T14:00:00.000Z'};recordStockRevision(s,edited,null,beforeVoid,'void');assert.equal(s.stockEvents.at(-1).documentRevision,2);assert.equal(s.stockEvents.at(-1).occurredAt,s.records[0].voidedAt);assert.equal(s.products[0].stocks.A,10);
});
check('stock correction cannot fabricate accounting cost from the editable card',()=>{
 const s=fixture(),draft={from:'A',note:'جرد',lines:[{product:1,quantity:12}]};delete s.products[0].openingCost;
 assert.throws(()=>stockOperationRecord(s,'adjustment',draft,null,101,'2026-11-16','12:00'),/مصدر تكلفة/);
 s.products[0].openingCost=4;const correction=stockOperationRecord(s,'adjustment',draft,null,101,'2026-11-16','12:00');assert.equal(correction.lines[0].price,4);assert.equal(correction.total,0);
 assert.throws(()=>stockOperationRecord(s,'adjustment',{...draft,lines:[{product:1,quantity:10}]},null,101,'2026-11-16','12:00'),/لا يوجد تغيير/);
 const old={...correction,lines:[{...correction.lines[0],price:4}]};s.products[0].openingCost=20;
 assert.equal(stockOperationRecord(s,'adjustment',{...draft,note:'شرح'},old,101,'2026-11-16','12:00').lines[0].price,4);
});


check('sub-cent financial entries remain visible and reconcile with the actual account',()=>{
 const s=fixture();upgradeState(s);const expense={id:101,kind:'expense',date:'2026-11-16',total:.0001,paid:.0001,due:0,account:1,lines:[]};s.records=[expense];applyRecordEffect(s,expense,1);
 assert.equal(moneyAccountDelta(expense,1),-.0001);const report=reportDataset(s,{type:'financial',accountId:1,allTime:true});assert.equal(report.rows.length,1);assert.equal(report.rows[0].outgoing,.0001);assert.equal(s.accounts[0].balance,-.0001);
});
check('zero-initialized mobile warehouses are not evidence that the product entered them',()=>{
 const s=fixture();s.warehouses.push('B');s.products[0].stocks.B=0;s.opening.stocks[1].B=0;
 const draft={from:'B',note:'جرد',lines:[{product:1,quantity:1}]};assert.throws(()=>stockOperationRecord(s,'adjustment',draft,null,101,'2026-11-16','12:00'),/قبل دخوله/);
 s.records.push({id:100,kind:'stocktransfer',from:'A',toWarehouse:'B',lines:[{product:1,qty:1}]});assert.equal(stockOperationRecord(s,'adjustment',draft,null,101,'2026-11-16','12:00').lines[0].price,4);
});

console.log(JSON.stringify({suite:'business-boundaries-862',checks}));
