import {canonical,commandHash,financialProjection,domainApply} from './platform/shared/accounting-domain.mjs';
import {materializeLocalView} from './platform/shared/local-identities.mjs';
import {applySharedDelta,viewHash} from './shared-delta.mjs';
const clone=value=>structuredClone(value);
const failure=code=>Object.assign(Error(code),{code});
const authorityVersion=context=>canonical({role:context.member.role,capabilities:context.member.capabilities,branchIds:context.member.branchIds,membershipVersion:context.member.membershipVersion});

// Institution data is never opened in ShopDatabase/IndexedDB. Only native owns
// the authenticated transport and the durable journal of an uncertain command.
export class OnlineDatabase{
 constructor(context,transport){this.context=clone(context);this.transport=transport;this.revision=0;this.cachedState=null;this.epoch=0;this.cursor=0;this.branchId=null;this.connected=false;this.pending=false;this.pendingPayload=null;this.settlement=false;this.settlementCode='';this.reviewRequired=false;this.lastReceipt=null;this.committedOperations=new Set();this.meta=new Map();this.drafts=new Map();this.onGate=()=>{};this.onAdopt=()=>{};this.onCommitted=()=>{};this.onSaveFailure=()=>{};this.prepareSave=null;this.inflight=false;this.contextVersion=canonical(context);}
 async call(operation,payload={}){return this.transport('online-call',{operation,payload});}
 deltaCapable(){return this.context.protocolCapabilities?.sharedDeltaVersion===1;}
 salesOnly(){const m=this.context.member;return m.role!=='org-admin'&&!m.capabilities?.some(cap=>cap==='*'||cap==='branch.sync.read');}
 actor(){const m=this.context.member;return {id:m.id,name:m.name,username:m.username,role:m.role==='org-admin'?'owner':m.role,active:true,capabilities:m.role==='org-admin'?['*']:[...(m.capabilities||[])]};}
 async open(branchId){
  const branches=this.context.branches||[],selected=branchId||this.branchId||branches[0]?.id;
  if(!selected||!branches.some(b=>b.id===selected)||!(this.context.member?.branchIds||[]).includes(selected))throw failure('BRANCH_READ_REQUIRED');
  if(this.pending&&this.branchId&&selected!==this.branchId)throw failure('ONLINE_RESULT_UNCERTAIN');
  if(this.branchId&&this.branchId!==selected){this.cachedState=null;this.remoteState=null;this.meta.clear();}
  this.branchId=selected;await this.refresh();return this;
 }
 async status(){
  try{
   const result=await this.transport('online-status',{}),context=result.context||result;
   if(context.organization?.id!==this.context.organization.id||context.member?.id!==this.context.member.id||!context.member.branchIds?.includes(this.branchId))throw failure('AUTHOR_CHANGED');
   if(context.member.role!=='org-admin'&&!context.member.capabilities?.some(cap=>cap==='*'||cap==='branch.sync.read')&&!(context.protocolCapabilities?.salesViewVersion===1&&context.member.capabilities?.some(cap=>['pos.view','pos.create'].includes(cap))))throw failure('BRANCH_READ_REQUIRED');
   const authority=authorityVersion(context);
   if((this.authorityVersion||authorityVersion(this.context))!==authority){this.cachedState=null;this.remoteState=null;this.identityHint=null;this.reviewRequired=true;}
   this.authorityVersion=authority;this.context=clone(context);this.connected=true;this.onGate();return context;
  }catch(error){this.connected=false;this.onGate(error);throw error;}
 }
 async refresh(forceBootstrap=false){
  try{
   if(!forceBootstrap&&this.deltaCapable()&&this.remoteState){
    let pages=0,changed=false,remote=this.remoteState,cursor=this.cursor,hash=this.remoteHash;
    while(true){
     const result=await this.call('online.delta',{branchId:this.branchId,epoch:this.epoch,cursor,viewVersion:1,limit:50});
     if(result.needsBootstrap){if(result.organizationId!==this.context.organization.id||result.branchId!==this.branchId)throw failure('ONLINE_DELTA_INVALID');return this.refresh(true);}
     const applied=applySharedDelta(remote,{epoch:this.epoch,cursor,view:this.viewMode,hash},result,{organizationId:this.context.organization.id,branchId:this.branchId});
     remote=applied.state;cursor=applied.cursor;hash=applied.hash;changed=changed||applied.changed;
     if(!result.hasMore)break;if(++pages>1000)throw failure('ONLINE_DELTA_INVALID');
    }
    this.remoteState=remote;this.cursor=cursor;this.remoteHash=hash;if(changed||this.identityHint)this.adoptRemote();this.lastRefreshChanged=changed;this.connected=true;this.onGate();return clone(this.cachedState);
   }
   const result=await this.call('online.bootstrap',{branchId:this.branchId,...(this.deltaCapable()?{viewVersion:1}:{})});
   if(result.mode!=='online'||result.organizationId!==this.context.organization.id||result.branchId!==this.branchId||!Number.isSafeInteger(result.epoch)||result.epoch<1||!Number.isSafeInteger(result.cursor)||result.cursor<0||!result.state||result.state.syncScope?.organizationId!==result.organizationId||result.state.syncScope?.branchId!==result.branchId)throw failure('ONLINE_BOOTSTRAP_INVALID');
   const expected=this.context.branches.find(b=>b.id===this.branchId)?.originId;if(expected&&result.state.originId!==expected)throw failure('CROSS_SCOPE');
   if(this.deltaCapable()&&(!['full','sales'].includes(result.view)||result.viewHash!==viewHash(result.state)||result.view!==(this.salesOnly()?'sales':'full')))throw failure('ONLINE_BOOTSTRAP_INVALID');
   const oldEpoch=this.epoch;if(oldEpoch&&oldEpoch!==result.epoch)this.reviewRequired=true;
   this.remoteState=clone(result.state);this.viewMode=result.view||'full';this.remoteHash=result.viewHash||null;this.epoch=result.epoch;this.cursor=result.cursor;this.adoptRemote(oldEpoch!==result.epoch);this.lastRefreshChanged=true;this.connected=true;this.onGate();return clone(this.cachedState);
  }catch(error){if(error.code==='ONLINE_DELTA_INVALID'&&!forceBootstrap)return this.refresh(true);this.connected=false;this.onGate(error);throw error;}
 }
 adoptRemote(newEpoch=false){
  const previous=newEpoch?null:(this.identityHint||this.cachedState),state=clone(this.remoteState);
  if(this.viewMode==='sales'){
   // Presentation defaults contain no authoritative cost, profit or balances.
   for(const product of state.products||[])product.cost=0;
   for(const account of state.accounts||[]){account.balance=0;account.openingBalance=0;}
   for(const party of state.parties||[])party.balance=0;
   state.opening={accounts:{},parties:{},stocks:{}};state.stockEvents=[];state.stockEventSequence=0;
  }
  try{this.cachedState=materializeLocalView(state,previous);this.onAdopt(clone(this.cachedState));this.identityHint=null;}
  catch(error){this.remoteState=null;this.cachedState=null;this.identityHint=null;this.connected=false;throw error;}
 }
 async load(){if(!this.cachedState)await this.open();return clone(this.cachedState);}
 async all(store){return store==='users'?[this.actor()]:[];}
 async get(store,id){return clone(this.meta.get(store+':'+id));}
 async put(store,value){if(store!=='meta'||!String(value?.id||'').startsWith('session:'))throw failure('ONLINE_LOCAL_OPERATION_DISABLED');this.meta.set(store+':'+value.id,clone(value));return clone(value);}
 async createSession(user,session){if(user.id!==this.context.member.id)throw failure('AUTHOR_CHANGED');return this.put('meta',session);}
 async accountingResetBootstrap(){return null;}
 async replace(){throw failure('ONLINE_LOCAL_OPERATION_DISABLED');}
 async cloudSnapshot(){throw failure('ONLINE_LOCAL_OPERATION_DISABLED');}
 async save(submitted,_unused,userChanges=[]){
  if(userChanges?.length)throw failure('ONLINE_LOCAL_OPERATION_DISABLED');
  if(this.inflight||this.pending)throw failure('ONLINE_RESULT_UNCERTAIN');
  if(this.settlement)throw failure('NEEDS_SETTLEMENT');
  if(this.reviewRequired)throw failure('REVIEW_REQUIRED');
  if(!this.connected)throw failure('ONLINE_REQUIRED');
  try{
   const prepared=await this.prepareSave?.(clone(submitted));
   if(!prepared)throw failure('SEMANTIC_COMMAND_REQUIRED');
   if(prepared.nonFinancial){if(canonical(financialProjection(this.cachedState))!==canonical(financialProjection(submitted)))throw failure('SEMANTIC_COMMAND_REQUIRED');if(this.cachedState.warehouses.includes(submitted.warehouse))this.cachedState.warehouse=submitted.warehouse;return;}
   const command=prepared.command;
   if(!command||command.organizationId!==this.context.organization.id||command.authorMemberId!==this.context.member.id||command.branchId!==this.branchId||command.epoch!==this.epoch)throw failure('CROSS_SCOPE');
   // Reject malformed/unsupported commands before native creates its durable
   // journal. This is validation only; reducer output never becomes confirmed.
   domainApply(this.cachedState,command,{organizationId:this.context.organization.id,branchId:this.branchId,memberId:this.context.member.id,role:this.context.member.role,capabilities:this.context.member.capabilities,branchIds:this.context.member.branchIds,epoch:this.epoch});
   this.identityHint=prepared.localView||null;this.inflight=true;this.onGate();
   return await this.push({branchId:this.branchId,epoch:this.epoch,commands:[command]});
  }catch(error){this.onSaveFailure(error);throw error;}finally{this.inflight=false;this.onGate();}
 }
 async push(payload){
  this.pendingPayload=clone(payload);let result;
  try{result=await this.call('sync.push',payload);}catch(error){this.pending=true;this.connected=false;this.onGate(error);throw error;}
  return this.receive(payload,result);
 }
 async acknowledge(payload){
  try{
   const answer=await this.transport('online-ack',{operationIds:payload.commands.map(c=>c.operationId)});
   if(answer?.acknowledged!==true)throw failure('ONLINE_ACK_REQUIRED');
   this.pending=false;this.pendingPayload=null;return true;
  }catch(error){this.pending=true;this.connected=false;this.onGate(error);return false;}
 }
 async receive(payload,result){
  try{
   const commands=payload.commands;
   if(!Array.isArray(commands)||!commands.length||!Array.isArray(result.receipts)||result.receipts.length!==commands.length||!Number.isSafeInteger(result.epoch)||result.epoch<payload.epoch||!Number.isSafeInteger(result.cursor)||result.cursor<0)throw failure('RECEIPT_MISMATCH');
   const receipts=commands.map(command=>{
    const matches=result.receipts.filter(r=>r.operationId===command.operationId);
    if(matches.length!==1||matches[0].hash!==commandHash(command)||!['accepted','needs-settlement','blocked'].includes(matches[0].status))throw failure('RECEIPT_MISMATCH');return matches[0];
   });
   // The server reports its current epoch when rejecting a command from a
   // restored database. A matching STALE_EPOCH receipt is a known rejection,
   // never an invitation to invent a replacement operation UUID.
   if(result.epoch!==payload.epoch&&!receipts.every(r=>r.status!=='accepted'&&r.error?.code==='STALE_EPOCH'))throw failure('RECEIPT_MISMATCH');
   this.pending=true;this.pendingPayload=clone(payload);this.lastReceipt=clone(receipts[0]);
   if(receipts.some(r=>r.status!=='accepted')){
    this.identityHint=null;this.settlement=true;this.settlementCode=receipts.find(r=>r.status!=='accepted')?.error?.code||'NEEDS_SETTLEMENT';
    await this.acknowledge(payload);throw failure(this.settlementCode==='STALE_EPOCH'?'STALE_EPOCH':'NEEDS_SETTLEMENT');
   }
   // The receipt is the commit boundary. A failed subsequent read must never
   // make the caller claim that this already accepted operation was not saved.
   const newlyCommitted=commands.filter(command=>!this.committedOperations.has(command.operationId));
   if(newlyCommitted.length){for(const command of newlyCommitted)this.committedOperations.add(command.operationId);this.revision++;try{this.onCommitted({commands:clone(newlyCommitted),branchId:payload.branchId});}catch(error){this.onGate(error);}}
   // ACK is a separate delivery boundary. Losing it cannot roll back a known
   // accepted operation; native retains the exact terminal receipt for recovery.
   const acknowledged=await this.acknowledge(payload);
   try{await this.refresh();return {...result,committed:true,acknowledged};}catch{
    // The accepted receipt is final even when its subsequent read fails. Keep
    // the UI gated, acknowledge/clear the committed draft once, and never send
    // the caller down its rejected-write path or invite a replacement UUID.
    return {...result,committed:true,acknowledged,refreshRequired:true};
   }
  }catch(error){if(error.code==='RECEIPT_MISMATCH'){this.pending=true;this.connected=false;}this.onGate(error);throw error;}
 }
 async resolvePending(){
  await this.status();const pending=await this.transport('online-pending',{});
  if(pending.pending===false){
   const knownAccepted=this.lastReceipt?.status==='accepted'&&this.pendingPayload?.commands.every(c=>this.committedOperations.has(c.operationId));
   this.pending=false;this.pendingPayload=null;this.identityHint=null;
   if(!knownAccepted)this.reviewRequired=true;
   await this.checkSettlement();return {pending:false,committed:!!knownAccepted,reviewRequired:this.reviewRequired};
  }
  const p=pending.payload;
  if(pending.operation!=='sync.push'||!p||p.branchId!==this.branchId||!p.commands?.length||p.commands.some(c=>c.organizationId!==this.context.organization.id||c.authorMemberId!==this.context.member.id||c.branchId!==this.branchId||c.epoch!==p.epoch))throw failure('ONLINE_RESULT_UNCERTAIN');
  this.pendingPayload=clone(p);
  if(pending.completed===true){if(!pending.result)throw failure('RECEIPT_MISMATCH');return this.receive(p,pending.result);}
  // Reuse the original bytes/UUIDs; never encode a replacement while uncertain.
  return this.push(p);
 }
 async checkSettlement(){
  await this.status();const result=await this.call('sync.status',{branchId:this.branchId});
  const count=Array.isArray(result.needsSettlement)?result.needsSettlement.length:Number(result.needsSettlement||0);
  if(!Number.isFinite(count)||count<0)throw failure('RECEIPT_MISMATCH');
  if(count>0){this.settlement=true;throw failure('NEEDS_SETTLEMENT');}
  const hadSettlement=this.settlement,oldEpoch=this.epoch;
  this.settlement=false;await this.refresh();if(hadSettlement||oldEpoch!==this.epoch)this.reviewRequired=true;return result;
 }
 clear(){this.cachedState=null;this.remoteState=null;this.meta.clear();this.drafts.clear();this.committedOperations.clear();this.pendingPayload=null;this.connected=false;}
}
