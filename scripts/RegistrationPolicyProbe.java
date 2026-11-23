package mr.alkarna.mobile.approved;

public class RegistrationPolicyProbe {
 private static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
 public static void main(String[] args){
  RegistrationPolicy p=new RegistrationPolicy();long now=1000000;
  check(p.decide("A",now,false,false,0).stage.equals("offline"),"Offline must not start attempts");
  check(p.nextAttempt==0,"Offline must not persist a retry loop");
  var initial=p.decide("A",now,true,false,0);check(initial.stage.equals("scheduled")&&initial.retryAt==now+30000,"Initial jitter lower bound");
  RegistrationPolicy upper=new RegistrationPolicy();check(upper.decide("A",now,true,false,0.999999).retryAt<=now+180000,"Initial jitter upper bound");
  check(p.decide("A",now,true,true,0).stage.equals("run"),"Explicit recovery must bypass initial staggering");p.started(now);
  check(p.decide("A",now+1,true,false,0).stage.equals("scheduled"),"Restart during lost response must keep cooldown");
  p.failed(now,false,now+600000,0);check(p.nextAttempt==now+600000,"Respect Retry-After");
  check(p.decide("A",now+1,true,true,0).stage.equals("scheduled"),"Repeated manual retry cannot hammer");
  check(p.decide("A",now+30000,true,true,0).retryAt==now+600000,"Explicit retry must honor the complete failure/Retry-After deadline");
  for(int i=0;i<20;i++)p.failed(now,false,0,0.99);check(p.nextAttempt<=now+6*3600000L,"Backoff is bounded");
  p.failed(now,true,0,0);check(p.decide("A",now+86400000,true,false,0).stage.equals("blocked"),"Permanent failures must stop");
  check(!p.decide("B",now,true,false,0).stage.equals("blocked"),"A genuine stable change can be retried");p.success("B",now);
  int requests=0;for(int i=0;i<10000;i++)if(p.decide("B",now+i*1000L,true,false,0).stage.equals("run"))requests+=2;
  check(requests==0,"Unchanged foreground/network events must produce zero HTTP");
  RegistrationPolicy restarted=new RegistrationPolicy();restarted.successful=p.successful;restarted.lastSuccess=p.lastSuccess;check(restarted.decide("B",now+86400000,true,false,0).stage.equals("cached"),"Persisted success survives restart");
  check(restarted.decide("B",now+86400000,true,true,0).stage.equals("run"),"Explicit recovery must revalidate a saved successful registration");
  restarted.started(now);restarted.success("B",now);check(restarted.decide("B",now+1,true,true,0).retryAt==now+10000,"Cached success still has a ten-second manual cooldown");
  restarted.failed(now,true,0,0);check(restarted.decide("B",now+30000,true,true,0).retryAt==now+60000,"A repaired denial needs a one-minute explicit cooldown");
  check(restarted.decide("B",now+60000,true,true,0).stage.equals("run"),"Explicit action may recheck a repaired denial");
  check(restarted.decide("B",now+86400000,true,false,0).stage.equals("cached"),"A manual denial must not create an automatic registration loop");
  check(restarted.decide("B",now+86400000,false,true,0).stage.equals("offline"),"Offline explicit recovery must not trust a stale cached registration");
  RegistrationPolicy denied=new RegistrationPolicy();denied.decide("D",now,true,true,0);denied.started(now);denied.failed(now,true,0,0);check(denied.decide("D",now+86400000,true,false,0).stage.equals("blocked"),"Unregistered denied devices remain automatically blocked");
  System.out.println("PASS native RegistrationPolicy: offline, jitter, explicit cached revalidation, manual cooldown, preserved Retry-After/backoff, repaired denial, changed identity, 10000 idle events = 0 HTTP");
 }
}
