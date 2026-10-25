package mr.alkarna.mobile.approved;

import android.content.Context;
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
 ContatoolsClient(Context context,DeviceLicense license,String endpoint,JSONObject issuers) throws Exception {
  this(context,license,issuers,new HttpsTransport(endpoint));
 }
 // Package-private injection is used only from the independent instrumentation APK.
 ContatoolsClient(Context context,DeviceLicense license,JSONObject issuers,Transport transport) throws Exception {
  this.license=license;this.transport=transport;this.issuers=ProtocolJson.copy(issuers);
  if(issuers.length()==0)throw new IOException("Recovery issuer is not configured");
  identity=new InstallationIdentity();journal=new RecoveryJournal(context,license.deviceCode(),identity.fingerprint());
 }
 private JSONObject dispatch(String operation,JSONObject payload) throws Exception {
  JSONObject challenge=transport.post("/api/android/challenge",new JSONObject().put("operation",operation).put("payload",payload));
  String message=challenge.getString("message");JSONObject proof=new JSONObject(message);
  if(!"contatools-device-proof".equals(proof.optString("schema"))||proof.optInt("version")!=1||!operation.equals(proof.optString("operation"))||!identity.id().equals(proof.optString("installationId"))||!ProtocolJson.hash(payload).equals(proof.optString("payloadHash"))||!challenge.getString("id").equals(proof.optString("id"))||message.length()>4096)throw new IOException("Mismatched server challenge");
  return transport.post("/api/android/dispatch",new JSONObject().put("operation",operation).put("payload",payload).put("challengeId",challenge.getString("id")).put("signature",identity.sign(message)));
 }
 synchronized JSONObject register(JSONObject context) throws Exception {
  // Construct a whitelist; neither user credentials nor accounting records cross this boundary.
  if(context.length()!=2)throw new IOException("Invalid local recovery context");
  String shop=context.getString("shopId");JSONArray owners=context.getJSONArray("owners");
  if(!shop.matches("[A-Za-z0-9_.:-]{1,160}")||owners.length()<1||owners.length()>20)throw new IOException("Invalid owner target");
  JSONArray safe=new JSONArray();for(int i=0;i<owners.length();i++){JSONObject owner=owners.getJSONObject(i);if(owner.length()!=3||!"owner".equals(owner.optString("role")))throw new IOException("Only the local owner is eligible");safe.put(new JSONObject().put("id",owner.getString("id")).put("name",owner.getString("name")).put("role","owner"));}
  JSONObject snapshot=license.registrationSnapshot();JSONObject payload=new JSONObject().put("installationId",identity.id()).put("publicJwk",identity.publicJwk()).put("licenseDocument",snapshot.getString("licenseDocument")).put("deviceCode",license.deviceCode()).put("applicationId",BuildConfig.APPLICATION_ID).put("appVersion",BuildConfig.VERSION_NAME).put("versionCode",BuildConfig.VERSION_CODE).put("localShopId",shop).put("owners",safe).put("activation",snapshot.getJSONObject("activation"));
  JSONObject result=dispatch("register",payload);journal.state.put("context",new JSONObject().put("shopId",shop).put("owners",safe));journal.save();return result;
 }
 private JSONObject target(JSONObject request) throws Exception {return new JSONObject().put("installationId",identity.id()).put("shopId",request.getString("shopId")).put("ownerId",request.getString("ownerId")).put("requestId",request.getString("requestId"));}
 synchronized JSONObject request(String ownerId) throws Exception {
  JSONObject pending=journal.state.optJSONObject("pending");if(pending!=null)return resume();
  JSONObject context=journal.state.getJSONObject("context");JSONArray owners=context.getJSONArray("owners");boolean allowed=false;for(int i=0;i<owners.length();i++)if(ownerId.equals(owners.getJSONObject(i).getString("id")))allowed=true;if(!allowed)throw new IOException("Local owner unavailable");
  JSONObject request=journal.state.optJSONObject("request");if(request==null||!ownerId.equals(request.optString("ownerId"))||!context.getString("shopId").equals(request.optString("shopId"))){request=new JSONObject().put("shopId",context.getString("shopId")).put("ownerId",ownerId).put("requestId",UUID.randomUUID().toString());journal.state.put("request",request);journal.save();}
  JSONObject response=dispatch("recovery.request",target(request));request.put("requestId",response.getString("requestId"));journal.save();return remember(response);
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
 synchronized JSONObject finish(String grantId,String intentId) throws Exception {
  JSONObject p=journal.state.getJSONObject("pending");JSONObject grant=p.getJSONObject("grant").getJSONObject("payload");if(!grantId.equals(grant.getString("grantId"))||!intentId.equals(p.getString("intentId"))||!("prepared".equals(p.getString("stage"))||"applied".equals(p.getString("stage"))))throw new IOException("Recovery completion mismatch");
  p.put("stage","applied");p.remove("password");journal.consume(grantId);return acknowledge(p);
 }
 private JSONObject acknowledge(JSONObject pending) throws Exception {
  JSONObject grant=pending.getJSONObject("grant").getJSONObject("payload");
  try{dispatch("recovery.complete",target(journal.state.getJSONObject("request")).put("grantId",grant.getString("grantId")).put("intentId",pending.getString("intentId")));journal.state.remove("pending");journal.state.remove("grant");journal.state.remove("request");journal.save();return new JSONObject().put("stage","complete");}
  catch(Exception e){return new JSONObject().put("stage","complete").put("ackPending",true);}
 }
 private static final class HttpsTransport implements Transport {
  private final String base;
  HttpsTransport(String base) throws Exception {URI uri=new URI(base);if(!"https".equals(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null||uri.getRawQuery()!=null||uri.getRawFragment()!=null||!"".equals(uri.getPath())&&!"/".equals(uri.getPath()))throw new IOException("A fixed HTTPS administration origin is required");this.base=base.replaceAll("/$","");}
  public JSONObject post(String path,JSONObject body) throws Exception {
   HttpsURLConnection c=(HttpsURLConnection)new URL(base+path).openConnection();c.setConnectTimeout(12000);c.setReadTimeout(15000);c.setInstanceFollowRedirects(false);c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);if(bytes.length>131072)throw new IOException("Request too large");c.setFixedLengthStreamingMode(bytes.length);
   try{try(OutputStream out=c.getOutputStream()){out.write(bytes);}int status=c.getResponseCode();if(status!=200)throw new IOException("Administration service unavailable ("+status+")");try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>262144)throw new IOException("Response too large");out.write(buffer,0,n);}return new JSONObject(out.toString("UTF-8"));}}finally{c.disconnect();}
  }
 }
}
