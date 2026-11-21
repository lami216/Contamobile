import assert from 'node:assert/strict';
import {mergeImport,reconcileImportOpening} from '../approved-runtime/import-domain.js';
import {upgradeState} from '../approved-runtime/upgrade-state.js';
import {validateState} from '../approved-runtime/database.js';
import {commandPayroll,materializePayroll,validatePayrollState,payrollFacts} from '../approved-runtime/payroll-domain.js';
import {partyOpeningCommand} from '../approved-runtime/party-opening-domain.js';
import {phoneFixture} from './party-category-862-harness.mjs';
import {reportDataset} from '../approved-runtime/report-data.js';

const at='2026-11-16T12:00:00.000Z',actor={role:'owner',id:'owner'},clock={actor,now:at};
let checks=0;const check=async(label,work)=>{await work();checks++;console.log('PASS '+label)};
function base(){const state=phoneFixture();state.branding='Current';state.originId='current';state.users=[{id:'owner',name:'Owner',role:'owner'}];state.products[0].sku='rice';state.stockEvents=[{id:'current-proof',documentId:'baseline',documentNumber:'INITIAL',productId:'1',warehouseId:'A',balanceBefore:0,quantityDelta:20,balanceAfter:20,type:'legacy-opening',at}];upgradeState(state);return state;}
async function incoming(){
 let state=phoneFixture();state.branding='Incoming';state.originId='source-862';state.accounts[0].balance=300;state.accounts.push({id:2,name:'Bank source',code:'bank',balance:20});state.products[0].sku='rice';state.categories=[{id:1,name:'Food'}];state.products[0].categoryId=1;
 state.expenseCategories=[{id:'rent',name:'Rent',kind:'nonrecurring',isArchived:false,revision:0}];
 state.records=[{id:201,kind:'sale',number:'SALE-201',date:'2026-11-15',time:'12:00',occurredAt:'2026-11-15T12:00:00.000Z',warehouse:'A',party:1,account:1,total:.3,paid:.3,due:0,revision:0,lines:[{id:'line-exact',product:1,name:'Rice',qty:2,price:.15,lineTotal:.3,lineTotalMode:'exact',costAtSale:null}]},{id:202,kind:'expense',date:'2026-11-15',total:.0001,paid:.0001,due:0,account:1,expenseCategoryId:'rent',expenseCategoryName:'Rent',lines:[]}];
 state.stockEvents=[{id:'source-proof',documentId:'201',documentNumber:'SALE-201',documentRevision:0,productId:'1',warehouseId:'A',type:'sale',balanceBefore:22,quantityDelta:-2,balanceAfter:20,occurredAt:'2026-11-15T12:00:00.000Z'}];
 state.financialMovements=[{id:'fin-expense',documentId:'202',paymentMethod:'1',direction:'out',amount:.0001,type:'expense',status:'posted',occurredAt:at}];
 state.desktopAccountTransfers=[{id:'legacy-transfer',fromAccountId:'1',toAccountId:'2',amount:2,documentId:'201',occurredAt:at}];
 state.auditEvents=[{id:'source-audit',action:'sale.post',entityId:'201',status:'committed',createdAt:at}];
 state=(partyOpeningCommand(state,{type:'party-opening.post',partyId:1,direction:'receivable',amount:40},clock)).state;
 state=(await commandPayroll(state,'employee.create',{name:'Worker',amount:100,startDate:'2026-11-01',intervalMonths:1,entitlement:'beginning'},clock)).state;
 state=(await materializePayroll(state,{asOf:'2026-11-16',now:at})).state;
 const employeeId=state.employees[0].id;
 state=(await commandPayroll(state,'employee-payment.post',{employeeId,amount:20,direction:'withdraw',paymentMethod:'1',occurredAt:'2026-11-02'},clock)).state;
 state.desktopOriginal={format:'conta-backup',schemaVersion:1,createdAt:at,collections:{marker:'full-original-retained'}};
 upgradeState(state);validateState(state);return state;
}
const source=await incoming();
await check('merge validates new862 collections, keeps caller state and current account/user balances',()=>{
 const current=base(),before=structuredClone(current),sourceBefore=structuredClone(source),merged=mergeImport(current,source);validateState(merged.state);validatePayrollState(merged.state);assert.deepEqual(current,before);assert.deepEqual(source,sourceBefore);
 assert.equal(merged.state.accounts[0].balance,500);assert.equal(merged.state.parties[0].balance,0);assert.equal(merged.state.products[0].stocks.A,20);assert.deepEqual(merged.state.users,current.users);
 assert.equal(merged.counts.employees,1);assert.equal(merged.counts.expenseCategories,1);assert.equal(merged.state.employees[0].balance,80);assert.equal(merged.state.expenseCategories[0].kind,'nonrecurring');
 assert.deepEqual(payrollFacts(merged.state).summary,payrollFacts(source).summary);
});
await check('native numeric IDs, exact policy, unknown cost and all bank/party references remap consistently',()=>{
 const current=base();current.records=[{id:999,kind:'expense',date:'2026-11-14',total:1,paid:1,due:0,account:1,lines:[]}];
 const state=mergeImport(current,source).state,sale=state.records.find(row=>row.number==='SALE-201'),proof=state.stockEvents.find(row=>row.id==='source-proof'),audit=state.auditEvents.find(row=>row.id==='source-audit');
 assert(sale.id>999);assert.equal(sale.lines[0].product,1);assert.deepEqual([sale.total,sale.lines[0].lineTotal,sale.lines[0].lineTotalMode,sale.lines[0].costAtSale],[.3,.3,'exact',null]);assert.equal(proof.documentId,String(sale.id));assert.equal(proof.documentRevision,0);assert.equal(proof.productId,'1');assert.equal(audit.entityId,String(sale.id));
 const expense=state.records.find(row=>row.expenseCategoryId==='rent');assert.equal(state.financialMovements.find(row=>row.id==='fin-expense').documentId,String(expense.id));
 for(const payment of state.records.filter(row=>row.kind==='employee-payment')){assert.equal(payment.paymentMethod,String(payment.account));assert(state.payrollFinancialMovements.some(row=>row.documentId===payment.payrollDocumentId&&row.paymentMethod===payment.paymentMethod))}
});
await check('repeated import is idempotent for documents, workers, categories, movements, audit, proof and raw source',()=>{
 const first=mergeImport(base(),source).state,second=mergeImport(first,source).state;
 for(const name of ['records','employees','expenseCategories','payrollFinancialMovements','financialMovements','stockEvents','auditEvents','desktopAccountTransfers','desktopImportSources'])assert.equal(second[name].length,first[name].length,name);
 assert.deepEqual(second.payrollFinancialMovements,first.payrollFinancialMovements);assert.deepEqual(second.stockEvents,first.stockEvents);assert.deepEqual(second.desktopImportSources,first.desktopImportSources);
 assert.equal(second.desktopImportSources.length,1);assert.deepEqual(second.desktopImportSources[0].backup,source.desktopOriginal);
});
await check('native self-import retains numeric audit identities without fabricating a conflict',()=>{
 const current=structuredClone(source),merged=mergeImport(current,structuredClone(current)).state;
 assert.equal(merged.records.length,current.records.length);assert.equal(merged.auditEvents.length,current.auditEvents.length);
 for(const audit of current.auditEvents){const copy=merged.auditEvents.find(row=>row.id===audit.id);assert.equal(copy.entityId,audit.entityId)}
 validatePayrollState(merged);
});
await check('imported balances policy takes source final values without replaying payroll or party opening',()=>{
 const state=mergeImport(base(),source,{accounts:'imported',parties:'imported',stocks:'imported'}).state;
 assert.equal(state.accounts[0].balance,source.accounts[0].balance);assert.equal(state.parties[0].balance,source.parties[0].balance);assert.equal(state.products[0].stocks.A,source.products[0].stocks.A);
 const bank=reportDataset(state,{type:'financial',accountId:1});assert(bank);validatePayrollState(state);
 const all=state.records.filter(row=>row.account===1&&!row.voided).reduce((sum,row)=>sum+(row.kind==='employee-payment'?-row.total:row.kind==='sale'?row.paid:-row.paid),0);assert(Math.abs(state.opening.accounts[1]+all-state.accounts[0].balance)<1e-10);
});
await check('different snapshots of the same employee reject atomically rather than merge conflicting wages',async()=>{
 const first=mergeImport(base(),source).state,original=structuredClone(first),worker=source.employees[0];
 const changed=(await commandPayroll(source,'employee-payment.post',{employeeId:worker.id,amount:5,direction:'withdraw',paymentMethod:'1',occurredAt:'2026-11-03'},clock)).state;
 assert.throws(()=>mergeImport(first,changed),/نسختان مختلفتان/);assert.deepEqual(first,original);
});
await check('classification uses current master with explicit warning and preserves saved history',()=>{
 const current=base();current.expenseCategories=[{id:'current-rent',name:'Rent',kind:'recurring',isArchived:false,revision:0}];const result=mergeImport(current,source),expense=result.state.records.find(row=>row.kind==='expense'&&row.total===.0001);
 assert.equal(result.state.expenseCategories.length,1);assert.equal(expense.expenseCategoryId,'current-rent');assert.equal(expense.expenseCategoryName,'Rent');assert(result.warnings.some(row=>row.includes('تعريف الفئة الحالية')));assert.equal(expense.total,.0001);
});
await check('stock proof IDs/before/after are retained; conflicting ID reuse is rejected',()=>{
 const current=base(),before=structuredClone(current.stockEvents),result=mergeImport(current,source);assert.deepEqual(result.state.stockEvents[0],before[0]);
 const original=source.stockEvents[0],mapped=result.state.stockEvents.find(row=>row.id===original.id);for(const key of ['id','documentNumber','documentRevision','balanceBefore','quantityDelta','balanceAfter','occurredAt'])assert.equal(mapped[key],original[key]);
 const collision=structuredClone(source);collision.stockEvents[0].id='current-proof';assert.throws(()=>mergeImport(current,collision),/معرّف متعارض/);
});
await check('old numeric desktop aliases cannot shadow functional native product references',()=>{
 const incoming=structuredClone(source);incoming.products[0].desktopId='2';incoming.products.push({id:2,desktopId:'1',name:'Sugar',sku:'sugar',price:5,cost:2,stocks:{A:1},qty:1});incoming.opening.stocks[2]={A:1};
 const result=mergeImport(base(),incoming).state,proof=result.stockEvents.find(row=>row.id==='source-proof'),rice=result.products.find(row=>row.sku==='rice');
 assert.equal(proof.productId,String(rice.id));assert.equal(result.records.find(row=>row.number==='SALE-201').lines[0].product,rice.id);
});
await check('opening reconciliation preserves tiny cash and stock values and does not regenerate proof',()=>{
 const state=base();state.products[0].stocks.A=1e-20;state.accounts[0].balance=.0002;state.records=[{id:101,kind:'expense',date:'2026-11-01',total:.0001,paid:.0001,due:0,account:1,lines:[]}];const proof=structuredClone(state.stockEvents);reconcileImportOpening(state);
 assert.equal(state.opening.stocks[1].A,1e-20);assert(Math.abs(state.opening.accounts[1]-.0003)<1e-18);assert.deepEqual(state.stockEvents,proof);
});
await check('full backup JSON roundtrip keeps new ledger and validates with every source reference intact',()=>{
 const merged=mergeImport(base(),source).state,backup={format:'alkarna-web-backup',schemaVersion:1,state:merged,users:[]},restored=JSON.parse(JSON.stringify(backup));validateState(restored.state);validatePayrollState(restored.state);
 for(const name of ['employees','payrollFinancialMovements','expenseCategories','records','stockEvents','auditEvents','financialMovements','desktopImportSources'])assert.deepEqual(restored.state[name],JSON.parse(JSON.stringify(merged[name])),name);
});
console.log(JSON.stringify({suite:'862-import-merge',checks}));
