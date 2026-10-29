package mr.alkarna.mobile.approved;

import android.content.Context;
import android.util.AtomicFile;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.*;

/** Separate optional channel. It receives no shop state and cannot select a filesystem path. */
final class DataRescueClient {
 interface Progress {void uploaded(int done,int total);}
 private final DeviceLicense license;
 private final InstallationIdentity identity;
 private final JSONObject issuers;
 private final ContatoolsClient.Transport transport;
 private final AtomicFile file;
 private final int bootCount;
 final File directory;
 private JSONObject state;
 DataRescueClient(Context context,DeviceLicense license) throws Exception {
  this.license=license;identity=new InstallationIdentity();issuers=new JSONObject(BuildConfig.CONTATOOLS_ISSUERS);
  bootCount=android.provider.Settings.Global.getInt(context.getContentResolver(),android.provider.Settings.Global.BOOT_COUNT,-1);
  transport=new ContatoolsClient.HttpsTransport(BuildConfig.CONTATOOLS_ORIGIN);
  directory=new File(context.getNoBackupFilesDir(),"data-rescue");
  if(!directory.exists()&&!directory.mkdirs())throw new IOException("RESCUE_STORAGE");
  file=new AtomicFile(new File(directory,"state.json"));
  try{byte[] disk=file.readFully();if(disk.length>65536)throw new IOException("RESCUE_STATE");state=new JSONObject(new String(disk,StandardCharsets.UTF_8));}
  catch(FileNotFoundException absent){state=new JSONObject();}
 }
 private synchronized void save() throws Exception {
  state.put("lastTime",Math.max(state.optLong("lastTime"),System.currentTimeMillis()));
  FileOutputStream output=null;try{output=file.startWrite();output.write(state.toString().getBytes(StandardCharsets.UTF_8));file.finishWrite(output);}
  catch(Exception e){if(output!=null)file.failWrite(output);throw e;}
 }
 synchronized JSONObject cachedGrant() throws Exception {
  JSONObject envelope=state.optJSONObject("grant");if(envelope==null)return null;
  JSONObject grant=validate(envelope,trustedNow());if(grant.getString("caseId").equals(state.optString("declined")))return null;return grant;
 }
 private long trustedNow() throws Exception {
  return RecoveryClock.now(bootCount,state.optInt("grantBoot",-2),state.optLong("grantTime",-1),state.optLong("grantElapsed",-1),android.os.SystemClock.elapsedRealtime(),System.currentTimeMillis(),state.optLong("lastTime"));
 }
 private JSONObject validate(JSONObject envelope,long now) throws Exception {
  return RecoveryGrant.verify(envelope,issuers,identity.id(),identity.fingerprint(),license.deviceCode(),license.registrationSnapshot(),now);
 }
 synchronized boolean poll() throws Exception {
  long elapsed=android.os.SystemClock.elapsedRealtime();if(state.optInt("pollBoot",-2)==bootCount&&elapsed>=state.optLong("pollElapsed")&&elapsed-state.optLong("pollElapsed")<300000)return false;
  state.put("pollBoot",bootCount).put("pollElapsed",elapsed);save();JSONObject result;
  try{result=exchange("poll",target(null));}
  catch(ContatoolsClient.ServiceFailure failure){
   if(failure.status!=404)throw failure;
   JSONObject snapshot=license.registrationSnapshot();
   JSONObject enrollment=target(null).put("publicJwk",identity.publicJwk()).put("deviceCode",license.deviceCode()).put("licenseDocument",snapshot.getString("licenseDocument")).put("applicationId",BuildConfig.APPLICATION_ID).put("appVersion",BuildConfig.VERSION_NAME).put("versionCode",BuildConfig.VERSION_CODE).put("activation",snapshot.getJSONObject("activation"));
   exchange("enroll",enrollment);result=exchange("poll",target(null));
  }
  if(result.optBoolean("enabled")){JSONObject envelope=result.getJSONObject("grant");long observed=Math.max(System.currentTimeMillis(),result.getLong("serverTime"));JSONObject grant=validate(envelope,observed);if(grant.getString("caseId").equals(state.optString("declined")))return false;state.put("grant",envelope).put("grantTime",observed).put("grantElapsed",android.os.SystemClock.elapsedRealtime()).put("grantBoot",bootCount);save();return true;}
  state.remove("grant");save();return false;
 }
 private JSONObject target(String caseId) throws Exception {JSONObject value=new JSONObject().put("installationId",identity.id());if(caseId!=null)value.put("caseId",caseId);return value;}
 private JSONObject exchange(String operation,JSONObject payload) throws Exception {
  JSONObject challenge=transport.post("/api/android/rescue/challenge",new JSONObject().put("operation",operation).put("payload",payload));
  String message=challenge.getString("message");JSONObject proof=new JSONObject(message);
  if(!"contatools-device-proof".equals(proof.optString("schema"))||proof.optInt("version")!=1||!operation.equals(proof.optString("operation"))||!identity.id().equals(proof.optString("installationId"))||!ProtocolJson.hash(payload).equals(proof.optString("payloadHash"))||!challenge.getString("id").equals(proof.optString("id"))||message.length()>4096)throw new IOException("RESCUE_PROOF");
  return transport.post("/api/android/rescue/"+("chunk".equals(operation)?"chunk":"dispatch"),new JSONObject().put("operation",operation).put("payload",payload).put("challengeId",challenge.getString("id")).put("signature",identity.sign(message)));
 }
 synchronized void decline(JSONObject grant) throws Exception {state.put("declined",grant.getString("caseId"));state.remove("grant");save();}
 synchronized void consent(JSONObject grant,boolean snapshot,boolean upload) throws Exception {
  // Offline local capture is authorized by the cached signed grant; transport is a separate choice.
  state.put("snapshotConsent",snapshot).put("uploadConsent",upload).put("consentCaseId",grant.getString("caseId")).put("consentedAt",System.currentTimeMillis());save();
 }
 void sendConsent(JSONObject grant,boolean snapshot,boolean upload) throws Exception {exchange("consent",target(grant.getString("caseId")).put("snapshot",snapshot).put("upload",upload));}
 File packageFile(JSONObject grant) throws Exception {return new File(new File(directory,grant.getString("caseId")),"evidence.ctrescue");}
 synchronized void upload(JSONObject grant,File bundle,AtomicBoolean cancelled,Progress progress) throws Exception {
  if(!state.optBoolean("snapshotConsent")||!state.optBoolean("uploadConsent")||!grant.getString("caseId").equals(state.optString("consentCaseId")))throw new IOException("RESCUE_CONSENT");
  JSONObject current=cachedGrant();if(current==null||!grant.getString("caseId").equals(current.getString("caseId")))throw new IOException("RESCUE_EXPIRED");
  sendConsent(grant,true,true);String caseId=grant.getString("caseId");
  if(!bundle.isFile()||bundle.length()>268435456L)throw new IOException("RESCUE_PACKAGE_LIMIT");
  JSONObject session=exchange("begin",target(caseId).put("packageSize",bundle.length()).put("packageSha256",RecoveryPackage.hash(bundle)));
  String uploadId=session.getString("uploadId");int chunkSize=session.getInt("chunkSize");if(chunkSize!=196608||!uploadId.matches("[A-Za-z0-9_.:-]{1,160}"))throw new IOException("RESCUE_UPLOAD");
  Set<Integer> received=new HashSet<>();JSONArray chunks=session.getJSONArray("received");for(int i=0;i<chunks.length();i++)received.add(chunks.getInt(i));
  int total=(int)((bundle.length()+chunkSize-1)/chunkSize),done=0;
  try(RandomAccessFile input=new RandomAccessFile(bundle,"r")){
   for(int index=0;index<total;index++){
    if(cancelled.get())throw new IOException("RESCUE_CANCELLED");
    if(!received.contains(index)){
     input.seek((long)index*chunkSize);byte[] bytes=new byte[(int)Math.min(chunkSize,bundle.length()-(long)index*chunkSize)];input.readFully(bytes);
     byte[] digest=MessageDigest.getInstance("SHA-256").digest(bytes);StringBuilder hash=new StringBuilder();for(byte b:digest)hash.append(String.format(Locale.ROOT,"%02x",b&255));
     exchange("chunk",target(caseId).put("uploadId",uploadId).put("index",index).put("sha256",hash.toString()).put("data",ProtocolJson.base64(bytes)));
    }
    progress.uploaded(++done,total);
   }
  }
  if(cancelled.get())throw new IOException("RESCUE_CANCELLED");exchange("complete",target(caseId).put("uploadId",uploadId));
 }
}
