// Functional identity adapter for official Conta backups, including Offline build 862.
// This never writes to storage, replays postings, imports login credentials or changes activation.
import {sha256Hex} from './accounting-hash.js';
import {stockBalanceAfter,reportCostNumber} from './accounting-numbers.js';
import {resolveInvoiceLineTotal,sumInvoiceLineTotals} from './invoice-amount.js';
import {refreshCurrentProductCosts} from './cost-provenance.js';
import {ensurePayrollState,validatePayrollState} from './payroll-domain.js';
import {validateExpenseCategoryState} from './expense-category-domain.js';
import {validatePartyOpeningState} from './party-opening-domain.js';
import {upgradeState,validateFeatureState} from './upgrade-state.js';

const clone=value=>structuredClone(value),own=(value,key)=>Object.hasOwn(value,key);
const fail=message=>{throw Error(message+'؛ لم تتغير بيانات الهاتف')};
const key=value=>String(value??'');
const active=row=>!row.voided&&row.status!=='voided';
const payroll=row=>['employee-accrual','employee-payment'].includes(row.kind);
function numeric(value,label,{fallback,nonnegative=false}={}){
 if(value===undefined||value===null||value===''){if(fallback!==undefined)return fallback;fail(label+' غير صالح')}
 if(typeof value!=='number'&&(typeof value!=='string'||! /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())))fail(label+' غير صالح');
 const number=Number(value);if(!Number.isFinite(number)||Math.abs(number)>1e14||nonnegative&&number<0)fail(label+' غير صالح');return number;
}
function dateText(value,fallback){
 const input=value??fallback;if(typeof input!=='string'||!Number.isFinite(Date.parse(input)))fail('تاريخ في النسخة');
 const day=input.slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||new Date(day+'T12:00:00.000Z').toISOString().slice(0,10)!==day)fail('تاريخ في النسخة');
 return input.length===10?input+'T12:00:00.000Z':input;
}
// Official older backups can contain MongoDB extended JSON scalar values.
function plain(value){
 if(Array.isArray(value))return value.map(plain);
 if(value&&typeof value==='object'){
  const keys=Object.keys(value);
  if(keys.length===1){
   if(own(value,'$oid'))return String(value.$oid);
   if(own(value,'$date')){const at=value.$date;if(typeof at==='string')return at;const number=Number(at?.$numberLong??at);if(!Number.isFinite(number))fail('تاريخ في النسخة');return new Date(number).toISOString()}
   for(const tag of ['$numberInt','$numberLong','$numberDouble','$numberDecimal'])if(own(value,tag))return numeric(value[tag],'رقم في النسخة');
  }
  return Object.fromEntries(Object.entries(value).map(([name,item])=>[name,plain(item)]));
 }
 return value;
}
function index(rows,label,start=1){
 const map=new Map();for(const [position,row]of rows.entries()){
  const id=key(row.id??row._id);if(!id||map.has(id))fail('معرّف '+label+' مكرر أو مفقود');map.set(id,position+start);
 }return map;
}
function reference(map,value,label,{optional=false}={}){
 if(value===undefined||value===null||value===''){if(optional)return null;fail(label+' مفقود')}
 const result=map.get(key(value));if(result===undefined)fail(label+' غير موجود');return result;
}
function revision(value){const result=numeric(value,'إصدار المستند',{fallback:0,nonnegative:true});if(!Number.isSafeInteger(result))fail('إصدار المستند');return result;}

