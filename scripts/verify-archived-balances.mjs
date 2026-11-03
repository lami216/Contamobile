import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {repairArchivedBalances,reconcileHistoricalArchives} from '../approved-runtime/accounting-lifecycle.js';
import {partyFinancialSummary} from '../approved-runtime/party-metrics.js';

const fixture=()=>({accounts:[{id:1,name:'Cash',balance:0},{id:2,name:'Bank',balance:0,archived:true,active:false,archivedAt:'old'},{id:3,balance:0,archived:true}],parties:[{id:1,type:'supplier',balance:100,archived:true},{id:2,type:'customer',balance:-75,archived:true},{id:3,type:'customer',balance:0,archived:true}],records:[]});
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS '+name);}
check('legacy hidden positive and negative balances reappear without rewriting financial history',()=>{
 const state=fixture();state.accounts[1].balance=-30;const financial=JSON.stringify([state.accounts.map(a=>a.balance),state.parties.map(p=>p.balance),state.records]);
 assert(repairArchivedBalances(state));assert.equal(state.accounts[1].archived,false);assert.equal(state.accounts[1].active,true);assert.equal(state.accounts[2].archived,true);assert.equal(state.parties[2].archived,true);
 assert.equal(partyFinancialSummary(state,'supplier').values.payable,100);assert.equal(partyFinancialSummary(state,'customer').values.payable,75);
 assert.equal(JSON.stringify([state.accounts.map(a=>a.balance),state.parties.map(p=>p.balance),state.records]),financial);assert.equal(repairArchivedBalances(state),false);
});
check('a reversed payment exposes only the affected party and account with restored funds',()=>{
 const state=fixture();state.accounts[1].balance=100;reconcileHistoricalArchives(state,{kind:'pay',party:1,account:2},null,true);
 assert.equal(state.parties[0].archived,false);assert.equal(state.accounts[1].archived,false);assert.equal(state.accounts[1].active,true);assert.equal(state.parties[1].archived,true);assert.equal(state.parties[2].archived,true);
});
check('balanced note-only historical edit preserves party archive while reused original bank reactivates',()=>{
 const state=fixture();state.parties[0].balance=0;const record={kind:'purchase',party:1,account:2};reconcileHistoricalArchives(state,record,{...record});
 assert.equal(state.parties[0].archived,true);assert.equal(state.accounts[1].archived,false);assert.equal(state.accounts[1].active,true);assert.equal(state.accounts[1].balance,0);
});
check('reversal with zero final balance preserves archive and changed-account edit exposes nonzero old balance',()=>{
 const state=fixture();const old={kind:'transfer',account:2,to:3};reconcileHistoricalArchives(state,old,null,true);assert(state.accounts[1].archived);assert(state.accounts[2].archived);
 state.accounts[1].balance=50;reconcileHistoricalArchives(state,{kind:'expense',account:1},old);assert.equal(state.accounts[1].archived,false);assert.equal(state.accounts[2].archived,true);
});
check('invalid balance is never silently normalized by archive repair',()=>{
 const state=fixture();state.accounts[1].balance=NaN;state.parties[0].balance=Infinity;repairArchivedBalances(state);assert(state.accounts[1].archived);assert(state.parties[0].archived);assert(Number.isNaN(state.accounts[1].balance));assert.equal(state.parties[0].balance,Infinity);
});
const engine=fs.readFileSync(new URL('../approved-runtime/engine.js',import.meta.url),'utf8');
const source=engine.match(/^function historicalEntityAvailable.*$/m)?.[0];assert(source);
check('historic picker accepts only original archived entities and rejects them for new invoices',()=>{
 const state={records:[{id:10,party:1,account:2,to:3}]};const context=vm.createContext({S:state,editingId:10});const accepts=vm.runInContext(source+';historicalEntityAvailable',context);
 assert(accepts({id:1,archived:true},'party'));assert(accepts({id:2,archived:true,active:false},'account'));assert(!accepts({id:3,archived:true},'account'));assert(accepts({id:3,archived:true},'to'));assert(!accepts({id:4,archived:true},'party'));
 context.editingId=null;assert(!accepts({id:1,archived:true},'party'));assert(!accepts({id:2,active:false},'account'));assert(accepts({id:1},'party'));assert(accepts({id:2},'account'));
 context.editingId=10;state.records[0].voided=true;assert(!accepts({id:1,archived:true},'party'));
});
console.log(JSON.stringify({checks,status:'passed'}));
