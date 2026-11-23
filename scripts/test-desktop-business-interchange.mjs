import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createDesktopBusinessBackup,DESKTOP_BUSINESS_COLLECTIONS} from '../approved-runtime/desktop-backup-export.js';
import {desktopToMobileState} from '../approved-runtime/desktop-state-862.js';
import {validateState} from '../approved-runtime/database.js';
import {currentProductCosts} from '../approved-runtime/cost-provenance.js';
import {upgradeState} from '../approved-runtime/upgrade-state.js';
import {applyRecordEffect} from '../approved-runtime/business-accounting.js';
import {recordStockRevision} from '../approved-runtime/stock-domain.js';
import {readBusinessInterchange} from '../approved-runtime/business-interchange.js';
import {bindWarehouseIdentities} from '../approved-runtime/warehouse-identity.js';
import {ordinaryMobileState,currentMobileBusinessFixture,reference,exportedAt} from './desktop-business-fixture.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const source=(await readFile(path.join(reference,'lib/backup.ts'),'utf8')).replaceAll('\r\n','\n');
const validatorSource=source.slice(source.indexOf('const nonempty ='),source.indexOf('export async function restoreNativeBackup'));
assert.equal(hash(validatorSource),'358b6111c10b625138d5a9400055780dd1c7010b480dd39fe7f2d43d4ea3e4de','Canonical Desktop2327 invariant validator must remain unchanged');
assert.equal(hash((await readFile(path.join(reference,'tests/fixtures/mobile-backup-v23.mjs'),'utf8')).replaceAll('\r\n','\n')),'fdd2e7365f9af304208ba256b6d6c2542a113c32ddc827ff0d8ce9e16e3e04ca');
const imports=`import {validatePayrollSnapshot} from ${JSON.stringify(pathToFileURL(path.join(reference,'lib/payroll.ts')).href)};\nimport {invoiceAmountNumber,resolveInvoiceLineTotal,sumInvoiceLineTotals} from ${JSON.stringify(pathToFileURL(path.join(reference,'app/invoice-line-amount.ts')).href)};\n`;
const {validateInvariants}=await import('data:text/javascript;base64,'+Buffer.from(imports+stripTypeScriptTypes(validatorSource,{mode:'transform'})).toString('base64'));
const {readMobileBusinessBackup}=await import(pathToFileURL(path.join(reference,'lib/mobile-business-backup.ts')));
const {convertMobileBackup}=await import(pathToFileURL(path.join(reference,'lib/mobile-backup.ts')));
const {mobileBackupV23}=await import(pathToFileURL(path.join(reference,'tests/fixtures/mobile-backup-v23.mjs')));
const {resolveAdjustmentStockCost}=await import(pathToFileURL(path.join(reference,'lib/adjustment-stock-cost.ts')));
const canonical=state=>{const wrapper=createDesktopBusinessBackup(state,{createdAt:exportedAt}),backup=readMobileBusinessBackup(wrapper);validateInvariants(backup);return {wrapper,backup,c:backup.collections};};
const effective=row=>row.status!=='reversed'&&row.isReversal!==true;
const totals=c=>({accounts:c.paymentAccounts.map(a=>[a.id,a.balance]).sort(),parties:c.parties.map(p=>[p.id,p.receivable,p.payable]).sort(),stock:c.products.map(p=>[p.id,p.stocks]).sort(),payroll:c.employees.map(e=>[e.id,e.balance,e.agreements,e.isDeleted??false]).sort()});

