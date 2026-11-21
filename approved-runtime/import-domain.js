import {upgradeState,partyNetDelta,validateSharedCounters} from './upgrade-state.js';
import {normalizeStockSettlementSequences,isStockSettlementDocument,validSettlementSequence} from './stock-settlement.js';
import {seedStockEvents} from './stock-domain.js';
import {stockBalanceAfter} from './accounting-numbers.js';
import {expenseCategoryName,expenseCategoryKind} from './expense-category-domain.js';
import {validatePayrollState} from './payroll-domain.js';
import {validateState} from './database.js';
import {sha256Hex} from './accounting-hash.js';
import {executeLegacyImportPhase,preflightLegacyDatabase,inspectLegacyDatabase,LEGACY_IMPORT_PHASES} from './legacy-import.js';
const normalize=v=>String(v||'').normalize('NFKD').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').trim().toLocaleLowerCase().replace(/\s+/g,' ');
const keyOf=(state,kind,row)=>row.importKey||row.desktopId&&'desktop:'+kind+':'+row.desktopId||row.canonicalId&&'canonical:'+kind+':'+row.canonicalId||'mobile:'+(state.originId||state.branding)+':'+kind+':'+row.id;
const num=v=>Number(v)||0;
export function reconcileImportOpening(state){
 state.opening={accounts:Object.fromEntries(state.accounts.map(a=>[a.id,a.balance])),parties:Object.fromEntries(state.parties.map(p=>[p.id,p.balance])),stocks:Object.fromEntries(state.products.map(p=>[p.id,{...p.stocks}]))};
 const documents=new Map(state.records.map(row=>[String(row.id),row])),parties=new Map(state.parties.map(row=>[row.id,row]));
 for(const r of state.records.filter(r=>!r.voided&&!r.reversedBy&&!r.reversalOf)){
  const parent=documents.get(String(r.parentDocumentId)),supplierReturn=r.returnParentKind==='purchase'||parent?.kind==='purchase';
  // Desktop expenses/account balances may contain sub-cent values. Reconciliation
  // derives a baseline; it is not a new payment and must not round the customer's data.
  let delta=r.kind==='party-opening'||r.kind==='employee-opening'||r.kind==='employee-accrual'||r.kind==='employee-closure'?0:r.kind==='employee-payment'?(r.employeePaymentDirection==='deposit'?1:-1)*r.total:r.kind==='return'?(supplierReturn?1:-1)*r.paid:['sale','receive','deposit'].includes(r.kind)?r.paid:-r.paid;
  if(r.account)state.opening.accounts[r.account]-=delta||0;
  if(r.kind==='transfer'&&r.to)state.opening.accounts[r.to]-=r.total;
  if(r.party){const p=parties.get(r.party);if(!p)throw Error('طرف المستند غير موجود');const net=Number.isFinite(r.partyBalanceDelta)?r.partyBalanceDelta:r.kind==='return'?(supplierReturn?1:-1)*Math.max(0,r.total-r.paid):partyNetDelta(r);state.opening.parties[p.id]-=net*(p.type==='supplier'?-1:1);}
  for(const l of r.lines){const stock=state.opening.stocks[l.product];if(!stock)throw Error('منتج المستند غير موجود');const warehouse=l.warehouse||r.warehouse;if(r.kind==='sale')stock[warehouse]=stockBalanceAfter(stock[warehouse]||0,l.qty);if(r.kind==='purchase')stock[warehouse]=stockBalanceAfter(stock[warehouse]||0,-l.qty);if(r.kind==='adjustment')stock[warehouse]=stockBalanceAfter(stock[warehouse]||0,-l.delta);if(r.kind==='stocktransfer'){stock[r.from]=stockBalanceAfter(stock[r.from]||0,l.qty);stock[r.toWarehouse]=stockBalanceAfter(stock[r.toWarehouse]||0,-l.qty)}if(r.kind==='return')stock[warehouse]=stockBalanceAfter(stock[warehouse]||0,(supplierReturn?1:-1)*l.qty);}
 }
 // Never turn a reconstructed history into original stock proof or discard its IDs.
 if(!state.stockEvents)seedStockEvents(state);return state;
}
const stable=value=>JSON.stringify((function order(input){return Array.isArray(input)?input.map(order):input&&typeof input==='object'?Object.fromEntries(Object.keys(input).sort().map(k=>[k,order(input[k])])):input})(value));
const payrollRecord=row=>['employee-opening','employee-accrual','employee-payment','employee-closure'].includes(row.kind);
const payrollFingerprint=value=>{const row={...value,paymentMethod:value.paymentMethod??null,note:value.note??null};return stable(Object.fromEntries(['kind','payrollDocumentId','status','voided','revision','employeeId','employeeName','total','amount','paid','due','paymentMethod','businessDate','occurredAt','periodStart','periodEnd','dueDate','agreementSnapshot','allocations','employeeOpeningDirection','employeeOpeningAnchor','employeePaymentVersion','employeePaymentDirection','employeeAccountOrder','note','balanceDelta','salaryReserveReleased','cashAmount','employeeScheduleRecomputed','voidReason'].filter(key=>row[key]!==undefined).map(key=>[key,row[key]])))};
const financialBody=row=>{const value={...row};for(const key of ['importKey','desktop','importRevisions'])delete value[key];return stable(value)};
function mergeSharedCounters(next,source){
 validateSharedCounters(next);validateSharedCounters(source);
 const canonical=row=>typeof row?._id==='string'&&/^documentSequence:(sale|purchase|expense|stock-settlement)$/.test(row._id),identity=row=>row?._id??row?.id;
 const byId=new Map((next.counters||[]).filter(row=>identity(row)!=null).map(row=>[String(identity(row)),row])),bodies=new Set((next.counters||[]).map(stable));
 for(const row of source.counters||[]){const id=identity(row),old=id==null?null:byId.get(String(id));if(old){if(canonical(row)){old.value=Math.max(old.value,row.value);}continue;}if(id==null&&bodies.has(stable(row)))continue;const copy=structuredClone(row);next.counters.push(copy);if(id!=null)byId.set(String(id),copy);bodies.add(stable(copy));}
 for(const kind of ['sale','purchase','expense','stock-settlement']){const counter=next.counters.find(row=>row?._id==='documentSequence:'+kind);if(next.sequences[kind]!==undefined||source.sequences[kind]!==undefined||counter)next.sequences[kind]=Math.max(next.sequences[kind]??0,source.sequences[kind]??0,counter?.value??0);}
 validateSharedCounters(next);
}
export function mergeImport(current,incoming,options={}){
 const next=structuredClone(current),source=structuredClone(incoming);upgradeState(next);upgradeState(source);mergeSharedCounters(next,source);
 const result={state:next,counts:{products:0,parties:0,accounts:0,warehouses:0,categories:0,expenseCategories:0,employees:0,records:0,existing:0},conflicts:[],warnings:[]},maps=Object.fromEntries(['products','parties','accounts','categories','expenseCategories','warehouses','records'].map(name=>[name,new Map()]));
 const clone=value=>structuredClone(value),choices=options.matches||{},policy=name=>options[name]||'current',affectedProducts=new Set(),existingProducts=new Set(next.products.map(row=>row.id));
 const lastIds=Object.fromEntries(['categories','products','parties','accounts','records'].map(name=>[name,next[name].reduce((max,row)=>Math.max(max,row.id),name==='records'?100:0)]));
 const allocate=name=>++lastIds[name],ref=(map,value,label)=>{if(value===undefined||value===null||value==='')return value;const target=map.get(value)??map.get(Number(value));if(target===undefined)throw Error(label+' غير موجود');return target};
 for(const warehouse of source.warehouses){let target=next.warehouses.find(name=>normalize(name)===normalize(warehouse));if(!target){target=warehouse;next.warehouses.push(target);next.warehouseMeta[target]=clone(source.warehouseMeta[warehouse]);for(const product of next.products)product.stocks[target]=0;result.counts.warehouses++}maps.warehouses.set(warehouse,target)}
 for(const category of source.categories){let target=next.categories.find(row=>normalize(row.name)===normalize(category.name));if(!target){target={...clone(category),id:allocate('categories')};next.categories.push(target);result.counts.categories++}maps.categories.set(category.id,target.id)}
 for(const kind of ['products','parties','accounts']){
  const byKey=new Map(),byName=new Map(),bySku=new Map(),byId=new Map(next[kind].map(row=>[row.id,row]));
  const token=row=>(kind==='parties'?row.type+':':'')+normalize(row.name),add=(map,key,row)=>map.set(key,[...(map.get(key)||[]),row]);
  const catalog=row=>{add(byKey,keyOf(next,kind,row),row);for(const key of row.importKeys||[])add(byKey,key,row);add(byName,token(row),row);if(kind==='products'&&row.sku)add(bySku,row.sku,row)};next[kind].forEach(catalog);
  for(const row of source[kind]){
   const key=keyOf(source,kind,row),sameRole=target=>kind!=='parties'||target.type===row.type,exact=[...new Set((byKey.get(key)||[]).filter(sameRole))];
   let matches=exact;if(!matches.length&&kind==='products'&&row.sku)matches=bySku.get(row.sku)||[];if(!matches.length)matches=byName.get(token(row))||[];
   let target=exact.length===1?exact[0]:choices[key]==='new'?null:choices[key]?byId.get(Number(choices[key])):matches.length===1?matches[0]:null;
   if(target&&!sameRole(target))throw Error('اختيار مطابقة غير صالح');
   if(matches.length>1&&!Object.hasOwn(choices,key)){result.conflicts.push({key,kind,name:row.name,candidates:matches.map(item=>({id:item.id,name:item.name}))});continue;}
   if(choices[key]&&choices[key]!=='new'&&!target)throw Error('اختيار مطابقة غير صالح');
   if(!target){
    target={...clone(row),id:allocate(kind),importKey:key};
    if(kind==='products'){target.stocks=Object.fromEntries(next.warehouses.map(name=>[name,0]));for(const [name,quantity]of Object.entries(row.stocks))target.stocks[ref(maps.warehouses,name,'المخزن')]=quantity;target.categoryId=maps.categories.get(row.categoryId)||null;target.openingWarehouse=row.openingWarehouse?ref(maps.warehouses,row.openingWarehouse,'مخزن البداية'):row.openingWarehouse;target.qty=num(target.stocks[next.warehouse]);affectedProducts.add(target.id)}
    next[kind].push(target);byId.set(target.id,target);catalog(target);result.counts[kind]++;
   }else{
    result.counts.existing++;target.importKeys=[...new Set([...(target.importKeys||[]),key])];add(byKey,key,target);
    if(kind==='products'&&policy('stocks')==='imported'){for(const [name,quantity]of Object.entries(row.stocks)){const warehouse=ref(maps.warehouses,name,'المخزن');if(target.stocks[warehouse]!==quantity)affectedProducts.add(target.id);target.stocks[warehouse]=quantity}target.qty=num(target.stocks[next.warehouse]);}
    if(kind!=='products'&&policy(kind)==='imported')target.balance=row.balance;
   }
   maps[kind].set(row.id,target.id);
  }
 }
 if(result.conflicts.length)return result;
 // Expense identities never resolve to product categories or to employee names.
 const categoryNames=new Map((next.expenseCategories||[]).map(row=>[expenseCategoryName(row.name).toLocaleLowerCase(),row]));
 for(const row of source.expenseCategories||[]){
  let target=next.expenseCategories.find(item=>String(item.id)===String(row.id))||categoryNames.get(expenseCategoryName(row.name).toLocaleLowerCase());
  if(!target){target=clone(row);next.expenseCategories.push(target);categoryNames.set(expenseCategoryName(target.name).toLocaleLowerCase(),target);result.counts.expenseCategories++}
  else if(expenseCategoryName(target.name)!==expenseCategoryName(row.name)||expenseCategoryKind(target)!==expenseCategoryKind(row)||target.isArchived!==row.isArchived)result.warnings.push('فئة المصروف المستوردة تستخدم تعريف الفئة الحالية: '+target.name);
  maps.expenseCategories.set(String(row.id),target.id);
 }
 const existingRecords=new Map(next.records.map(row=>[keyOf(next,'records',row),row]));
 for(const row of source.records){const existing=existingRecords.get(keyOf(source,'records',row));maps.records.set(row.id,existing?.id??allocate('records'))}
 const mapRecord=(row,forcedId)=>{
  const mapped={...clone(row),id:forcedId??ref(maps.records,row.id,'المستند')};
  for(const key of ['account','to'])if(mapped[key]!=null)mapped[key]=ref(maps.accounts,mapped[key],'وسيلة دفع المستند');
  if(mapped.party)mapped.party=ref(maps.parties,mapped.party,'طرف المستند');if(mapped.otherParty)throw Error('التقاص غير مدعوم');
  for(const key of ['warehouse','from','toWarehouse','openingWarehouseBefore','openingWarehouseAfter'])if(mapped[key])mapped[key]=ref(maps.warehouses,mapped[key],'المخزن');
  if(mapped.openingProduct)mapped.openingProduct=ref(maps.products,mapped.openingProduct,'منتج البداية');
  if(mapped.parentDocumentId)mapped.parentDocumentId=String(ref(maps.records,mapped.parentDocumentId,'الفاتورة الأصلية'));
  if(mapped.expenseCategoryId!=null&&mapped.expenseCategoryId!==''){const target=maps.expenseCategories.get(String(mapped.expenseCategoryId));if(target===undefined)throw Error('فئة المصروف غير موجودة');mapped.expenseCategoryId=target;}
  mapped.lines=(mapped.lines||[]).map(line=>({...line,product:ref(maps.products,line.product,'منتج المستند'),...(line.warehouse?{warehouse:ref(maps.warehouses,line.warehouse,'مخزن السطر')}:{})}));
  mapped.revisions=(mapped.revisions||[]).map(previous=>mapRecord({...previous,revisions:[]},mapped.id));
  if(payrollRecord(mapped))mapped.paymentMethod=mapped.account==null?null:String(mapped.account);
  return mapped;
 };
 const stagedRecords=source.records.map(row=>({...mapRecord(row),importKey:keyOf(source,'records',row)}));
 // Two snapshots of the same employee are not independent wage ledgers.
 for(const employee of source.employees||[]){
  const old=next.employees.find(row=>row.id===employee.id);
  if(old){
   const currentDocs=next.records.filter(row=>payrollRecord(row)&&row.employeeId===old.id),importedDocs=stagedRecords.filter(row=>payrollRecord(row)&&row.employeeId===employee.id);
   const a=currentDocs.map(payrollFingerprint).sort(),b=importedDocs.map(payrollFingerprint).sort();
   if(stable(old)!==stable(employee)||stable(a)!==stable(b))throw Error('حساب الموظف '+employee.name+' له نسختان مختلفتان؛ استخدم استعادة نسخة كاملة بدل دمج استحقاقاته ودفعاته');
  }else{next.employees.push(clone(employee));result.counts.employees++;}
 }
 for(const row of stagedRecords){
  const old=existingRecords.get(row.importKey);if(old&&policy('records')!=='imported'){result.counts.existing++;continue;}
  for(const line of [...(old?.lines||[]),...row.lines])affectedProducts.add(line.product);
  // A source import cannot renumber an already accepted local settlement identity.
  if(old&&isStockSettlementDocument(old)&&isStockSettlementDocument(row)&&validSettlementSequence(old.settlementSequence))row.settlementSequence=old.settlementSequence;
  if(old?.canonicalId)row.canonicalId=old.canonicalId;
  if(old)next.records[next.records.indexOf(old)]=row;else next.records.push(row);existingRecords.set(row.importKey,row);result.counts.records++;
 }
 // Native references are already remapped by desktopToMobileState. An old
 // numeric desktop ID must not shadow another row's valid native identity.
 const accountAliases=new Map(source.accounts.map(row=>[String(row.id),maps.accounts.get(row.id)]));for(const row of source.accounts)for(const value of [row.desktopId,row.code].filter(value=>value!=null))if(!accountAliases.has(String(value)))accountAliases.set(String(value),maps.accounts.get(row.id));
 const sourceRecordAliases=new Map(source.records.map(row=>[String(row.id),maps.records.get(row.id)]));for(const row of source.records)if(row.desktopId!=null&&!sourceRecordAliases.has(String(row.desktopId)))sourceRecordAliases.set(String(row.desktopId),maps.records.get(row.id));
 const sourceProductAliases=new Map(source.products.map(row=>[String(row.id),maps.products.get(row.id)]));for(const row of source.products)if(row.desktopId!=null&&!sourceProductAliases.has(String(row.desktopId)))sourceProductAliases.set(String(row.desktopId),maps.products.get(row.id));
 const method=value=>{if(value===null||value===undefined||value==='')return value;const mapped=accountAliases.get(String(value));if(mapped===undefined)throw Error('وسيلة دفع الحركة غير موجودة');return String(mapped)};
 const movement=(row,isPayroll=false)=>{
  const mapped=clone(row);for(const key of ['paymentMethod','accountId','fromAccountId','toAccountId'])if(mapped[key]!=null)mapped[key]=method(mapped[key]);
  if(mapped.partyId!=null)mapped.partyId=ref(maps.parties,mapped.partyId,'طرف الحركة');
  if(!isPayroll&&mapped.documentId!=null&&sourceRecordAliases.has(String(mapped.documentId)))mapped.documentId=String(sourceRecordAliases.get(String(mapped.documentId)));
  return mapped;
 };
 const mergeRows=(name,rows,mapper)=>{
  next[name]??=[];const byKey=new Map(),byId=new Map(),byBody=new Map();for(const row of next[name]){if(row.importKey)byKey.set(row.importKey,row);if(row.id!=null)byId.set(String(row.id),row);byBody.set(financialBody(row),row)}
  for(const [position,sourceRow]of (rows||[]).entries()){
   const key=sourceRow.importKey||'import:'+String(source.originId||source.branding)+':'+name+':'+String(sourceRow.id??sha256Hex(stable(sourceRow))+':'+position),row={...mapper(sourceRow),importKey:key},old=byKey.get(key)||(row.id!=null?byId.get(String(row.id)):null)||byBody.get(financialBody(row));
   if(old){
    if(financialBody(old)===financialBody(row))continue;
    if(name==='payrollFinancialMovements')throw Error('حركة موظف لها نسختان مختلفتان؛ استخدم الاستعادة الكاملة');
    // Original proofs and audits cannot be rewritten merely because an import reuses an ID.
    if(name==='stockEvents'||name==='auditEvents')throw Error('سجل تدقيق أو إثبات مخزون له معرّف متعارض');
    if(policy('records')!=='imported')continue;
    const revisions=[...(old.importRevisions||[]),clone({...old,importRevisions:undefined})];Object.assign(old,row,{importRevisions:revisions});continue;
   }
   next[name].push(row);byKey.set(key,row);if(row.id!=null)byId.set(String(row.id),row);byBody.set(financialBody(row),row);
  }
 };
 mergeRows('payrollFinancialMovements',source.payrollFinancialMovements,row=>movement(row,true));
 mergeRows('financialMovements',source.financialMovements,row=>movement(row));
 mergeRows('stockEvents',source.stockEvents,row=>({...clone(row),productId:String(sourceProductAliases.get(String(row.productId))??ref(maps.products,row.productId,'منتج حركة المخزون')),warehouseId:ref(maps.warehouses,row.warehouseId,'مخزن الحركة'),documentId:sourceRecordAliases.has(String(row.documentId))?String(sourceRecordAliases.get(String(row.documentId))):row.documentId}));
 mergeRows('auditEvents',source.auditEvents,row=>({...clone(row),entityId:payrollRecord({kind:row.after?.kind??row.afterDocument?.kind})||String(row.action).startsWith('payroll.')?row.entityId:sourceRecordAliases.has(String(row.entityId))?(typeof row.entityId==='number'?sourceRecordAliases.get(String(row.entityId)):String(sourceRecordAliases.get(String(row.entityId)))):row.entityId}));
 mergeRows('desktopAccountTransfers',source.desktopAccountTransfers,row=>movement(row));
 if(source.desktopOriginal){next.desktopImportSources??=[];const fingerprint=sha256Hex(stable(source.desktopOriginal));if(!next.desktopImportSources.some(row=>row.fingerprint===fingerprint))next.desktopImportSources.push({fingerprint,backup:clone(source.desktopOriginal),sourceMappings:clone(source.desktopMappings||{})});}
 for(const prior of source.desktopImportSources||[]){next.desktopImportSources??=[];if(!next.desktopImportSources.some(row=>row.fingerprint===prior.fingerprint))next.desktopImportSources.push(clone(prior));}
 normalizeStockSettlementSequences(next);next.records.sort((a,b)=>b.id-a.id);reconcileImportOpening(next);
 for(const product of next.products)if(existingProducts.has(product.id)&&affectedProducts.has(product.id))product.openingHistoryLocked=true;
 if([...affectedProducts].some(id=>existingProducts.has(id)))result.warnings.push('المنتجات المتطابقة ذات التاريخ المدمج تُراجع من سجل المخزون؛ لا يعاد تقدير رصيد بدايتها تلقائيًا.');
 upgradeState(next);validatePayrollState(next);validateState(next);return result;
}

