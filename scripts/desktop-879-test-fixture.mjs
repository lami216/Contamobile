import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {upgradeState} from '../approved-runtime/upgrade-state.js';
import {commandPayroll,materializePayroll,payrollCanonicalDocuments} from '../approved-runtime/payroll-domain.js';
export const commit='8a6cb072c411ee698f3ca5a0f1943be80ccd2955';
export const desktop=process.env.DESKTOP_879_ROOT||process.env.DESKTOP_879_SOURCE||fileURLToPath(new URL('../../Desktop/',import.meta.url));
export const pins={'lib/payroll.ts':'15f53951a2d83a69f2592a9f57a6ec136609836639aa809bc90aaef27583d20d','lib/employee-ledger.ts':'87e0a5599e5ca56cd52e269ae2aa89f43481603dff31bc03e765d70e191d8193','lib/document-read-model.ts':'cc969c581ae2c579227e259eea39f9353eb520f8a9bc181c2d583827bc5ccbe7','app/api/history/route.ts':'5ac60f7dbe7d4eb3e908ec153edd4ab0b4bf24e0caa8a7896476c55e5b4dad77','lib/document-sequences.ts':'fb238d965eb33f82fb4b0670756ff500ac16c066137a0c797a18f3267386f3d5','app/stock-settlement.ts':'f6c51282e1b820de7376bbb204d64cd6d263dbedf3f40a56de5af53aa4087182','app/stock-movement.ts':'7810eafa46f03b4c9fd9eaa5da75c55f5eeeddfefa183be9e349f3f145fb1ea2'};
export async function source(name){const s=(await readFile(path.join(desktop,name),'utf8')).replaceAll('\r\n','\n');assert.equal(createHash('sha256').update(s).digest('hex'),pins[name],'Pinned Desktop879 source changed: '+name);return s;}
export async function reference(name,prefix=''){const s=await source(name),js=stripTypeScriptTypes(s,{mode:'transform'}).replace(/^import .*from ["']\..*;\r?\n/gm,'');const url='data:text/javascript;base64,'+Buffer.from(prefix+js).toString('base64');return {url,module:await import(url)};}
export async function references(){const payroll=await reference('lib/payroll.ts'),movement=await reference('app/stock-movement.ts'),stock=await reference('app/stock-settlement.ts',`const {isOpeningStockDocument}=await import(${JSON.stringify(movement.url)});\n`),numbering=await reference('lib/document-sequences.ts',`const {isStockSettlementDocument,validSettlementSequence}=await import(${JSON.stringify(stock.url)});\n`),ledger=await reference('lib/employee-ledger.ts',`const {displayDocumentNumber}=await import(${JSON.stringify(numbering.url)});const {employeePaymentDirection,employeeOpeningDirection}=await import(${JSON.stringify(payroll.url)});\n`),read=await reference('lib/document-read-model.ts');return {payroll:payroll.module,ledger:ledger.module,read:read.module};}
export const clone=v=>structuredClone(v),at=day=>day+'T12:00:00.000Z';
export function empty(){const s={products:[],parties:[],accounts:[{id:1,code:'cash',name:'نقدي',balance:300,active:true,archived:false}],records:[],warehouses:['المخزن الرئيسي'],warehouse:'المخزن الرئيسي',opening:{accounts:{1:300},parties:{},stocks:{}},users:[],branding:'مؤسسة 879',originId:'native-879-proof'};upgradeState(s);return s;}
export async function fixture(){let state=empty();const actor={id:'owner-test',name:'مالك',role:'owner'};
 const run=async(type,input,day='2026-11-12')=>{const result=await commandPayroll(state,type,input,{actor,now:at(day)});state=result.state;return result;};
 const a=await run('employee.create',{name:'عامل مستحق',phone:'22000001',startDate:'2026-11-10',amount:100,intervalMonths:1,entitlement:'beginning'},'2026-11-01'),aId=a.id;
 await run('employee-opening.post',{employeeId:aId,direction:'payable',amount:500,occurredAt:'2026-11-01',note:'رصيد مستحق سابق'},'2026-11-01');
 await run('employee-payment.post',{employeeId:aId,direction:'withdraw',amount:500,paymentMethod:1,occurredAt:'2026-11-05'},'2026-11-05');
 state=(await materializePayroll(state,{actor,asOf:'2026-11-10',now:at('2026-11-10')})).state;
 await run('employee-payment.post',{employeeId:aId,direction:'withdraw',amount:100,paymentMethod:1,occurredAt:'2026-11-11'},'2026-11-11');
 const b=await run('employee.create',{name:'عامل سلفة',phone:'22000002',startDate:'2026-11-10',amount:600,intervalMonths:1,entitlement:'beginning'},'2026-11-01');
 await run('employee-opening.post',{employeeId:b.id,direction:'receivable',amount:500,occurredAt:'2026-11-01',note:'سلفة سابقة'},'2026-11-01');
 state=(await materializePayroll(state,{actor,asOf:'2026-11-10',now:at('2026-11-10')})).state;
 const c=await run('employee.create',{name:'عامل إثبات مبكر',phone:'22000003',startDate:'2026-11-10',amount:0,intervalMonths:1,entitlement:'beginning'},'2026-11-01');
 const opening=await run('employee-opening.post',{employeeId:c.id,direction:'receivable',amount:100,occurredAt:'2026-11-01',note:'سلفة مثبتة'},'2026-11-01');
 await run('employee-payment.post',{employeeId:c.id,direction:'deposit',amount:100,paymentMethod:1,occurredAt:'2026-11-05'},'2026-11-05');
 await run('employee-opening.update',{documentId:opening.record.id,expectedRevision:0,direction:'receivable',amount:80,occurredAt:'2026-11-01',note:'تصحيح',reason:'تصحيح الرصيد'},'2026-11-11');
 await run('employee-opening.void',{documentId:opening.record.id,expectedRevision:1,reason:'إلغاء الرصيد السابق'},'2026-11-12');
 const collections={products:[],productCategories:[],parties:[],warehouses:[{_id:'warehouse-main',name:'المخزن الرئيسي',isSalesDefault:true}],documents:payrollCanonicalDocuments(state),paymentAccounts:state.accounts.map(row=>({id:String(row.id),code:row.code,name:row.name,balance:row.balance,openingBalance:300,isActive:true,isArchived:false})),financialMovements:clone(state.payrollFinancialMovements),employees:clone(state.employees),expenseCategories:[],auditEvents:clone(state.auditEvents),stockMovements:[],accountTransfers:[],appSettings:[],counters:[],importMappings:[],recurringExpenses:[],users:[]};
 return {state,raw:JSON.parse(JSON.stringify({format:'conta-backup',schemaVersion:1,encoding:'json-v2',createdAt:at('2026-11-12'),appVersion:'0.1.25',build:{number:879,commit},collections}))};
}
