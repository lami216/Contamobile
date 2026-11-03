import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {validateState} from '../approved-runtime/database.js';
import {upgradeState,validateFeatureState} from '../approved-runtime/upgrade-state.js';
import {reportDataset} from '../approved-runtime/report-data.js';
import {translateText} from '../approved-runtime/i18n.js';

// Execute the actual shipped ledger, including its final wrappers, in isolated memory.
let engine=readFileSync(new URL('../approved-runtime/engine.js',import.meta.url),'utf8').split("document.addEventListener('click'")[0];
engine=engine.replace(/const form=[^\r\n]*/,"const form=()=>testForm,error=t=>{lastError=t},toast=()=>{};\n");
const context={assert,console,structuredClone,crypto,testForm:{},lastError:null,document:{addEventListener(){},querySelector(){return null}},localStorage:{getItem(){return null}},matchMedia:()=>({matches:true}),karnaLocale:{text:value=>translateText(value,'ar')},karnaCurrentActor:()=>({id:7,name:'مالك'})};
vm.createContext(context);vm.runInContext(engine+'\nrender=()=>{};reset();',context);
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS '+name)};
const run=source=>vm.runInContext(source,context);
check('paid purchase at zero commits negative cash with goods and stable invoice',()=>run(`
 reset();S.records=[];S.accounts[0].balance=0;S.opening.accounts[1]=0;const whSigned=S.warehouse,quantityBeforeSigned=S.products[0].stocks[whSigned];
 const purchaseSigned={...newRecord('purchase'),id:901,total:500,paid:500,due:0,warehouse:whSigned,account:1,lines:[{product:1,name:'أرز',qty:2,price:250}]};
 assert(commitRecord(purchaseSigned));assert.equal(S.accounts[0].balance,-500);assert.equal(S.products[0].stocks[whSigned],quantityBeforeSigned+2);assert.equal(S.records[0].id,901);
`));
check('editing and cancelling purchase apply only its financial difference',()=>run(`
 assert(commitRecord({...S.records[0],total:600,paid:600,lines:[{product:1,name:'أرز',qty:2,price:300}]}));assert.equal(S.accounts[0].balance,-600);assert.equal(S.products[0].stocks[whSigned],quantityBeforeSigned+2);assert.equal(S.records.length,1);
 act('void:901');act('confirm-void');assert.equal(S.accounts[0].balance,0);assert.equal(S.products[0].stocks[whSigned],quantityBeforeSigned);assert.equal(S.records[0].voided,true);
`));
check('negative account never blocks receipts or unrelated noncash documents',()=>run(`
 S.accounts[0].balance=-500;S.records=[];const partySigned=S.parties[0];partySigned.balance=500;
 assert(commitRecord({...newRecord('receive'),id:902,total:100,paid:100,due:0,account:1,party:partySigned.id,lines:[]}));assert.equal(S.accounts[0].balance,-400);assert.equal(partySigned.balance,400);
 assert(commitRecord({...newRecord('sale'),id:903,total:100,paid:0,due:100,party:partySigned.id,warehouse:whSigned,lines:[{product:1,name:'أرز',qty:1,price:100}]}));assert.equal(S.accounts[0].balance,-400);assert.equal(partySigned.balance,500);
`));
check('withdrawal expense and account transfers may cross zero',()=>run(`
 S.accounts[0].balance=0;S.accounts.push({id:9,name:'مصرف',balance:0});
 assert(commitRecord({...newRecord('withdraw'),id:904,total:100,paid:100,account:1,lines:[]}));assert.equal(S.accounts[0].balance,-100);
 assert(commitRecord({...newRecord('expense'),id:905,total:50,paid:50,account:1,lines:[]}));assert.equal(S.accounts[0].balance,-150);
 assert(commitRecord({...newRecord('transfer'),id:906,total:100,paid:100,account:1,to:9,lines:[]}));assert.equal(S.accounts[0].balance,-250);assert.equal(S.accounts.find(a=>a.id===9).balance,100);
`));
check('cancelling cash income may make account negative',()=>run(`
 S.records=[];S.accounts[0].balance=0;
 assert(commitRecord({...newRecord('sale'),id:907,total:100,paid:100,due:0,account:1,warehouse:whSigned,lines:[{product:1,name:'أرز',qty:1,price:100}]}));
 assert(commitRecord({...newRecord('withdraw'),id:908,total:100,paid:100,account:1,lines:[]}));act('void:907');act('confirm-void');assert.equal(S.records.find(r=>r.id===907).voided,true);assert.equal(S.accounts[0].balance,-100);
`));
check('stock dependencies still fail atomically with negative cash allowed',()=>run(`
 reset();S.records=[];S.products[0].stocks[S.warehouse]=0;S.accounts[0].balance=0;
 assert(commitRecord({...newRecord('purchase'),id:909,total:500,paid:500,account:1,warehouse:S.warehouse,lines:[{product:1,name:'أرز',qty:2,price:250}]}));
 assert(commitRecord({...newRecord('sale'),id:910,total:400,paid:400,account:1,warehouse:S.warehouse,lines:[{product:1,name:'أرز',qty:2,price:200}]}));const beforeStockFailureSigned=JSON.stringify(S);act('void:909');act('confirm-void');assert.equal(JSON.stringify(S),beforeStockFailureSigned);assert.match(lastError,/أرز/);
`));
check('invalid and overflowing account values remain rejected atomically',()=>run(`
 const beforeInvalidSigned=JSON.stringify(S);assert.equal(commitRecord({...newRecord('withdraw'),id:911,total:Infinity,paid:Infinity,account:1,lines:[]}),false);assert.equal(JSON.stringify(S),beforeInvalidSigned);
 assert.equal(commitRecord({...newRecord('withdraw'),id:912,total:2e14,paid:2e14,account:1,lines:[]}),false);assert.equal(JSON.stringify(S),beforeInvalidSigned);
`));
check('zero and negative transaction amounts remain rejected by entry points',()=>run(`
 const beforeAmountSigned=JSON.stringify(S);modal='withdraw';testForm={account:'1',amount:'-1'};act('post-cash');assert.equal(JSON.stringify(S),beforeAmountSigned);assert.match(lastError,/أكبر من صفر/);
 testForm.amount='0';act('post-cash');assert.equal(JSON.stringify(S),beforeAmountSigned);
`));
check('signed account inputs retain numeric entry without physical-quantity validation changes',()=>run(`
 assert(!input('balance','number',-500,true).includes('min="0"'));assert(input('quantity','number',1).includes('min="0"'));assert(input('balance','number',-500,true).includes('inputmode="decimal"'));
 modal='account';testForm={name:'مصرف سالب',balance:'-250'};act('save-account');assert.equal(S.accounts.at(-1).balance,-250);assert.equal(S.opening.accounts[S.accounts.at(-1).id],-250);
`));
const state=()=>({originId:'signed-accounts',branding:'المتجر',warehouse:'A',warehouses:['A'],products:[],parties:[],accounts:[{id:1,name:'Cash',balance:-500,openingBalance:-250}],records:[{id:101,kind:'withdraw',date:'2026-11-03',total:250,paid:250,due:0,account:1,lines:[]}],opening:{accounts:{1:-250},parties:{},stocks:{}}});
check('upgrade and persistence validation preserve signed current and opening balances',()=>{
 const s=state(),original=JSON.stringify(s);assert.equal(validateState(s),true);assert.equal(JSON.stringify(s),original);upgradeState(s);validateFeatureState(s);assert.equal(s.accounts[0].balance,-500);assert.equal(s.accounts[0].openingBalance,-250);assert.equal(s.opening.accounts[1],-250);assert.equal(upgradeState(s),false);assert.equal(validateState(JSON.parse(JSON.stringify(s))),true);
});
check('backup state with negative account remains valid while nonfinite money and stock do not',()=>{
 for(const balance of [NaN,Infinity,-Infinity,1e14+1,-1e14-1]){const s=state();s.accounts[0].balance=balance;assert.throws(()=>validateState(s));}
 const s=state();s.accounts[0].openingBalance=-Infinity;assert.throws(()=>validateState(s));
 const t=state();t.products=[{id:1,name:'زيت',price:10,cost:5,stocks:{A:-1}}];assert.throws(()=>validateState(t));
});
check('financial account report preserves signed opening and closing exactly',()=>{
 const s=state();upgradeState(s);const dataset=reportDataset(s,{type:'financial',accountId:1});assert.equal(dataset.rows.length,1);assert.equal(dataset.rows[0].outgoing,250);assert.equal(dataset.rows[0].balance,-500);
});
console.log(JSON.stringify({checks,status:'passed'}));
