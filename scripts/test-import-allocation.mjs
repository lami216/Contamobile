import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {mergeImport} from '../approved-runtime/import-domain.js';
import {validateState} from '../approved-runtime/database.js';

const fixture=originId=>({originId,branding:'Synthetic fixture',warehouse:'A',warehouses:['A'],products:[],parties:[],accounts:[{id:1,name:'Cash',balance:1000000}],records:[],opening:{stocks:{},parties:{},accounts:{1:1000000}}});
const expense=(id,extra={})=>({id,kind:'expense',date:'2026-10-01',total:1,paid:1,due:0,account:1,lines:[],...extra});

test('new import IDs stay above sparse existing IDs and preserve source identities',()=>{
 const current=fixture('current'),incoming=fixture('incoming');
 current.records=[expense(5000),expense(101)];incoming.records=[expense(5000),expense(90000)];
 const before=structuredClone(current),source=structuredClone(incoming),result=mergeImport(current,incoming);
 assert.deepEqual(current,before);assert.deepEqual(incoming,source);
 assert.deepEqual(result.state.records.map(r=>r.id),[5002,5001,5000,101]);
 assert.equal(result.state.records.find(r=>r.id===5001).importKey,'mobile:incoming:records:5000');
 assert.equal(result.state.records.find(r=>r.id===5002).importKey,'mobile:incoming:records:90000');
 validateState(result.state);
});

test('repeated import does not duplicate documents or consume more local IDs',()=>{
 const current=fixture('current'),incoming=fixture('incoming');incoming.records=[expense(101),expense(102)];
 const first=mergeImport(current,incoming),second=mergeImport(first.state,incoming);
 assert.equal(second.counts.records,0);assert.equal(second.state.records.length,2);
 assert.deepEqual(second.state.records.map(r=>[r.id,r.importKey]),first.state.records.map(r=>[r.id,r.importKey]));
});

test('replacement preserves an existing imported ID while a new document receives the next ID',()=>{
 const current=fixture('current'),incoming=fixture('incoming');
 current.records=[expense(7000,{importKey:'mobile:incoming:records:101'})];incoming.records=[expense(101,{total:2,paid:2}),expense(102)];
 const result=mergeImport(current,incoming,{records:'imported'});
 assert.deepEqual(result.state.records.map(r=>r.id),[7001,7000]);
 assert.equal(result.state.records.find(r=>r.id===7000).total,2);
 assert.equal(current.records[0].total,1);validateState(result.state);
});

test('entity remapping uses independent counters and keeps invoice relations intact',()=>{
 const current=fixture('current'),incoming=fixture('incoming');
 current.categories=[{id:80,name:'Existing category'}];current.products=[{id:500,name:'Existing product',sku:'old',price:2,cost:1,stocks:{A:0},qty:0}];current.parties=[{id:40,name:'Existing client',type:'customer',balance:0}];current.accounts.push({id:60,name:'Existing bank',balance:0});
 incoming.categories=[{id:1,name:'New category'}];incoming.products=[{id:1,name:'Imported product',sku:'new',price:2,cost:1,stocks:{A:0},qty:0,categoryId:1}];incoming.parties=[{id:1,name:'Imported client',type:'customer',balance:2}];incoming.accounts.push({id:2,name:'Imported bank',balance:0});incoming.records=[{id:101,kind:'sale',date:'2026-10-01',warehouse:'A',total:2,paid:0,due:2,party:1,account:2,lines:[{product:1,name:'Imported product',qty:1,price:2}]}];
 const result=mergeImport(current,incoming).state,record=result.records[0];
 assert.equal(result.categories.find(c=>c.name==='New category').id,81);
 const p=result.products.find(p=>p.name==='Imported product');assert.equal(p.id,501);assert.equal(p.categoryId,81);
 assert.equal(result.parties.find(p=>p.name==='Imported client').id,41);assert.equal(result.accounts.find(a=>a.name==='Imported bank').id,61);
 assert.equal(record.lines[0].product,501);assert.equal(record.party,41);assert.equal(record.account,61);validateState(result);
});

test('the supported 100,000-document boundary remains valid without changing originals',{timeout:30000},()=>{
 const current=fixture('current'),incoming=fixture('incoming');incoming.records=Array.from({length:100000},(_,i)=>expense(i+101));validateState(incoming);
 const start=performance.now(),result=mergeImport(current,incoming),durationMs=Math.round(performance.now()-start);
 assert.equal(result.counts.records,100000);assert.equal(result.state.records.length,100000);
 assert.equal(new Set(result.state.records.map(r=>r.id)).size,100000);assert.equal(result.state.records[0].id,100100);assert.equal(result.state.records.at(-1).id,101);
 assert.equal(current.records.length,0);assert.equal(incoming.records[0].id,101);validateState(result.state);
 console.log(JSON.stringify({scenario:'maximum supported synthetic document import',records:100000,durationMs}));
});
