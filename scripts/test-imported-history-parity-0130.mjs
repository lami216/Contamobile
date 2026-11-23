import assert from 'node:assert/strict';
import {desktopToMobileState} from '../approved-runtime/desktop-state-862.js';
import {financialRecordReadOnly,storedPartyDelta,cashDelta,stockDeltas} from '../approved-runtime/business-accounting.js';
import {saleFacts,profitSummary} from '../approved-runtime/commerce-facts.js';
import {partyNetDelta,moneyAccountDelta,upgradeState} from '../approved-runtime/upgrade-state.js';
import {validateState} from '../approved-runtime/database.js';
import {reportDataset} from '../approved-runtime/report-data.js';
import {historicalSettlementProjection} from '../approved-runtime/historical-settlement.js';
import {createDesktopBusinessBackup} from '../approved-runtime/desktop-backup-export.js';
import {mergeImport} from '../approved-runtime/import-domain.js';
import {LifecycleMemoryDb} from './desktop-882-lifecycle-test-fixture.mjs';
import {references,commandReference,legacySettlementReference,source,proof,withoutHistoricalOffset} from './desktop-0130-test-fixture.mjs';
const refs=await references(),command=await commandReference(),clone=structuredClone,cases=[];
const check=async(name,fn)=>{await fn();cases.push(name);console.log('PASS '+name)};
const repeated=()=>{
 const raw=withoutHistoricalOffset(refs.fixture.mobileBackupV23({repeatedCommercialLines:true}));
 const sale=raw.state.records.find(row=>row.id===102);Object.assign(sale.lines[0],{price:18,costAtSale:8});Object.assign(sale.lines[1],{price:21,costAtSale:11});
 const purchase=raw.state.records.find(row=>row.id===114);purchase.lines[0].price=7;purchase.lines[1].price=13;
 return raw;
};
await check('actual Desktop command guards reject all five mutations of imported stock baselines and openings before any write',async()=>{
 const c=refs.backup.convertMobileBackup(repeated()).collections,db=new LifecycleMemoryDb(c),before=clone(db.rows),rows=c.documents.filter(row=>row.kind==='adjustment'&&(row.mobileBaseline||row.mobileOpening));assert(rows.length>=3);
 for(const row of rows)for(const type of ['adjustment.update','adjustment.void','opening-stock-initial.void','opening-stock-correction.update','opening-stock-correction.void']){
  await assert.rejects(db.transaction(session=>command.execute(db,session,{type,documentId:row.id,reason:'تحقق السجل التاريخي'})),error=>error.status===409&&/سجل تاريخي/.test(error.message));assert.deepEqual(db.rows,before);
  const mapped={...clone(row),id:1,desktopId:row.id};assert.equal(financialRecordReadOnly({records:[mapped],employees:[]},mapped),true);
 }
});
await check('historical bank opening corrections retain immutable evidence while ordinary source markers do not blanket-lock native stock corrections',async()=>{
 const movement={id:'historical-bank-correction',type:'opening-balance-correction',importedFrom:'mobile-v23'},db=new LifecycleMemoryDb({financialMovements:[movement]}),before=clone(db.rows);
 for(const type of ['account-opening-balance-correction.update','account-opening-balance-correction.void']){await assert.rejects(db.transaction(session=>command.execute(db,session,{type,movementId:movement.id})),error=>error.status===409);assert.deepEqual(db.rows,before);}
 const native={id:9,kind:'adjustment',openingCorrection:true},state={records:[native],employees:[]};assert.equal(financialRecordReadOnly(state,native),false);
 for(const extra of [{mobileBaseline:true},{mobileOpening:{}},{importedFrom:'mobile-v23'},{importedFrom:'another-source',mobileBaseline:true}])assert.equal(financialRecordReadOnly(state,{...native,...extra}),false);
 assert.equal(financialRecordReadOnly(state,{id:10,kind:'deposit',importReadOnly:true,importReadOnlyReason:'financial-movement-source',desktop:movement}),true);
});
await check('repeated imported commercial lines preserve their independent source IDs, ordering, prices, costs, totals and archive',async()=>{
 const raw=repeated(),before=clone(raw),result=refs.backup.convertMobileBackup(raw),db=new LifecycleMemoryDb(result.collections),saved=clone(db.rows);
 for(const id of [102,114]){const sourceRecord=raw.state.records.find(row=>row.id===id),doc=result.collections.documents.find(row=>row.id==='mobile23:record:'+id);assert.equal(doc.legacyKey,doc.id);assert.match(doc.mobileReadOnlyReason,/Repeated product lines/);
  assert.deepEqual(doc.lines.map((line,index)=>[line.id,line.productId,line.quantity,line.unitPrice,line.lineTotal]),sourceRecord.lines.map((line,index)=>[`${doc.id}:line:${index+1}`,'mobile23:product:'+line.product,line.qty,line.price,line.qty*line.price]));
  assert.deepEqual(result.collections.stockMovements.filter(m=>m.documentId===doc.id).map(m=>m.id),sourceRecord.lines.map((line,index)=>`${doc.id}:stock:${index+1}`));
  for(const type of [doc.kind+'.update',doc.kind+'.void'])await assert.rejects(db.transaction(session=>command.execute(db,session,{type,documentId:doc.id,expectedRevision:doc.revision})),error=>error.status===409&&/عرض فقط/.test(error.message));
  assert.equal(financialRecordReadOnly({records:[],employees:[]},{...clone(doc),id,desktopId:doc.id}),true);
 }
 assert.deepEqual(result.collections.documents.find(row=>row.id==='mobile23:record:102').lines.map(line=>[line.costAtSale,line.grossProfit]),[[8,10],[11,20]]);
 assert.deepEqual(db.rows,saved);assert.deepEqual(raw,before);assert.deepEqual(result.collections.appSettings.find(row=>row.inertSourceArchive).originalBackup,before);
});
await check('ordinary native duplicate entry still rejects on Desktop; historical noncommercial duplicate rows reject without source mutation',()=>{
 assert.throws(()=>command.parseInvoiceLines({lines:[{productId:'p',quantity:1,unitPrice:10},{productId:'p',quantity:1,unitPrice:20}]}),/مكررة/);
 for(const kind of ['adjustment','stocktransfer']){const raw=repeated(),row=raw.state.records.find(r=>r.kind===kind);row.lines.push(clone(row.lines[0]));const before=clone(raw);assert.throws(()=>refs.backup.convertMobileBackup(raw));assert.deepEqual(raw,before);}
 const normal={id:12,kind:'sale',lines:[{product:1,qty:1,price:10},{product:2,qty:1,price:20}]};assert.equal(financialRecordReadOnly({records:[normal],employees:[]},normal),false);
});
await check('cent-rounded historical invoice values remain literal read-only evidence rather than silently changing unit prices',()=>{
 const raw=repeated(),r=raw.state.records.find(row=>row.id===117);r.lines[0].qty=3;r.lines[0].price=.149;r.total=r.paid=.45;r.profit=.3;r.lines[0].costAtSale=.05;raw.state.products[1].stocks['الرئيسي']-=2;raw.state.products[1].qty-=2;raw.state.accounts[0].balance-=11.55;
 const before=clone(raw),result=refs.backup.convertMobileBackup(raw),doc=result.collections.documents.find(row=>row.id==='mobile23:record:117');assert.equal(doc.lines[0].unitPrice,.149);assert.equal(doc.lines[0].lineTotal,.45);assert.equal(doc.legacyKey,doc.id);assert.match(doc.mobileReadOnlyReason,/cent-rounded/);assert.equal(financialRecordReadOnly({records:[],employees:[]},{...doc,id:117}),true);assert.deepEqual(raw,before);
});
await check('actual converted repeated history is preserved by phone adaptation and a serialization round-trip without reopening protected sources',()=>{
 const raw=repeated(),canonical=refs.backup.convertMobileBackup(raw),state=desktopToMobileState(canonical),before=clone(state);
 for(const id of [102,114]){const doc=canonical.collections.documents.find(r=>r.id==='mobile23:record:'+id),r=state.records.find(r=>r.desktopId===doc.id);assert.deepEqual(r.lines.map(l=>[l.id,l.qty,l.price,l.costAtSale]),doc.lines.map(l=>[l.id,l.quantity,l.unitPrice,l.costAtSale]));assert.equal(financialRecordReadOnly(state,r),true);}
 const summary=profitSummary(saleFacts(state));assert.deepEqual([summary.revenue,summary.cost,summary.profit],[72,35,37]);
 const reopened=JSON.parse(JSON.stringify(state));assert.deepEqual(profitSummary(saleFacts(reopened)),summary);assert.deepEqual(state,before);assert.deepEqual(state.desktopOriginal,canonical);
});
await check('full original Mobile23 offset history imports as two independent read-only single-party settlements without restoring a creation route',async()=>{
 const original=refs.fixture.mobileBackupV23(),canonical=refs.backup.convertMobileBackup(original),s=desktopToMobileState(canonical),before=clone(s),rows=s.records.filter(r=>r.kind==='settlement');validateState(s);assert.equal(rows.length,2);assert.notEqual(rows[0].desktopId,rows[1].desktopId);
 assert.deepEqual(rows.map(r=>[r.desktopId,r.partyBalanceDelta]).sort(),[['mobile23:record:111',-20],['mobile23:record:111:counterparty',20]]);
 for(const r of rows){const p=s.parties.find(p=>p.id===r.party);assert.equal(financialRecordReadOnly(s,r),true);assert.equal(partyNetDelta(r),r.desktop.partyBalanceDelta);assert.equal(storedPartyDelta(s,r,p.id),-20);assert.deepEqual(stockDeltas(r),[]);for(const a of s.accounts){assert.equal(cashDelta(r,a.id),0);assert.equal(moneyAccountDelta(r,a.id),0);}}
 for(const p of s.parties){const report=reportDataset(s,{type:'party-ledger',partyId:p.id,allTime:true}),settlement=rows.find(r=>r.party===p.id),row=report.rows.find(row=>row.id===settlement.id);assert.equal(row.change,settlement.partyBalanceDelta);assert.equal(row.description,'تقاص تاريخي غير نقدي');assert.equal(report.closing,p.balance*(p.type==='supplier'?-1:1));}
 const db=new LifecycleMemoryDb(canonical.collections);await assert.rejects(db.transaction(session=>command.execute(db,session,{type:'settlement.post',partyId:canonical.collections.parties[0].id,total:20})),error=>error.status===409&&/للقراءة فقط/.test(error.message));assert.deepEqual(s,before);assert.deepEqual(s.desktopOriginal,canonical);
});
await check('forged or cash-bearing historical settlements reject before state acceptance without changing source evidence',()=>{
 const s=desktopToMobileState(refs.backup.convertMobileBackup(refs.fixture.mobileBackupV23()));
 for(const patch of [{importReadOnly:false},{importReadOnlyReason:'other'},{desktopId:'different'},{desktop:null},{partyBalanceDelta:'20'},{partyBalanceDelta:21},{paid:1},{due:1},{account:s.accounts[0].id},{otherParty:s.parties[0].id},{total:21},{voided:true},{warehouse:s.warehouse}]){const invalid=clone(s),r=invalid.records.find(r=>r.kind==='settlement');Object.assign(r,patch);const before=clone(invalid);assert.throws(()=>validateState(invalid));assert.deepEqual(invalid,before);}
});
await check('legacy read-only settlement projection executes the exact source report rule while retaining conflicts with the different source void rule',async()=>{
 const reference=await legacySettlementReference();let vectors=0,conflicts=0;
 for(const value of [undefined,null,'',0,-20,20,'-20',false,true,[],{},'bad'])for(const title of ['دفع لنا','استلام مبلغ','دفع للطرف','صرف','تسوية قديمة'])for(const evidence of [{},{partyBalanceBefore:10,partyBalanceAfter:15},{settledReceivable:3,settledPayable:7},{cashAmount:20}]){
  const doc={id:'old-settlement',kind:'settlement',total:20,paidTotal:0,cashAmount:0,partyBalanceDelta:value,title,...evidence},before=clone(doc),projection=historicalSettlementProjection(doc),expected=reference.reportDelta(doc);let lifecycle=null;try{lifecycle=reference.lifecycleDelta(doc);}catch(error){assert.equal(error.status,409);}
  assert.equal(projection.partyBalanceDelta,expected);assert.equal(projection.lifecycleDelta,lifecycle);assert.equal(projection.conflictsWithLifecycle,lifecycle===null||lifecycle!==expected);if(projection.conflictsWithLifecycle)conflicts++;assert.deepEqual(doc,before);vectors++;
 }
 assert.equal(vectors,240);assert(conflicts>0);assert.equal(historicalSettlementProjection({kind:'sale',total:20}),null);assert.equal(historicalSettlementProjection({kind:'settlement',total:Infinity}),null);
});
await check('actual legacy missing, null and string effects import with source ledger signs while raw amounts and account cards remain authoritative',async()=>{
 const reference=await legacySettlementReference(),base=refs.backup.convertMobileBackup(refs.fixture.mobileBackupV23());
 for(const partyType of ['customer','supplier'])for(const [value,title]of [['missing','دفع لنا'],['missing','صرف'],['missing','تسوية قديمة'],[null,'دفع لنا'],['-12','تسوية قديمة']]){
  const raw=clone(base),party=raw.collections.parties.find(p=>p.partyType===partyType),oldNet=party.receivable-party.payable,doc={id:'old-'+partyType,number:'OLD-1',kind:'settlement',status:'posted',revision:0,occurredAt:'2026-11-21T10:00:00.000Z',partyId:party.id,total:20,paidTotal:0,dueTotal:0,cashAmount:0,paymentMethod:null,title,note:'نص تاريخي محفوظ',lines:[]};if(value!=='missing')doc.partyBalanceDelta=value;
  const delta=reference.reportDelta(doc),net=oldNet+delta;party.receivable=Math.max(net,0);party.payable=Math.max(-net,0);raw.collections.documents.push(doc);const before=clone(raw),s=desktopToMobileState(raw),mapped=s.records.find(r=>r.desktopId===doc.id),p=s.parties.find(p=>p.desktopId===party.id);validateState(s);
  assert.equal(mapped.partyBalanceDelta,delta);assert.deepEqual(mapped.desktop,doc);assert.equal(mapped.importReadOnly,true);assert.equal(p.balance,net*(partyType==='supplier'?-1:1));assert.equal(reportDataset(s,{type:'party-ledger',partyId:p.id,allTime:true}).closing,net);assert.deepEqual(s.accounts.map(a=>a.balance),base.collections.paymentAccounts.map(a=>a.balance));assert.deepEqual(raw,before);assert.deepEqual(s.desktopOriginal,before);
 }
});
await check('a real linked legacy settlement cash journal appears once independently of legacy paidTotal and never replays during import or reopen',()=>{
 const raw=refs.backup.convertMobileBackup(refs.fixture.mobileBackupV23()),baseState=desktopToMobileState(raw),baseFinancial=reportDataset(baseState,{type:'financial',allTime:true}),customer=raw.collections.parties.find(p=>p.partyType==='customer'),cash=raw.collections.paymentAccounts[0],sourceBalance=cash.balance;
 const doc={id:'old-linked-settlement',number:'OLD-LINKED',kind:'settlement',status:'posted',revision:0,occurredAt:'2026-11-21T10:00:00.000Z',partyId:customer.id,title:'دفع لنا',note:'تسوية محفوظة',total:20,paidTotal:7,cashAmount:7,dueTotal:0,paymentMethod:cash.id,lines:[]};
 raw.collections.documents.push(doc);customer.receivable-=20;cash.balance+=7;raw.collections.financialMovements.push({id:'old-linked-cash',documentId:doc.id,documentNumber:doc.number,type:'legacy-settlement-cash',direction:'in',amount:7,paymentMethod:cash.id,partyId:customer.id,occurredAt:doc.occurredAt,note:'قيد النقد الأصلي',status:'posted'});
 const before=clone(raw),s=desktopToMobileState(raw),settlement=s.records.find(r=>r.desktopId===doc.id),journals=s.records.filter(r=>r.desktopMovementId==='old-linked-cash');validateState(s);assert.equal(journals.length,1);assert.equal(financialRecordReadOnly(s,journals[0]),true);assert.deepEqual([settlement.paid,settlement.due,settlement.account],[0,0,null]);assert.equal(settlement.desktop.paidTotal,7);assert.equal(settlement.settlementProjection.conflictsWithLifecycle,true);
 const account=s.accounts.find(a=>a.desktopId===cash.id),financial=reportDataset(s,{type:'financial',allTime:true}),newRows=financial.rows.filter(r=>r.action==='invoice:'+journals[0].id);assert.equal(newRows.length,1);assert.deepEqual([newRows[0].incoming,newRows[0].outgoing,newRows[0].description],[7,0,'قيد النقد الأصلي']);assert.equal(account.balance,sourceBalance+7);
 assert.equal(financial.metrics.find(m=>m.key==='incoming').value,baseFinancial.metrics.find(m=>m.key==='incoming').value+7);assert.equal(financial.metrics.find(m=>m.key==='outgoing').value,baseFinancial.metrics.find(m=>m.key==='outgoing').value);assert.equal(financial.rows.filter(r=>r.action==='invoice:'+settlement.id).length,0);
 const reopened=JSON.parse(JSON.stringify(s));validateState(reopened);assert.deepEqual(reportDataset(reopened,{type:'financial',allTime:true}),financial);assert.deepEqual(desktopToMobileState(raw),s);assert.deepEqual(s.desktopOriginal,before);assert.deepEqual(raw,before);
});
await check('explicitly matched native party settlement evidence survives merge while foreign or unrelated party aliases remain rejected',()=>{
 const native={originId:'settlement-native-origin',products:[],parties:[{id:1,name:'عميل أصلي',type:'customer',balance:10}],accounts:[{id:1,name:'Cash',balance:0,active:true}],records:[],warehouses:['Main'],warehouse:'Main',opening:{accounts:{1:0},parties:{1:10},stocks:{}},stockEvents:[]};upgradeState(native);
 const inverse=desktopToMobileState(createDesktopBusinessBackup(native,{createdAt:'2026-11-23T10:00:00.000Z'})),target=clone(native);target.originId='different-target-shop';target.parties[0].id=7;target.opening.parties={7:10};
 const result=mergeImport(target,inverse),merged=result.state;assert(!result.ownBusinessSnapshotUnchanged);validateState(merged);assert.equal(merged.parties.length,1);assert.equal(merged.parties[0].id,7);assert.equal(merged.parties[0].balance,10);assert.equal(merged.accounts[0].balance,0);
 const record=merged.records.find(r=>r.kind==='settlement');assert(record);const canonical=record.desktop.partyId;
 for(const key of ['desktop:parties:'+canonical,'canonical:parties:'+canonical,'mobile:'+native.originId+':parties:1']){const valid=clone(merged),p=valid.parties[0];delete p.desktopId;delete p.canonicalId;delete p.importKey;p.importKeys=[key];validateState(valid);}
 for(const key of ['desktop:parties:foreign','canonical:parties:foreign','desktop:accounts:'+canonical,'mobile:foreign-origin:parties:1','mobile:'+native.originId+':parties:2','mobile:'+native.originId+':accounts:1','']){const invalid=clone(merged),p=invalid.parties[0];delete p.desktopId;delete p.canonicalId;delete p.importKey;p.importKeys=key?[key]:[];const before=clone(invalid);assert.throws(()=>validateState(invalid));assert.deepEqual(invalid,before);}
});
await check('actual source 1800-record capacity fixture keeps only four repeated documents protected and exactly 1804 stock effects',async()=>{
 const text=await source('tests/mobile-repeated-lines-scale.test.mjs'),start=text.indexOf('function scaleFixture()'),end=text.indexOf('\ntest(',start);assert(start>=0&&end>start);const raw=Function(text.slice(start,end)+'\nreturn scaleFixture();')(),before=clone(raw),canonical=refs.backup.convertMobileBackup(raw),state=desktopToMobileState(canonical);
 const canonicalIds=new Set(canonical.collections.documents.map(row=>row.id)),sourceDocuments=state.records.filter(row=>canonicalIds.has(row.desktopId)),financialOnly=state.records.filter(row=>!canonicalIds.has(row.desktopId));
 assert.equal(sourceDocuments.length,1800);assert.equal(new Set(sourceDocuments.map(row=>row.desktopId)).size,1800);assert.equal(financialOnly.length,1);assert.equal(financialOnly[0].desktopMovementId,canonical.collections.financialMovements.find(row=>row.type==='opening-balance').id);assert.equal(state.stockEvents.length,1804);assert.equal(sourceDocuments.filter(r=>financialRecordReadOnly(state,r)).length,4);
 assert.deepEqual([profitSummary(saleFacts(state)).revenue,profitSummary(saleFacts(state)).cost,profitSummary(saleFacts(state)).profit],[11700,6300,5400]);
 assert.deepEqual([state.accounts[0].balance,state.products[0].stocks[state.warehouse],state.parties.find(p=>p.type==='customer').balance],[86950,1800,5850]);assert.deepEqual(raw,before);assert.deepEqual(state.desktopOriginal,canonical);
});
await proof('imported-history-parity-0130',cases,{capacityRecords:1800,capacityStockEffects:1804});
