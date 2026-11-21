import assert from 'node:assert/strict';
import {ensureExpenseCategoryState,validateExpenseCategoryState,expenseCategoryName,expenseCategoryKind,expenseCategoryCommand,expenseCategorySnapshot,expenseCategoryForRecord,expenseCategoryMatches} from '../approved-runtime/expense-category-domain.js';
import {installExpenseCategoryFeatures} from '../approved-runtime/feature-expense-categories.js';
import {desktop862Modules,memoryDesktop,phoneFixture,uiHarness} from './party-category-862-harness.mjs';

let checks=0;const check=async(label,work)=>{await work();checks++;console.log('PASS '+label)};
const context={actor:{id:'owner',role:'owner'},now:'2026-11-16T12:00:00.000Z'};
const create=(state,input={})=>expenseCategoryCommand(state,{type:'expense-category.create',name:'Shop rent',...input},context);
const edit=(state,id,input={})=>expenseCategoryCommand(state,{type:'expense-category.update',id,...input},context);
const remove=(state,id,input={})=>expenseCategoryCommand(state,{type:'expense-category.delete',id,...input},context);
const desktop=await desktop862Modules();

await check('normalized uniqueness includes archived names and classifications never post cash',()=>{
 const initial=phoneFixture(),original=structuredClone(initial);const result=create(initial,{name:'  Shop   Rent  '});assert.deepEqual(initial,original);assert.equal(result.category.name,'Shop Rent');assert.equal(result.category.kind,'recurring');
 for(const name of ['shop rent','Ｓｈｏｐ Rent'])assert.throws(()=>create(result.state,{name}),{status:409});
 for(const name of ['',{},' '.repeat(5),'x'.repeat(81)])assert.throws(()=>create(initial,{name}));
 for(const kind of ['once',null,3])assert.throws(()=>create(initial,{kind}));
 for(const key of ['records','accounts','products','parties','opening'])assert.deepEqual(result.state[key],initial[key]);
 assert.equal(result.state.auditEvents.length,1);assert.equal(expenseCategoryName('  Ｒｅｎｔ\t Shop '),'Rent Shop');
});
await check('optional authoritative snapshot preserves omitted, clears explicit empty and ignores forged name',()=>{
 const a=create(phoneFixture(),{name:'Transport'}),b=create(a.state,{name:'Repair',kind:'nonrecurring'}),state=b.state;
 const snapshot=expenseCategorySnapshot(state,{expenseCategoryId:a.category.id,expenseCategoryName:'forged'});assert.deepEqual(snapshot,{expenseCategoryId:a.category.id,expenseCategoryName:'Transport'});
 assert.deepEqual(expenseCategorySnapshot(state,{},snapshot),snapshot);
 for(const expenseCategoryId of ['',null])assert.deepEqual(expenseCategorySnapshot(state,{expenseCategoryId},snapshot),{expenseCategoryId:null,expenseCategoryName:null});
 for(const expenseCategoryId of ['missing',{},123])assert.throws(()=>expenseCategorySnapshot(state,{expenseCategoryId},snapshot));
 assert.equal(expenseCategorySnapshot(state,{expenseCategoryId:b.category.id},snapshot).expenseCategoryName,'Repair');
});
await check('editing master reclassifies old expenses without altering saved amounts or snapshots',()=>{
 const first=create(phoneFixture(),{name:'Transport'}),id=first.category.id,state=first.state;state.records.push({id:101,kind:'expense',date:'2026-11-01',total:.0001,paid:.0001,due:0,lines:[],...expenseCategorySnapshot(state,{expenseCategoryId:id})});
 const saved=structuredClone(state.records),cash=structuredClone(state.accounts);
 const changed=edit(state,id,{expectedRevision:0,name:'New transport',kind:'nonrecurring'});
 assert.deepEqual(changed.state.records,saved);assert.deepEqual(changed.state.accounts,cash);assert.equal(changed.category.revision,1);
 assert.deepEqual(expenseCategoryForRecord(changed.state,saved[0]),{expenseCategoryId:id,expenseCategoryName:'New transport',expenseCategoryKind:'nonrecurring'});
 assert.equal(expenseCategoryMatches(changed.state,saved[0],{expenseCategoryKind:'recurring'}),false);
 assert.equal(expenseCategoryMatches(changed.state,saved[0],{expenseCategoryKind:'nonrecurring',expenseCategoryId:id}),true);
 assert.equal(expenseCategoryMatches(changed.state,saved[0],{expenseCategoryId:'__uncategorized'}),false);
 assert.equal(expenseCategoryMatches(changed.state,{kind:'expense'},{expenseCategoryId:'__uncategorized',expenseCategoryKind:'recurring'}),true);
 assert.throws(()=>expenseCategoryMatches(changed.state,saved[0],{expenseCategoryKind:'once'}));
});
await check('referenced deletion archives even voided and numeric history; unused deletion removes',()=>{
 for(const numeric of [false,true]){
  const initial=phoneFixture(),first=numeric?expenseCategoryCommand(initial,{type:'expense-category.create',name:'Legacy'},{...context,id:17}):create(initial);
  const id=first.category.id;first.state.records.push({id:1,kind:'expense',voided:true,expenseCategoryId:numeric?'17':id});
  const archived=remove(first.state,id);assert.deepEqual(archived.result,{id:String(id),disposition:'archived'});assert.equal(archived.category.isArchived,true);
  assert.throws(()=>expenseCategorySnapshot(archived.state,{expenseCategoryId:String(id)}),{status:409});
  assert.equal(expenseCategorySnapshot(archived.state,{expenseCategoryId:String(id)},{expenseCategoryId:id,expenseCategoryName:'Old label'}).expenseCategoryName,'Old label');
  assert.throws(()=>create(archived.state,{name:first.category.name}),{status:409});
  const noChange=remove(archived.state,id);assert.equal(noChange.changed,false);assert.deepEqual(noChange.state,archived.state);
 }
 const first=create(phoneFixture()),deleted=remove(first.state,first.category.id);assert.equal(deleted.state.expenseCategories.length,0);assert.equal(deleted.category,null);assert.equal(deleted.result.disposition,'deleted');
});
await check('stale revisions, denied permissions, invalid restore and audit failure are atomic',()=>{
 const initial=phoneFixture(),first=create(initial),before=structuredClone(first.state);
 assert.throws(()=>edit(first.state,first.category.id,{expectedRevision:9,name:'No'}),{status:409});
 assert.throws(()=>remove(first.state,first.category.id,{expectedRevision:'0'}));assert.deepEqual(first.state,before);
 assert.throws(()=>expenseCategoryCommand(initial,{type:'expense-category.create',name:'No'},{}),{status:403});
 assert.throws(()=>expenseCategoryCommand(initial,{type:'expense-category.create',name:'No'},{...context,uuid(){throw Error('AUDIT_FAILURE')}}),/AUDIT_FAILURE/);assert.deepEqual(initial,phoneFixture());
 const broken=structuredClone(first.state);broken.records.push({kind:'expense',expenseCategoryId:'gone'});assert.throws(()=>validateExpenseCategoryState(broken),/مصروف يشير/);
 broken.expenseCategories={};assert.throws(()=>validateExpenseCategoryState(broken));
 const duplicate=structuredClone(first.state);duplicate.expenseCategories.push({...first.category,id:'other'});assert.throws(()=>validateExpenseCategoryState(duplicate));
});
await check('legacy missing-kind/defaults and backup restore never infer category from name',()=>{
 const state=phoneFixture();delete state.expenseCategories;state.records=[{id:101,kind:'expense',total:1,expenseCategoryName:'Same'}];const before=structuredClone(state.records);
 assert.equal(ensureExpenseCategoryState(state),true);assert.equal(ensureExpenseCategoryState(state),false);assert.deepEqual(state.records,before);
 state.expenseCategories=[{id:'other',name:'Same',kind:'nonrecurring'}];
 assert.deepEqual(expenseCategoryForRecord(state,{expenseCategoryId:'gone',expenseCategoryName:'Same'}),{expenseCategoryId:'gone',expenseCategoryName:'Same',expenseCategoryKind:'recurring'});
 assert.equal(expenseCategoryKind({}), 'recurring');
 const first=create(phoneFixture());delete first.state.expenseCategories[0].kind;const raw=JSON.stringify(first.state),restored=JSON.parse(raw);validateExpenseCategoryState(restored);assert.equal(JSON.stringify(restored),raw);
 assert.equal(expenseCategoryForRecord(restored,{expenseCategoryId:first.category.id}).expenseCategoryKind,'recurring');
});
await check('Arabic/French editor preserves failed draft, guards dismissal and defers success',()=>{
 for(const lang of ['ar','fr']){
  const initial=phoneFixture(),h=uiHarness(installExpenseCategoryFeatures,initial,lang);h.group.action('expense-categories');h.group.action('expense-category-new');
  h.fields({name:'Special rent',kind:'nonrecurring'});assert.equal(h.group.before('close'),true);assert.equal(h.modal(),'feature-expense-category-leave');
  h.group.action('expense-category-continue');assert.match(h.group.sheet(),/Special rent/);
  h.group.action('expense-category-save');assert.equal(h.state().expenseCategories.length,1);assert.equal(h.toasts.length,0);
  h.restore(initial,'feature-expense-category-editor');h.group.afterFailure();h.group.afterSave();assert.match(h.group.sheet(),/Special rent/);assert.equal(h.toasts.length,0);
  h.group.action('expense-category-save');h.group.afterSave();assert.equal(h.toasts.length,1);assert.equal(h.state().expenseCategories[0].kind,'nonrecurring');
  if(lang==='fr')assert.match(h.group.sheet(),/Catégories de dépenses/);
  const many=phoneFixture();many.expenseCategories=Array.from({length:122},(_,i)=>({id:'category-'+i,name:'Category '+i,kind:'recurring'}));
  const big=uiHarness(installExpenseCategoryFeatures,many,lang);big.group.action('expense-categories');assert.equal((big.group.sheet().match(/<tbody>[\s\S]*?<\/tbody>/)?.[0].match(/<tr>/g)||[]).length,50);big.group.action('expense-category-page','3');assert.equal((big.group.sheet().match(/<tbody>[\s\S]*?<\/tbody>/)?.[0].match(/<tr>/g)||[]).length,22);
 }
});
if(desktop)await check('live pinned Desktop862 agrees on normalization, classification, snapshots and archival',async()=>{
 const db=memoryDesktop({expenseCategories:[],documents:[],auditEvents:[]}),d=desktop.categories;
 const id=await d.createExpenseCategory(db,{}, {name:'  Shop   Rent ',kind:'nonrecurring'});let phone=expenseCategoryCommand(phoneFixture(),{type:'expense-category.create',name:'  Shop   Rent ',kind:'nonrecurring'},{...context,id});
 const compare=async()=>{const category=await db.collection('expenseCategories').findOne({id});for(const key of ['id','name','normalizedName','kind','isArchived','revision'])assert.equal(phone.category[key],category[key],key)};await compare();
 for(const name of ['shop rent','Ｓｈｏｐ Rent'])await assert.rejects(d.createExpenseCategory(db,{}, {name}),{status:409});
 const snapshot=await d.expenseCategorySnapshot(db,{}, {expenseCategoryId:id,expenseCategoryName:'forged'});assert.deepEqual(snapshot,expenseCategorySnapshot(phone.state,{expenseCategoryId:id,expenseCategoryName:'forged'}));
 await db.collection('documents').insertOne({id:'expense',kind:'expense',status:'voided',expenseCategoryId:id});phone.state.records.push({id:101,kind:'expense',voided:true,expenseCategoryId:id});
 await d.updateExpenseCategory(db,{}, {id,expectedRevision:0,name:'New rent',kind:'recurring'});phone=edit(phone.state,id,{expectedRevision:0,name:'New rent',kind:'recurring'});await compare();
 const result=await d.deleteExpenseCategory(db,{}, {id,expectedRevision:1});phone=remove(phone.state,id,{expectedRevision:1});assert.deepEqual(phone.result,result);await compare();
 await assert.rejects(d.expenseCategorySnapshot(db,{}, {expenseCategoryId:id}),{status:409});
 assert.deepEqual(await d.expenseCategorySnapshot(db,{}, {},snapshot),expenseCategorySnapshot(phone.state,{},snapshot));
 assert.deepEqual(await d.expenseCategorySnapshot(db,{}, {expenseCategoryId:''},snapshot),expenseCategorySnapshot(phone.state,{expenseCategoryId:''},snapshot));
});
console.log(JSON.stringify({suite:'expense-categories-862',checks,livePinnedDesktop:!!desktop}));
