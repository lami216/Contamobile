package mr.alkarna.mobile.approved;

/** Pure, deterministic policy; persistence is the existing authenticated native journal.
 * No timer, thread, network, activation or business database lives in this class. */
final class RegistrationPolicy {
 static final int VERSION=1;
 String successful="",pending="";
 long lastSuccess=0,lastAttempt=0,nextAttempt=0;
 int failures=0;
 boolean blocked=false;
 static final class Decision {
  final String stage;final long retryAt;final boolean changed;
  Decision(String stage,long retryAt,boolean changed){this.stage=stage;this.retryAt=retryAt;this.changed=changed;}
 }
 Decision decide(String fingerprint,long now,boolean online,boolean force,double random){
  if(successful.equals(fingerprint)&&!force)return new Decision("cached",0,false);
  if(!online)return new Decision("offline",0,false);
  boolean changed=false;
  if(!pending.equals(fingerprint)){
   pending=fingerprint;failures=0;blocked=false;
   nextAttempt=now+(lastSuccess==0?30000L+(long)(clamp(random)*150001):1500L);changed=true;
  }
  // An explicit recovery revalidates the server registration, even after a cached
  // success. Automatic events remain cached. Preserve failure backoff; an explicit
  // retry may recheck a repaired permanent denial only after a one-minute cooldown.
  if(force){long deadline=lastAttempt==0?0:lastAttempt+10000L;if(failures>0)deadline=Math.max(deadline,blocked?lastAttempt+60000L:nextAttempt);return new Decision(now<deadline?"scheduled":"run",now<deadline?deadline:0,changed);}
  if(blocked)return new Decision("blocked",0,changed);
  if(now<nextAttempt)return new Decision("scheduled",nextAttempt,changed);
  return new Decision("run",0,changed);
 }
 void started(long now){lastAttempt=now;nextAttempt=Math.max(nextAttempt,now+30000L);}
 void success(String fingerprint,long now){successful=fingerprint;pending=fingerprint;lastSuccess=now;nextAttempt=0;failures=0;blocked=false;}
 void failed(long now,boolean permanent,long retryAfter,double random){
  blocked=permanent;failures=Math.min(16,failures+1);
  long ceiling=Math.min(6*3600000L,30000L*(1L<<Math.min(failures-1,10)));
  nextAttempt=permanent?0:Math.max(retryAfter,now+(long)(ceiling*(0.5+clamp(random)*0.5)));
 }
 private static double clamp(double value){return Math.max(0,Math.min(0.999999999,value));}
}
