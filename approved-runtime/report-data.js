import {statementNote,movementStatement,financialStatementSource,financialStatementIndex} from './movement-statement.js';
import {recordNumber,recordReference} from './document-presentation.js';
import {displayStockMovementDocumentNumber} from './stock-settlement.js';
import {currencyCode,partyNetDelta,moneyAccountDelta} from './upgrade-state.js';
import {effectivePartyRecord,partyNetBalance} from './party-metrics.js';
import {translateText} from './i18n.js';
import {saleFacts,profitSummary,reportNetLines} from './commerce-facts.js';
import {stockBalanceAfter,stockNumber} from './accounting-numbers.js';
import {currentProductCosts,inventoryUnitCost,accountingTimestamp} from './cost-provenance.js';
import {payrollFacts,employeeLedger} from './payroll-domain.js';
import {expenseCategoryForRecord,expenseCategoryMatches} from './expense-category-domain.js';
import {partyOpeningNetDelta} from './party-opening-domain.js';

export const reportTitles={overview:'التقرير الشامل',sales:'حركة المبيعات',purchases:'حركة المشتريات','product-sales':'حركة المنتجات',stock:'حركة المخزون',profit:'تحليل الأرباح',debts:'الحسابات والديون','party-ledger':'كشف حسابات الأطراف',financial:'الحركة المالية',expenses:'المصاريف'};
const n=v=>Number(v)||0,sum=(rows,get)=>rows.reduce((total,row)=>total+n(get(row)),0);
const columns=(...items)=>items.map(([key,label,format='text'])=>({key,label,format}));
const matches=(text,search)=>{const normalize=v=>String(v||'').normalize('NFKD').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').toLocaleLowerCase();return normalize(search).split(/\s+/).filter(Boolean).every(word=>normalize(text).includes(word))};
const unknownWarning='التكلفة التاريخية غير مكتملة؛ لا يمكن تأكيد التكلفة والربح حتى مراجعة مصادرها.';
const finiteDate=date=>{try{return /^\d{4}-\d{2}-\d{2}$/.test(date||'')&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date}catch{return false}};
const idEqual=(a,b)=>String(a)===String(b);
export function normalizeReportFilters(state,filters={}){
 const f={type:'overview',allTime:true,from:'',to:'',partyId:'',partyType:'',productId:'',categoryId:'',accountId:'',warehouse:'',direction:'',debtSide:'',movementType:'',groupBy:'invoice',search:'',expenseCategoryId:'',expenseCategoryKind:'',...filters};
 if(!reportTitles[f.type])throw Error('نوع التقرير غير صالح');
 if(!f.allTime&&(!finiteDate(f.from)||!finiteDate(f.to)||f.from>f.to))throw Error('أدخل فترة صحيحة');
 for(const [key,list]of [['partyId',f.partyType==='employee'?state.employees||[]:state.parties],['productId',state.products],['categoryId',state.categories||[]],['accountId',state.accounts]])if(f[key]&&!list.some(x=>idEqual(x.id,f[key])))throw Error('اختيار التقرير غير موجود');
 if(f.partyType&&!['customer','supplier','employee'].includes(f.partyType))throw Error('نوع الحساب غير صالح');
 if(f.expenseCategoryId&&f.expenseCategoryId!=='__uncategorized'&&!(state.expenseCategories||[]).some(c=>idEqual(c.id,f.expenseCategoryId)))throw Error('فئة المصروف غير موجودة');
 if(f.expenseCategoryKind&&!['recurring','nonrecurring'].includes(f.expenseCategoryKind))throw Error('نوع فئة المصروف غير صالح');
 if(['financial','party-ledger'].includes(f.type)&&['asc','desc'].includes(f.statementOrder)){f.sortKey='description';f.sortDirection=f.statementOrder;}
 if(f.warehouse&&!state.warehouses.includes(f.warehouse))throw Error('المخزن غير موجود');return f;
}
export function reportDataset(state,filters={}){
 const f=normalizeReportFilters(state,filters),all=state.records.filter(effectivePartyRecord),inRange=r=>f.allTime||r.date>=f.from&&r.date<=f.to;
 const productsById=new Map(state.products.map(p=>[p.id,p])),partiesById=new Map(state.parties.map(p=>[p.id,p])),accountsById=new Map(state.accounts.map(a=>[a.id,a]));
 const byProduct=line=>(!f.productId||idEqual(line.product,f.productId))&&(!f.categoryId||idEqual(productsById.get(line.product)?.categoryId,f.categoryId));
 const byContext=r=>(!f.accountId||idEqual(r.account,f.accountId)||idEqual(r.to,f.accountId))&&(!f.partyId||idEqual(r.party,f.partyId)||f.partyType==='employee'&&idEqual(r.employeeId,f.partyId))&&(!f.warehouse||[r.warehouse,r.from,r.toWarehouse].includes(f.warehouse));
 const records=all.filter(r=>inRange(r)&&byContext(r)&&(!f.productId&&!f.categoryId||(r.lines||[]).some(byProduct))).sort((a,b)=>accountingTimestamp(a).localeCompare(accountingTimestamp(b))||a.id-b.id);
 const result={type:f.type,title:reportTitles[f.type],filters:f,currency:currencyCode(state),columns:[],rows:[],metrics:[],records:[],opening:null,closing:null,warnings:[]};
 const metric=(key,label,value,format='money',costKnown=true)=>({key,label,value:value===null||!costKnown?null:n(value),format,costKnown});
 const period=f.allTime?{}:{from:f.from,to:f.to},payroll=payrollFacts(state,{...period,...(f.accountId?{accountId:f.accountId}:{})});
 const facts=['overview','sales','profit','product-sales'].includes(f.type)?saleFacts(state,{records,productPredicate:byProduct}):[],factGroups=new Map();for(const row of facts){const list=factGroups.get(row.documentId)||[];list.push(row);factGroups.set(row.documentId,list)}
 const documentsById=new Map(state.records.flatMap(r=>[[String(r.id),r],...(r.desktopId?[[String(r.desktopId),r]]:[])]));
 const parent=r=>r.parentDocumentId?documentsById.get(String(r.parentDocumentId)):null;
 const costIndex=['overview','stock'].includes(f.type)?currentProductCosts(state):new Map();
 const purchaseLike=r=>r.kind==='purchase'||r.kind==='return'&&parent(r)?.kind==='purchase';
 const saleLike=r=>r.kind==='sale'||r.kind==='return'&&!purchaseLike(r);
 const documentBase=r=>({id:r.id,action:'invoice:'+r.id,number:recordNumber(r),documentReference:recordReference(r),date:r.date,party:partiesById.get(r.party)?.name||r.employeeName||r.title||'',kind:r.kind,total:n(r.total),paid:n(r.paid),due:n(r.due),account:accountsById.get(r.account)?.name||'—',note:statementNote(r),employeeId:r.employeeId});
 const commerceRow=r=>{
  const row=documentBase(r),selected=reportNetLines(r).filter(byProduct),portion=sum(selected,l=>l.lineTotal),sign=r.kind==='return'?-1:1;
  if(saleLike(r)){const summary=profitSummary(factGroups.get(r.id)||[]);Object.assign(row,{total:summary.revenue,cost:summary.costKnown?summary.cost:null,profit:summary.costKnown?summary.profit:null,costKnown:summary.costKnown,unknownRevenue:summary.unknownRevenue});}
  else Object.assign(row,{total:sign*(f.productId||f.categoryId?portion:n(r.total)),cost:null,profit:null,costKnown:true});
  // A product filter selects net revenue after the invoice discount. It never
  // allocates against the undiscounted raw price or changes saved settlement.
  const ratio=f.productId||f.categoryId?(r.total?Math.abs(row.total)/r.total:0):1;row.paid=sign*n(r.paid)*ratio;row.due=sign*n(r.due)*ratio;return row;
 };
 const ordinaryExpenses=records.filter(r=>r.kind==='expense').filter(r=>expenseCategoryMatches(state,r,f)).map(r=>({...documentBase(r),...expenseCategoryForRecord(state,r),costKnown:true}));
 const wageRows=payroll.entries.filter(entry=>(!f.expenseCategoryId||f.expenseCategoryId==='__uncategorized')&&(!f.expenseCategoryKind||f.expenseCategoryKind==='recurring')&&(!f.partyId||idEqual(entry.employeeId,f.partyId))).map(entry=>({...documentBase(entry.record),date:entry.date,kind:entry.kind,party:entry.employeeName,total:entry.total,paid:entry.total,due:0,expenseCategoryId:'',expenseCategoryName:'',expenseCategoryKind:'recurring',costKnown:true,recognizedWage:true}));
 const expenseRows=[...ordinaryExpenses,...wageRows].sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id);
 const partyAccounts=state.parties.filter(p=>!p.archived).map(p=>({id:p.id,action:'ledger:'+p.id,name:p.name,party:p.name,type:p.type,partyType:p.type,phone:p.phone||'',receivable:Math.max(0,partyNetBalance(p)),payable:Math.max(0,-partyNetBalance(p))}));
 const employeeAccounts=payroll.employees.map(e=>({...e,party:e.name,type:'employee',action:'site:feature:employees-ledger:'+e.employeeId}));
 const currentAccounts=[...employeeAccounts,...partyAccounts];
 if(['sales','purchases','expenses','overview','profit'].includes(f.type)){
  const sales=records.filter(saleLike).map(commerceRow),purchases=records.filter(purchaseLike).map(commerceRow),summary=profitSummary(facts),expenses=sum(expenseRows,r=>r.total),net=summary.profit-expenses;
  result.records=f.type==='sales'?records.filter(saleLike):f.type==='purchases'?records.filter(purchaseLike):f.type==='expenses'?expenseRows.map(r=>documentsById.get(String(r.id))).filter(Boolean):f.type==='profit'?records.filter(r=>saleLike(r)||r.kind==='expense'):records.filter(r=>saleLike(r)||purchaseLike(r)||r.kind==='expense');
  result.rows=f.type==='sales'?sales:f.type==='purchases'?purchases:f.type==='expenses'?expenseRows:f.type==='profit'?sales:[...sales,...purchases,...expenseRows].sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id);
  result.costKnown=summary.costKnown;result.unknownRevenue=summary.unknownRevenue;result.payroll=payroll;result.expenseRows=expenseRows;
  result.columns=columns(['number','رقم الفاتورة'],['date','التاريخ'],['party','الطرف / البيان'],['total','الإجمالي','money'],['paid','المدفوع','money'],['due','على الحساب','money']);
  if(f.type==='sales')result.metrics=[metric('sales','المبيعات',summary.revenue),metric('count','عدد العمليات',sales.filter(r=>r.kind==='sale').length,'count'),metric('paid','المدفوع عند البيع',sum(sales,r=>r.paid)),metric('due','الآجل عند البيع',sum(sales,r=>r.due)),metric('customerNet','صافي العملاء',sum(state.parties.filter(p=>p.type==='customer'),p=>p.balance))];
  else if(f.type==='purchases')result.metrics=[metric('purchases','المشتريات',sum(purchases,r=>r.total)),metric('count','عدد العمليات',purchases.filter(r=>r.kind==='purchase').length,'count'),metric('paid','المدفوع عند الشراء',sum(purchases,r=>r.paid)),metric('due','الآجل عند الشراء',sum(purchases,r=>r.due))];
  else if(f.type==='expenses'){
   result.columns=columns(['number','رقم الفاتورة'],['date','التاريخ'],['party','الطرف / البيان'],['expenseCategoryName','فئة المصروف'],['expenseCategoryKind','التصنيف'],['total','الإجمالي','money']);
   result.metrics=[metric('expenses','المصاريف',expenses),metric('recurring','متكررة',sum(expenseRows.filter(r=>r.expenseCategoryKind==='recurring'),r=>r.total)),metric('nonrecurring','غير متكررة',sum(expenseRows.filter(r=>r.expenseCategoryKind==='nonrecurring'),r=>r.total)),metric('count','عدد العمليات',expenseRows.length,'count')];
  }else{
   result.columns=columns(['number','رقم الفاتورة'],['date','التاريخ'],['kind','النوع'],['party','الطرف / البيان'],['total','الإجمالي','money'],['cost','تكلفة البيع','money'],['profit','الربح','money']);
   result.metrics=[metric('sales','المبيعات',summary.revenue),metric('cost','تكلفة البيع',summary.cost,'money',summary.costKnown),metric('grossProfit','الربح الإجمالي',summary.profit,'money',summary.costKnown),metric('expenses','المصاريف',expenses),metric('netProfit','صافي الربح',net,'money',summary.costKnown)];
  }
  if(f.type==='overview'){
   const inventory=state.products.reduce((total,p)=>total+sum(state.warehouses,w=>n(p.stocks?.[w]))*inventoryUnitCost({...p,lastPurchaseCost:costIndex.get(p.id)?.cost}),0);
   result.metrics=[metric('accounts','الأرصدة',sum(state.accounts.filter(a=>!a.archived),a=>a.balance)),metric('inventory','قيمة المخزون',inventory),metric('receivable','لنا',sum(currentAccounts,p=>p.receivable)),metric('payable','علينا',sum(currentAccounts,p=>p.payable)),metric('sales','المبيعات',summary.revenue),metric('purchases','المشتريات',sum(purchases,r=>r.total)),metric('expenses','المصاريف',expenses),metric('netProfit','صافي الربح',net,'money',summary.costKnown),metric('workersExpense','أجور معترف بها',sum(wageRows,r=>r.total)),metric('workersAccrued','استحقاق الأجور',payroll.workersAccrued),metric('workersReserve','تغير احتياطي الأجور',payroll.workersReserveChange),metric('ownerAvailable','ربح المالك المتاح',net-payroll.workersReserveChange,'money',summary.costKnown)];
   result.currentAccounts=state.accounts.filter(a=>!a.archived).map(a=>({id:a.id,name:a.name,balance:a.balance}));result.currentParties=currentAccounts;result.warehouseValues=state.warehouses.map(w=>({name:w,value:sum(state.products,p=>n(p.stocks?.[w])*inventoryUnitCost({...p,lastPurchaseCost:costIndex.get(p.id)?.cost}))}));
  }
  if(['overview','sales','profit'].includes(f.type)&&!summary.costKnown)result.warnings.push(unknownWarning);
 }else if(f.type==='party-ledger'){
  result.columns=columns(['date','التاريخ'],['number','رقم المستند'],['kind','النوع'],['description','البيان'],['change','الحركة','money'],['debit','لنا','money'],['credit','علينا','money'],['balance','الرصيد','money']);
  if(f.partyType==='employee'){
   if(!f.partyId){result.needsParty=true;return result}const ledger=employeeLedger(state,String(f.partyId),period);result.party={id:f.partyId,name:ledger.employee.name,type:'employee'};result.payrollLedgerSummary=ledger.summary;result.opening=ledger.summary.openingBalance;result.closing=ledger.summary.closingBalance;result.rows=[{id:'opening',date:f.allTime?'—':f.from,number:'—',kind:'رصيد البداية',change:0,debit:0,credit:0,balance:result.opening},...ledger.rows.slice().reverse().map(row=>({...row,number:row.documentNumber,kind:row.movementCode,balance:row.runningBalance}))];result.records=ledger.rows.map(row=>state.records.find(r=>r.id===row.id)).filter(Boolean);
  }else{
   const party=state.parties.find(p=>idEqual(p.id,f.partyId));if(!party){result.needsParty=true;return result}result.party=party;
   const history=all.filter(r=>r.party===party.id).sort((a,b)=>accountingTimestamp(a).localeCompare(accountingTimestamp(b))||a.id-b.id),delta=r=>r.kind==='party-opening'?partyOpeningNetDelta(r):partyNetDelta(r);
   let balance=n(state.opening.parties[party.id])*(party.type==='supplier'?-1:1);for(const r of history.filter(r=>!f.allTime&&r.date<f.from))balance+=delta(r);
   result.opening=balance;result.rows.push({id:'opening',date:f.allTime?'—':f.from,number:'—',kind:'رصيد البداية',change:0,debit:0,credit:0,balance});
   for(const r of history.filter(inRange)){const change=delta(r);balance+=change;result.rows.push({...documentBase(r),description:movementStatement(r,String(r.desktop?.title??r.desktop?.partyName??r.title??'')),descriptionCode:r.kind==='receive'?'party-receipt':r.kind==='pay'?'party-payment':'',change,debit:Math.max(0,change),credit:Math.max(0,-change),balance});result.records.push(r)}result.closing=balance;
  }
  result.metrics=[metric('opening','رصيد البداية',result.opening),metric('debit','الحركات لنا',sum(result.rows,r=>r.debit)),metric('credit','الحركات علينا',sum(result.rows,r=>r.credit)),metric('closing','الرصيد النهائي',result.closing)];
  if(f.partyType==='employee')result.metrics.push(metric('workersReserveReleased','احتياطي الأجور المحرر',result.payrollLedgerSummary.workersReserveReleased));
 }else if(f.type==='debts'){
  result.columns=columns(['party','الحساب'],['type','النوع'],['phone','الهاتف'],['receivable','لنا','money'],['payable','علينا','money']);
  result.rows=currentAccounts.filter(p=>(!f.partyId||idEqual(p.id,f.partyId))&&(!f.partyType||p.type===f.partyType)&&matches(p.name+' '+p.phone,f.search)).filter(r=>f.debtSide==='receivable'?r.receivable>0:f.debtSide==='payable'?r.payable>0:f.debtSide==='clear'?r.receivable===0&&r.payable===0:true);
  result.metrics=[metric('receivable','لنا',sum(result.rows,r=>r.receivable)),metric('payable','علينا',sum(result.rows,r=>r.payable)),metric('count','عدد الحسابات',result.rows.length,'count')];
 }else if(f.type==='product-sales'){
  const grouped=new Map();for(const p of state.products.filter(p=>byProduct({product:p.id})))grouped.set(p.id,{id:p.id,action:'product:'+p.id,product:p.name,quantity:0,total:0,cost:0,costKnown:true,unknownRevenue:0,purchases:0,purchasedQuantity:0,currentQuantity:sum(state.warehouses.filter(w=>!state.warehouseMeta?.[w]?.archived),w=>n(p.stocks?.[w]))});
  for(const row of facts){const group=grouped.get(row.productId);if(!group)continue;group.quantity+=row.quantity;group.total+=row.revenue;group.cost+=row.cost;group.costKnown&&=row.costKnown;group.unknownRevenue+=row.unknownRevenue;}
  for(const record of records.filter(purchaseLike))for(const line of reportNetLines(record).filter(byProduct)){const group=grouped.get(line.product);if(!group)continue;const sign=record.kind==='return'?-1:1;group.purchases+=sign*n(line.lineTotal);group.purchasedQuantity+=sign*n(line.qty);}
  result.rows=[...grouped.values()].map(r=>({...r,average:r.quantity?r.total/r.quantity:0,profit:r.costKnown?r.total-r.cost:null,cost:r.costKnown?r.cost:null}));result.records=records.filter(r=>saleLike(r)||purchaseLike(r));
  const known=result.rows.every(r=>r.costKnown);if(!known)result.warnings.push(unknownWarning);
  result.columns=columns(['product','المنتج'],['quantity','الكمية','number'],['currentQuantity','الرصيد الحالي','number'],['average','متوسط السعر','money'],['total','المبيعات','money'],['purchases','المشتريات','money'],['profit','الربح','money']);result.metrics=[metric('quantity','الوحدات المباعة',sum(result.rows,r=>r.quantity),'count'),metric('sales','المبيعات',sum(result.rows,r=>r.total)),metric('purchases','المشتريات',sum(result.rows,r=>r.purchases)),metric('grossProfit','الربح الإجمالي',sum(result.rows,r=>r.profit),'money',known)];
 }else if(f.type==='stock'){
  result.columns=columns(['date','التاريخ'],['product','المنتج'],['warehouse','المخزن'],['kind','النوع'],['number','رقم المستند'],['documentReference','المرجع الأصلي'],['before','قبل','number'],['delta','التغيير','number'],['after','بعد','number']);
  const balances=structuredClone(state.opening.stocks),events=state.stockEvents||[];
  if(events.length){for(const event of events){const record=documentsById.get(String(event.documentId)),product=productsById.get(Number(event.productId)),line={product:product?.id},date=String(event.occurredAt||event.at||record?.date||'').slice(0,10),warehouse=event.warehouseId,delta=stockNumber(event.quantityDelta);if(delta===null)continue;balances[line.product]??={};const before=stockNumber(event.balanceBefore)??n(balances[line.product][warehouse]);const after=stockNumber(event.balanceAfter)??stockBalanceAfter(before,delta);balances[line.product][warehouse]=after;
   if(inRange({date})&&byProduct(line)&&(!f.warehouse||f.warehouse===warehouse)&&(!f.movementType||String(event.type).startsWith(f.movementType)))result.rows.push({id:event.id||result.rows.length,action:record?'invoice:'+record.id:undefined,date,product:product?.name||event.productName||'',warehouse,kind:event.type,number:displayStockMovementDocumentNumber(event,record),documentReference:event.documentNumber||record?.number||'',before,delta,after});}}
  else for(const r of all.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id))for(const l of r.lines||[]){const p=state.products.find(p=>p.id===l.product);let moves=[];if(['sale','purchase'].includes(r.kind))moves=[[r.warehouse,(r.kind==='sale'?-1:1)*l.qty]];else if(r.kind==='stocktransfer')moves=[[r.from,-l.qty],[r.toWarehouse,l.qty]];else if(r.kind==='adjustment')moves=[[l.warehouse||r.warehouse,l.delta]];
   for(const [warehouse,delta]of moves){balances[l.product]??={};const before=n(balances[l.product][warehouse]);balances[l.product][warehouse]=stockBalanceAfter(before,delta);if(inRange(r)&&byProduct(l)&&(!f.warehouse||f.warehouse===warehouse)&&(!f.movementType||f.movementType===r.kind))result.rows.push({id:r.id+'-'+l.product+'-'+warehouse,action:'invoice:'+r.id,date:r.date,product:p?.name||l.name,warehouse,kind:r.openingStock?'رصيد البداية':r.kind,number:recordNumber(r),documentReference:recordReference(r),before,delta,after:balances[l.product][warehouse]});}}
  const products=state.products.filter(p=>byProduct({product:p.id})),quantity=p=>f.warehouse?n(p.stocks[f.warehouse]):sum(Object.values(p.stocks),q=>q),value=p=>quantity(p)*inventoryUnitCost({...p,lastPurchaseCost:costIndex.get(p.id)?.cost});
  result.metrics=[metric('inventory','قيمة المخزون',sum(products,value)),metric('quantity','الوحدات',sum(products,quantity),'count'),metric('count','عدد المنتجات',products.length,'count'),metric('incoming','الداخل',sum(result.rows,r=>Math.max(0,r.delta)),'count'),metric('outgoing','الخارج',sum(result.rows,r=>Math.max(0,-r.delta)),'count')];result.stockBalances=products.map(p=>({id:p.id,action:'explain:audit:product:'+p.id,product:p.name,quantity:quantity(p),value:value(p)}));
 }else if(f.type==='financial'){
  result.columns=columns(['date','التاريخ'],['number','رقم المستند'],['account','الحساب'],['kind','النوع'],['description','البيان'],['incoming','الداخل','money'],['outgoing','الخارج','money'],['balance','الرصيد','money']);const balances={...state.opening.accounts},statementIndex=financialStatementIndex(state);
  for(const r of all.slice().sort((a,b)=>accountingTimestamp(a).localeCompare(accountingTimestamp(b))||a.id-b.id))for(const a of [...new Set([r.account,r.kind==='transfer'?r.to:null])].map(id=>accountsById.get(id)).filter(Boolean)){const delta=r.kind==='employee-payment'?(r.account===a.id?(r.employeePaymentDirection==='deposit'?1:-1)*n(r.total):0):r.kind==='employee-opening'||r.kind==='employee-accrual'||r.kind==='party-opening'?0:moneyAccountDelta(r,a.id);if(!delta)continue;balances[a.id]=n(balances[a.id])+delta;if(!inRange(r)||f.accountId&&!idEqual(a.id,f.accountId)||f.direction==='in'&&delta<0||f.direction==='out'&&delta>0||f.movementType&&r.kind!==f.movementType)continue;result.rows.push({id:r.id+'-'+a.id,action:'invoice:'+r.id,date:r.date,number:recordNumber(r),documentReference:recordReference(r),account:a.name,kind:r.kind,note:statementNote(financialStatementSource(state,r,a.id,statementIndex)),description:movementStatement(financialStatementSource(state,r,a.id,statementIndex)),incoming:Math.max(delta,0),outgoing:Math.max(-delta,0),balance:balances[a.id]});}
  result.metrics=[metric('incoming','الداخل',sum(result.rows,r=>r.incoming)),metric('outgoing','الخارج',sum(result.rows,r=>r.outgoing)),metric('net','الصافي',sum(result.rows,r=>r.incoming-r.outgoing))];
 }
 if(['financial','party-ledger'].includes(f.type)&&f.sortKey==='description'){const opening=result.rows.filter(r=>r.id==='opening'),direction=f.sortDirection==='desc'?-1:1;result.rows=[...opening,...result.rows.filter(r=>r.id!=='opening').sort((a,b)=>String(a.description??'').localeCompare(String(b.description??''),undefined,{numeric:true,sensitivity:'base'})*direction)];}
 result.warnings=[...new Set(result.warnings)];return result;
}
// Localize only semantic fallback codes. A saved statement remains literal user data.
function outputStatement(row,t){const note=statementNote(row);if(note)return note;const code=row.descriptionCode;
 if(code==='employee-opening')return t('رصيد بداية عامل')+' — '+t(row.credit>0?'مستحق للعامل':'مستحق على العامل');
 if(code==='employee-closure')return t('إقفال حساب عامل محذوف');if(code==='party-receipt')return t('استلام من الطرف');if(code==='party-payment')return t('دفع للطرف');
 return code?.startsWith('employee-')?t(row.description??''):row.description??'';
}
export function reportOutputModel(state,data,{language='ar',labels={}}={}){
 const t=v=>translateText(v,language),display=(value,column,row)=>column.key==='description'?outputStatement(row,t):value===null?t('غير مؤكد'):column.format==='money'?Number(value||0).toLocaleString(language==='fr'?'fr-FR':'en-US',{maximumFractionDigits:2})+' '+data.currency:column.key==='kind'?t(labels[value]||value):column.key==='expenseCategoryKind'?t(value==='nonrecurring'?'غير متكررة':'متكررة'):column.key==='type'?t(value==='employee'?'عامل':value==='supplier'?'مورد':'عميل'):column.key==='date'?t(value):value;
 const blocks=[{kind:'heading',text:t(data.title)},{kind:'text',text:data.filters.allTime?t('كل الفترة'):t(data.filters.from)+' — '+t(data.filters.to)}];
 if(data.party)blocks.push({kind:'text',text:data.party.name});
 for(const warning of data.warnings||[])blocks.push({kind:'text',text:t(warning)});
 const selections=[['productId',state.products,'المنتج'],['categoryId',state.categories||[],'الفئة'],['accountId',state.accounts,'وسيلة الدفع'],['expenseCategoryId',state.expenseCategories||[],'فئة المصروف']];for(const [key,list,label]of selections)if(data.filters[key])blocks.push({kind:'text',text:t(label)+': '+list.find(x=>idEqual(x.id,data.filters[key]))?.name});
 blocks.push({kind:'table',rows:[[t('البيان'),t('القيمة')],...data.metrics.map(m=>[t(m.label),m.value===null?t('غير مؤكد'):m.format==='money'?Number(m.value).toLocaleString(language==='fr'?'fr-FR':'en-US',{maximumFractionDigits:2})+' '+data.currency:m.value])]});
 blocks.push({kind:'table',rows:[data.columns.map(c=>t(c.label)+(c.format==='money'?' '+data.currency:'')),...data.rows.map(r=>data.columns.map(c=>display(r[c.key],c,r)))]});
 if(data.stockBalances)blocks.push({kind:'subheading',text:t('الرصيد الحالي')},{kind:'table',rows:[[t('المنتج'),t('الكمية'),t('القيمة')+' '+data.currency],...data.stockBalances.map(r=>[r.product,r.quantity,r.value])]});
 if(data.currentAccounts)blocks.push({kind:'subheading',text:t('الأرصدة الحالية')},{kind:'table',rows:[[t('الحساب'),t('الرصيد')+' '+data.currency],...data.currentAccounts.map(a=>[a.name,a.balance])]},{kind:'subheading',text:t('العملاء والموردون')},{kind:'table',rows:[[t('الحساب'),t('لنا')+' '+data.currency,t('علينا')+' '+data.currency],...data.currentParties.map(p=>[p.name,p.receivable,p.payable])]});
 return {language,dir:language==='fr'?'ltr':'rtl',brand:state.branding||'AlKarna',logo:state.brandInfo?.logo||'',branding:state.brandInfo||{},created:new Date().toLocaleDateString(language==='fr'?'fr-MR':'en-GB'),blocks};
}
export function reportWorkbookData(state,data,options={}){
 const language=options.language||'ar',t=v=>translateText(v,language),label=value=>t(options.labels?.[value]||value);
 const sheets=[{name:t('الملخص'),rows:[[t('البيان'),t('القيمة')],[t('المحل'),state.branding],[t('نوع التقرير'),t(data.title)],[t('العملة'),data.currency],[t('الفترة'),data.filters.allTime?t('كل الفترة'):data.filters.from+' — '+data.filters.to],...(data.party?[[t('الحساب'),data.party.name]]:[]),...(data.warnings||[]).map(w=>[t('ملاحظة'),t(w)]),...data.metrics.map(m=>[t(m.label)+(m.format==='money'?' '+data.currency:''),m.value===null?t('غير مؤكد'):m.value])]},
 {name:t('الحركات'),rows:[data.columns.map(c=>t(c.label)+(c.format==='money'?' '+data.currency:'')),...data.rows.map(row=>data.columns.map(c=>c.key==='description'?outputStatement(row,t):c.key==='kind'?label(row[c.key]):c.key==='expenseCategoryKind'?t(row[c.key]==='nonrecurring'?'غير متكررة':'متكررة'):c.key==='type'?t(row.type==='employee'?'عامل':row.type==='supplier'?'مورد':'عميل'):row[c.key]===null?t('غير مؤكد'):row[c.key]??''))]}];
 if(data.stockBalances)sheets.push({name:t('المخزون'),rows:[[t('المنتج'),t('الكمية'),t('القيمة')+' '+data.currency],...data.stockBalances.map(r=>[r.product,r.quantity,r.value])]});
 if(data.currentAccounts)sheets.push({name:t('الأرصدة'),rows:[[t('الحساب'),t('الرصيد')+' '+data.currency],...data.currentAccounts.map(a=>[a.name,a.balance])]},{name:t('الأطراف'),rows:[[t('الحساب'),t('لنا'),t('علينا')],...data.currentParties.map(p=>[p.name,p.receivable,p.payable])]});
 return sheets;
}
