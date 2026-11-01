package mr.alkarna.mobile.approved;

import android.app.job.*;
import android.content.*;
import android.net.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.ZoneId;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** Optional cloud copies; no local accounting write or local-license decision waits here. */
final class CloudBackupManager {
 private static CloudBackupManager singleton;
 private static final Object UPLOAD_LOCK=new Object();
 private final Object lock=new Object();
 private final Context context;
 private final CloudBackupStore disk;
 private final CloudBackupClient client;
 private final boolean injected;
 private final java.security.SecureRandom random=new java.security.SecureRandom();
 private Stage transfer;
 private volatile boolean running;
 private final AtomicBoolean manualQueued=new AtomicBoolean(false);
 private static final class Stage {
  final String id;final JSONObject target;final long epoch,snapshotAt;final String revision;final int expected;final ByteArrayOutputStream data=new ByteArrayOutputStream();
  Stage(String id,JSONObject target,long epoch,String revision,int expected,long at){this.id=id;this.target=target;this.epoch=epoch;this.revision=revision;this.expected=expected;snapshotAt=at;}
 }
 static synchronized CloudBackupManager get(Context context) throws Exception {if(singleton==null)singleton=new CloudBackupManager(context,new ContatoolsClient.HttpsTransport(BuildConfig.CONTATOOLS_ORIGIN),false);return singleton;}
 CloudBackupManager(Context context,ContatoolsClient.Transport transport,boolean injected) throws Exception {this.context=context.getApplicationContext();this.injected=injected;InstallationIdentity identity=new InstallationIdentity();disk=new CloudBackupStore(context,identity.fingerprint());client=new CloudBackupClient(identity,transport);if("uploading".equals(disk.state.optString("stage")))disk.state.put("stage","scheduled");}
 private static JSONObject target(JSONObject p) throws Exception {String shop=p.getString("shopId"),owner=p.getString("ownerId");if(!shop.matches("[A-Za-z0-9_.:-]{1,160}")||!owner.matches("[A-Za-z0-9_.:-]{1,160}"))throw new IOException("INVALID_TARGET");return new JSONObject().put("shopId",shop).put("ownerId",owner);}
 private static boolean same(JSONObject a,JSONObject b){return a!=null&&b!=null&&a.optString("shopId").equals(b.optString("shopId"))&&a.optString("ownerId").equals(b.optString("ownerId"));}
 private JSONObject settings(){return disk.state.optJSONObject("settings");}
 private void scope(JSONObject value) throws Exception {
  JSONObject old=disk.state.optJSONObject("context");if(same(old,value))return;
  if(old!=null&&settings().optBoolean("consent"))throw new IOException("WRONG_SHOP");
  if(old!=null){JSONObject revoke=disk.state.optJSONObject("revocation");long epoch=disk.state.optLong("epoch")+1;clearBlobs();disk.state=new JSONObject().put("version",1).put("epoch",epoch).put("settings",CloudBackupPolicy.settings(new JSONObject())).put("stage","disabled");if(revoke!=null)disk.state.put("revocation",revoke);}
  disk.state.put("context",value);disk.save();
 }
 private void clearBlobs(){JSONObject latest=disk.state.optJSONObject("latest"),pending=disk.state.optJSONObject("pending");if(latest!=null)disk.deleteSnapshot(latest.optString("id"));if(pending!=null&&(latest==null||!pending.optString("id").equals(latest.optString("id"))))disk.deleteSnapshot(pending.optString("id"));}
 private JSONObject local() throws Exception {
  JSONObject state=disk.state,latest=state.optJSONObject("latest"),server=state.optJSONObject("server");
  boolean changes=latest!=null&&!latest.optString("sha256").equals(state.optString("lastSha256"));String stage=state.optString("stage","disabled");
  if("uploading".equals(stage)&&!running)stage="scheduled";
  JSONObject visibleServer=server==null?null:ProtocolJson.copy(server);if(visibleServer!=null)visibleServer.put("entitlement",new JSONObject().put("enabled",server.optBoolean("subscribed")).put("active",server.optBoolean("subscribed")&&server.optBoolean("writer")).put("writer",server.optBoolean("writer")).put("endsAt",server.opt("endsAt")).put("downloadUntil",server.opt("downloadUntil")).put("quotaBytes",server.opt("quotaBytes")).put("usedBytes",server.opt("usedBytes")));
  return new JSONObject().put("settings",ProtocolJson.copy(settings())).put("context",state.opt("context")).put("paused",state.optBoolean("paused")).put("stage",stage).put("lastSuccessAt",state.optLong("lastSuccessAt")).put("lastBackup",state.opt("lastBackup")).put("stagedRevision",latest==null?JSONObject.NULL:latest.optString("localRevision")).put("lastBackedUpRevision",state.opt("lastBackedUpRevision")).put("changesPending",changes).put("nextRunAt",state.optLong("dueAt")).put("retryAt",state.optLong("retryAt")).put("lastError",state.opt("lastError")).put("progress",state.opt("progress")).put("server",visibleServer==null?JSONObject.NULL:visibleServer).put("serverCheckedAt",state.optLong("serverCheckedAt"));
 }
 JSONObject status(JSONObject p,boolean refresh) throws Exception {
  JSONObject t=target(p);synchronized(lock){scope(t);if(!refresh)return local();}
  ensureNetwork(false);JSONObject server=client.call("status",t);synchronized(lock){if(!same(disk.state.optJSONObject("context"),t))throw new IOException("WRONG_SHOP");disk.state.put("server",server).put("serverCheckedAt",System.currentTimeMillis());disk.save();return local();}
 }
 JSONObject configure(JSONObject p) throws Exception {
  JSONObject t=target(p),newSettings=CloudBackupPolicy.settings(p);boolean consent=newSettings.optBoolean("consent");
  synchronized(lock){scope(t);if(!consent){pauseLocked(false);disk.state.put("settings",newSettings);disk.save();scheduleLocked();return local();}}
  // Explicit opt-in must be accepted online. An already consented owner may change cadence offline.
  boolean needsConsent;synchronized(lock){needsConsent=!settings().optBoolean("consent")||disk.state.has("revocation");}
  long expectedEpoch;synchronized(lock){expectedEpoch=disk.state.optLong("epoch");}
  if(needsConsent){ensureNetwork(false);revokeIfNeeded();JSONObject server=client.call("consent",ProtocolJson.copy(t).put("enabled",true).put("consentVersion",1));if(!server.optBoolean("subscribed")||!server.optBoolean("consent")||!server.optBoolean("writer"))throw new IOException("NOT_SUBSCRIBED");synchronized(lock){scope(t);if(expectedEpoch!=disk.state.optLong("epoch"))throw new IOException("PAUSED");JSONObject oldPending=disk.state.optJSONObject("pending"),latest=disk.state.optJSONObject("latest");if(oldPending!=null&&(latest==null||!oldPending.optString("id").equals(latest.optString("id"))))disk.deleteSnapshot(oldPending.optString("id"));disk.state.remove("pending");disk.state.put("server",server).put("serverCheckedAt",System.currentTimeMillis());}}
  synchronized(lock){if(!same(disk.state.optJSONObject("context"),t))throw new IOException("WRONG_SHOP");if(expectedEpoch!=disk.state.optLong("epoch"))throw new IOException("PAUSED");JSONObject latest=disk.state.optJSONObject("latest");String stage=latest==null?"waiting-snapshot":latest.optString("sha256").equals(disk.state.optString("lastSha256"))?"up-to-date":"scheduled";disk.state.put("settings",newSettings).put("paused",false).put("stage",stage).remove("lastError");long now=System.currentTimeMillis();disk.state.put("dueAt",disk.state.optLong("lastSuccessAt")==0?now:CloudBackupPolicy.nextPreferred(newSettings,now,ZoneId.systemDefault()));disk.save();scheduleLocked();return local();}
 }
 private void pauseLocked(boolean invalidate) throws Exception {
  JSONObject t=disk.state.optJSONObject("context");if(t!=null)disk.state.put("revocation",ProtocolJson.copy(t));
  disk.state.put("epoch",disk.state.optLong("epoch")+1);settings().put("consent",false);disk.state.put("paused",invalidate).put("stage",invalidate?"paused":"disabled").remove("retryAt");disk.state.remove("progress");
  transfer=null;if(invalidate){clearBlobs();disk.state.remove("latest");disk.state.remove("pending");}
  scheduler().cancel(CloudBackupPolicy.JOB_ID);disk.save();
 }
 JSONObject pause(JSONObject p,boolean invalidate) throws Exception {JSONObject t=target(p);synchronized(lock){scope(t);pauseLocked(invalidate);scheduleLocked();return local();}}
 JSONObject begin(String id,JSONObject p) throws Exception {
  JSONObject t=target(p);int size=p.getInt("sizeBytes");String revision=p.getString("localRevision");long at=p.getLong("snapshotAt");
  if(!id.matches("[a-f0-9-]{36}")||size<2||size>CloudBackupPolicy.MAX_BYTES||!revision.matches("[0-9]{1,18}")||at<0)throw new IOException("INVALID_SNAPSHOT");
  synchronized(lock){if(!same(disk.state.optJSONObject("context"),t)||!settings().optBoolean("consent"))throw new IOException("CONSENT_REQUIRED");if(transfer!=null)throw new IOException("STAGE_BUSY");JSONObject previous=disk.state.optJSONObject("latest");if(previous!=null&&CloudBackupPolicy.older(revision,previous.optString("localRevision")))throw new IOException("STALE_SNAPSHOT");transfer=new Stage(id,t,disk.state.optLong("epoch"),revision,size,at);return new JSONObject().put("accepted",true);}
 }
 void append(String id,String encoded) throws Exception {synchronized(lock){if(transfer==null||!transfer.id.equals(id)||encoded.length()>65536)throw new IOException("INVALID_STAGE");byte[] bytes=Base64.getDecoder().decode(encoded);if(bytes.length>CloudBackupPolicy.CHUNK_BYTES||transfer.data.size()+bytes.length>transfer.expected){transfer=null;throw new IOException("INVALID_STAGE");}transfer.data.write(bytes);}}
 JSONObject finish(String id) throws Exception {
  synchronized(lock){Stage current=transfer;transfer=null;if(current==null||!current.id.equals(id)||current.data.size()!=current.expected||current.epoch!=disk.state.optLong("epoch")||!settings().optBoolean("consent"))throw new IOException("INVALID_STAGE");byte[] bytes=current.data.toByteArray();CloudBackupStore.validateSnapshot(bytes,current.target.getString("shopId"));JSONObject previous=disk.state.optJSONObject("latest");
   if(previous!=null){if(CloudBackupPolicy.older(current.revision,previous.optString("localRevision")))throw new IOException("STALE_SNAPSHOT");if(current.revision.equals(previous.optString("localRevision")))return local();}
   String hash=CloudBackupStore.hash(bytes);disk.writeSnapshot(id,bytes);JSONObject latest=new JSONObject().put("id",id).put("sha256",hash).put("sizeBytes",bytes.length).put("localRevision",current.revision).put("snapshotAt",current.snapshotAt);
   disk.state.put("latest",latest).put("stage",hash.equals(disk.state.optString("lastSha256"))?"up-to-date":"scheduled");if("connected".equals(settings().optString("schedule")))disk.state.put("dueAt",System.currentTimeMillis()+2000+(long)(random.nextDouble()*3000));disk.save();
   JSONObject pending=disk.state.optJSONObject("pending");if(previous!=null&&(pending==null||!previous.optString("id").equals(pending.optString("id"))))disk.deleteSnapshot(previous.optString("id"));scheduleLocked();return local();
  }
 }
 void cancelStage(String id){synchronized(lock){if(transfer!=null&&transfer.id.equals(id))transfer=null;}}
 JSONObject run(JSONObject p) throws Exception {JSONObject t=target(p);synchronized(lock){scope(t);if(!settings().optBoolean("consent"))throw new IOException("CONSENT_REQUIRED");JSONObject latest=disk.state.optJSONObject("latest");if(latest==null)throw new IOException("SNAPSHOT_REQUIRED");if(latest.optString("sha256").equals(disk.state.optString("lastSha256"))){disk.state.put("stage","up-to-date");disk.save();return local();}disk.state.put("dueAt",System.currentTimeMillis()).put("stage","scheduled");disk.state.remove("retryAt");disk.state.remove("lastError");disk.save();scheduleLocked();}launch();synchronized(lock){return local();}}
 JSONObject list(JSONObject p) throws Exception {JSONObject t=target(p);ensureNetwork(false);JSONObject result=client.call("list",t.put("cursor",p.optInt("cursor",0)).put("limit",Math.max(1,Math.min(50,p.optInt("limit",20)))));JSONArray versions=result.optJSONArray("versions");if(versions!=null)for(int i=0;i<versions.length();i++){JSONObject item=versions.getJSONObject(i);item.put("backupId",item.getString("id")).put("bytes",item.optLong("sizeBytes"));}return result;}
 JSONObject download(JSONObject p) throws Exception {
  JSONObject t=target(p);String id=p.getString("backupId");if(!id.matches("[a-f0-9-]{36}"))throw new IOException("INVALID_BACKUP_ID");ensureNetwork(false);ByteArrayOutputStream out=new ByteArrayOutputStream();String hash=null;int count=1,size=0;
  for(int index=0;index<count;index++){ensureNetwork(false);JSONObject result=client.call("download.chunk",ProtocolJson.copy(t).put("backupId",id).put("index",index));if(!id.equals(result.optString("backupId"))||result.optInt("index",-1)!=index)throw new IOException("INVALID_DOWNLOAD");
   if(index==0){count=result.getInt("chunkCount");size=result.getInt("sizeBytes");hash=result.getString("sha256");if(size<2||size>CloudBackupPolicy.MAX_BYTES||count!=(size+CloudBackupPolicy.CHUNK_BYTES-1)/CloudBackupPolicy.CHUNK_BYTES||!hash.matches("[a-f0-9]{64}"))throw new IOException("INVALID_DOWNLOAD");}
   if(result.getInt("sizeBytes")!=size||result.getInt("chunkCount")!=count||!hash.equals(result.getString("sha256")))throw new IOException("INVALID_DOWNLOAD");byte[] bytes=Base64.getDecoder().decode(result.getString("data"));if(bytes.length>CloudBackupPolicy.CHUNK_BYTES||out.size()+bytes.length>size)throw new IOException("INVALID_DOWNLOAD");out.write(bytes);
  }
  byte[] bytes=out.toByteArray();if(bytes.length!=size||!CloudBackupStore.hash(bytes).equals(hash))throw new IOException("DOWNLOAD_CHECKSUM");CloudBackupStore.validateSnapshot(bytes,null);return new JSONObject().put("text",new String(bytes,StandardCharsets.UTF_8)).put("version",new JSONObject().put("id",id).put("sha256",hash).put("sizeBytes",size));
 }
 private JobScheduler scheduler(){return (JobScheduler)context.getSystemService(Context.JOB_SCHEDULER_SERVICE);}
 private void scheduleLocked() throws Exception {
  boolean revoke=disk.state.has("revocation");JSONObject latest=disk.state.optJSONObject("latest");boolean dirty=latest!=null&&!latest.optString("sha256").equals(disk.state.optString("lastSha256"));
  if(!revoke&&(!settings().optBoolean("consent")||!dirty)){scheduler().cancel(CloudBackupPolicy.JOB_ID);return;}
  // Scheduling the same ID while its service is running stops that job. A newer
  // snapshot waits for this immutable upload to finish, then gets one new job.
  if(running&&!revoke)return;
  long due=revoke?System.currentTimeMillis():disk.state.optLong("dueAt",System.currentTimeMillis());due=Math.max(due,disk.state.optLong("retryAt"));
  boolean wifi=!revoke&&settings().optBoolean("wifiOnly");int network=wifi?JobInfo.NETWORK_TYPE_UNMETERED:JobInfo.NETWORK_TYPE_ANY;JobInfo old=scheduler().getPendingJob(CloudBackupPolicy.JOB_ID);
  if(old!=null&&old.getExtras().getLong("dueAt",-1)==due&&old.getExtras().getBoolean("wifiOnly",false)==wifi)return;
  android.os.PersistableBundle extras=new android.os.PersistableBundle();extras.putLong("dueAt",due);extras.putBoolean("wifiOnly",wifi);
  JobInfo.Builder builder=new JobInfo.Builder(CloudBackupPolicy.JOB_ID,new ComponentName(context,CloudBackupJobService.class)).setPersisted(true).setExtras(extras).setRequiredNetworkType(network).setMinimumLatency(Math.max(0,due-System.currentTimeMillis())).setBackoffCriteria(30000,JobInfo.BACKOFF_POLICY_EXPONENTIAL);
  if(wifi&&android.os.Build.VERSION.SDK_INT>=28)builder.setRequiredNetwork(new NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED).build());
  JobInfo job=builder.build();
  if(scheduler().schedule(job)!=JobScheduler.RESULT_SUCCESS)throw new IOException("SCHEDULER_UNAVAILABLE");
 }
 void resume(){synchronized(lock){try{scheduleLocked();}catch(Exception ignored){}}}
 void launch(){if(!manualQueued.compareAndSet(false,true))return;Thread thread=new Thread(()->{try{process(new AtomicBoolean(false));}finally{manualQueued.set(false);}},"AlKarnaBackupManual");thread.start();}
 static boolean unmeteredWifi(NetworkCapabilities caps){return caps!=null&&caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)&&caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED);}
 private void ensureNetwork(boolean wifi) throws Exception {if(injected)return;ConnectivityManager manager=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);NetworkCapabilities caps=manager==null?null:manager.getNetworkCapabilities(manager.getActiveNetwork());if(caps==null||!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)||!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED))throw new IOException("NETWORK");if(wifi&&!unmeteredWifi(caps))throw new IOException("WIFI_REQUIRED");}
 private void revokeIfNeeded() throws Exception {JSONObject revoke;synchronized(lock){revoke=disk.state.optJSONObject("revocation");if(revoke==null)return;revoke=ProtocolJson.copy(revoke);}try{client.call("consent",revoke.put("enabled",false).put("consentVersion",1));}catch(ContatoolsClient.ServiceFailure error){if(error.status!=403&&error.status!=404)throw error;}synchronized(lock){JSONObject current=disk.state.optJSONObject("revocation");if(same(current,revoke)){disk.state.remove("revocation");disk.save();}}}
 private void live(long epoch,JSONObject target,AtomicBoolean stopped) throws Exception {if(stopped.get())throw new IOException("STOPPED");synchronized(lock){if(epoch!=disk.state.optLong("epoch")||!settings().optBoolean("consent")||!same(disk.state.optJSONObject("context"),target))throw new IOException("PAUSED");ensureNetwork(settings().optBoolean("wifiOnly"));}}
 void process(AtomicBoolean stopped){process(stopped,false);}
 void process(AtomicBoolean stopped,boolean fromJob){
  synchronized(UPLOAD_LOCK){running=true;String attemptedBackupId=null;try{
   ensureNetwork(false);revokeIfNeeded();JSONObject t,pending;long epoch;
   synchronized(lock){if(!settings().optBoolean("consent"))return;JSONObject latest=disk.state.optJSONObject("latest");if(latest==null||latest.optString("sha256").equals(disk.state.optString("lastSha256")))return;long now=System.currentTimeMillis();if(now<Math.max(disk.state.optLong("dueAt"),disk.state.optLong("retryAt")))return;t=ProtocolJson.copy(disk.state.getJSONObject("context"));epoch=disk.state.optLong("epoch");pending=disk.state.optJSONObject("pending");if(pending==null){pending=ProtocolJson.copy(latest).put("backupId",UUID.randomUUID().toString());disk.state.put("pending",pending);}pending=ProtocolJson.copy(pending);disk.state.put("stage","uploading");disk.state.remove("lastError");disk.save();}
   attemptedBackupId=pending.getString("backupId");live(epoch,t,stopped);JSONObject server=client.call("status",t);synchronized(lock){if(epoch!=disk.state.optLong("epoch")||!same(disk.state.optJSONObject("context"),t)||!settings().optBoolean("consent"))return;disk.state.put("server",server).put("serverCheckedAt",System.currentTimeMillis());disk.save();}
   if(!server.optBoolean("subscribed"))throw new IOException("NOT_SUBSCRIBED");if(!server.optBoolean("writer"))throw new IOException("WRITER_REQUIRED");if(!server.optBoolean("consent"))throw new IOException("CONSENT_REQUIRED");
   byte[] bytes; synchronized(lock){bytes=disk.snapshot(pending.getString("id"));}if(bytes.length!=pending.getInt("sizeBytes")||!CloudBackupStore.hash(bytes).equals(pending.getString("sha256")))throw new IOException("STAGED_CHECKSUM");
   live(epoch,t,stopped);JSONObject begin=client.call("upload.begin",ProtocolJson.copy(t).put("backupId",pending.getString("backupId")).put("generation",server.getInt("generation")).put("sizeBytes",bytes.length).put("sha256",pending.getString("sha256")).put("snapshotAt",pending.getLong("snapshotAt")).put("localRevision",pending.getString("localRevision")));
   int count=(bytes.length+CloudBackupPolicy.CHUNK_BYTES-1)/CloudBackupPolicy.CHUNK_BYTES;if(begin.optInt("chunkBytes",CloudBackupPolicy.CHUNK_BYTES)!=CloudBackupPolicy.CHUNK_BYTES||begin.optInt("chunkCount",count)!=count)throw new IOException("INVALID_UPLOAD");Set<Integer> received=new HashSet<>();JSONArray chunks=begin.optJSONArray("receivedChunks");if(chunks!=null)for(int i=0;i<chunks.length();i++)received.add(chunks.getInt(i));
   for(int i=0;i<count;i++){live(epoch,t,stopped);if(!received.contains(i)&&!"ready".equals(begin.optString("status"))){int from=i*CloudBackupPolicy.CHUNK_BYTES,to=Math.min(bytes.length,from+CloudBackupPolicy.CHUNK_BYTES);client.call("upload.chunk",ProtocolJson.copy(t).put("backupId",pending.getString("backupId")).put("index",i).put("data",Base64.getEncoder().encodeToString(Arrays.copyOfRange(bytes,from,to))));}synchronized(lock){disk.state.put("progress",new JSONObject().put("completed",i+1).put("total",count));disk.save();}}
   live(epoch,t,stopped);JSONObject result=client.call("upload.commit",ProtocolJson.copy(t).put("backupId",pending.getString("backupId")));if(!"ready".equals(result.optString("status"))||!pending.getString("backupId").equals(result.optString("backupId"))||!pending.getString("sha256").equals(result.optString("sha256"))||pending.getInt("sizeBytes")!=result.optInt("sizeBytes"))throw new IOException("INVALID_ACK");
   synchronized(lock){if(epoch!=disk.state.optLong("epoch")||!same(disk.state.optJSONObject("context"),t))return;long now=System.currentTimeMillis();disk.state.put("lastSuccessAt",now).put("lastBackup",result).put("lastSha256",pending.getString("sha256")).put("lastBackedUpRevision",pending.getString("localRevision")).put("failures",0).put("dueAt",CloudBackupPolicy.nextPreferred(settings(),now,ZoneId.systemDefault()));disk.state.remove("pending");disk.state.remove("retryAt");disk.state.remove("lastError");disk.state.remove("progress");JSONObject latest=disk.state.optJSONObject("latest");boolean dirty=latest!=null&&!latest.optString("sha256").equals(pending.getString("sha256"));disk.state.put("stage",settings().optBoolean("consent")?(dirty?"scheduled":"up-to-date"):"paused");disk.save();if(latest==null||!latest.optString("id").equals(pending.getString("id")))disk.deleteSnapshot(pending.getString("id"));}
  }catch(Exception failure){synchronized(lock){try{if(!"PAUSED".equals(failure.getMessage())&&!"STOPPED".equals(failure.getMessage())){int n=Math.min(20,disk.state.optInt("failures")+1);long now=System.currentTimeMillis(),retry=now+CloudBackupPolicy.backoff(n,random.nextDouble());int status=0;if(failure instanceof ContatoolsClient.ServiceFailure){ContatoolsClient.ServiceFailure service=(ContatoolsClient.ServiceFailure)failure;status=service.status;retry=Math.max(retry,service.retryAt);if(status==409){JSONObject pending=disk.state.optJSONObject("pending"),latest=disk.state.optJSONObject("latest");if(pending!=null&&pending.optString("backupId").equals(attemptedBackupId)){disk.state.remove("pending");if(latest==null||!latest.optString("id").equals(pending.optString("id")))disk.deleteSnapshot(pending.optString("id"));}}}String code=errorCode(failure);disk.state.put("failures",n).put("retryAt",retry).put("stage","waiting").put("lastError",new JSONObject().put("code",code).put("status",status).put("at",now));disk.save();}}catch(Exception ignored){}}}
  finally{running=false;if(!fromJob)synchronized(lock){try{scheduleLocked();}catch(Exception ignored){}}}}
 }
 static String errorCode(Exception error){if(error instanceof ContatoolsClient.ServiceFailure){int status=((ContatoolsClient.ServiceFailure)error).status;return status==429?"RATE_LIMITED":status==413?"SNAPSHOT_TOO_LARGE":status==403?"UPLOAD_DENIED":status==409?"REVIEW_REQUIRED":"SERVER_ERROR";}String m=error.getMessage();return m!=null&&m.matches("[A-Z_]{3,40}")?m:"BACKUP_UNAVAILABLE";}
}
