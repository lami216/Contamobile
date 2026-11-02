package mr.alkarna.mobile.approved;

import android.content.Context;
import java.io.IOException;
import java.util.UUID;
import org.json.*;

/** Fetching a request never prepares or applies it. Only an explicit accepted intent can claim it. */
final class AccountingResetClient {
 interface PauseBackups {void pause(JSONObject target) throws Exception;}
 private final DeviceLicense license;
 private final InstallationIdentity identity;
 private final JSONObject issuers;
 private final ContatoolsClient channel;
 private final AccountingResetStore disk;
 private final PauseBackups backups;
 AccountingResetClient(Context context,DeviceLicense license,JSONObject issuers,ContatoolsClient channel,PauseBackups backups) throws Exception {
  this.license=license;this.issuers=ProtocolJson.copy(issuers);this.channel=channel;this.backups=backups;
  if(issuers.length()==0)throw new IOException("RESET_UNCONFIGURED");identity=new InstallationIdentity();disk=new AccountingResetStore(context,license.deviceCode(),identity.fingerprint());
 }
 private static JSONObject target(JSONObject value) throws Exception {
  String shop=value.getString("shopId"),owner=value.getString("ownerId");
  if(!shop.matches("[A-Za-z0-9_.:-]{1,160}")||!owner.matches("[A-Za-z0-9_.:-]{1,160}"))throw new IOException("RESET_TARGET");
  return new JSONObject().put("shopId",shop).put("ownerId",owner);
 }
 private JSONObject wire(JSONObject value) throws Exception {return target(value).put("installationId",identity.id());}
 private JSONObject payload(JSONObject value,boolean claimed) throws Exception {
  JSONObject p=AccountingResetGrant.verify(value.getJSONObject("grant"),issuers,identity.id(),identity.fingerprint(),license.deviceCode(),license.registrationSnapshot(),value.getString("shopId"),value.getString("ownerId"),System.currentTimeMillis(),claimed);
  if(!value.getString("requestId").equals(p.getString("requestId")))throw new IOException("RESET_REQUEST_SCOPE");return p;
 }
 private JSONObject request(JSONObject value) throws Exception {
  JSONObject current=disk.state.optJSONObject("request");if(current==null||!value.getString("requestId").equals(current.optString("requestId"))||!value.getString("shopId").equals(current.optString("shopId"))||!value.getString("ownerId").equals(current.optString("ownerId")))throw new IOException("RESET_REQUEST_UNAVAILABLE");return current;
 }
 private JSONObject call(String operation,JSONObject value) throws Exception {return channel.accountingExchange("accounting-reset."+operation,value);}
 synchronized JSONObject poll(JSONObject value) throws Exception {
  if(value.length()!=2)throw new IOException("RESET_TARGET");JSONObject t=target(value),pending=disk.state.optJSONObject("pending");
  if(pending!=null){if(!t.getString("shopId").equals(pending.optString("shopId"))||!t.getString("ownerId").equals(pending.optString("ownerId")))return new JSONObject().put("stage","none");return resumeLocal();}
  if(disk.state.has("declined")){acknowledgeDecline();return new JSONObject().put("stage","none");}
  JSONObject polls=disk.state.optJSONObject("pollTargets");if(polls==null){polls=new JSONObject();disk.state.put("pollTargets",polls);}String pollId=ProtocolJson.hash(t);JSONObject timing=polls.optJSONObject(pollId);if(timing==null){if(polls.length()>=20)polls=new JSONObject();timing=new JSONObject();polls.put(pollId,timing);disk.state.put("pollTargets",polls);}
  long now=System.currentTimeMillis(),retry=timing.optLong("notBefore");if(channel.managedNetwork()&&now<retry)return new JSONObject().put("stage","cooldown").put("retryAt",retry);
  JSONObject result;
  try{result=call("poll",wire(t));timing.put("notBefore",now+60000).put("failures",0);disk.save();}
  catch(Exception error){int failures=Math.min(16,timing.optInt("failures")+1);long wait=Math.min(6*3600000L,30000L*(1L<<Math.min(10,failures-1)));timing.put("failures",failures).put("notBefore",now+wait);disk.save();throw error;}
  if(!"waiting".equals(result.optString("status"))){disk.state.remove("request");disk.save();return new JSONObject().put("stage","none");}
  JSONObject record=ProtocolJson.copy(t).put("requestId",result.getString("requestId")).put("reason",result.getString("reason")).put("expiresAt",result.getLong("expiresAt")).put("grant",result.getJSONObject("grant"));
  JSONObject p=payload(record,false);if(record.getLong("expiresAt")!=p.getLong("expiresAt")||record.getString("reason").length()>1000)throw new IOException("RESET_REQUEST");
  if(disk.used(p.getString("grantId")))return new JSONObject().put("stage","none");disk.state.put("request",record);disk.save();
  JSONObject visible=ProtocolJson.copy(record);visible.remove("grant");return new JSONObject().put("stage","pending").put("request",visible);
 }
 synchronized JSONObject decline(JSONObject value) throws Exception {
  if(value.length()!=3)throw new IOException("RESET_DECLINE");if(disk.state.has("pending"))throw new IOException("RESET_ALREADY_ACCEPTED");
  JSONObject record=request(value),p=payload(record,false);disk.consume(p.getString("grantId"));disk.state.put("declined",record);disk.state.remove("request");disk.save();
  return acknowledgeDecline();
 }
 private JSONObject acknowledgeDecline() throws Exception {
  JSONObject record=disk.state.optJSONObject("declined");if(record==null)return new JSONObject().put("stage","none");
  long next=disk.state.optLong("declineNotBefore");if(channel.managedNetwork()&&System.currentTimeMillis()<next)return new JSONObject().put("stage","declined").put("ackPending",true).put("retryAt",next);
  try{JSONObject p=record.getJSONObject("grant").getJSONObject("payload");call("decline",wire(record).put("requestId",p.getString("requestId")).put("grantId",p.getString("grantId")));disk.state.remove("declined");disk.state.remove("declineNotBefore");disk.save();return new JSONObject().put("stage","declined");}
  catch(Exception error){disk.state.put("declineNotBefore",System.currentTimeMillis()+60000);disk.save();return new JSONObject().put("stage","declined").put("ackPending",true).put("retryAt",disk.state.getLong("declineNotBefore"));}
 }
 synchronized JSONObject prepare(JSONObject value) throws Exception {
  if(value.length()!=4||!Boolean.TRUE.equals(value.opt("accepted")))throw new IOException("RESET_CONSENT_REQUIRED");
  JSONObject pending=disk.state.optJSONObject("pending");if(pending!=null){if(!value.getString("requestId").equals(pending.optString("requestId"))||!value.getString("shopId").equals(pending.optString("shopId"))||!value.getString("ownerId").equals(pending.optString("ownerId")))throw new IOException("RESET_BUSY");return resume();}
  JSONObject record=request(value),p=payload(record,false);if(disk.used(p.getString("grantId")))throw new IOException("RESET_ALREADY_USED");
  pending=ProtocolJson.copy(record).put("stage","awaiting-claim").put("intentId",UUID.randomUUID().toString());disk.state.put("pending",pending);disk.save();return resume();
 }
 private JSONObject prepared(JSONObject pending) throws Exception {
  JSONObject p=payload(pending,true);if(disk.used(p.getString("grantId")))throw new IOException("RESET_ALREADY_USED");
  AccountingResetGrant.verifyClaim(pending.getJSONObject("claim"),issuers,p,pending.getString("intentId"));
  // These barriers are durable before JavaScript is allowed to clear its atomic database.
  channel.accountingResetPrepared(p.getString("requestId"));backups.pause(target(pending));
  return new JSONObject().put("stage","prepared").put("shopId",p.getString("shopId")).put("ownerId",p.getString("ownerId")).put("requestId",p.getString("requestId")).put("grantId",p.getString("grantId")).put("intentId",pending.getString("intentId")).put("accountingResetId",p.getString("requestId"));
 }
 synchronized JSONObject resumeLocal() throws Exception {
  JSONObject pending=disk.state.optJSONObject("pending");if(pending==null)return new JSONObject().put("stage","idle");
  if("applied".equals(pending.optString("stage")))return new JSONObject().put("stage","complete").put("ackPending",true).put("retryAt",disk.state.optLong("ackNotBefore"));
  if("awaiting-claim".equals(pending.optString("stage")))return new JSONObject().put("stage","awaiting-network");
  return prepared(pending);
 }
 synchronized JSONObject resume() throws Exception {
  JSONObject pending=disk.state.optJSONObject("pending");if(pending==null)return new JSONObject().put("stage","idle");
  if("applied".equals(pending.optString("stage")))return acknowledge();
  JSONObject p=payload(pending,true);if(disk.used(p.getString("grantId")))throw new IOException("RESET_ALREADY_USED");
  if("awaiting-claim".equals(pending.optString("stage"))){
   JSONObject answer=call("claim",wire(pending).put("requestId",p.getString("requestId")).put("grantId",p.getString("grantId")).put("intentId",pending.getString("intentId")).put("accepted",true));
   if("unavailable".equals(answer.optString("status"))){AccountingResetGrant.verifyDenial(answer.getJSONObject("denial"),issuers,p,pending.getString("intentId"));disk.consume(p.getString("grantId"));disk.state.remove("pending");disk.state.remove("request");disk.save();return new JSONObject().put("stage","unavailable");}
   JSONObject claim=answer.getJSONObject("claim");
   AccountingResetGrant.verifyClaim(claim,issuers,p,pending.getString("intentId"));pending.put("claim",claim).put("stage","prepared");disk.save();
  }
  return prepared(pending);
 }
 synchronized JSONObject finish(JSONObject value) throws Exception {
  if(value.length()!=3)throw new IOException("RESET_RECEIPT");JSONObject pending=disk.state.optJSONObject("pending");
  if(pending==null){JSONObject receipt=disk.state.optJSONObject("lastReceipt");if(receipt!=null&&sameReceipt(receipt,value))return new JSONObject().put("stage","complete");throw new IOException("RESET_RECEIPT");}
  JSONObject p=payload(pending,true),receipt=new JSONObject().put("requestId",p.getString("requestId")).put("grantId",p.getString("grantId")).put("intentId",pending.getString("intentId"));
  if(!sameReceipt(receipt,value)||!("prepared".equals(pending.optString("stage"))||"applied".equals(pending.optString("stage"))))throw new IOException("RESET_RECEIPT_SCOPE");
  pending.put("stage","applied");disk.state.put("lastReceipt",receipt).put("lastAccountingResetId",p.getString("requestId"));disk.consume(p.getString("grantId"));return new JSONObject().put("stage","complete").put("ackPending",true);
 }
 private static boolean sameReceipt(JSONObject a,JSONObject b){for(String key:new String[]{"requestId","grantId","intentId"})if(!a.optString(key).equals(b.optString(key)))return false;return true;}
 /** A one-shot local UI transition, never a network acknowledgement or a second
  * reset authority. The trusted page calls it only after its committed IDB receipt. */
 synchronized boolean authorizeExit(JSONObject value) throws Exception {
  if(value.length()!=6||!"accounting-reset-exit".equals(value.optString("purpose")))throw new IOException("RESET_EXIT_PURPOSE");
  JSONObject pending=disk.state.optJSONObject("pending"),receipt=disk.state.optJSONObject("lastReceipt");
  if(pending==null||!"applied".equals(pending.optString("stage"))||receipt==null||!sameReceipt(receipt,value))throw new IOException("RESET_EXIT_RECEIPT");
  JSONObject p=payload(pending,true);
  AccountingResetGrant.verifyClaim(pending.getJSONObject("claim"),issuers,p,pending.getString("intentId"));
  if(!sameReceipt(receipt,new JSONObject().put("requestId",p.getString("requestId")).put("grantId",p.getString("grantId")).put("intentId",pending.getString("intentId")))||
    !p.getString("shopId").equals(value.optString("shopId"))||!p.getString("ownerId").equals(value.optString("ownerId"))||!disk.used(p.getString("grantId")))throw new IOException("RESET_EXIT_SCOPE");
  JSONObject exited=disk.state.optJSONObject("lastExitReceipt");
  if(exited!=null&&sameReceipt(exited,receipt))return false;
  // Persist before finishing the Activity. A process interruption cannot make a
  // reopened phone repeatedly close merely because the server ACK is pending.
  disk.state.put("lastExitReceipt",ProtocolJson.copy(receipt));
  disk.save();
  return true;
 }
 synchronized JSONObject acknowledge() throws Exception {
  JSONObject pending=disk.state.optJSONObject("pending");if(pending==null)return acknowledgeDecline();if(!"applied".equals(pending.optString("stage")))return resumeLocal();
  long now=System.currentTimeMillis(),deadline=disk.state.optLong("ackNotBefore");if(channel.managedNetwork()&&now<deadline)return new JSONObject().put("stage","complete").put("ackPending",true).put("retryAt",deadline);
  try{
   JSONObject p=payload(pending,true);JSONObject result=call("complete",wire(pending).put("requestId",p.getString("requestId")).put("grantId",p.getString("grantId")).put("intentId",pending.getString("intentId")));
   if(!"completed".equals(result.optString("status")))throw new IOException("RESET_ACK");channel.accountingResetAcknowledged(p.getString("requestId"));disk.state.remove("pending");disk.state.remove("request");disk.state.remove("ackNotBefore");disk.state.remove("ackFailures");disk.save();return new JSONObject().put("stage","complete");
  }catch(Exception error){int failures=Math.min(16,disk.state.optInt("ackFailures")+1);long wait=Math.min(6*3600000L,30000L*(1L<<Math.min(10,failures-1)));disk.state.put("ackFailures",failures).put("ackNotBefore",now+wait);disk.save();return new JSONObject().put("stage","complete").put("ackPending",true).put("retryAt",now+wait);}
 }
}
