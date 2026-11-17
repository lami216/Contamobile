import assert from 'node:assert/strict';
import {desktopToMobileState} from '../approved-runtime/desktop-state-862.js';
import {validateFeatureState} from '../approved-runtime/upgrade-state.js';
import {saleFacts,profitSummary} from '../approved-runtime/commerce-facts.js';
import {partyOpeningNetBalance,partyOpeningCommand,validatePartyOpeningState} from '../approved-runtime/party-opening-domain.js';
import {expenseCategoryForRecord} from '../approved-runtime/expense-category-domain.js';
import {commandPayroll,materializePayroll,payrollCanonicalDocuments,payrollFacts,validatePayrollState} from '../approved-runtime/payroll-domain.js';
import {phoneFixture} from './party-category-862-harness.mjs';

const at='2026-11-16T12:00:00.000Z';
const document=(id,kind,extra={})=>({id,number:id.toUpperCase(),kind,status:'posted',revision:0,occurredAt:at,partyId:null,warehouseId:null,paymentMethod:null,total:0,paidTotal:0,dueTotal:0,lines:[],...extra});
function fixture(){return{format:'conta-backup',schemaVersion:1,appVersion:'0.1.19',build:{number:862},createdAt:at,collections:{
 warehouses:[{_id:'w1',name:'المخزن',isSalesDefault:true},{_id:'w2',name:'احتياطي',isSalesDefault:false,isArchived:true}],
 products:[{id:'p1',sku:'001',barcode:'123',name:'أرز',piecePrice:100,pieceCost:10,openingStock:10,openingCost:5,openingWarehouseId:'w1',lastPurchaseCost:42,stocks:{w1:11,w2:0},categoryId:'cat1'},{id:'p2',sku:'002',name:'زيت',piecePrice:.2,pieceCost:999,lastPurchaseCost:null,openingStock:0,openingCost:null,stocks:{w1:.2,w2:0}}],
 productCategories:[{id:'cat1',name:'غذاء'}],expenseCategories:[{id:'expense-category-rent',name:'إيجار',kind:'nonrecurring',revision:0,isArchived:false}],
 parties:[{id:'client',name:'أحمد',partyType:'customer',receivable:140,payable:0},{id:'supplier',name:'المورد',partyType:'supplier',receivable:0,payable:84,isArchived:true}],
 paymentAccounts:[{id:'cash',code:'cash',name:'نقدي',isActive:true,isArchived:false,balance:1000,openingBalance:600},{id:'bank',code:'bank1',name:'مصرفي',isActive:false,isArchived:true,balance:0}],employees:[],
 documents:[
  document('open','adjustment',{number:'OPEN-1',warehouseId:'w1',openingStockAfter:10,openingCostAfter:5,lines:[{id:'line-open',productId:'p1',description:'أرز',quantity:10,unitPrice:5,lineTotal:0}]}),
  document('purchase','purchase',{sequence:1,warehouseId:'w1',partyId:'supplier',total:84,dueTotal:84,lines:[{id:'line-purchase',productId:'p1',quantity:2,unitPrice:42,lineTotal:84,lineTotalMode:'exact'}]}),
  document('sale','sale',{sequence:1,warehouseId:'w1',partyId:'client',total:100,dueTotal:100,lines:[{id:'line-sale',productId:'p1',quantity:1,unitPrice:100,lineTotal:100,lineTotalMode:'exact',costAtSale:42,grossProfit:58}]}),
  document('sale-unknown','sale',{sequence:2,warehouseId:'w1',paymentMethod:'cash',total:.02,paidTotal:.02,lines:[{id:'line-unknown',productId:'p2',quantity:.1,unitPrice:.2,lineTotal:.02,lineTotalMode:'exact',costAtSale:null}]}),
  document('opening-client','party-opening',{partyId:'client',total:50,cashAmount:0,partyOpeningVersion:1,partyOpeningDirection:'receivable',partyOpeningAmount:50,partyOpeningContribution:50,partyBalanceDelta:50,partyOpeningBalanceBefore:100,partyOpeningAppliedDelta:50,partyOpeningBalanceAfter:150}),
  document('expense','expense',{paymentMethod:'cash',total:10,paidTotal:10,expenseCategoryId:'expense-category-rent',expenseCategoryName:'إيجار',lines:[{id:'line-expense',productId:null,description:'إيجار',quantity:1,unitPrice:10,lineTotal:10}]}),
  document('receipt','payment',{paymentMethod:'cash',partyId:'client',partyCashDirection:'receive',total:10,paidTotal:10,partyBalanceDelta:-10}),
 ],
 financialMovements:[{id:'fin-sale',documentId:'sale-unknown',documentNumber:'SALE-UNKNOWN',paymentMethod:'cash',type:'sale',direction:'in',amount:.02,status:'posted',occurredAt:at},{id:'fin-expense',documentId:'expense',paymentMethod:'cash',type:'expense',direction:'out',amount:10,status:'posted',occurredAt:at},{id:'fin-receipt',documentId:'receipt',paymentMethod:'cash',partyId:'client',type:'party-receive',direction:'in',amount:10,status:'posted',occurredAt:at},{id:'fin-opening-correction',documentId:'fin-opening-correction',documentNumber:'OPEN-COR-CASH',paymentMethod:'cash',type:'opening-balance-correction',direction:'in',amount:100,openingBalanceBefore:500,openingBalanceAfter:600,status:'posted',revision:0,occurredAt:at}],
 stockMovements:[{id:'stock-purchase',documentId:'purchase',documentNumber:'PURCHASE',documentRevision:0,productId:'p1',warehouseId:'w1',type:'purchase',balanceBefore:10,quantityDelta:2,balanceAfter:12,occurredAt:at},{id:'stock-sale',documentId:'sale',documentNumber:'SALE',documentRevision:0,productId:'p1',warehouseId:'w1',type:'sale',balanceBefore:12,quantityDelta:-1,balanceAfter:11,occurredAt:at}],
 auditEvents:[{id:'audit1',action:'sale.post',entityId:'sale',status:'committed',createdAt:at,afterDocument:{id:'sale',total:100}}],
 accountTransfers:[],appSettings:[{_id:'currency-settings',code:'EUR',availableCodes:['MRU','EUR','USD']},{_id:'invoice-branding',storeName:'متجر',storePhone:'1234',storeAddress:'العنوان',footerNote:'Footer',nameFont:'arial',nameFontSize:22,nameFontWeight:600}],users:[{id:'desktop-owner',username:'secret-name',password:'never-import'}],recurringExpenses:[{id:'retired-template',disabled:true}],importMappings:[{id:'mapping',targetId:'p1'}],counters:[{_id:'document-sale',value:2}],
}};}