test('current39 schema4 enters a separate canonical transport without changing the old v23 guard or source state',async()=>{
 const state=await currentMobileBusinessFixture(),before=structuredClone(state);validateState(state);
 assert.throws(()=>convertMobileBackup(JSON.parse(JSON.stringify({format:'alkarna-web-backup',schemaVersion:1,createdAt:exportedAt,state,users:[]}))),/إصدار ميزات Mobile/);
 const {wrapper,c}=canonical(state);assert.deepEqual(state,before);assert.equal(wrapper.source.featureSchema,4);assert.deepEqual(Object.keys(c),DESKTOP_BUSINESS_COLLECTIONS);assert.deepEqual(c.users,[]);
 const encoded=JSON.stringify(wrapper);for(const secret of ['NEVER-EXPORT-AUTH','NEVER-EXPORT-CLOUD','NEVER-EXPORT-LICENSE','secret-username'])assert(!encoded.includes(secret));
});
test('exact decimals, signed banks, categories, literal notes, returns and single native opening pass the original canonical validator',async()=>{
 const state=await currentMobileBusinessFixture(),{c}=canonical(state),sale=c.documents.find(d=>d.mobileSource?.id===117),returned=c.documents.find(d=>d.kind==='return');
 assert.equal(sale.total,12.345);assert.equal(sale.lines[0].unitPrice,12.345);assert.equal(sale.lines[0].lineTotal,12.345);assert.equal(sale.lines[0].lineTotalMode,'exact');assert.equal(c.paymentAccounts[1].balance,-5);assert.equal(c.paymentAccounts[1].openingBalance,-20);
 assert.equal(c.documents.find(d=>d.kind==='expense').expenseCategoryId,'expense-category-fixture');assert.equal(returned.parentDocumentId,sale.id);assert.equal(returned.lines[0].lineTotal,3.08625);assert.equal(returned.note,'مرتجع محفوظ\nRetour littéral');assert.equal(c.documents.filter(d=>d.kind==='party-opening'&&d.status==='posted').length,1);assert(c.documents.some(d=>d.kind==='settlement'&&d.mobileBaseline===true));
});
test('canonical payroll IDs, accruals, allocations, journal proofs and audit anchors survive account alias conversion',async()=>{
 const state=await currentMobileBusinessFixture(),{c}=canonical(state),payments=c.documents.filter(d=>d.kind==='employee-payment');
 assert.equal(c.employees[0].id,state.employees[0].id);assert.deepEqual(c.employees[0].agreements,state.employees[0].agreements);assert.equal(payments.length,1);assert.equal(payments[0].id,state.records.find(d=>d.kind==='employee-payment').payrollDocumentId);assert.equal(payments[0].paymentMethod,c.paymentAccounts[0].id);assert(c.financialMovements.some(m=>m.documentId===payments[0].id&&m.paymentMethod===payments[0].paymentMethod));assert(c.auditEvents.some(e=>e.action==='payroll.employee-payment.post'));
});
test('independent phone origins never collide while existing canonical identities remain stable',()=>{
 const a=ordinaryMobileState(),b=structuredClone(a);b.originId='another-independent-shop';const aa=canonical(a).c,bb=canonical(b).c;
 assert.notEqual(aa.products[0].id,bb.products[0].id);assert.notEqual(aa.documents[0].id,bb.documents[0].id);
 a.products[0].desktopId='canonical-desktop-product';a.products[0].canonicalId='canonical-desktop-product';a.accounts[0].desktopId='canonical-bank';const result=canonical(a).c;assert.equal(result.products[0].id,'canonical-desktop-product');assert.equal(result.paymentAccounts[0].id,'canonical-bank');
});
test('all effective financial and stock postings reconcile exactly to cards without invented native balance evidence',async()=>{
 const {c}=canonical(await currentMobileBusinessFixture());
 for(const account of c.paymentAccounts){const net=c.financialMovements.filter(m=>m.paymentMethod===account.id&&effective(m)).reduce((v,m)=>v+(m.direction==='in'?1:-1)*m.amount,0);assert(Math.abs(net-account.balance)<1e-9);}
 for(const party of c.parties){const net=c.documents.filter(d=>d.partyId===party.id&&d.status==='posted').reduce((v,d)=>v+(d.partyBalanceDelta??0),0);assert(Math.abs(net-(party.receivable-party.payable))<1e-9);}
 for(const product of c.products)for(const [warehouse,quantity]of Object.entries(product.stocks)){const net=c.stockMovements.filter(m=>m.productId===product.id&&m.warehouseId===warehouse).reduce((v,m)=>v+m.quantityDelta,0);assert(Math.abs(net-quantity)<1e-9);}
 for(const row of c.financialMovements.filter(m=>m.mobileBaseline||m.mobileCurrentEffect))assert(!Object.hasOwn(row,'balanceBefore')&&!Object.hasOwn(row,'balanceAfter'));
});
test('repeated historical product rows retain separate IDs, quantities and prices and stay read-only',()=>{
 const state=ordinaryMobileState(),sale=state.records.find(r=>r.id===102);sale.lines=[{product:1,name:'First',qty:1,price:20,costAtSale:10},{product:1,name:'Second',qty:2,price:20,costAtSale:10}];
 const doc=canonical(state).c.documents.find(r=>r.mobileSource?.id===102);assert.equal(doc.lines.length,2);assert.notEqual(doc.lines[0].id,doc.lines[1].id);assert.deepEqual(doc.lines.map(l=>[l.quantity,l.unitPrice,l.costAtSale]),[[1,20,10],[2,20,10]]);assert.equal(doc.legacyKey,doc.id);
});
test('business wrappers reject source credentials, unknown transport versions and missing canonical collections',async()=>{
 const {wrapper}=canonical(await currentMobileBusinessFixture());
 for(const mutate of [v=>v.schemaVersion=2,v=>v.source.featureSchema=2,v=>v.source.businessOnly=false,v=>v.backup.collections.users.push({id:'foreign',passwordHash:'forbidden'}),v=>delete v.backup.collections.stockMovements,v=>v.backup.collections.appSettings.push({_id:'forged',originalBackup:{format:'alkarna-web-backup',state:{},users:[{password:'forbidden'}]}}),v=>v.backup.collections.appSettings.push({_id:'forged-state',originalBackup:{format:'alkarna-web-backup',state:{users:[{password:'forbidden'}]},users:[]}}),v=>{let nested={};for(let i=0;i<90;i++)nested={next:nested};v.backup.collections.appSettings.push({_id:'too-deep',nested});}]){const bad=structuredClone(wrapper);mutate(bad);assert.throws(()=>readMobileBusinessBackup(bad));assert.throws(()=>readBusinessInterchange(bad));}
});
test('Mobile canonical inverse preserves full business values and re-export retains original canonical identities',async()=>{
 const state=await currentMobileBusinessFixture(),first=canonical(state),phone=desktopToMobileState(first.backup);validateState(phone);const second=canonical(phone);
 assert.deepEqual(totals(second.c),totals(first.c));
 for(const name of ['products','parties','paymentAccounts','warehouses','expenseCategories','employees'])assert.deepEqual(second.c[name].map(r=>r.id??r._id).sort(),first.c[name].map(r=>r.id??r._id).sort(),name);
 const sourceDocuments=new Set(first.c.documents.map(d=>d.id));for(const doc of second.c.documents)if(!doc.mobileBaseline)assert(sourceDocuments.has(doc.id),doc.id);
 const a=currentProductCosts(state),b=currentProductCosts(phone);assert.deepEqual([...a.values()].map(v=>v.cost),[...b.values()].map(v=>v.cost));
});
test('unchanged canonical roundtrips stabilize flat archives and retain immutable literal note history',async()=>{
 const state=await currentMobileBusinessFixture(),record=state.records.find(r=>r.id===117);record.revisions=[{...structuredClone(record),revisions:undefined,note:'أصل محفوظ\nHistorique immuable'}];record.revision++;
 let value=canonical(state),stable;for(let step=0;step<5;step++){
  assert(JSON.stringify(value.wrapper).includes('Historique immuable'));
  for(const archive of value.c.appSettings.filter(r=>r.originalBackup?.format==='conta-backup'))assert(!archive.originalBackup.collections.appSettings.some(r=>r.inertSourceArchive));
  if(step===1)stable={bytes:JSON.stringify(value.wrapper).length,archives:value.c.appSettings.filter(r=>r.inertSourceArchive).map(r=>r._id)};
  if(step>1){assert.equal(JSON.stringify(value.wrapper).length,stable.bytes);assert.deepEqual(value.c.appSettings.filter(r=>r.inertSourceArchive).map(r=>r._id),stable.archives);}
  const phone=desktopToMobileState(value.backup);assert.equal(phone.originId,state.originId);value=canonical(phone);
 }
});
test('known source credentials stay excluded while flattened original business metadata remains recoverable',async()=>{
 const state=await currentMobileBusinessFixture(),initial=canonical(state).backup;initial.collections.users=[{id:'legacy-owner',passwordHash:'NEVER-EXPORT-ORIGINAL-CREDENTIAL'}];initial.collections.recurringExpenses=[{id:'source-schedule',description:'مصروف قديم محفوظ',isActive:false}];initial.collections.appSettings.push({_id:'opaque-business-setting',value:'literal preserved'});state.desktopOriginal=initial;
 const {wrapper,c}=canonical(state);assert(!JSON.stringify(wrapper).includes('NEVER-EXPORT-ORIGINAL-CREDENTIAL'));assert(c.recurringExpenses.some(r=>r.id==='source-schedule'));assert(c.appSettings.some(r=>r._id==='opaque-business-setting'));const original=c.appSettings.find(r=>r.originalBackup?.collections.recurringExpenses.some(s=>s.id==='source-schedule'));assert(original);assert.deepEqual(original.originalBackup.collections.users,[]);
});
test('five thousand cents-valued operations export with bounded passes and preserve all rows',()=>{
 const count=5000,state={originId:'scale-synthetic-shop',products:[],parties:[],accounts:[{id:1,name:'Cash',balance:0,openingBalance:50,active:true}],records:Array.from({length:count},(_,i)=>({id:101+i,kind:'expense',number:'E-'+(i+1),sequence:i+1,date:'2026-11-01',time:'12:00',total:0.01,paid:0.01,due:0,account:1,lines:[],note:'قيمة '+i})),warehouses:['الرئيسي'],warehouse:'الرئيسي',opening:{accounts:{1:50},parties:{},stocks:{}},stockEvents:[]};upgradeState(state);const before=performance.now(),{c}=canonical(state),duration=performance.now()-before;assert.equal(c.documents.filter(d=>d.kind==='expense').length,count);assert.equal(c.financialMovements.filter(d=>d.type==='expense').length,count);assert.equal(c.financialMovements.find(d=>d.type==='opening-balance').amount,50);assert(duration<10000,'Bounded synthetic 5000-row conversion took '+duration+'ms');
});
test('historical settlement projection exports the Desktop report delta instead of compensating with a duplicate baseline',()=>{
 const initial=canonical(ordinaryMobileState()).backup,customer=initial.collections.parties.find(p=>p.partyType==='customer');initial.collections.documents.push({id:'source-title-settlement',number:'SOURCE-TITLE-SETTLEMENT',kind:'settlement',partyId:customer.id,title:'الطرف دفع لنا',total:20,cashAmount:0,paidTotal:0,dueTotal:0,paymentMethod:null,lines:[],status:'posted',revision:0,occurredAt:'2026-11-23T10:00:00.000Z'});customer.receivable-=20;
 const phone=desktopToMobileState(initial),out=canonical(phone).c,doc=out.documents.find(d=>d.id==='source-title-settlement');assert.equal(doc.partyBalanceDelta,-20);assert.equal(out.documents.filter(d=>d.mobileBaseline&&d.partyId===customer.id).length,initial.collections.documents.filter(d=>d.mobileBaseline&&d.partyId===customer.id).length);assert.equal(out.documents.filter(d=>d.partyId===customer.id&&d.status==='posted').reduce((sum,d)=>sum+(d.partyBalanceDelta??0),0),customer.receivable-customer.payable);
});
test('current source lifecycle timestamps and actor metadata replace stale import aliases',()=>{
 const initial=canonical(ordinaryMobileState()).backup,phone=desktopToMobileState(initial),purchase=phone.records.find(r=>r.kind==='purchase'),before=structuredClone(phone);applyRecordEffect(phone,purchase,-1);purchase.updatedAt='2026-11-23T10:30:00.000Z';purchase.voidedAt='2026-11-23T10:31:00.000Z';purchase.updatedBy='current-actor';purchase.updatedByName='Current operator';purchase.voidedBy='current-actor';purchase.voidedByName='Current operator';purchase.voided=true;purchase.revision++;recordStockRevision(phone,purchase,null,before,'void');
 const doc=canonical(phone).c.documents.find(d=>d.id===purchase.desktopId);assert.equal(doc.status,'voided');for(const name of ['updatedAt','voidedAt','updatedBy','updatedByName','voidedBy','voidedByName'])assert.equal(doc[name],purchase[name],name);
});
test('the original v23 bridge normalizes sequences once without archive or counter growth on subsequent exchanges',()=>{
 let backup=convertMobileBackup(mobileBackupV23()),baseline;for(let step=0;step<5;step++){const value=canonical(desktopToMobileState(backup)),current={archives:value.c.appSettings.filter(r=>r.inertSourceArchive).map(r=>r._id),bytes:JSON.stringify(value.wrapper).length,counters:value.c.counters};if(step===1)baseline=current;if(step>1)assert.deepEqual(current,baseline);backup=value.backup;}
});
test('explicit tiny source bank, debt and stock baselines retain their exact nonzero quantities',()=>{
 const tiny=1e-12,state={originId:'tiny-baselines',products:[{id:1,name:'Tiny',sku:'',price:1,cost:0,stocks:{Main:tiny},qty:tiny}],parties:[{id:1,name:'Tiny debtor',type:'customer',balance:tiny}],accounts:[{id:1,name:'Tiny cash',balance:tiny,openingBalance:tiny,active:true}],records:[],warehouses:['Main'],warehouse:'Main',opening:{accounts:{1:tiny},parties:{1:tiny},stocks:{1:{Main:tiny}}},stockEvents:[]};upgradeState(state);const {c}=canonical(state);assert.equal(c.financialMovements.find(m=>m.mobileBaseline).amount,tiny);assert.equal(c.documents.find(d=>d.mobileBaseline).partyBalanceDelta,tiny);assert.equal(c.stockMovements.find(m=>m.mobileBaseline).quantityDelta,tiny);state.opening.accounts[1]=0;state.accounts[0].openingBalance=0;state.opening.parties[1]=0;const residual=canonical(state).c;assert.equal(residual.financialMovements.find(m=>m.mobileBaseline).amount,tiny);assert.equal(residual.documents.find(d=>d.mobileBaseline).partyBalanceDelta,tiny);
});
test('barcode and expiry projections preserve absent or null source values and honor explicit clears and changes',()=>{
 const initial=canonical(ordinaryMobileState()).backup,source=initial.collections.products[0];source.sku='SKU-NATIVE';source.barcode=null;source.expiryDate='2027-12-31';let phone=desktopToMobileState(initial),product=phone.products[0],out=canonical(phone).c.products[0];assert.equal(out.barcode,null);assert.equal(out.sku,'SKU-NATIVE');assert.equal(out.expiryDate,'2027-12-31');product.sku='SKU-NATIVE';delete product.sourceSku;assert.equal(canonical(phone).c.products[0].barcode,null,'Older stored internal-code fallback stays compatible');
 source.barcode='123456';phone=desktopToMobileState(initial);product=phone.products[0];product.sku='';product.expiry='';out=canonical(phone).c.products[0];assert.equal(out.barcode,'');assert.equal(out.expiryDate,null);assert.equal(out.sku,'SKU-NATIVE');
 product.sku='654321';product.expiry='2028-01-02';out=canonical(phone).c.products[0];assert.equal(out.barcode,'654321');assert.equal(out.expiryDate,'2028-01-02');
 delete source.barcode;delete source.expiryDate;phone=desktopToMobileState(initial);out=canonical(phone).c.products[0];assert(!Object.hasOwn(out,'barcode'));assert(!Object.hasOwn(out,'expiryDate'));
});
test('removed wholesale UI and normalized zero suggestions do not overwrite source optional amount metadata',()=>{
 const initial=canonical(ordinaryMobileState()).backup,source=initial.collections.products[0];source.wholesalePrice=null;source.piecePrice=null;source.pieceCost=null;let phone=desktopToMobileState(initial),out=canonical(phone).c.products[0];assert.equal(out.wholesalePrice,null);assert.equal(out.piecePrice,null);assert.equal(out.pieceCost,null);
 phone.products[0].price=3.25;phone.products[0].cost=4.5;out=canonical(phone).c.products[0];assert.equal(out.wholesalePrice,null);assert.equal(out.piecePrice,3.25);assert.equal(out.pieceCost,4.5);
 delete source.wholesalePrice;delete source.piecePrice;delete source.pieceCost;phone=desktopToMobileState(initial);out=canonical(phone).c.products[0];assert(!Object.hasOwn(out,'piecePrice'));assert(!Object.hasOwn(out,'pieceCost'));assert.equal(out.wholesalePrice,null);
});
test('explicit warehouse identity binding preserves first-export identity across rename and no-op commands without moving counters',()=>{
 const state=ordinaryMobileState(),before=canonical(state).c,counters=structuredClone(state.counters),sequences=structuredClone(state.sequences),old='الرئيسي',name='المخزن الجديد';bindWarehouseIdentities(state);const bound=structuredClone(state);bindWarehouseIdentities(state);assert.deepEqual(state,bound);
 state.warehouses=state.warehouses.map(w=>w===old?name:w);state.warehouseMeta[name]=state.warehouseMeta[old];delete state.warehouseMeta[old];for(const p of state.products){p.stocks[name]=p.stocks[old];delete p.stocks[old];if(p.openingWarehouse===old)p.openingWarehouse=name;}for(const stocks of Object.values(state.opening.stocks)){stocks[name]=stocks[old];delete stocks[old];}for(const r of state.records){for(const field of ['warehouse','from','toWarehouse','openingWarehouseBefore','openingWarehouseAfter'])if(r[field]===old)r[field]=name;for(const line of r.lines)if(line.warehouse===old)line.warehouse=name;}for(const e of state.stockEvents)if(e.warehouseId===old)e.warehouseId=name;if(state.warehouse===old)state.warehouse=name;if(state.salesWarehouse===old)state.salesWarehouse=name;
 const after=canonical(state).c,id=before.warehouses.find(w=>w.name===old).id;assert.equal(after.warehouses.find(w=>w.name===name).id,id);assert.deepEqual(after.products.map(p=>p.stocks),before.products.map(p=>p.stocks));assert.deepEqual(after.documents.map(d=>[d.id,d.warehouseId,d.destinationWarehouseId]),before.documents.map(d=>[d.id,d.warehouseId,d.destinationWarehouseId]));assert.deepEqual(state.counters,counters);assert.deepEqual(state.sequences,sequences);
});
test('canonical unique display numbers preserve genuine count-cost proofs and never heal a corrupted original journal reference',()=>{
 const at=n=>'2026-11-01T10:00:0'+n+'.000Z',base={date:'2026-11-01',time:'10:00',due:0,warehouse:'Main'};
 const state={originId:'proof-number',products:[{id:1,name:'Product',price:200,cost:0,stocks:{Main:1},qty:1}],parties:[],accounts:[{id:1,name:'Cash',balance:1000,openingBalance:1000}],records:[{...base,id:1,kind:'purchase',number:'1',sequence:1,status:'voided',voided:true,revision:1,occurredAt:at(1),updatedAt:at(3),voidedAt:at(3),total:100,paid:100,account:1,lines:[{id:'buy-line',product:1,qty:1,price:100}]},{...base,id:2,kind:'adjustment',number:'ADJ-2',status:'posted',revision:0,occurredAt:at(2),total:100,paid:0,lines:[{id:'count-line',product:1,qty:1,delta:1,price:100,balanceBefore:1,balanceAfter:2}]},{...base,id:3,kind:'sale',number:'1',sequence:1,status:'voided',voided:true,revision:0,occurredAt:at(4),total:100,paid:100,account:1,lines:[{id:'sale-line',product:1,qty:1,price:100,costAtSale:100}]}],warehouses:['Main'],warehouse:'Main',opening:{accounts:{1:1000},parties:{},stocks:{1:{Main:0}}},stockEvents:[{id:'buy-row',documentId:'1',documentNumber:'1',documentRevision:0,productId:'1',warehouseId:'Main',type:'purchase',balanceBefore:0,quantityDelta:1,balanceAfter:1,occurredAt:at(1)},{id:'count-row',documentId:'2',documentNumber:'ADJ-2',documentRevision:0,productId:'1',warehouseId:'Main',type:'adjustment',balanceBefore:1,quantityDelta:1,balanceAfter:2,occurredAt:at(2)},{id:'buy-void',documentId:'1',documentNumber:'1',documentRevision:1,productId:'1',warehouseId:'Main',type:'purchase-void',balanceBefore:2,quantityDelta:-1,balanceAfter:1,occurredAt:at(3)}]};upgradeState(state);
 const proof=c=>resolveAdjustmentStockCost({productId:c.products[0].id,warehouseId:c.warehouses[0].id,currentStock:1,movements:c.stockMovements,documents:c.documents});
 const {c}=canonical(state);assert.equal(proof(c).unitCost,100);assert(c.documents.filter(d=>d.kind==='purchase'||d.kind==='sale').every(d=>/^MOB-[a-f0-9]{8}-/.test(d.number)));assert.equal(state.stockEvents[0].documentNumber,'1');
 const bad=structuredClone(state);bad.stockEvents[0].documentNumber='stale-original-reference';const broken=canonical(bad).c;assert.equal(broken.stockMovements.find(m=>m.id==='buy-row').documentNumber,'stale-original-reference');assert.equal(proof(broken),null);
});
test('native sale profit uses only saved line cost while untouched imported literal profits remain source facts',()=>{
 const state=ordinaryMobileState(),value=canonical(state).c,sourceSale=value.documents.find(r=>r.mobileSource?.id===117);assert.equal(sourceSale.lines[0].grossProfit,7);
 sourceSale.lines[0].grossProfit=99;const backup=canonical(state).backup;backup.collections.documents.find(r=>r.mobileSource?.id===117).lines[0].grossProfit=99;const phone=desktopToMobileState(backup),unchanged=canonical(phone).c.documents.find(r=>r.id===sourceSale.id);assert.equal(unchanged.lines[0].grossProfit,99);
 const record=phone.records.find(r=>r.desktopId===sourceSale.id);record.revision++;record.lines[0].price=13;record.lines[0].lineTotal=13;record.total=record.paid=13;phone.accounts.find(a=>a.id===record.account).balance++;record.updatedAt='2026-11-23T10:00:00.000Z';const revised=canonical(phone).c.documents.find(r=>r.id===sourceSale.id);assert.equal(revised.lines[0].grossProfit,8);
});
