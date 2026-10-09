import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
import {invoiceDocument} from '../approved-runtime/invoice-view.js';
const engine=fs.readFileSync('approved-runtime/engine.js','utf8').split("document.addEventListener('click'")[0];
const c={console,assert,structuredClone,crypto,document:{addEventListener(){},querySelector(){return null}},localStorage:{getItem(){return null}}};
vm.createContext(c);vm.runInContext(engine+'\nrender=()=>{};reset();',c);
vm.runInContext(`
const purchase={...S.records[0],id:900,kind:'purchase',party:S.parties.find(p=>p.type==='supplier').id};S.records.push(purchase);
const before=JSON.stringify(S.records);cart=[];modal=null;editingId=null;act('source-location:900');
assert.equal(view,'purchase');assert.equal(editingId,900);assert.equal(modal,null);assert.equal(cart.length,purchase.lines.length);assert.equal(JSON.stringify(S.records),before);
cart=[];view='purchase';act('invoice:900');assert(invoiceIsAtSource(purchase));view='operations';act('invoice:900');assert(!invoiceIsAtSource(purchase));
reset();const supplier=S.parties.find(p=>p.type==='supplier');selected=supplier.id;assert(!ledger().includes('new:purchase'));assert(!ledger().includes('new:sale'));
for(const kind of ['receive','pay']){const r={...S.records[0],id:901,kind,party:supplier.id,lines:[]};S.records.push(r);act('source-location:901');assert.equal(view,'ledger');assert.equal(modal,'partyCash');assert.equal(editingId,901);modal=null;act('invoice:901');assert(invoiceIsAtSource(r));S.records.pop()}
const cancelled={...S.records[0],id:902,voided:true};S.records.push(cancelled);cart=[];editingId=null;act('source-location:902');assert.equal(modal,'sourceinfo');assert.equal(editingId,null);
`,c);
const state=vm.runInContext('S',c),record=state.records[0];
const render=atSource=>invoiceDocument(state,record,{esc:x=>String(x??''),money:x=>String(x),icon:()=>'',labels:{sale:'فاتورة بيع'},atSource});
assert(render(false).includes(`source-location:${record.id}`));assert(!render(false).includes(`data-action="source:${record.id}"`));assert(!render(true).includes(`source-location:${record.id}`));assert(render(true).includes(`data-action="source:${record.id}"`));
console.log('PASS original entry source workflow, drafts, contextual source/edit actions, supplier account and cancelled records');
