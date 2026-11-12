import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {identifierKind,loginInput,assertOfflineScope,accessReason} from '../approved-runtime/platform/shared/android-access.mjs';
import {emptyState,makeCommand,domainApply,commandHash,canonical} from '../approved-runtime/platform/shared/accounting-domain.mjs';
import {OnlineDatabase} from '../approved-runtime/online-database.mjs';
import {installOnlineEncoder} from '../approved-runtime/online-command-encoder.mjs';
const clone=value=>structuredClone(value);
const context=()=>({organization:{id:'org-test',name:'مؤسسة مصطنعة'},member:{id:'member-test',name:'موظف اختبار',username:'employee@example.invalid',role:'org-admin',capabilities:['*'],branchIds:['branch-test'],membershipVersion:1},branches:[{id:'branch-test',name:'الفرع',originId:'origin-test'}]});
function fixture(){
 const c=context(),scope={organizationId:c.organization.id,branchId:'branch-test',originId:'origin-test'};
 let state=emptyState(scope),cursor=0,pending=null,completed=null,failWrite=false,failRead=false,receiptStatus='accepted',receiptCode='VERSION_CONFLICT',badHash=false,granted=true,dropResponse=false,ackFails=false,dropAckResponse=false,resultEpoch=1,statusCount=null;const pushes=[],acks=[],committed=new Map();
 const transport=async(command,input)=>{
  if(command==='online-status')return {...clone(c),connected:true,member:{...c.member,...(!granted?{role:'sales',capabilities:[]}:{})}};
  if(command==='online-pending')return completed?{pending:true,operation:'sync.push',payload:clone(completed.payload),completed:true,result:clone(completed.result)}:pending?{pending:true,operation:'sync.push',payload:clone(pending)}:{pending:false};
  if(command==='online-ack'){acks.push(clone(input));if(ackFails)throw Object.assign(Error('NETWORK'),{code:'NETWORK'});assert.deepEqual(input.operationIds,completed?.payload.commands.map(c=>c.operationId));completed=null;if(dropAckResponse)throw Object.assign(Error('NETWORK'),{code:'NETWORK'});return {acknowledged:true};}
  assert.equal(command,'online-call');const {operation,payload}=input;
  if(operation==='online.bootstrap'){if(failRead)throw Object.assign(Error('NETWORK'),{code:'NETWORK'});return {mode:'online',organizationId:scope.organizationId,branchId:scope.branchId,epoch:resultEpoch,cursor,state:clone(state)};}
  if(operation==='sync.status')return {epoch:resultEpoch,cursor,needsSettlement:statusCount??(receiptStatus==='accepted'?0:1)};
  if(completed){assert.equal(canonical(payload),canonical(completed.payload));return clone(completed.result);}
  assert.equal(operation,'sync.push');pushes.push(clone(payload));pending=clone(payload);
  if(failWrite)throw Object.assign(Error('NETWORK'),{code:'NETWORK'});
  const receipts=payload.commands.map(command=>{
   if(receiptStatus==='accepted'&&!committed.has(command.operationId)){state=domainApply(state,command,{...scope,memberId:c.member.id,role:'org-admin',capabilities:['*'],branchIds:['branch-test'],epoch:1}).state;cursor++;committed.set(command.operationId,commandHash(command));}
   return {operationId:command.operationId,hash:badHash?'0'.repeat(64):commandHash(command),status:receiptStatus,...(receiptStatus!=='accepted'?{error:{code:receiptCode}}:{})};
  });const result={epoch:resultEpoch,cursor,receipts};if(!badHash){completed={payload:clone(payload),result:clone(result)};pending=null;}if(dropResponse)throw Object.assign(Error('NETWORK'),{code:'NETWORK'});return result;
 };
 const db=new OnlineDatabase(c,transport);
 const command=()=>makeCommand('settings.update',{fields:{branding:'اسم جديد'}},{...scope,epoch:1,memberId:c.member.id,operationId:crypto.randomUUID()});
 return {db,c,transport,pushes,acks,command,getState:()=>clone(state),setFailWrite:v=>failWrite=v,setFailRead:v=>failRead=v,setReceipt:v=>receiptStatus=v,setBadHash:v=>badHash=v,setGrant:v=>granted=v,setDropResponse:v=>dropResponse=v,setAckFailure:v=>ackFails=v,setDropAck:v=>dropAckResponse=v,setEpoch:v=>resultEpoch=v,setReceiptCode:v=>receiptCode=v,setSettlementCount:v=>statusCount=v,losePending:()=>{pending=null;completed=null;}};
}
test('phone/email classifier normalizes case and Arabic digits without widening number rules',()=>{
 assert.deepEqual(identifierKind(' ٣٢١٢٣٤٥٦ '),{mode:'offline',identifier:'32123456'});
 assert.deepEqual(identifierKind(' Staff@Example.Invalid '),{mode:'online',identifier:'staff@example.invalid'});
 for(const value of ['12345678','52345678','2345678','234567890','2345 6789','a@b','x'])assert.throws(()=>identifierKind(value),/INVALID_IDENTIFIER/);
});
test('disclosure consent and mode-specific secret lengths are required',()=>{
 assert.throws(()=>loginInput('23456789','123456',false),/CONSENT_REQUIRED/);
 assert.throws(()=>loginInput('test@example.invalid','123456',true),/ONLINE_CODE_LENGTH/);
 assert.throws(()=>loginInput('23456789','12345',true),/OFFLINE_CODE_LENGTH/);
 assert.equal(loginInput('23456789','123456',true).consent,true);
});
test('offline binding never adopts a first/other owner or another shop',()=>{
 const binding={phone:'23456789',localOwnerId:'owner-b',localShopId:'shop-b',ownerName:'المالك',shopName:'المحل'};
 const users=[{id:'owner-a',role:'owner',active:true,password:{hash:'keep'}}];
 assert.throws(()=>assertOfflineScope(binding,{originId:'shop-b'},users),/OFFLINE_SCOPE_MISMATCH/);
 assert.throws(()=>assertOfflineScope(binding,{originId:'other'},[{...users[0],id:'owner-b'}]),/OFFLINE_SCOPE_MISMATCH/);
 const owner={...users[0],id:'owner-b'};assert.equal(assertOfflineScope(binding,{originId:'shop-b'},[owner]).owner,owner);
 assert.throws(()=>assertOfflineScope(binding,null,[],null),/OFFLINE_SETUP_CREDENTIAL_REQUIRED/);
 assert.equal(assertOfflineScope(binding,null,[],{phone:binding.phone,code:'123456'}).fresh,true);
});
test('existing-phone linking error explains the authenticated owner path in both languages',()=>{
 assert.match(accessReason({code:'OFFLINE_LOCAL_SCOPE_REQUIRED'}),/حساب المالك/);
 assert.match(accessReason({code:'OFFLINE_LOCAL_SCOPE_REQUIRED'},'fr'),/propriétaire/);
});
test('online bootstrap uses RAM and rejects local replacement/user writes',async()=>{
 const f=fixture();await f.db.open();assert.equal((await f.db.load()).originId,'origin-test');
 await assert.rejects(f.db.replace({},[]),/ONLINE_LOCAL_OPERATION_DISABLED/);
 await assert.rejects(f.db.put('users',{}),/ONLINE_LOCAL_OPERATION_DISABLED/);
 await assert.rejects(f.db.save(await f.db.load(),null,[{id:'other'}]),/ONLINE_LOCAL_OPERATION_DISABLED/);
 assert.equal(f.pushes.length,0);
});
test('cross-tenant bootstrap cannot enter RAM',async()=>{
 const f=fixture(),db=new OnlineDatabase(f.c,async(cmd,p)=>{const r=await f.transport(cmd,p);return cmd==='online-call'&&p.operation==='online.bootstrap'?{...r,organizationId:'other'}:r;});
 await assert.rejects(db.open(),/ONLINE_BOOTSTRAP_INVALID/);assert.equal(db.cachedState,null);assert.equal(db.connected,false);
});
test('success requires the matching authoritative command receipt',async()=>{
 const f=fixture();await f.db.open();const c=f.command();f.db.prepareSave=async()=>({command:c});await f.db.save(await f.db.load());
 assert.equal(f.db.revision,1);assert.equal(f.db.cachedState.branding,'اسم جديد');assert.equal(f.pushes.length,1);assert.equal(f.db.pending,false);
});
test('accepted commit remains success when the following read fails',async()=>{
 const f=fixture();await f.db.open();f.db.prepareSave=async()=>({command:f.command()});let rejected=0;f.db.onSaveFailure=()=>rejected++;f.setFailRead(true);
 await f.db.save(await f.db.load());assert.equal(f.db.revision,1);assert.equal(rejected,0);assert.equal(f.db.pending,false);assert.equal(f.db.connected,false);assert.equal(f.getState().branding,'اسم جديد');
});
test('lost response blocks new UUIDs and explicit recovery reuses the original payload',async()=>{
 const f=fixture();await f.db.open();const c=f.command();f.db.prepareSave=async()=>({command:c});f.setFailWrite(true);
 await assert.rejects(f.db.save(await f.db.load()),/NETWORK/);assert.equal(f.db.pending,true);
 await assert.rejects(f.db.save(await f.db.load()),/ONLINE_RESULT_UNCERTAIN/);assert.equal(f.pushes.length,1);
 f.setFailWrite(false);await f.db.resolvePending();assert.equal(canonical(f.pushes[0]),canonical(f.pushes[1]));assert.equal(f.db.revision,1);assert.equal(f.db.pending,false);assert.equal(f.db.cachedState.branding,'اسم جديد');
});
test('response lost after commit reconciles the same receipt without a duplicate financial effect',async()=>{
 const f=fixture();await f.db.open();const state=await f.db.load(),command=makeCommand('record.post',{record:{globalId:'record-one',number:'SYNTHETIC-ONE',kind:'deposit',date:'2026-11-11',time:'12:00',account:state.accounts[0].globalId,total:7,paid:7,due:0,lines:[]}},{organizationId:f.c.organization.id,branchId:'branch-test',epoch:1,memberId:f.c.member.id,operationId:crypto.randomUUID()});
 f.db.prepareSave=async()=>({command});f.setDropResponse(true);await assert.rejects(f.db.save(state),/NETWORK/);assert.equal(f.getState().records.length,1);const committedBalance=f.getState().accounts[0].balance;
 f.setDropResponse(false);await f.db.resolvePending();assert.equal(f.db.cachedState.records.length,1);assert.equal(f.db.cachedState.accounts[0].balance,committedBalance);assert.equal(f.pushes.length,1,'completed terminal receipt must not resend a financial command');assert.equal(f.db.revision,1);assert.equal(f.acks.length,1);
});
test('ACK failure never rolls back an accepted operation and completed recovery acknowledges it once',async()=>{
 const f=fixture();await f.db.open();const c=f.command();f.db.prepareSave=async()=>({command:c});f.setAckFailure(true);let failed=0,cleared=0;f.db.onSaveFailure=()=>failed++;f.db.onCommitted=()=>cleared++;
 const result=await f.db.save(await f.db.load());assert.equal(result.committed,true);assert.equal(result.acknowledged,false);assert.equal(f.db.revision,1);assert.equal(failed,0);assert.equal(cleared,1);assert.equal(f.db.pending,true);
 await assert.rejects(f.db.save(await f.db.load()),/ONLINE_RESULT_UNCERTAIN/);f.setAckFailure(false);await f.db.resolvePending();assert.equal(f.db.revision,1);assert.equal(cleared,1);assert.equal(f.pushes.length,1);assert.equal(f.db.pending,false);
});
test('ACK response lost after native clears completion requires settlement check without duplicating the commit',async()=>{
 const f=fixture();await f.db.open();f.db.prepareSave=async()=>({command:f.command()});f.setDropAck(true);await f.db.save(await f.db.load());assert.equal(f.db.pending,true);
 f.setDropAck(false);const result=await f.db.resolvePending();assert.equal(result.committed,true);assert.equal(f.db.revision,1);assert.equal(f.pushes.length,1);assert.equal(f.db.pending,false);
});
test('unknown pending:false keeps writes closed until explicit ledger review',async()=>{
 const f=fixture();await f.db.open();f.db.prepareSave=async()=>({command:f.command()});f.setFailWrite(true);await assert.rejects(f.db.save(await f.db.load()),/NETWORK/);f.losePending();f.setFailWrite(false);
 const result=await f.db.resolvePending();assert.equal(result.reviewRequired,true);assert.equal(f.db.reviewRequired,true);await assert.rejects(f.db.save(await f.db.load()),/REVIEW_REQUIRED/);assert.equal(f.pushes.length,1);
});
test('current-epoch STALE_EPOCH receipt is a known rejection and requires explicit fresh review',async()=>{
 const f=fixture();await f.db.open();f.db.prepareSave=async()=>({command:f.command()});f.setReceipt('needs-settlement');f.setReceiptCode('STALE_EPOCH');f.setEpoch(2);
 await assert.rejects(f.db.save(await f.db.load()),/STALE_EPOCH/);assert.equal(f.db.revision,0);assert.equal(f.db.pending,false);assert.equal(f.db.settlement,true);assert.equal(f.acks.length,1);
 f.setSettlementCount(0);await f.db.checkSettlement();assert.equal(f.db.epoch,2);assert.equal(f.db.reviewRequired,true);await assert.rejects(f.db.save(await f.db.load()),/REVIEW_REQUIRED/);assert.equal(f.pushes.length,1);
});
test('preflight rejects a malformed semantic command before native journals anything',async()=>{
 const f=fixture();await f.db.open();const command={...f.command(),kind:'unsupported.financial.operation'};f.db.prepareSave=async()=>({command});
 await assert.rejects(f.db.save(await f.db.load()));assert.equal(f.pushes.length,0);assert.equal(f.db.pending,false);assert.equal(f.db.revision,0);
});
test('a mismatched receipt hash cannot produce success',async()=>{
 const f=fixture();await f.db.open();f.setBadHash(true);f.db.prepareSave=async()=>({command:f.command()});
 await assert.rejects(f.db.save(await f.db.load()),/RECEIPT_MISMATCH/);assert.equal(f.db.revision,0);assert.equal(f.db.pending,true);assert.equal(f.db.connected,false);
});
test('known conflicts retain the original command and gate later writes',async()=>{
 const f=fixture();await f.db.open();f.setReceipt('needs-settlement');f.db.prepareSave=async()=>({command:f.command()});
 await assert.rejects(f.db.save(await f.db.load()),/NEEDS_SETTLEMENT/);assert.equal(f.db.revision,0);assert.equal(f.db.settlement,true);assert.equal(f.db.pending,false);
 await assert.rejects(f.db.save(await f.db.load()),/NEEDS_SETTLEMENT/);assert.equal(f.pushes.length,1);
 await assert.rejects(f.db.checkSettlement(),/NEEDS_SETTLEMENT/);f.setReceipt('accepted');await f.db.checkSettlement();assert.equal(f.db.settlement,false);
});
test('revoking full branch read masks existing RAM even while an editor is open',async()=>{
 const f=fixture();await f.db.open();f.setGrant(false);await assert.rejects(f.db.status(),/BRANCH_READ_REQUIRED/);assert.equal(f.db.connected,false);
});
test('semantic encoder posts record global references and fails closed on an unexplained financial edit',async()=>{
 const f=fixture();await f.db.open();let state=await f.db.load(),commit=r=>{state.records.unshift(r);return true};
 const api={database:f.db,state:()=>state,commitRecord(v){if(arguments.length)commit=v;return commit},form:()=>({}),modal:()=>null,selected:()=>0,partyType:()=> 'customer',saleType:()=> 'sale',warehouseEdit:()=>null,restoreForm(){}};
 const encoder=installOnlineEncoder(api);encoder.begin('post-cash');
 commit({id:101,kind:'deposit',date:'2026-11-11',time:'12:00',account:state.accounts[0].id,total:5,paid:5,due:0,lines:[]});
 const result=await f.db.prepareSave(state);assert.equal(result.command.kind,'record.post');assert.equal(result.command.payload.record.account,state.accounts[0].globalId);assert.match(result.command.payload.record.number,/^AND-/);encoder.finish();
 encoder.begin('unknown-write');const changed=clone(state);changed.branding='unexplained';await assert.rejects(f.db.prepareSave(changed),/SEMANTIC_COMMAND_REQUIRED/);encoder.finish();
});
test('reviewed entry removes manual activation and preserves explicit local storage access',async()=>{
 const [app,access,stock]=await Promise.all(['app.js','access.js','feature-stock.js'].map(file=>readFile(new URL('../approved-runtime/'+file,import.meta.url),'utf8')));
 assert.match(app,/new OnlineDatabase[\s\S]*:new ShopDatabase\(\)/);assert.match(app,/history:\[\.\.\.history\]/);assert.match(app,/history=beforeView.history/);
 assert.match(access,/!result.activationRequired/);assert.doesNotMatch(access,/openActivation|installActivation|license-file|license-text/);assert.match(access,/native\('legacy'\)/);assert.match(stock,/karnaWorkflowDraftStorage\|\|localStorage/);
});
