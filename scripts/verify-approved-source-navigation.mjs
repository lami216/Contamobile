import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {invoiceDocument} from '../approved-runtime/invoice-view.js';
const engine=fs.readFileSync('approved-runtime/engine.js','utf8').split("document.addEventListener('click'")[0];
const c={console,assert,structuredClone,crypto,document:{addEventListener(){},querySelector(){return null}},localStorage:{getItem(){return null}},matchMedia:()=>({matches:true})};
vm.createContext(c);vm.runInContext(engine+'\nrender=()=>{};reset();',c);
vm.runInContext(`
const supplier=S.parties.find(p=>p.type==='supplier');
for(const kind of ['purchase','pay','receive']){
 S.records.push({...S.records[0],id:900,kind,party:supplier.id,voided:false});
 const before=JSON.stringify(S);editingId=null;modal=null;cart=[];act('source-location:900');
 assert.equal(view,'ledger');assert.equal(selected,supplier.id);assert.equal(modal,null);assert.equal(editingId,null);assert.equal(cart.length,0);assert.equal(JSON.stringify(S),before);
 assert(!ledger().includes('new:purchase'));assert(!ledger().includes('new:sale'));S.records.pop();
}
const many=Array.from({length:140},(_,i)=>({...S.records[0],id:1000+i,kind:'purchase',party:supplier.id,voided:false}));
S.records=many;act('source-location:1130');assert(rows(many).includes('invoice:1130'));assert.equal(listWindowPages.get(listWindowKey('سجل المستندات')),3);
let scrolled=0;const row={classList:{add(){}},setAttribute(){},scrollIntoView(){scrolled++}};
focusLocatedRecord({querySelector(){return row}});focusLocatedRecord({querySelector(){return row}});assert.equal(scrolled,1);
S.records[130].voided=true;act('source-location:1130');assert(rows(liveRecords()).includes('invoice:1130'));assert.equal(editingId,null);
selected=-1;assert(!rows([]).includes('invoice:1130'));act('invoice:1130');assert.equal(view,'invoice');assert.equal(modal,null);
`,c);
const state=vm.runInContext('S',c),record=state.records[0];
const render=r=>invoiceDocument(state,r,{esc:x=>String(x??''),money:x=>String(x),icon:()=>'',labels:{purchase:'فاتورة شراء'}});
assert(render(record).includes(`source-location:${record.id}`));assert(render(record).includes(`source:${record.id}`));assert(!render({...record,voided:true}).includes(`data-action="source:${record.id}"`));
console.log('PASS read-only source navigation, separate editing, paging, cancelled records and owner-scoped highlighting');