let checks=0;const check=async(label,work)=>{await work();checks++;console.log('PASS '+label)};
await check('conversion is pure, maps source identities and keeps entire original backup losslessly',()=>{
 const raw=fixture(),before=structuredClone(raw),state=desktopToMobileState(raw);assert.deepEqual(raw,before);assert.deepEqual(state.desktopOriginal,before);assert.deepEqual(state.users,[]);
 assert.equal(state.warehouse,'المخزن');assert.equal(state.warehouseMeta['احتياطي'].archived,true);assert.equal(state.accounts[1].active,false);assert.equal(state.accounts[1].archived,true);assert.equal(state.parties[1].archived,true);
 assert.equal(state.currency.code,'EUR');assert.deepEqual(state.currency.availableCodes,['MRU','EUR','USD']);assert.equal(state.branding,'متجر');assert.equal(state.brandInfo.phone,'1234');assert.equal(state.brandInfo.footer,'Footer');
 assert.equal(state.products[0].categoryId,state.categories[0].id);assert.equal(state.records.find(r=>r.desktopId==='receipt').kind,'receive');assert.deepEqual(state.records.find(r=>r.desktopId==='expense').nonProductLines,raw.collections.documents.find(r=>r.id==='expense').lines);
 assert.notEqual(state.records.find(r=>r.desktopId==='sale').id,'sale');validateFeatureState(state);
});
await check('card price and authoritative accounting cost stay separate; unknown cost never becomes card999',()=>{
 const state=desktopToMobileState(fixture()),known=state.products[0],unknown=state.products[1];assert.equal(known.cost,10);assert.equal(known.lastPurchaseCost,42);assert.equal(known.lastPurchaseCostSource,'purchase');assert.equal(unknown.cost,999);assert.equal(unknown.lastPurchaseCost,null);
 const sale=state.records.find(r=>r.desktopId==='sale'),missing=state.records.find(r=>r.desktopId==='sale-unknown');assert.equal(sale.profit,58);assert.equal(missing.profit,null);assert.equal(missing.costKnown,false);assert.equal(missing.lines[0].costAtSale,null);
 assert.equal(profitSummary(saleFacts(state,{records:[missing]})).costKnown,false);assert.equal(profitSummary(saleFacts(state,{records:[sale]})).profit,58);
});
await check('exact decimals and legacy saved line agreements survive without recalculation',()=>{
 const raw=fixture();raw.collections.documents.push(document('legacy-round','sale',{warehouseId:'w1',total:1,dueTotal:1,partyId:'client',lines:[{id:'legacy-line',productId:'p1',quantity:.1,unitPrice:14.9,lineTotal:1,costAtSale:0}]}));
 const state=desktopToMobileState(raw),exact=state.records.find(r=>r.desktopId==='sale-unknown'),legacy=state.records.find(r=>r.desktopId==='legacy-round');
 assert.deepEqual([exact.total,exact.paid,exact.lines[0].qty,exact.lines[0].price,exact.lines[0].lineTotal,exact.lines[0].lineTotalMode],[.02,.02,.1,.2,.02,'exact']);
 assert.deepEqual([legacy.total,legacy.lines[0].lineTotal,legacy.lines[0].lineTotalMode,legacy.lines[0].costAtSale],[1,1,'desktop-legacy',0]);
 const invalid=fixture();invalid.collections.documents.find(r=>r.id==='sale-unknown').total=.03;assert.throws(()=>desktopToMobileState(invalid),/إجمالي الفاتورة/);
});
await check('party opening is usable, additive and reversible; final party/bank/stock balances are not replayed',()=>{
 const raw=fixture(),state=desktopToMobileState(raw),p=state.parties.find(p=>p.desktopId==='client'),opening=state.records.find(r=>r.desktopId==='opening-client');
 assert.equal(p.balance,140);assert.equal(state.accounts[0].balance,1000);assert.equal(state.products[0].stocks['المخزن'],11);assert.equal(state.products[1].stocks['المخزن'],.2);
 assert.equal(state.opening.parties[p.id],0);assert.equal(state.opening.stocks[state.products[0].id]['المخزن'],0);assert(Math.abs(state.opening.stocks[state.products[1].id]['المخزن']-.3)<Number.EPSILON);
 validatePartyOpeningState(state);const edited=partyOpeningCommand(state,{type:'party-opening.update',documentId:opening.id,expectedRevision:0,direction:'receivable',amount:80},{actor:{role:'owner'},now:at});assert.equal(partyOpeningNetBalance(edited.state.parties.find(row=>row.id===p.id)),170);assert.equal(edited.state.accounts[0].balance,1000);
 const record=state.records.find(r=>r.desktopMovementId==='fin-opening-correction');assert(record.openingAccountCorrection);assert.deepEqual([record.openingBalanceBefore,record.openingBalanceAfter,record.total],[500,600,100]);
});
await check('source stock proof, revisions, audit and financial movement identities are retained',()=>{
 const raw=fixture(),state=desktopToMobileState(raw),sale=state.records.find(r=>r.desktopId==='sale'),event=state.stockEvents.find(row=>row.id==='stock-sale');
 assert.deepEqual(event.desktop,raw.collections.stockMovements[1]);assert.equal(event.documentId,String(sale.id));assert.equal(event.productId,String(sale.lines[0].product));assert.equal(event.warehouseId,'المخزن');assert.equal(event.documentNumber,'SALE');assert.equal(event.documentRevision,0);assert.deepEqual([event.balanceBefore,event.quantityDelta,event.balanceAfter],[12,-1,11]);
 assert.equal(state.auditEvents[0].entityId,String(sale.id));assert.deepEqual(state.auditEvents[0].desktop,raw.collections.auditEvents[0]);
 assert.equal(state.financialMovements.find(row=>row.id==='fin-expense').documentId,String(state.records.find(row=>row.desktopId==='expense').id));
});
await check('expense master classification and archived references remain functional',()=>{
 const raw=fixture();raw.collections.expenseCategories[0].isArchived=true;const state=desktopToMobileState(raw),expense=state.records.find(row=>row.kind==='expense');
 assert.deepEqual(expenseCategoryForRecord(state,expense),{expenseCategoryId:'expense-category-rent',expenseCategoryName:'إيجار',expenseCategoryKind:'nonrecurring'});assert.equal(state.expenseCategories[0].isArchived,true);
});
await check('historical partial payments and returns remain readable without new creation paths',()=>{
 const raw=fixture();raw.collections.documents.push(document('partial','sale',{warehouseId:'w1',partyId:'client',paymentMethod:'cash',total:100,paidTotal:40,dueTotal:60,lines:[{id:'partial-line',productId:'p1',quantity:1,unitPrice:100,lineTotal:100,costAtSale:42}]}));
 raw.collections.documents.push(document('return','return',{warehouseId:'w1',partyId:'client',parentDocumentId:'sale',total:50,dueTotal:50,lines:[{id:'return-line',productId:'p1',quantity:.5,unitPrice:100,lineTotal:50,costAtSale:42,grossProfit:29}]}));
 const state=desktopToMobileState(raw),partial=state.records.find(r=>r.desktopId==='partial'),returned=state.records.find(r=>r.desktopId==='return');
 assert.equal(partial.importReadOnly,true);assert.deepEqual([partial.total,partial.paid,partial.due],[100,40,60]);assert.equal(returned.kind,'return');assert.equal(returned.importReadOnly,true);assert.equal(returned.parentDocumentId,String(state.records.find(r=>r.desktopId==='sale').id));
 assert.equal(profitSummary(saleFacts(state,{records:[returned]})).revenue,-50);
});
await check('unsupported or dangling structures reject the whole import before any live state can change',()=>{
 for(const alter of [r=>r.collections.documents.push(document('offset','offset')),r=>r.collections.documents[1].lines[0].productId='gone',r=>r.collections.documents[2].warehouseId='gone',r=>r.collections.warehouses[1].name='المخزن',r=>r.collections.products[0].stocks.gone=1,r=>r.collections.documents[5].expenseCategoryId='gone',r=>r.collections.documents[1].paymentMethod='gone',r=>r.collections.products[0].piecePrice=Infinity]){
  const raw=fixture();alter(raw);const before=structuredClone(raw);assert.throws(()=>desktopToMobileState(raw));assert.deepEqual(raw,before);
 }
});
await check('Mongo extended scalar values map to usable numbers, IDs and dates while raw source stays exact',()=>{
 const raw=fixture();raw.encoding='mongodb-extended-json-v2';raw.collections.products[0].stocks.w1={$numberDouble:'11'};raw.collections.warehouses[0]._id={$oid:'w1'};raw.collections.documents[2].occurredAt={$date:at};raw.collections.documents[2].total={$numberInt:'100'};
 const state=desktopToMobileState(raw);assert.equal(state.products[0].stocks['المخزن'],11);assert.equal(state.records.find(r=>r.desktopId==='sale').total,100);assert.deepEqual(state.desktopOriginal,raw);
});
await check('employee agreements, accrual canonical IDs, deposits, payroll proofs and reserves round-trip functionally',async()=>{
 let current=phoneFixture();const options={actor:{role:'owner',id:'owner'},now:at};
 let result=await commandPayroll(current,'employee.create',{name:'Worker',amount:500,startDate:'2026-11-01',intervalMonths:1,entitlement:'beginning'},options);current=result.state;const workerId=result.id;
 current=(await materializePayroll(current,{asOf:'2026-11-16',now:at})).state;
 current=(await commandPayroll(current,'employee-payment.post',{employeeId:workerId,amount:200,direction:'withdraw',paymentMethod:'1',occurredAt:'2026-11-02'},options)).state;
 current=(await commandPayroll(current,'employee-payment.post',{employeeId:workerId,amount:50,direction:'deposit',paymentMethod:'1',occurredAt:'2026-11-03'},options)).state;
 const raw=fixture();raw.collections.employees=structuredClone(current.employees);
 raw.collections.documents.push(...payrollCanonicalDocuments(current).map(row=>({...row,paymentMethod:row.paymentMethod==='1'?'cash':row.paymentMethod})));
 raw.collections.financialMovements.push(...current.payrollFinancialMovements.map(row=>({...row,paymentMethod:row.paymentMethod==='1'?'cash':row.paymentMethod})));
 raw.collections.auditEvents.push(...current.auditEvents);const state=desktopToMobileState(raw);validatePayrollState(state);
 assert.deepEqual(state.employees,current.employees);assert.equal(state.payrollFinancialMovements.length,current.payrollFinancialMovements.length);
 for(const record of state.records.filter(row=>row.kind.startsWith('employee-'))){assert.equal(typeof record.id,'number');assert.equal(record.sourceDocumentId,record.payrollDocumentId);if(record.kind==='employee-payment')assert.equal(record.paymentMethod,String(record.account))}
 const facts=payrollFacts(state),before=payrollFacts(current);assert.deepEqual(facts.summary,before.summary);assert.equal(state.employees[0].balance,350);
});
console.log(JSON.stringify({suite:'desktop-import-862',checks}));
