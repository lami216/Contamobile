/** Foreground-only scheduling. Native code owns durable registration/retry policy. */
export class RegistrationEvents {
 constructor({call,context,visible,online,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,onResult=()=>{}}){Object.assign(this,{call,context,visible,online,now,setTimer,clearTimer,onResult});this.timer=null;this.flight=null;this.again=false;}
 cancel(){if(this.timer!==null)this.clearTimer(this.timer);this.timer=null;}
 notify(){this.cancel();if(!this.visible()||!this.online())return;if(this.flight){this.again=true;return;}this.schedule(this.now()+750);}
 schedule(at){this.cancel();if(!this.visible()||!this.online())return;this.timer=this.setTimer(()=>{this.timer=null;this.run().catch(()=>{});},Math.min(2147483647,Math.max(0,at-this.now())));}
 async run(){
  if(this.flight)return this.flight;if(!this.visible()||!this.online())return {stage:'offline'};
  const context=this.context();if(!context.owners.length)return {stage:'idle'};
  this.flight=this.call('register',context);
  try{const result=await this.flight;this.onResult(result);if(result.retryAt>this.now())this.schedule(result.retryAt);return result;}
  catch(error){if(!error.permanent)this.schedule(Math.max(error.retryAt||0,this.now()+60000));throw error;}
  finally{this.flight=null;if(this.again){this.again=false;this.notify();}}
 }
 async forRecovery(){this.cancel();if(this.flight)await this.flight.catch(()=>{});return this.call('register-now',this.context());}
}

/** One timer and one outstanding poll, only for the visible pending request. */
export class RecoveryPoller {
 constructor({poll,onResult,onError,visible,online,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,random=Math.random}){Object.assign(this,{poll,onResult,onError,visible,online,now,setTimer,clearTimer,random});this.timer=null;this.flight=null;this.waiting=false;this.nextAt=0;this.manualAt=0;this.failures=0;this.generation=0;}
 cancel(){if(this.timer!==null)this.clearTimer(this.timer);this.timer=null;}
 stop(){this.cancel();this.waiting=false;this.generation++;}
 pause(){this.cancel();}
 pending(){this.waiting=true;this.failures=0;this.nextAt=this.now()+45000;this.manualAt=Math.max(this.manualAt,this.now()+10000);this.schedule();}
 schedule(){this.cancel();if(!this.waiting||this.flight||!this.visible()||!this.online())return;this.timer=this.setTimer(()=>{this.timer=null;this.refresh(false).catch(()=>{});},Math.min(2147483647,Math.max(0,this.nextAt-this.now())));}
 wake(){if(this.waiting){this.nextAt=Math.max(this.nextAt,this.now()+1000);this.schedule();}}
 async refresh(manual=true){
  if(!this.waiting||!this.visible()||!this.online())return {stage:'paused'};
  if(this.flight)return this.flight;
  const now=this.now(),deadline=manual?this.manualAt:this.nextAt;
  if(now<deadline){this.schedule();return {stage:'cooldown',retryAt:deadline};}
  const generation=this.generation;this.manualAt=now+10000;this.cancel();
  this.flight=this.poll();
  try{const result=await this.flight;if(generation!==this.generation)return result;this.failures=0;if(result.status==='waiting'){this.nextAt=this.now()+45000;this.manualAt=Math.max(this.manualAt,this.now()+10000);}else this.waiting=false;await this.onResult(result);return result;}
  catch(error){if(generation!==this.generation)throw error;this.failures=Math.min(10,this.failures+1);const ceiling=Math.min(900000,60000*2**(this.failures-1));this.nextAt=Math.max(error.retryAt||0,this.now()+Math.round(ceiling*(0.5+this.random()*0.5)));this.manualAt=Math.max(this.manualAt,this.nextAt);if(error.permanent)this.waiting=false;this.onError(error);throw error;}
  finally{this.flight=null;if(generation===this.generation)this.schedule();}
 }
}
