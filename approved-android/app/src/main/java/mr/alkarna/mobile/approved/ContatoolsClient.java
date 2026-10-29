package mr.alkarna.mobile.approved;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import java.security.SecureRandom;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import javax.net.ssl.HttpsURLConnection;

/** Optional administration channel. Offline activation remains entirely in DeviceLicense. */
final class ContatoolsClient {
 interface Transport { JSONObject post(String path,JSONObject body) throws Exception; }
 private final InstallationIdentity identity;
 private final RecoveryJournal journal;
 private final DeviceLicense license;
 private final JSONObject issuers;
 private final Transport transport;
 private final Context context;
 private final SecureRandom random=new SecureRandom();
 private final RegistrationPolicy registration=new RegistrationPolicy();
 static final class ServiceFailure extends IOException {
  final boolean permanent;final long retryAt;final int status;
  ServiceFailure(int status,boolean permanent,long retryAt){super("Service channel unavailable");this.status=status;this.permanent=permanent;this.retryAt=retryAt;}
 }
 ContatoolsClient(Context context,DeviceLicense license,String endpoint,JSONObject issuers) throws Exception {
  this(context,license,issuers,new HttpsTransport(endpoint));
 }
 // Package-private injection is used only from the independent instrumentation APK.
 ContatoolsClient(Context context,DeviceLicense license,JSONObject issuers,Transport transport) throws Exception {
  this.context=context.getApplicationContext();this.license=license;this.transport=transport;this.issuers=ProtocolJson.copy(issuers);
  if(issuers.length()==0)throw new IOException("Recovery issuer is not configured");
  identity=new InstallationIdentity();journal=new RecoveryJournal(context,license.deviceCode(),identity.fingerprint());
  JSONObject saved=journal.state.optJSONObject("registration");
  if(saved!=null&&saved.optInt("protocol")==RegistrationPolicy.VERSION){registration.successful=saved.optString("successful");registration.pending=saved.optString("pending");registration.lastSuccess=saved.optLong("lastSuccess");registration.lastAttempt=saved.optLong("lastAttempt");registration.nextAttempt=saved.optLong("nextAttempt");registration.failures=saved.optInt("failures");registration.blocked=saved.optBoolean("blocked");}
 }
 private JSONObject dispatch(String operation,JSONObject payload) throws Exception {
  if(!online())throw new ServiceFailure(0,false,0);
  long deadline=journal.state.optLong("networkNotBefore");if(deadline>System.currentTimeMillis())throw new ServiceFailure(429,false,deadline);
  try{return exchange(operation,payload);}catch(ServiceFailure failure){if(failure.retryAt>System.currentTimeMillis()){journal.state.put("networkNotBefore",failure.retryAt);journal.save();}throw failure;}
  catch(IOException failure){if(transport instanceof HttpsTransport){journal.state.put("networkNotBefore",System.currentTimeMillis()+15000);journal.save();}throw failure;}
 }
 private JSONObject exchange(String operation,JSONObject payload) throws Exception {
  JSONObject challenge=transport.post("/api/android/challenge",new JSONObject().put("operation",operation).put("payload",payload));
  String message=challenge.getString("message");JSONObject proof=new JSONObject(message);
  if(!"contatools-device-proof".equals(proof.optString("schema"))||proof.optInt("version")!=1||!operation.equals(proof.optString("operation"))||!identity.id().equals(proof.optString("installationId"))||!ProtocolJson.hash(payload).equals(proof.optString("payloadHash"))||!challenge.getString("id").equals(proof.optString("id"))||message.length()>4096)throw new ServiceFailure(0,true,0);
  return transport.post("/api/android/dispatch",new JSONObject().put("operation",operation).put("payload",payload).put("challengeId",challenge.getString("id")).put("signature",identity.sign(message)));
 }
 synchronized JSONObject register(JSONObject context) throws Exception {return register(context,true);}
 synchronized JSONObject registerAutomatically(JSONObject context) throws Exception {return register(context,false);}
 private boolean online(){
  if(!(transport instanceof HttpsTransport))return true; // Existing test-APK-only injected transport.
  ConnectivityManager manager=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);
  if(manager==null)return false;NetworkCapabilities caps=manager.getNetworkCapabilities(manager.getActiveNetwork());return caps!=null&&caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)&&caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
 }
 private void saveRegistration() throws Exception {
  journal.state.put("registration",new JSONObject().put("protocol",RegistrationPolicy.VERSION).put("successful",registration.successful).put("pending",registration.pending).put("lastSuccess",registration.lastSuccess).put("lastAttempt",registration.lastAttempt).put("nextAttempt",registration.nextAttempt).put("failures",registration.failures).put("blocked",registration.blocked));journal.save();
 }
 private JSONObject register(JSONObject context,boolean force) throws Exception {
  // Construct a whitelist; neither user credentials nor accounting records cross this boundary.
  if(context.length()!=2)throw new IOException("Invalid local recovery context");
  String shop=context.getString("shopId");JSONArray owners=context.getJSONArray("owners");
  if(!shop.matches("[A-Za-z0-9_.:-]{1,160}")||owners.length()<1||owners.length()>20)throw new IOException("Invalid owner target");
  JSONArray safe=new JSONArray();for(int i=0;i<owners.length();i++){JSONObject owner=owners.getJSONObject(i);if(owner.length()!=3||!"owner".equals(owner.optString("role")))throw new IOException("Only the local owner is eligible");safe.put(new JSONObject().put("id",owner.getString("id")).put("name",owner.getString("name")).put("role","owner"));}
  JSONObject snapshot=license.registrationSnapshot();JSONObject payload=new JSONObject().put("installationId",identity.id()).put("publicJwk",identity.publicJwk()).put("licenseDocument",snapshot.getString("licenseDocument")).put("deviceCode",license.deviceCode()).put("applicationId",BuildConfig.APPLICATION_ID).put("appVersion",BuildConfig.VERSION_NAME).put("versionCode",BuildConfig.VERSION_CODE).put("localShopId",shop).put("owners",safe).put("activation",snapshot.getJSONObject("activation"));
  String fingerprint=RegistrationPayload.fingerprint(payload,issuers,BuildConfig.CONTATOOLS_ORIGIN);long now=System.currentTimeMillis();RegistrationPolicy.Decision decision=registration.decide(fingerprint,now,online(),force,random.nextDouble());
  if(decision.changed)saveRegistration();
  if(!"run".equals(decision.stage))return new JSONObject().put("stage",decision.stage).put("retryAt",decision.retryAt).put("registered","cached".equals(decision.stage));
  registration.started(now);saveRegistration();
  try{
   JSONObject result=dispatch("register",payload);if(!result.optBoolean("registered"))throw new ServiceFailure(200,true,0);
   registration.success(fingerprint,System.currentTimeMillis());journal.state.put("context",new JSONObject().put("shopId",shop).put("owners",safe));saveRegistration();return result;
  }catch(Exception failure){
   boolean permanent=permanentRegistrationFailure(failure);
   long retry=failure instanceof ServiceFailure?((ServiceFailure)failure).retryAt:0;
   registration.failed(System.currentTimeMillis(),permanent,retry,random.nextDouble());saveRegistration();
   return new JSONObject().put("stage",permanent?"blocked":"scheduled").put("retryAt",registration.nextAttempt).put("registered",false);
  }
 }
 // A certificate/network incident can be repaired without changing this installation.
 // Retry with bounded backoff and normal TLS validation; only an explicit protocol denial blocks.
 static boolean permanentRegistrationFailure(Exception failure){return failure instanceof ServiceFailure&&((ServiceFailure)failure).permanent;}
 private JSONObject target(JSONObject request) throws Exception {return new JSONObject().put("installationId",identity.id()).put("shopId",request.getString("shopId")).put("ownerId",request.getString("ownerId")).put("requestId",request.getString("requestId"));}
 synchronized JSONObject request(String ownerId) throws Exception {
  JSONObject pending=journal.state.optJSONObject("pending");if(pending!=null)return resume();
  JSONObject context=journal.state.getJSONObject("context");JSONArray owners=context.getJSONArray("owners");boolean allowed=false;for(int i=0;i<owners.length();i++)if(ownerId.equals(owners.getJSONObject(i).getString("id")))allowed=true;if(!allowed)throw new IOException("Local owner unavailable");
  JSONObject request=journal.state.optJSONObject("request");if(request==null||!ownerId.equals(request.optString("ownerId"))||!context.getString("shopId").equals(request.optString("shopId"))){request=new JSONObject().put("shopId",context.getString("shopId")).put("ownerId",ownerId).put("requestId",UUID.randomUUID().toString());journal.state.put("request",request);journal.save();}
  JSONObject response;try{response=dispatch("recovery.request",target(request));}catch(ServiceFailure failure){if(failure.status==403||failure.status==404){registration.successful="";saveRegistration();}throw failure;}request.put("requestId",response.getString("requestId"));journal.save();return remember(response);
 }
 synchronized JSONObject poll() throws Exception {return remember(dispatch("recovery.poll",target(journal.state.getJSONObject("request"))));}
 private JSONObject remember(JSONObject response) throws Exception {
  if("approved".equals(response.optString("status"))){JSONObject grant=response.getJSONObject("grant");validateGrant(grant);journal.state.put("grant",grant);}
  if("expired".equals(response.optString("status"))||"rejected".equals(response.optString("status"))||"used".equals(response.optString("status"))){journal.state.remove("grant");journal.state.remove("request");}
  journal.save();return response;
 }
 private JSONObject validateGrant(JSONObject grant) throws Exception {
  JSONObject p=ProtocolJson.verifyEnvelope(grant,issuers,"contatools-owner-reset"),r=journal.state.getJSONObject("request"),snapshot=license.registrationSnapshot();JSONObject doc=new JSONObject(snapshot.getString("licenseDocument"));
  String[][] expected={{"installationId",identity.id()},{"keyFingerprint",identity.fingerprint()},{"deviceCode",license.deviceCode()},{"shopId",r.getString("shopId")},{"ownerId",r.getString("ownerId")},{"requestId",r.getString("requestId")},{"licenseDocumentHash",ProtocolJson.hash(doc)},{"licenseId",doc.getJSONObject("payload").getString("licenseId")}};
  for(String[] binding:expected)if(!binding[1].equals(p.optString(binding[0])))throw new IOException("Recovery scope mismatch");
  if(p.length()!=11||p.getLong("expiresAt")<=p.getLong("issuedAt")||p.getLong("expiresAt")-p.getLong("issuedAt")>900000||journal.used(p.getString("grantId")))throw new IOException("Recovery authorization already consumed or invalid");return p;
 }
 private void digest(JSONObject d) throws Exception {if(d.length()!=4||!"PBKDF2-SHA256".equals(d.optString("algorithm"))||d.optInt("iterations")!=210000||!d.optString("salt").matches("[a-f0-9]{32}")||!d.optString("hash").matches("[a-f0-9]{64}"))throw new IOException("Invalid local password derivation");}
 synchronized JSONObject prepare(JSONObject passwordDigest) throws Exception {
  if(journal.state.has("pending"))return resume();digest(passwordDigest);JSONObject grant=journal.state.getJSONObject("grant");JSONObject p=validateGrant(grant);
  JSONObject pending=new JSONObject().put("stage","awaiting-claim").put("grant",grant).put("intentId",UUID.randomUUID().toString()).put("password",passwordDigest);
  journal.state.put("pending",pending);journal.save();return resume();
 }
 synchronized JSONObject resumeLocal() throws Exception {
  JSONObject pending=journal.state.optJSONObject("pending");if(pending==null)return new JSONObject().put("stage","idle");
  if("applied".equals(pending.optString("stage")))return new JSONObject().put("stage","complete").put("ackPending",true).put("retryAt",journal.state.optLong("ackNextAt"));
  if("awaiting-claim".equals(pending.optString("stage")))return new JSONObject().put("stage","awaiting-network");
  return resume(); // A saved signed claim is verified locally; no HTTP in the prepared stage.
 }
 synchronized JSONObject acknowledgePending() throws Exception {
  JSONObject pending=journal.state.optJSONObject("pending");return pending!=null&&"applied".equals(pending.optString("stage"))?acknowledge(pending):new JSONObject().put("stage","idle");
 }
 synchronized JSONObject resume() throws Exception {
  JSONObject pending=journal.state.optJSONObject("pending");if(pending==null)return new JSONObject().put("stage","idle");
  if("applied".equals(pending.optString("stage")))return acknowledge(pending);
  JSONObject p=validateGrant(pending.getJSONObject("grant"));JSONObject wire=target(journal.state.getJSONObject("request")).put("grantId",p.getString("grantId")).put("intentId",pending.getString("intentId"));
  if("awaiting-claim".equals(pending.optString("stage"))){
   JSONObject claim;
   try{claim=dispatch("recovery.claim",wire).getJSONObject("claim");}
   catch(Exception failure){
    // Distinguish an authoritative unclaimed expiry from a lost claim response.
    // A claimed request stays approved; only retry the identical saved intent.
    JSONObject current=dispatch("recovery.poll",target(journal.state.getJSONObject("request")));
    if("expired".equals(current.optString("status"))||"rejected".equals(current.optString("status"))){journal.state.remove("pending");remember(current);return new JSONObject().put("stage","expired");}
    throw failure;
   }
   validateClaim(pending,p,claim);pending.put("claim",claim).put("stage","prepared");journal.save();
  }
  validateClaim(pending,p,pending.getJSONObject("claim"));digest(pending.getJSONObject("password"));
  return new JSONObject().put("stage","prepared").put("shopId",p.getString("shopId")).put("ownerId",p.getString("ownerId")).put("requestId",p.getString("requestId")).put("grantId",p.getString("grantId")).put("intentId",pending.getString("intentId")).put("password",pending.getJSONObject("password"));
 }
 private void validateClaim(JSONObject pending,JSONObject grant,JSONObject claim) throws Exception {
  JSONObject c=ProtocolJson.verifyEnvelope(claim,issuers,"contatools-reset-claim");if(c.length()!=grant.length()+2)throw new IOException("Invalid claim");java.util.Iterator<String> names=grant.keys();while(names.hasNext()){String name=names.next();if(!ProtocolJson.canonical(grant.get(name)).equals(ProtocolJson.canonical(c.get(name))))throw new IOException("Claim scope mismatch");}
  if(!pending.getString("intentId").equals(c.getString("intentId"))||c.getLong("claimedAt")<grant.getLong("issuedAt")||c.getLong("claimedAt")>=grant.getLong("expiresAt"))throw new IOException("Claim was not authorized before expiration");
 }
 synchronized JSONObject finish(String grantId,String intentId) throws Exception {finishLocally(grantId,intentId);return acknowledge(journal.state.getJSONObject("pending"));}
 synchronized JSONObject finishLocally(String grantId,String intentId) throws Exception {
  JSONObject p=journal.state.getJSONObject("pending");JSONObject grant=p.getJSONObject("grant").getJSONObject("payload");if(!grantId.equals(grant.getString("grantId"))||!intentId.equals(p.getString("intentId"))||!("prepared".equals(p.getString("stage"))||"applied".equals(p.getString("stage"))))throw new IOException("Recovery completion mismatch");
  p.put("stage","applied");p.remove("password");journal.consume(grantId);return new JSONObject().put("stage","complete").put("ackPending",true);
 }
 private JSONObject acknowledge(JSONObject pending) throws Exception {
  JSONObject grant=pending.getJSONObject("grant").getJSONObject("payload");
  if(journal.state.optBoolean("ackBlocked"))return new JSONObject().put("stage","complete").put("ackPending",true).put("permanent",true);
  long now=System.currentTimeMillis(),deadline=Math.max(journal.state.optLong("ackNextAt"),journal.state.optLong("networkNotBefore"));
  if(!online()||now<deadline)return new JSONObject().put("stage","complete").put("ackPending",true).put("retryAt",deadline);
  try{dispatch("recovery.complete",target(journal.state.getJSONObject("request")).put("grantId",grant.getString("grantId")).put("intentId",pending.getString("intentId")));journal.state.remove("pending");journal.state.remove("grant");journal.state.remove("request");journal.state.remove("ackNextAt");journal.state.remove("ackFailures");journal.state.remove("ackBlocked");journal.save();return new JSONObject().put("stage","complete");}
  catch(Exception e){if(e instanceof ServiceFailure&&((ServiceFailure)e).permanent){journal.state.put("ackBlocked",true);journal.save();return new JSONObject().put("stage","complete").put("ackPending",true).put("permanent",true);}long retry=0;if(transport instanceof HttpsTransport){int count=Math.min(16,journal.state.optInt("ackFailures")+1);long ceiling=Math.min(6*3600000L,30000L*(1L<<Math.min(count-1,10)));retry=Math.max(journal.state.optLong("networkNotBefore"),now+(long)(ceiling*(0.5+random.nextDouble()*0.5)));journal.state.put("ackFailures",count).put("ackNextAt",retry);journal.save();}return new JSONObject().put("stage","complete").put("ackPending",true).put("retryAt",retry);}
 }
 static final class HttpsTransport implements Transport {
  private final String base;
  HttpsTransport(String base) throws Exception {URI uri=new URI(base);if(!"https".equals(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null||uri.getRawQuery()!=null||uri.getRawFragment()!=null||!"".equals(uri.getPath())&&!"/".equals(uri.getPath()))throw new IOException("A fixed HTTPS administration origin is required");this.base=base.replaceAll("/$","");}
  private static long retryAfter(String value,long now){
   if(value==null)return 0;try{long seconds=Long.parseLong(value.trim());return seconds>=0?Math.addExact(now,Math.multiplyExact(seconds,1000L)):0;}catch(Exception ignored){try{return Math.max(now,ZonedDateTime.parse(value,DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toEpochMilli());}catch(Exception invalid){return 0;}}
  }
  public JSONObject post(String path,JSONObject body) throws Exception {
   HttpsURLConnection c=(HttpsURLConnection)new URL(base+path).openConnection();c.setConnectTimeout(12000);c.setReadTimeout(15000);c.setInstanceFollowRedirects(false);c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);int max=path.startsWith("/api/android/rescue/")?307200:131072;if(bytes.length>max)throw new IOException("Request too large");c.setFixedLengthStreamingMode(bytes.length);
   try{try(OutputStream out=c.getOutputStream()){out.write(bytes);}int status=c.getResponseCode();if(status!=200){long retry=retryAfter(c.getHeaderField("Retry-After"),System.currentTimeMillis());throw new ServiceFailure(status,status>=400&&status<500&&status!=408&&status!=425&&status!=429,retry);}try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>262144)throw new IOException("Response too large");out.write(buffer,0,n);}return new JSONObject(out.toString("UTF-8"));}}finally{c.disconnect();}
  }
 }
}