export function desktopToMobileState(raw){
 if(!raw||raw.format!=='conta-backup'||raw.schemaVersion!==1||!raw.collections||typeof raw.collections!=='object')fail('صيغة النسخة الرسمية غير مدعومة');
 const c=plain(clone(raw.collections));
 for(const name of ['products','parties','warehouses','documents','paymentAccounts','financialMovements'])if(!Array.isArray(c[name])||c[name].length>100000)fail('جزء النسخة '+name+' ناقص أو غير صالح');
 for(const name of ['productCategories','expenseCategories','employees','stockMovements','auditEvents','accountTransfers','appSettings']){if(c[name]===undefined)c[name]=[];if(!Array.isArray(c[name])||c[name].length>1000000)fail('جزء النسخة '+name+' غير صالح')}
 const ids={products:index(c.products,'المنتج'),parties:index(c.parties,'الطرف'),accounts:index(c.paymentAccounts.slice().sort((a,b)=>Number(b.code==='cash')-Number(a.code==='cash')),'وسيلة الدفع'),categories:index(c.productCategories,'الفئة'),documents:index(c.documents,'المستند',101)},warehouseIds=new Map(),accountIds=new Map(ids.accounts);
 const names=new Set();
 for(const row of c.warehouses){
  const name=typeof row.name==='string'?row.name.trim():'';if(!name||names.has(name)||['__proto__','constructor','prototype'].includes(name))fail('اسم مخزن مكرر أو غير صالح');names.add(name);
  for(const identity of [row.id,row._id].filter(value=>value!==undefined&&value!==null)){if(warehouseIds.has(key(identity))&&warehouseIds.get(key(identity))!==name)fail('معرّف المخزن مكرر');warehouseIds.set(key(identity),name)}
 }
 if(!names.size)fail('النسخة لا تحتوي مخزنًا');
 for(const row of c.paymentAccounts)if(row.code){const code=key(row.code),id=reference(ids.accounts,row.id,'وسيلة الدفع');if(accountIds.has(code)&&accountIds.get(code)!==id)fail('رمز وسيلة الدفع مكرر');accountIds.set(code,id)}
 const defaultWarehouses=c.warehouses.filter(row=>row.isSalesDefault===true);if(defaultWarehouses.length>1)fail('أكثر من مخزن بيع افتراضي');
 const main=defaultWarehouses[0]||c.warehouses.find(row=>!row.isArchived)||c.warehouses[0],warehouse=reference(warehouseIds,main._id??main.id,'مخزن البيع');
 const branding=c.appSettings.find(row=>(row._id??row.id)==='invoice-branding')||c.appSettings.find(row=>row.storeName)||{},currency=c.appSettings.find(row=>row.currency?.code)?.currency||c.appSettings.find(row=>['currency','currency-settings'].includes(row._id??row.id))||{};
 const state={products:[],parties:[],accounts:[],records:[],users:[],warehouses:[...names],warehouse,salesWarehouse:warehouse,warehouseMeta:Object.fromEntries(c.warehouses.map(row=>[String(row.name).trim(),{...clone(row),archived:row.isArchived===true}])),categories:c.productCategories.map(row=>({...clone(row),id:reference(ids.categories,row.id,'الفئة'),desktopId:row.id})),expenseCategories:clone(c.expenseCategories),employees:clone(c.employees),payrollFinancialMovements:[],financialMovements:[],stockEvents:[],auditEvents:[],branding:branding.storeName||'الكرنه',brandInfo:{phone:branding.storePhone||'',address:branding.storeAddress||'',logo:branding.storeLogoDataUrl||'',registrationNumber:branding.registrationNumber||'',taxNumber:branding.taxNumber||'',footer:branding.footerNote||'',nameFont:branding.nameFont||'tahoma',nameFontSize:branding.nameFontSize||24,nameFontWeight:branding.nameFontWeight||800},currency:{code:currency.code||'MRU',availableCodes:currency.availableCodes||['MRU',currency.code||'MRU']},opening:{accounts:{},parties:{},stocks:{}},originId:'desktop:'+sha256Hex(JSON.stringify(c)),desktopImportVersion:862,desktopOriginal:clone(raw),desktopImportWarnings:[]};
 state.products=c.products.map(row=>{
  const stocks={};for(const [source,quantity]of Object.entries(row.stocks||{})){const name=reference(warehouseIds,source,'مخزن المنتج');if(own(stocks,name))fail('أكثر من رصيد لنفس المخزن');stocks[name]=numeric(quantity,'رصيد المنتج',{nonnegative:true})}
  for(const name of names)stocks[name]??=0;
  const result={...clone(row),id:reference(ids.products,row.id,'المنتج'),desktopId:row.id,desktop:clone(row),name:row.name,sku:row.barcode||row.sku||'',price:numeric(row.piecePrice,'سعر المنتج',{fallback:0,nonnegative:true}),cost:numeric(row.pieceCost,'سعر شراء البطاقة',{fallback:0,nonnegative:true}),stocks,qty:stocks[warehouse]||0,archived:row.isArchived===true,categoryId:reference(ids.categories,row.categoryId,'فئة المنتج',{optional:true})};
  result.expiry=String(row.expiryDate??row.expiry??'').slice(0,10);
  if(own(row,'openingStock'))result.openingTotal=row.openingStock===null?0:numeric(row.openingStock,'رصيد البداية',{nonnegative:true});
  if(row.openingWarehouseId)result.openingWarehouse=reference(warehouseIds,row.openingWarehouseId,'مخزن رصيد البداية');
  if(row.openingCost!=null)result.openingCost=numeric(row.openingCost,'تكلفة رصيد البداية',{nonnegative:true});
  if(row.legacyOpeningCost!=null)result.legacyOpeningCost=numeric(row.legacyOpeningCost,'التكلفة السابقة',{nonnegative:true});
  return result;
 });
 const productById=new Map(state.products.map(row=>[row.id,row]));
 state.parties=c.parties.map(row=>{
  const type=row.partyType??row.type??'supplier';if(!['customer','supplier'].includes(type))fail('نوع الطرف غير صالح');
  const net=numeric(row.receivable,'الرصيد لنا',{fallback:0,nonnegative:true})-numeric(row.payable,'الرصيد علينا',{fallback:0,nonnegative:true});
  return{...clone(row),id:reference(ids.parties,row.id??row._id,'الطرف'),desktopId:row.id??row._id,desktop:clone(row),name:row.name,phone:row.phone||'',type,balance:net===0?0:net*(type==='supplier'?-1:1),archived:row.isArchived===true};
 });
 state.accounts=c.paymentAccounts.map(row=>({...clone(row),id:reference(ids.accounts,row.id,'وسيلة الدفع'),desktopId:row.id,desktop:clone(row),name:row.name,balance:numeric(row.balance,'رصيد وسيلة الدفع',{fallback:0}),active:row.isActive!==false,archived:row.isArchived===true}));
 const sourceById=new Map(c.documents.map(row=>[key(row.id),row])),financialByDocument=new Map();
 for(const movement of c.financialMovements){const id=key(movement.documentId),rows=financialByDocument.get(id)||[];rows.push(movement);financialByDocument.set(id,rows)}
 const kinds={sale:'sale',purchase:'purchase',expense:'expense',payment:'receive',transfer:'stocktransfer','account-transfer':'transfer',adjustment:'adjustment','account-adjustment':'deposit','party-opening':'party-opening','employee-accrual':'employee-accrual','employee-payment':'employee-payment',return:'return'};
 function convertDocument(row,id){
  if(!own(kinds,row.kind))fail('نوع مستند يحتاج مراجعة قبل الاستيراد: '+row.kind);
  if(row.status!==undefined&&!['posted','voided'].includes(row.status))fail('حالة مستند غير مدعومة');
  const occurredAt=dateText(row.occurredAt,raw.createdAt),date=(row.businessDate||occurredAt).slice(0,10);dateText(date);
  const amount=numeric(row.total,'مجموع المستند',{fallback:0,nonnegative:true}),paid=numeric(row.paidTotal??row.cashAmount,'المدفوع',{fallback:0,nonnegative:true}),due=numeric(row.dueTotal,'الباقي',{fallback:0,nonnegative:true});
  const movements=financialByDocument.get(key(row.id))||[],effective=movements.filter(m=>m.status!=='reversed'&&m.isReversal!==true),outgoing=effective.find(m=>m.direction==='out')||effective[0];
  const method=row.fromAccountId??row.paymentMethod??outgoing?.paymentMethod??outgoing?.accountId;
  const account=method&&method!=='note'?reference(accountIds,method,'وسيلة دفع المستند'):null;
  let direction=row.partyCashDirection;
  if(row.kind==='payment'&&!['receive','pay'].includes(direction)){direction=effective.length===1?(effective[0].direction==='in'?'receive':'pay'):String(row.title||'').includes('دفع لنا')?'receive':'pay'}
  const kind=row.kind==='payment'?(direction==='pay'?'pay':'receive'):row.kind==='account-adjustment'?(row.accountAdjustmentDirection==='withdrawal'?'withdraw':'deposit'):kinds[row.kind];
  if(row.kind==='account-adjustment'&&!['deposit','withdrawal',undefined].includes(row.accountAdjustmentDirection))fail('اتجاه الإيداع أو السحب غير صالح');
  const sourceLines=Array.isArray(row.lines)?row.lines:[],nonProductLines=sourceLines.filter(line=>line.productId===null||line.productId===undefined);
  if(['sale','purchase','transfer','adjustment','return'].includes(row.kind)&&nonProductLines.length)fail('سطر تجاري بلا منتج في '+String(row.number||row.id));
  const lines=sourceLines.filter(line=>line.productId!==undefined&&line.productId!==null).map((line,index)=>{
   const product=reference(ids.products,line.productId,'منتج المستند'),quantity=numeric(line.quantity,'كمية السطر',{fallback:0}),price=numeric(line.unitPrice,'سعر السطر',{fallback:0,nonnegative:true});
   if(quantity<0&&row.kind!=='adjustment')fail('كمية تجارية سالبة');
   const result={...clone(line),id:line.id??String(row.id)+'-line-'+index,product,name:line.description||productById.get(product)?.name||'',qty:row.kind==='adjustment'?Math.abs(quantity):quantity,price,desktop:clone(line)};
   if(line.warehouseId)result.warehouse=reference(warehouseIds,line.warehouseId,'مخزن سطر التصحيح');
   if(row.kind==='adjustment'){
    const hasBefore=line.balanceBefore!==undefined,hasAfter=line.balanceAfter!==undefined;
    result.delta=hasBefore&&hasAfter?numeric(line.balanceAfter,'العدد الفعلي')-numeric(line.balanceBefore,'العدد السابق'):quantity;
    if(hasAfter)result.actualQuantity=numeric(line.balanceAfter,'العدد الفعلي',{nonnegative:true});
   }
   if(['sale','purchase','return'].includes(row.kind)){
    const total=line.lineTotal===undefined?Math.round(quantity*price):numeric(line.lineTotal,'مجموع السطر',{nonnegative:true});
    if(line.lineTotalMode!==undefined&&!['exact','desktop-legacy','mobile-legacy'].includes(line.lineTotalMode))fail('سياسة مبلغ السطر غير مدعومة');
    if(line.lineTotalMode==='exact')resolveInvoiceLineTotal(quantity,price,total,true);
    result.lineTotal=total;result.lineTotalMode=line.lineTotalMode||'desktop-legacy';
   }
   // Missing, malformed and explicit zero costs have different meanings; never fill from today's card.
   if(own(line,'costAtSale'))result.costAtSale=line.costAtSale===null?null:reportCostNumber(line.costAtSale);
   return result;
  });
  if(['sale','purchase'].includes(row.kind)&&lines.some(line=>line.lineTotalMode==='exact')&&sumInvoiceLineTotals(lines.map(line=>line.lineTotal),true)!==amount)fail('إجمالي الفاتورة الدقيقة لا يطابق سطورها');
  const party=reference(ids.parties,row.partyId,'طرف المستند',{optional:true}),sourceWarehouse=reference(warehouseIds,row.warehouseId,'مخزن المستند',{optional:true}),destination=reference(warehouseIds,row.destinationWarehouseId,'مخزن الوجهة',{optional:true});
  const record={...clone(row),id,desktopId:row.id,desktop:clone(row),kind,number:row.number||String(row.id),title:row.title||row.partyName||kind,subtitle:row.note||'',note:row.note||'',occurredAt,date,time:occurredAt.slice(11,16)||'12:00',total:amount,paid,due,account,party,warehouse:sourceWarehouse,from:sourceWarehouse,toWarehouse:destination,to:reference(accountIds,row.toAccountId,'حساب التحويل الآخر',{optional:true}),voided:row.status==='voided',status:row.status||'posted',revision:revision(row.revision),lines,revisions:[],nonProductLines:clone(nonProductLines)};
  if(record.kind==='stocktransfer'&&(!record.from||!record.toWarehouse))fail('مخزن التحويل مفقود');
  if(['sale','purchase','adjustment','return'].includes(record.kind)&&!record.warehouse)fail('مخزن الفاتورة مفقود');
  if(['sale','purchase','expense','receive','pay','deposit','withdraw','transfer','employee-payment'].includes(record.kind)&&paid>0&&!account)fail('وسيلة دفع مستند نقدي مفقودة');
  if(record.kind==='transfer'&&(!record.account||!record.to||record.account===record.to))fail('حسابا التحويل غير صالحين');
  if(record.kind==='sale'){
   record.costKnown=lines.every(line=>own(line,'costAtSale')&&reportCostNumber(line.costAtSale)!==null);
   record.profit=record.costKnown?amount-lines.reduce((sum,line)=>sum+line.qty*line.costAtSale,0):null;
  }
  if(['sale','purchase'].includes(kind)&&paid>0&&paid!==amount){record.importReadOnly=true;record.importReadOnlyReason='historical-partial-payment';state.desktopImportWarnings.push('دفعة جزئية تاريخية محفوظة للعرض: '+record.number)}
  if(kind==='return'){record.importReadOnly=true;record.importReadOnlyReason='historical-return';record.returnParentKind=sourceById.get(key(row.parentDocumentId))?.kind||null;}
  if(own(row,'parentDocumentId'))record.parentDocumentId=row.parentDocumentId?String(reference(ids.documents,row.parentDocumentId,'الفاتورة الأصلية')):null;
  if(row.kind==='payment'&&!row.partyCashDirection){record.importReadOnly=true;record.importReadOnlyReason='historical-payment-direction'}
  if(row.kind==='payment')record.partyCashDirection=direction;
  if(row.kind==='adjustment'){
   const opening=row.openingCorrection===true||own(row,'openingStockBefore')&&own(row,'openingStockAfter');
   record.openingCorrection=opening;record.openingStock=!opening&&(/^OPEN-(?!COR)/.test(String(row.number||''))||own(row,'openingStockAfter'));
   if(opening){
    if(!lines.length)fail('تصحيح بداية بلا منتج');record.openingProduct=lines[0].product;
    record.openingTotalBefore=numeric(row.openingStockBefore,'رصيد البداية السابق',{fallback:0,nonnegative:true});record.openingTotalAfter=numeric(row.openingStockAfter,'رصيد البداية الجديد',{nonnegative:true});
    record.openingCostBefore=numeric(row.openingCostBefore,'تكلفة البداية السابقة',{fallback:0,nonnegative:true});record.openingCostAfter=numeric(row.openingCostAfter,'تكلفة البداية الجديدة',{fallback:0,nonnegative:true});
    record.openingWarehouseBefore=sourceWarehouse;record.openingWarehouseAfter=destination||sourceWarehouse;
   }
  }
  if(payroll(record)){
   record.payrollDocumentId=String(row.id);record.sourceDocumentId=String(row.id);record.businessDate=row.businessDate||date;record.date=record.businessDate;record.time='12:00';record.title=row.employeeName||row.title||'';
   record.paidTotal=paid;record.dueTotal=due;record.paymentMethod=account===null?null:String(account);
   record.account=kind==='employee-accrual'?null:account;
  }
  return record;
 }
 state.records=c.documents.map(row=>convertDocument(row,reference(ids.documents,row.id,'المستند')));
 let nextRecordId=state.records.reduce((max,row)=>Math.max(max,row.id),100);const documentNumber=movement=>movement.documentNumber||'FIN-'+movement.id;
 // Desktop bank openings historically live only in financialMovements, not documents.
 // Expose them as native bank-history rows so they remain inspectable and never vanish into a baseline.
 for(const movement of c.financialMovements){
  if(movement.isReversal===true||ids.documents.has(key(movement.documentId)))continue;
  if(!['opening-balance','opening-balance-correction','manual-deposit','manual-withdrawal'].includes(movement.type))continue;
  const account=reference(accountIds,movement.paymentMethod??movement.accountId,'حساب الحركة المالية'),amount=numeric(movement.amount,'مبلغ الحركة المالية',{nonnegative:true}),occurredAt=dateText(movement.occurredAt,raw.createdAt),direction=movement.direction;
  if(!['in','out'].includes(direction))fail('اتجاه الحركة المالية');
  const record={...clone(movement),id:++nextRecordId,desktopId:'movement:'+movement.id,desktopMovementId:movement.id,desktop:clone(movement),number:documentNumber(movement),kind:direction==='in'?'deposit':'withdraw',title:movement.type==='opening-balance-correction'?'تصحيح رصيد البداية':movement.type==='opening-balance'?'رصيد البداية':direction==='in'?'إيداع':'سحب',subtitle:movement.note||'',note:movement.note||'',date:occurredAt.slice(0,10),time:occurredAt.slice(11,16),occurredAt,total:amount,paid:amount,due:0,account,party:null,warehouse:null,lines:[],revisions:[],revision:revision(movement.revision),status:movement.status==='reversed'?'voided':'posted',voided:movement.status==='reversed',importReadOnly:true,importReadOnlyReason:'financial-movement-source'};
  if(movement.type==='opening-balance-correction')Object.assign(record,{openingAccountCorrection:true,openingBalanceBefore:numeric(movement.openingBalanceBefore,'رصيد البداية السابق'),openingBalanceAfter:numeric(movement.openingBalanceAfter,'رصيد البداية الجديد')});
  if(movement.type==='opening-balance')record.openingAccountInitial=true;
  state.records.push(record);
 }
 for(const transfer of c.accountTransfers){
  const sourceId=transfer.documentId??transfer.id;if(ids.documents.has(key(sourceId)))continue;
  const row={...clone(transfer),id:sourceId,kind:'account-transfer',number:transfer.number||'BTR-'+transfer.id,total:transfer.amount,paidTotal:transfer.amount,dueTotal:0,paymentMethod:transfer.fromAccountId,lines:[]};
  const record=convertDocument(row,++nextRecordId);record.desktopTransferId=transfer.id;record.desktopDocumentId=sourceId;record.desktopTransfer=clone(transfer);state.records.push(record);
 }
 const recordIds=new Map(state.records.map(record=>[key(record.desktopId),record.id]));
 for(const record of state.records){if(record.desktopDocumentId!=null)recordIds.set(key(record.desktopDocumentId),record.id);if(record.desktopMovementId!=null){recordIds.set(key(record.desktopMovementId),record.id);if(record.desktop.documentId!=null&&!recordIds.has(key(record.desktop.documentId)))recordIds.set(key(record.desktop.documentId),record.id)}}
 const mapMovement=movement=>({...clone(movement),desktop:clone(movement),paymentMethod:movement.paymentMethod==null?null:String(reference(accountIds,movement.paymentMethod,'حساب الحركة المالية')),accountId:movement.accountId==null?undefined:String(reference(accountIds,movement.accountId,'حساب الحركة المالية')),partyId:movement.partyId==null?null:reference(ids.parties,movement.partyId,'طرف الحركة المالية'),documentId:recordIds.has(key(movement.documentId))?String(recordIds.get(key(movement.documentId))):movement.documentId});
 state.financialMovements=c.financialMovements.map(mapMovement);
 state.payrollFinancialMovements=c.financialMovements.filter(movement=>String(movement.type).startsWith('employee-payment')).map(movement=>({...mapMovement(movement),documentId:movement.documentId}));
 state.stockEvents=c.stockMovements.map(movement=>({...clone(movement),desktop:clone(movement),productId:String(reference(ids.products,movement.productId,'منتج حركة المخزون')),warehouseId:reference(warehouseIds,movement.warehouseId,'مخزن الحركة'),documentId:recordIds.has(key(movement.documentId))?String(recordIds.get(key(movement.documentId))):movement.documentId,quantityDelta:numeric(movement.quantityDelta,'كمية حركة المخزون'),at:movement.occurredAt??movement.at}));
 state.auditEvents=c.auditEvents.map(event=>({...clone(event),desktop:clone(event),entityId:recordIds.has(key(event.entityId))?String(recordIds.get(key(event.entityId))):event.entityId}));
 // Payroll audit identities are canonical employee/document strings; preserve those unchanged.
 for(const event of state.auditEvents)if(String(event.action).startsWith('payroll.'))event.entityId=event.desktop.entityId;
 state.desktopAccountTransfers=c.accountTransfers.map(row=>({...clone(row),desktop:clone(row),fromAccountId:String(reference(accountIds,row.fromAccountId,'مصدر التحويل')),toAccountId:String(reference(accountIds,row.toAccountId,'وجهة التحويل')),documentId:recordIds.has(key(row.documentId??row.id))?String(recordIds.get(key(row.documentId??row.id))):row.documentId}));
 state.desktopMappings={products:Object.fromEntries(ids.products),parties:Object.fromEntries(ids.parties),accounts:Object.fromEntries(ids.accounts),warehouses:Object.fromEntries(warehouseIds),documents:Object.fromEntries(recordIds)};
 state.opening.accounts=Object.fromEntries(state.accounts.map(account=>[account.id,account.balance]));
 state.opening.parties=Object.fromEntries(state.parties.map(party=>[party.id,party.balance]));
 state.opening.stocks=Object.fromEntries(state.products.map(product=>[product.id,{...product.stocks}]));
 for(const record of state.records.filter(active)){
  const account=record.account,party=state.parties.find(p=>p.id===record.party),supplierReturn=record.kind==='return'&&record.returnParentKind==='purchase';
  let cash=0;if(record.kind==='employee-payment')cash=record.employeePaymentDirection==='deposit'?record.total:-record.total;
  else if(['sale','receive','deposit'].includes(record.kind))cash=record.paid;
  else if(['purchase','expense','pay','withdraw','transfer'].includes(record.kind))cash=-record.paid;
  else if(record.kind==='return')cash=(supplierReturn?1:-1)*record.paid;
  if(account!==null&&account!==undefined)state.opening.accounts[account]-=cash;
  if(record.kind==='transfer')state.opening.accounts[record.to]-=record.total;
  if(party){
   const effect=own(record,'partyBalanceDelta')&&Number.isFinite(record.partyBalanceDelta)?record.partyBalanceDelta:record.kind==='sale'?record.due:record.kind==='purchase'?-record.due:record.kind==='receive'?-record.total:record.kind==='pay'?record.total:record.kind==='return'?(supplierReturn?1:-1)*Math.max(0,record.total-record.paid):0;
   state.opening.parties[party.id]-=effect*(party.type==='supplier'?-1:1);
  }
  for(const line of record.lines){
   const stock=state.opening.stocks[line.product],warehouse=line.warehouse||record.warehouse;
   const reverse=(name,delta)=>{if(!own(stock,name))fail('مخزن حركة المستند');stock[name]=stockBalanceAfter(stock[name],delta)};
   if(record.kind==='sale')reverse(warehouse,line.qty);if(record.kind==='purchase')reverse(warehouse,-line.qty);
   if(record.kind==='adjustment')reverse(warehouse,-line.delta);
   if(record.kind==='stocktransfer'){reverse(record.from,line.qty);reverse(record.toWarehouse,-line.qty)}
   if(record.kind==='return')reverse(warehouse,(supplierReturn?1:-1)*line.qty);
  }
 }
 ensurePayrollState(state);upgradeState(state);validatePayrollState(state);validatePartyOpeningState(state);validateExpenseCategoryState(state);validateFeatureState(state);
 refreshCurrentProductCosts(state);
 return state;
}