export function memoryCollections(initial={}){
 const collections=structuredClone(initial),matches=(row,q)=>Object.entries(q||{}).every(([k,v])=>v&&typeof v==='object'&&v.$in?v.$in.includes(row[k]):row[k]===v);
 const set=(row,key,value)=>{const keys=key.split('.');let target=row;for(const k of keys.slice(0,-1))target=target[k]??={};target[keys.at(-1)]=value};
 return {collections,async transaction(fn){const before=structuredClone(collections);try{return await fn()}catch(e){for(const k of Object.keys(collections))delete collections[k];Object.assign(collections,before);throw e}},collection(name){const rows=collections[name]??=[];return {find(query={}){return {async toArray(){return rows.filter(r=>matches(r,query))}}},async bulkWrite(operations){for(const {updateOne:o}of operations){let row=rows.find(r=>matches(r,o.filter));if(!row&&o.upsert){row={...o.filter,...o.update.$setOnInsert};rows.push(row)}if(row)for(const [k,v]of Object.entries(o.update.$set||{}))set(row,k,v)}}}}};
}
export async function sqliteBackup(bytes,onProgress=()=>{}){
 if(bytes.byteLength>40*1024*1024)throw Error('الملف أكبر من 40 ميغابايت');
 const SQL=await globalThis.initSqlJs(),db=new SQL.Database(bytes);
 try{
  const names=db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values.flat().map(String)||[],collections={};
  const tables={products:'products',productCategories:'product_categories',parties:'parties',warehouses:'warehouses',documents:'documents',paymentAccounts:'payment_accounts',financialMovements:'financial_movements',stockMovements:'stock_movements',appSettings:'app_settings',employees:'employees',expenseCategories:'expense_categories',auditEvents:'audit_events',counters:'counters',accountTransfers:'account_transfers',recurringExpenses:'recurring_expenses',importMappings:'import_mappings',users:'users'};
  if(names.includes('products')&&names.includes('documents')){
   for(const [key,table]of Object.entries(tables)){if(!names.includes(table)){collections[key]=[];continue}const rows=db.exec('SELECT data_json FROM "'+table+'"')[0]?.values||[];if(rows.length>100000)throw Error('عدد السجلات يتجاوز الحد المدعوم');collections[key]=rows.map(([json])=>JSON.parse(json));onProgress(key,collections[key].length);await new Promise(r=>setTimeout(r,0))}
   return {format:'conta-backup',schemaVersion:1,createdAt:new Date().toISOString(),collections,warnings:[]};
  }
 }finally{db.close()}
 const target=memoryCollections({paymentAccounts:[{id:'cash',code:'cash',name:'نقدي',balance:0,isActive:true}],warehouses:[]}),preflight=await preflightLegacyDatabase(target,bytes);
 if(preflight.blockers.length)throw Error(preflight.blockers.slice(0,8).join(' · '));const preview=await inspectLegacyDatabase(bytes);
 for(const phase of LEGACY_IMPORT_PHASES){onProgress(phase,0);await executeLegacyImportPhase(target,bytes,phase);await new Promise(r=>setTimeout(r,0))}
 const c=target.collections;for(const w of c.warehouses)w.id??=w._id;
 for(const p of c.products)p.pieceCost??=p.legacyOpeningCost;
 return {format:'conta-backup',schemaVersion:1,createdAt:new Date().toISOString(),collections:{products:[],productCategories:[],parties:[],warehouses:[],documents:[],paymentAccounts:[],financialMovements:[],stockMovements:[],...c},warnings:[...preflight.warnings,...preview.warnings]};
}
