import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
import {invoiceDocument} from '../approved-runtime/invoice-view.js';
const engine=fs.readFileSync('approved-runtime/engine.js','utf8').split("document.addEventListener('click'")[0];
const c={console,assert,structuredClone,crypto,document:{addEventListener(){},querySelector(){return null}},localStorage:{getItem(){return null}},matchMedia:()=>({matches:true})};
vm.createContext(c);vm.runInContext(engine+'\nrender=()=>{};reset();',c);
vm.runInContext(`
const supplier=S.parties.find(p=>p.type==='supplier');
for(const kind of ['purchase','pay','receive']){
 const r={...S.records[0],id:900,kind,party:supplier.id,voided:false};S.records.push(r);
 const before=JSON.stringify(S);editingId=null;modal=null;cart=[];act('source-location:900');
 assert.equal(view,'ledger');assert.equal(selected,supplier.id);assert.equal(modal,null);assert.equal(editingId,null);assert.equal(cart.length,0);assert.equal(JSON.stringify(S),before);
 act('invoice:900');assert.equal(view,'invoice');assert.equal(modal,null);assert.equal(editingId,null);assert(invoiceIsAtSource(r));S.records.pop();
}
const many=Array.from({length:140},(_,i)=>({...S.records[0],id:1000+i,kind:'purchase',party:supplier.id,voided:false}));S.records=many;
act('source-location:1130');assert(rows(many).includes('invoice:1130'));assert.equal(listWindowPages.get(listWindowKey('سجل المستندات')),3);
let scrolled=0;const row={classList:{add(){}},setAttribute(){},scrollIntoView(){scrolled++}};focusLocatedRecord({querySelector(){return row}});focusLocatedRecord({querySelector(){return row}});assert.equal(scrolled,1);
S.records[130].voided=true;act('source-location:1130');assert(rows(liveRecords()).includes('invoice:1130'));selected=-1;assert(!rows([]).includes('invoice:1130'));
for(const [kind,target] of [['sale','operations'],['expense','expenses'],['stocktransfer','transfer'],['adjustment','adjustment'],['deposit','account']]){
 S.records.push({...S.records[0],id:900,kind,party:null,voided:false});cart=[];editingId=null;modal=null;const before=JSON.stringify(S);act('source-location:900');assert.equal(view,target);assert.equal(modal,null);assert.equal(editingId,null);assert.equal(cart.length,0);assert.equal(JSON.stringify(S),before);S.records.pop();
}
S.records[0].voided=false;cart=[];editingId=null;act('source-location:'+S.records[0].id);act('invoice:'+S.records[0].id);assert(invoiceIsAtSource(S.records[0]));act('source:'+S.records[0].id);assert.equal(view,'purchase');assert.equal(editingId,S.records[0].id);
`,c);
const state=vm.runInContext('S',c),record=state.records[0];
const render=atSource=>invoiceDocument(state,record,{esc:x=>String(x??''),money:x=>String(x),icon:()=>'',labels:{purchase:'فاتورة شراء'},atSource});
assert(render(false).includes(`source-location:${record.id}`));assert(!render(false).includes(`data-action="source:${record.id}"`));assert(!render(true).includes(`source-location:${record.id}`));assert(render(true).includes(`data-action="source:${record.id}"`));
console.log('PASS locate and highlight without opening/editing, distant/cancelled rows, scoped owner, all source registers, row opens detail and Edit alone opens editor');
