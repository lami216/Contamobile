import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {upgradeState} from '../approved-runtime/upgrade-state.js';
import {commandPayroll,materializePayroll} from '../approved-runtime/payroll-domain.js';
import {partyOpeningCommand} from '../approved-runtime/party-opening-domain.js';
import {expenseCategoryCommand} from '../approved-runtime/expense-category-domain.js';

export const reference=process.env.DESKTOP_LATEST_ROOT||fileURLToPath(new URL('../../Desktop/',import.meta.url));
const {mobileBackupV23}=await import(pathToFileURL(path.join(reference,'tests/fixtures/mobile-backup-v23.mjs')));
export const exportedAt='2026-11-23T12:00:00.000Z';
export function ordinaryMobileState(){const fixture=mobileBackupV23();upgradeState(fixture.state);return fixture.state;}
export async function currentMobileBusinessFixture(){
 let state=ordinaryMobileState();
 // The current phone accepts signed bank balances and exact non-cent invoices.
 const bank=state.accounts.find(a=>a.id===2);bank.balance-=220;bank.openingBalance-=220;state.opening.accounts[2]-=220;
 const sale=state.records.find(r=>r.id===117);sale.lines[0].price=12.345;sale.lines[0].lineTotal=12.345;sale.lines[0].lineTotalMode='exact';sale.total=sale.paid=12.345;sale.profit=7.345;state.accounts[0].balance+=0.345;
 const category=expenseCategoryCommand(state,{type:'expense-category.create',name:'نقل / Transport',kind:'nonrecurring'},{actor:{id:'owner',role:'owner'},id:'expense-category-fixture',now:exportedAt});state=category.state;state.records.find(r=>r.kind==='expense').expenseCategoryId=category.result;state.records.find(r=>r.kind==='expense').expenseCategoryName='نقل / Transport';
 state.records.unshift({id:118,kind:'return',number:'RETURN-118',date:'2026-11-18',time:'10:15',occurredAt:'2026-11-18T10:15:00.000Z',status:'posted',revision:0,total:3.08625,paid:3.08625,due:0,account:1,party:null,warehouse:'الرئيسي',parentDocumentId:'117',returnParentKind:'sale',lines:[{id:'return-line-fixture',product:2,name:'رصيد تجريبي',qty:0.25,price:12.345,lineTotal:3.08625,lineTotalMode:'desktop-legacy',costAtSale:5}],note:'مرتجع محفوظ\nRetour littéral'});
 state.accounts[0].balance-=3.08625;state.products.find(p=>p.id===2).stocks['الرئيسي']+=0.25;state.products.find(p=>p.id===2).qty+=0.25;
 state.stockEvents.push({id:'return-event-fixture',productId:'2',warehouseId:'الرئيسي',documentId:'118',documentNumber:'RETURN-118',quantityDelta:0.25,type:'return',occurredAt:'2026-11-18T10:15:00.000Z'});
 const actor={id:'owner',name:'Owner',role:'owner'},options={actor,now:'2026-11-19T12:00:00.000Z'};
 state=(await commandPayroll(state,'employee.create',{name:'عامل / Employé',phone:'22001122',startDate:'2026-11-01',amount:100,intervalMonths:1,entitlement:'beginning'},options)).state;
 state=(await materializePayroll(state,{asOf:'2026-11-19',now:options.now})).state;
 state=(await commandPayroll(state,'employee-payment.post',{employeeId:state.employees[0].id,amount:20,direction:'withdraw',occurredAt:'2026-11-19',paymentMethod:1,note:'صرف العامل\nSalaire'},options)).state;
 state=partyOpeningCommand(state,{type:'party-opening.post',partyId:1,direction:'receivable',amount:15,note:'أصل رصيد البداية\nOuverture'},{actor,now:options.now}).state;
 // Non-business state must not cross the interchange boundary.
 state.users=[{id:'owner',username:'secret-username',password:{hash:'NEVER-EXPORT-AUTH'}}];state.cloudBackup={token:'NEVER-EXPORT-CLOUD'};state.activation={token:'NEVER-EXPORT-LICENSE'};
 return state;
}
