import {statementNote} from './movement-statement.js';
import {reportDataset,reportOutputModel,reportWorkbookData,reportTitles} from './report-data.js';
import {canReadRecord,canReadReportSource} from './business-identity.js';
import {currencyCode} from './upgrade-state.js';
import {reportPdf,reportModel,invoicePdfModel} from './report-output.js';
import {recordExportData,recordWorkbook} from './record-export.js';
import {appLanguage,formatNumber,translateText} from './i18n.js';

export function installReportFeatures(api){
 const scoped={},original=reports;let openedMetric=null,linkedReportIds=new Set(),linkedActor=null,linkedView=null,linkedModal=null;
 const resetLinks=()=>{linkedReportIds=new Set();linkedActor=api.actor?.id;linkedView=view;linkedModal=modal};
 const reportAction=row=>{if(!String(row.action||'').startsWith('invoice:'))return row.action;const id=Number(row.action.split(':')[1]),record=S.records.find(r=>r.id===id);if(!canReadReportSource(S,record,api.can))return undefined;linkedReportIds.add(id);return 'site:feature:report-document:'+id};
 const periodFilter=()=>({allTime:period==='all',from:period==='today'?api.today():dateFrom,to:period==='today'?api.today():dateTo});
 const filters=()=>{const f={...scoped[reportType]};for(const [key,list]of [['categoryId',S.categories||[]],['productId',S.products],['partyId',S.parties],['accountId',S.accounts]])if(f[key]&&!(key==='partyId'&&f.partyType==='employee'?(S.employees||[]).filter(e=>e.isDeleted!==true||String(e.id)===String(f.partyId)):list).some(x=>String(x.id)===String(f[key])))f[key]='';return {...f,...periodFilter(),type:reportType}};
 const dataset=()=>reportDataset(S,filters());
 const active=()=>Object.values(scoped[reportType]||{}).some(v=>v!==''&&v!==null&&v!==false);
 function table(data,sourceRows=data.rows){
  const keys=data.currentStock?['product','quantity','value']:data.trace?['date','party','contribution']:data.type==='party-ledger'?['date','number','change','balance']:data.type==='stock'?['product','kind','number','delta','after']:data.type==='financial'?['account','date','incoming','outgoing','balance']:data.type==='product-sales'?['product','quantity','total','profit']:data.type==='debts'?['party','receivable','payable']:['date','party','total','due'];
  const cols=keys.map(k=>data.columns.find(c=>c.key===k)).filter(Boolean),cell=(row,c)=>row[c.key]===null?esc(translateText('غير مؤكد')):c.format==='money'?money(row[c.key],'xs',row[c.key]<0?'negative':''):c.key==='kind'?esc(documentLabels[row[c.key]]||row[c.key]):esc(row[c.key]??'—');
  return reportSourceTable31(data.title,cols.map(c=>c.label),sourceRows,row=>({action:reportAction(row),cells:cols.map(c=>cell(row,c)+(c.key==='number'&&row.kind?`<small>${esc(documentLabels[row.kind]||row.kind)}</small>`:'')+((data.type==='financial'&&c.key==='account'||data.type==='party-ledger'&&c.key==='number')&&statementNote(row)?`<small data-movement-statement data-user-content dir="auto" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere">${esc(statementNote(row))}</small>`:''))})).replace('report-source-table','report-source-table feature-report-table');
 }
 const originalSourceInfo=sourceInfo;
 sourceInfo=function(key){
  const kind=String(key).replace(/^audit:/,'').split(':')[0];if(!['profit','netprofit','cost','expenses'].includes(kind))return originalSourceInfo(key);
  resetLinks();const data=reportDataset(S,{...(view==='reports'?filters():periodFilter()),type:'overview'}),saleRows=data.rows.filter(r=>r.kind==='sale'||r.kind==='return'),expenseRows=data.expenseRows||[];
  const known=data.costKnown!==false,total=rows=>rows.reduce((sum,row)=>sum+Number(row||0),0),gross=known?total(saleRows.map(r=>r.profit)):null,cost=known?total(saleRows.map(r=>r.cost)):null,expenses=total(expenseRows.map(r=>r.total));
  const title={profit:'الربح الإجمالي',netprofit:'صافي الربح',cost:'تكلفة البيع',expenses:'المصاريف'}[kind],value=kind==='expenses'?expenses:kind==='cost'?cost:kind==='profit'?gross:gross===null?null:gross-expenses;
  const formula=kind==='netprofit'?'صافي الربح = المبيعات − تكلفة البيع − المصاريف.':kind==='profit'?'الربح الإجمالي = المبيعات − تكلفة البيع.':kind==='cost'?'تكلفة البيع من التكلفة المحفوظة أو المصدر التاريخي المثبت، ولا تؤخذ من سعر البطاقة الحالي.':'المصاريف تشمل الأجر المعترف به وتستبعد السلف غير المستحقة وإيداعات العامل.';
  const selected=kind==='expenses'?expenseRows:kind==='netprofit'?[...saleRows,...expenseRows]:saleRows;
  const trace={...data,trace:true,columns:[{key:'date',label:'التاريخ'},{key:'party',label:'الطرف / البيان'},{key:'contribution',label:'القيمة',format:'money'}],rows:selected.map(row=>({...row,contribution:kind==='expenses'?row.total:kind==='cost'?row.cost:row.kind==='expense'||row.recognizedWage?-row.total:row.profit}))};
  return `<h3>${esc(title)}</h3><p class="report-context-note">${esc(formula)}</p>${(kind==='expenses'?[]:data.warnings).map(w=>`<p class="notice">${esc(w)}</p>`).join('')}<div class="report-trace-total">${value===null?esc(translateText('غير مؤكد')):money(value,'sm')}</div>${table(trace)}`;
 };
 const filterButton=()=>`<button class="feature-filter-button" type="button" data-action="site:feature:report-filters">${icon('settings')}تصفية التقرير${active()?'<span class="dot"></span>':''}</button>`;
 reports=function(){
  resetLinks();const data=dataset();return `${(data.warnings||[]).map(w=>`<p class="notice">${esc(w)}</p>`).join('')}<div class="browse-toolbar">${browseButton('report',browseReports[reportType],'نوع التقرير')}${browseButton('period',browsePeriod(),'الفترة')}${filterButton()}</div>${data.party?`<div class="feature-scope"><strong data-user-content>${esc(data.party.name)}</strong><small>${period==='all'?'كل الفترة':esc(filters().from+' — '+filters().to)}</small></div>`:''}${data.needsParty?`<div class="empty"><h3>اختر الحساب</h3><p>اختر عميلًا أو موردًا لعرض كشف حسابه.</p><button class="primary" data-action="site:feature:report-filters">اختيار الحساب</button></div>`:`${section('ملخص الفترة')}<div class="metric-grid report-metrics-31">${data.metrics.map((m,i)=>`<button class="metric-card inline-metric" data-action="site:feature:report-metric:${i}"><strong>${esc(m.label)}</strong>${m.value===null?'<b class="metric-count">'+esc(translateText('غير مؤكد'))+'</b>':m.format==='money'?money(m.value,'sm'): `<b class="metric-count">${formatNumber(m.value)}</b>`}</button>`).join('')}</div>${section('تفاصيل التقرير')}${table(data)}`}`;
 };
 function fields(){
  const f=filters(),opt=(name,list,value,placeholder)=>field(name,`<select name="${value}"><option value="">${placeholder}</option>${list.map(x=>`<option value="${x.id}" ${String(x.id)===String(f[value])?'selected':''}>${esc(x.name)}</option>`).join('')}</select>`);
  let html='';if(['sales','purchases','product-sales','stock','profit'].includes(reportType)){html+=opt('الفئة',S.categories||[],'categoryId','كل الفئات');html+=opt('المنتج',S.products.filter(p=>!f.categoryId||p.categoryId===Number(f.categoryId)),'productId','كل المنتجات');}
  if(['sales','purchases','expenses','financial'].includes(reportType))html+=opt('وسيلة الدفع',S.accounts,'accountId','كل وسائل الدفع');
  if(['stock','sales','purchases'].includes(reportType))html+=field('المخزن',`<select name="warehouse"><option value="">كل المخازن</option>${S.warehouses.map(w=>`<option ${w===f.warehouse?'selected':''}>${esc(w)}</option>`).join('')}</select>`);
  if(reportType==='expenses'){html+=opt('فئة المصروف',[{id:'__uncategorized',name:'دون فئة'},...(S.expenseCategories||[])],'expenseCategoryId','كل الفئات');html+=field('التصنيف',`<select name="expenseCategoryKind">${[['','الكل'],['recurring','متكررة'],['nonrecurring','غير متكررة']].map(([v,t])=>`<option value="${v}" ${f.expenseCategoryKind===v?'selected':''}>${t}</option>`).join('')}</select>`);}
  if(['party-ledger','debts'].includes(reportType)){
   html+=field('نوع الحساب',`<select name="partyType" data-feature-change="report-party-type"><option value="customer" ${(!f.partyType||f.partyType==='customer')?'selected':''}>عميل</option><option value="supplier" ${f.partyType==='supplier'?'selected':''}>مورد</option><option value="employee" ${f.partyType==='employee'?'selected':''}>عامل</option>${reportType==='debts'?`<option value="" ${f.partyType===''?'selected':''}>الكل</option>`:''}</select>`);
   html+=opt('الحساب',f.partyType==='employee'?(S.employees||[]).filter(e=>e.isDeleted!==true||String(e.id)===String(f.partyId)):S.parties.filter(p=>!f.partyType||p.type===f.partyType),'partyId','اختر الحساب');
  }
  if(['financial','party-ledger'].includes(reportType))html+=field('ترتيب البيان',`<select name="statementOrder"><option value="">الترتيب الزمني</option><option value="asc" ${f.statementOrder==='asc'?'selected':''}>البيان تصاعديًا</option><option value="desc" ${f.statementOrder==='desc'?'selected':''}>البيان تنازليًا</option></select>`);
  if(reportType==='financial')html+=field('الاتجاه',`<select name="direction"><option value="">داخل وخارج</option><option value="in" ${f.direction==='in'?'selected':''}>داخل</option><option value="out" ${f.direction==='out'?'selected':''}>خارج</option></select>`);
  if(reportType==='debts')html+=field('الرصيد',`<select name="debtSide">${[['','الكل'],['receivable','لنا عليه'],['payable','له علينا'],['clear','حساب خالص']].map(([v,t])=>`<option value="${v}" ${f.debtSide===v?'selected':''}>${t}</option>`).join('')}</select>`)+field('بحث بالاسم أو الهاتف',input('search','text',f.search||''));
  if(reportType==='stock')html+=field('نوع الحركة',`<select name="movementType">${[['','كل الحركات'],['sale','المبيعات'],['purchase','المشتريات'],['stocktransfer','تحويل مخزون'],['adjustment','تصحيح مخزون']].map(([v,t])=>`<option value="${v}" ${f.movementType===v?'selected':''}>${t}</option>`).join('')}</select>`);
  return html||'<p class="notice">الفترة تحدد النتائج المعروضة والمصدرة.</p>';
 }
 async function output(format,individual=false){
  const language=appLanguage(),options={language,labels:documentLabels};let model,sheets,name;
  if(individual){const r=S.records.find(r=>r.id===selected);if(!r)throw Error('المستند غير موجود');if(!canReadRecord(S,r,api.can)&&!api.isReportSource?.(r))throw Error('غير متاح بصلاحيات حسابك');model=invoicePdfModel(S,r,documentLabels,{language});sheets=recordExportData(S,[r],documentLabels,{language});name='alkarna-'+r.kind+'-'+r.id;model.logo=S.brandInfo?.logo||'';model.branding=S.brandInfo||{};}
  else if(view==='reports'){
   const data=dataset();if(data.needsParty)throw Error('اختر الحساب');model=reportOutputModel(S,data,options);sheets=reportWorkbookData(S,data,options);name='alkarna-'+reportType+'-'+api.today();
  }else{const rows=api.exportRecords();if(!rows.length)throw Error('لا توجد مستندات ضمن الفلاتر المختارة');model=reportModel(S,rows,documentLabels,api.exportScope(),{language});sheets=recordExportData(S,rows,documentLabels,{language});name='alkarna-records-'+api.today();}
  if(format==='pdf')await api.offerExport(name+'.pdf',await reportPdf(model));else await api.offerExport(name+'.xlsx',recordWorkbook(sheets,{language}));
 }
 return {
  filters,dataset,output,
  sheet(){if(modal==='feature-report-filters')return api.modalMarkup('تصفية التقرير',`<div class="feature-fields">${fields()}</div><button type="button" class="feature-reset" data-action="site:feature:report-reset">إزالة الفلاتر</button>`,'site:feature:report-apply','عرض التقرير','feature-sheet');
   if(modal==='feature-report-metric'){resetLinks();const d=dataset(),m=d.metrics[openedMetric];
    let formula='',trace=d;
    const key=m.key,definition={sales:['sale','total'],cost:['sale','cost'],grossProfit:['sale','profit'],purchases:['purchase','total'],expenses:['expense','total']};
    const baseRows=d.rows||[],isExpense=r=>r.kind==='expense'||r.recognizedWage;
    const rowContribution=(rows,get)=>rows.map(row=>({...row,contribution:get(row)}));
    const traceRows=(rows)=>({...d,trace:true,columns:[{key:'date',label:'التاريخ'},{key:'party',label:'الطرف / البيان'},{key:'contribution',label:'القيمة',format:'money'}],rows});
    if(key==='workersReserveReleased'&&d.type==='party-ledger'){formula='تحرير الاحتياطي عند إقفال حساب العامل لا ينشئ حركة نقدية.';trace=traceRows(d.records.filter(r=>r.kind==='employee-closure').map(r=>({id:r.id,date:r.date,party:r.employeeName||r.title,action:'invoice:'+r.id,contribution:r.salaryReserveReleased})));}
    else if(['inventory','quantity','count'].includes(key)&&d.type==='stock'){formula='قيمة المخزون = الرصيد الحالي لكل منتج × تكلفته الحالية.';trace={...d,currentStock:true,columns:[{key:'product',label:'المنتج'},{key:'quantity',label:'الرصيد الحالي',format:'number'},{key:'value',label:'القيمة',format:'money'}],rows:d.stockBalances};}
    else if(d.type==='stock'&&['incoming','outgoing'].includes(key))trace={...d,rows:d.rows.filter(r=>key==='incoming'?r.delta>0:r.delta<0)};
    else if(['accounts','receivable','payable'].includes(key)&&d.type==='overview'){const rows=key==='accounts'?d.currentAccounts:d.currentParties;trace=traceRows(rows.map(r=>({id:r.id,date:'—',party:r.name,action:r.action,contribution:key==='accounts'?r.balance:r[key]})));}
    else if(key==='inventory'&&d.type==='overview'){trace=traceRows((d.warehouseValues||[]).map(r=>({date:'—',party:r.name,contribution:r.value})));}
    else if(['workersExpense','workersAccrued','workersReserve'].includes(key)){const alias={workersExpense:'paidPeriod',workersAccrued:'accrualPeriod',workersReserve:'reserveChange'};trace=traceRows(key==='workersExpense'?rowContribution(d.expenseRows.filter(r=>r.recognizedWage),r=>r.total):(d.payroll?.rows||[]).map(r=>({date:'—',party:r.name,action:'site:feature:employees-ledger:'+r.employeeId,contribution:r[alias[key]]})));formula=key==='workersReserve'?'تغير احتياطي الأجور = الاستحقاق − الأجر المعترف به − الاحتياطي المحرر عند الإقفال.':'تحتسب الأجور من الاستحقاقات وصافي السحب دون اعتبار السلف مصروفًا قبل استحقاقها.';}
    else if(['netProfit','ownerAvailable'].includes(key)){
     formula=key==='ownerAvailable'?'ربح المالك المتاح = صافي الربح − تغير احتياطي الأجور.':'صافي الربح = المبيعات − تكلفة البيع − المصاريف.';
     let rows=rowContribution(baseRows.filter(r=>r.kind==='sale'||r.kind==='return'||isExpense(r)),r=>isExpense(r)?-r.total:r.profit);
     if(key==='ownerAvailable')rows.push(...(d.payroll?.rows||[]).map(r=>({date:'—',party:r.name,action:'site:feature:employees-ledger:'+r.employeeId,contribution:-r.reserveChange})));
     trace=traceRows(rows);
    }else if(definition[key]){const [kind,column]=definition[key];formula=key==='grossProfit'?'الربح الإجمالي = المبيعات − تكلفة البيع.':'مجموع الحركات المطابقة للفلاتر.';trace=traceRows(rowContribution(baseRows.filter(r=>kind==='expense'?isExpense(r):r.kind===kind||r.kind==='return'),r=>r[column]));}
    else if(['recurring','nonrecurring'].includes(key))trace={...d,rows:d.rows.filter(r=>r.expenseCategoryKind===key)};
    else if(key==='paid'||key==='due')trace=traceRows(rowContribution(baseRows,r=>r[key]));
    return api.modalMarkup(m.label,`<p class="notice">${esc(d.title)} · ${d.party?esc(d.party.name):period==='all'?'كل الفترة':esc(filters().from+' — '+filters().to)}</p>${formula?`<p class="report-context-note">${formula}</p>`:''}<div class="report-trace-total">${m.value===null?'<b class="metric-count">'+esc(translateText('غير مؤكد'))+'</b>':m.format==='money'?money(m.value,'sm'):formatNumber(m.value)}</div>${table(trace)}`,'','حفظ','feature-sheet');}
   if(modal==='feature-document-output')return api.modalMarkup('تصدير الفاتورة','<div class="export-output-options"><button data-action="site:feature:document-pdf"><span class="output-file-badge pdf">PDF</span><span><strong>ملف PDF</strong><small>تنزيل الفاتورة كاملة</small></span></button><button data-action="site:feature:document-excel"><span class="output-file-badge excel">XLSX</span><span><strong>ملف إكسل</strong><small>البيانات وبنود الفاتورة</small></span></button></div>');
   return null;},
  async action(command,id){
   if(command==='report-document'){const record=S.records.find(r=>r.id===Number(id));if(linkedActor!==api.actor?.id||linkedView!==view||linkedModal!==modal||!linkedReportIds.has(Number(id))||!canReadReportSource(S,record,api.can))throw Error('غير متاح بصلاحيات حسابك');resetLinks();return api.openReportDocument(Number(id))}
   if(command==='report-filters'){modal='feature-report-filters';return render()}
   if(command==='report-reset'){scoped[reportType]={};modal=null;return render()}
   if(command==='report-party-type'){scoped[reportType]={...scoped[reportType],...api.form(),partyType:id,partyId:''};return render()}
   if(command==='report-apply'){const next={...api.form()};reportDataset(S,{...next,...periodFilter(),type:reportType});scoped[reportType]=next;modal=null;return render()}
   if(command==='report-metric'){openedMetric=Number(id);if(dataset().metrics[openedMetric]?.key==='customerNet'){sourceKey='audit:customer-net';modal='sourceinfo';return render()}modal='feature-report-metric';return render()}
   if(command==='employee-statement'){if(!api.can('employees.view')||!api.can('reports.view'))throw Error('غير متاح بصلاحيات حسابك');const p=(S.employees||[]).find(p=>p.id===id);if(!p)throw Error('العامل غير موجود');reportType='party-ledger';scoped[reportType]={partyId:p.id,partyType:'employee'};go('reports');return}
   if(command==='party-statement'){if(!api.can('reports.view'))throw Error('غير متاح بصلاحيات حسابك');const p=S.parties.find(p=>p.id===Number(id));if(!p)throw Error('الحساب غير موجود');reportType='party-ledger';scoped[reportType]={partyId:p.id,partyType:p.type};go('reports');return}
   if(command==='document-output'){modal='feature-document-output';return render()}
   if(command==='document-pdf')return output('pdf',true);if(command==='document-excel')return output('excel',true);
  },
  handles:command=>/^(report-|party-statement|employee-statement|document-)/.test(command),
  permission(command,id){if(command.startsWith('document-')){const r=S.records.find(r=>r.id===selected);if(api.isReportSource?.(r))return 'reports.view';return r?.kind==='sale'?'pos.view':r?.kind==='purchase'?'purchases.view':'records.view';}if(command==='employee-statement')return 'employees.view';if(command==='party-statement'){const p=S.parties.find(p=>p.id===Number(id));return p?.type==='supplier'?'suppliers.view':'customers.view';}return 'reports.view';}
 };
}
