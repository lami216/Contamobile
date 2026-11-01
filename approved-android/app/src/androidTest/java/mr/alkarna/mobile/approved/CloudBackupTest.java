package mr.alkarna.mobile.approved;

import android.app.job.*;
import android.content.Context;
import android.os.Build;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.junit.Assert.*;

/** Test APK only: actual Keystore/storage/jobs, signed in-memory service, no web endpoint. */
@RunWith(AndroidJUnit4.class)
public class CloudBackupTest {
 private Context context;
 private File directory;
 private CloudBackupManager manager;
 private FakeService service;
 private Object previousSingleton;
 private boolean ownsFixture;
 private final JSONObject target=target("cloud-test-shop");
 private static JSONObject target(String shop){try{return new JSONObject().put("shopId",shop).put("ownerId","cloud-test-owner");}catch(Exception e){throw new IllegalStateException(e);}}
 private static JSONObject copy(JSONObject value) throws Exception {return new JSONObject(value.toString());}
 private static java.lang.reflect.Field singleton() throws Exception {var field=CloudBackupManager.class.getDeclaredField("singleton");field.setAccessible(true);return field;}
 private CloudBackupStore disk() throws Exception {var field=CloudBackupManager.class.getDeclaredField("disk");field.setAccessible(true);return (CloudBackupStore)field.get(manager);}
 private void due(long value) throws Exception {disk().state.put("dueAt",value);disk().state.remove("retryAt");disk().save();}
 private JobScheduler jobs(){return (JobScheduler)context.getSystemService(Context.JOB_SCHEDULER_SERVICE);}
 private JSONObject configured(boolean wifi) throws Exception {return manager.configure(copy(target).put("consent",true).put("schedule","daily").put("time","21:00").put("wifiOnly",wifi));}
 private byte[] snapshot(String shop,String marker) throws Exception {
  JSONObject password=new JSONObject().put("algorithm","PBKDF2-SHA256").put("iterations",210000).put("salt","c3ludGhldGljLXNvbHQ=").put("hash","c3ludGhldGljLWRpZ2VzdA==");
  return new JSONObject().put("format","alkarna-web-backup").put("schemaVersion",1).put("createdAt",java.time.Instant.now().toString()).put("state",new JSONObject().put("originId",shop).put("marker",marker)).put("users",new JSONArray().put(new JSONObject().put("id","cloud-test-owner").put("role","owner").put("password",password))).toString().getBytes(StandardCharsets.UTF_8);
 }
 private JSONObject stage(long revision,byte[] bytes) throws Exception {
  String id=UUID.randomUUID().toString();manager.begin(id,copy(target).put("sizeBytes",bytes.length).put("localRevision",Long.toString(revision)).put("snapshotAt",System.currentTimeMillis()));
  for(int start=0;start<bytes.length;start+=CloudBackupPolicy.CHUNK_BYTES)manager.append(id,Base64.getEncoder().encodeToString(Arrays.copyOfRange(bytes,start,Math.min(bytes.length,start+CloudBackupPolicy.CHUNK_BYTES))));
  return manager.finish(id);
 }
 private interface Checked {void run() throws Exception;}
 private static void rejected(String code,Checked action) throws Exception {try{action.run();fail("Expected "+code);}catch(IOException expected){assertEquals(code,expected.getMessage());}}
 @Before public void prepare() throws Exception {
  // Never remove an existing customer's staging area, even if someone installs this test APK.
  Assume.assumeTrue(Build.FINGERPRINT.startsWith("generic")||Build.FINGERPRINT.contains("emulator")||Build.MODEL.contains("sdk_gphone"));
  context=InstrumentationRegistry.getInstrumentation().getTargetContext();directory=new File(context.getNoBackupFilesDir(),"cloud-backup-v1");Assume.assumeFalse(directory.exists());
  previousSingleton=singleton().get(null);Assume.assumeTrue(previousSingleton==null);ownsFixture=true;
  jobs().cancel(CloudBackupPolicy.JOB_ID);service=new FakeService();manager=new CloudBackupManager(context,service,true);singleton().set(null,manager);
 }
 @After public void cleanup() throws Exception {
  if(!ownsFixture)return;jobs().cancel(CloudBackupPolicy.JOB_ID);
  long end=System.currentTimeMillis()+5000;var running=CloudBackupManager.class.getDeclaredField("running");running.setAccessible(true);while(running.getBoolean(manager)&&System.currentTimeMillis()<end)Thread.sleep(20);
  singleton().set(null,previousSingleton);File[] files=directory.listFiles();if(files!=null)for(File file:files)assertTrue(file.delete());assertTrue(directory.delete());
  KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);keys.deleteEntry("alkarna.cloud.backup.v1");
 }
 @Test public void consentScopeRevisionAndRestorePauseProtectLocalData() throws Exception {
  JSONObject status=manager.status(target,false);assertFalse(status.getJSONObject("settings").getBoolean("consent"));assertFalse(status.getBoolean("paused"));assertEquals(0,service.calls);
  byte[] bytes=snapshot("cloud-test-shop","never-plaintext-5963");String id=UUID.randomUUID().toString();
  rejected("CONSENT_REQUIRED",()->manager.begin(id,copy(target).put("sizeBytes",bytes.length).put("localRevision","1").put("snapshotAt",1)));
  configured(true);due(System.currentTimeMillis()+3600000);stage(2,bytes);JobInfo job=jobs().getPendingJob(CloudBackupPolicy.JOB_ID);assertNotNull(job);assertTrue(job.isPersisted());assertEquals(JobInfo.NETWORK_TYPE_UNMETERED,job.getNetworkType());
  rejected("WRONG_SHOP",()->manager.status(target("other-shop"),false));
  rejected("STALE_SNAPSHOT",()->stage(1,bytes));
  for(File file:Objects.requireNonNull(directory.listFiles()))assertFalse(new String(Files.readAllBytes(file.toPath()),StandardCharsets.ISO_8859_1).contains("never-plaintext-5963"));
  manager.pause(target,true);assertTrue(manager.status(target,false).getBoolean("paused"));assertNull(disk().state.optJSONObject("latest"));assertNull(disk().state.optJSONObject("pending"));
  rejected("CONSENT_REQUIRED",()->stage(3,bytes));manager.process(new AtomicBoolean(false),true);assertFalse(service.consent);assertEquals(0,service.versions.size());
  configured(false);due(System.currentTimeMillis()+3600000);stage(3,bytes);assertFalse(manager.status(target,false).getBoolean("paused"));
  System.out.println("CLOUD BACKUP PASS: explicit consent, bound shop, stale revision rejected, encrypted snapshot, persisted Wi-Fi job and immediate restore pause.");
 }
 @Test public void lostCommitResponseResumesSameImmutableVersionAfterRecreation() throws Exception {
  configured(false);due(System.currentTimeMillis()+3600000);byte[] first=snapshot("cloud-test-shop","A".repeat(70000));stage(1,first);jobs().cancel(CloudBackupPolicy.JOB_ID);due(0);service.dropCommit=true;manager.process(new AtomicBoolean(false),true);
  assertEquals(1,service.versions.size());assertEquals(0,manager.status(target,false).getLong("lastSuccessAt"));String pendingId=disk().state.getJSONObject("pending").getString("backupId");
  // A newer local save may coexist with the immutable first upload; neither is lost.
  manager=new CloudBackupManager(context,service,true);singleton().set(null,manager);due(System.currentTimeMillis()+3600000);stage(2,snapshot("cloud-test-shop","second snapshot"));jobs().cancel(CloudBackupPolicy.JOB_ID);due(0);service.dropCommit=false;manager.process(new AtomicBoolean(false),true);
  assertEquals(pendingId,manager.status(target,false).getJSONObject("lastBackup").getString("backupId"));assertEquals(1,service.versions.size());assertTrue(manager.status(target,false).getBoolean("changesPending"));assertEquals("1",manager.status(target,false).getString("lastBackedUpRevision"));
  due(0);manager.process(new AtomicBoolean(false),true);assertEquals(2,service.versions.size());assertFalse(manager.status(target,false).getBoolean("changesPending"));assertEquals("2",manager.status(target,false).getString("lastBackedUpRevision"));
  int calls=service.calls;assertEquals("up-to-date",manager.run(target).getString("stage"));assertEquals(calls,service.calls);
  System.out.println("CLOUD BACKUP PASS: dropped commit ACK + recreated manager + newer staging = original ID resumed, two real revisions, no duplicate version.");
 }
 @Test public void downloadVerifiesBytesAndPreservesTransferredShopIdentity() throws Exception {
  configured(false);due(System.currentTimeMillis()+3600000);stage(1,snapshot("cloud-test-shop","source"));jobs().cancel(CloudBackupPolicy.JOB_ID);due(0);manager.process(new AtomicBoolean(false),true);JSONObject version=manager.list(target).getJSONArray("versions").getJSONObject(0);assertEquals(version.getLong("sizeBytes"),version.getLong("bytes"));
  String backupId=version.getString("id");byte[] transferred=snapshot("original-shop","original identity");service.versions.put(backupId,transferred);
  JSONObject response=manager.download(copy(target).put("backupId",backupId));assertEquals("original-shop",new JSONObject(response.getString("text")).getJSONObject("state").getString("originId"));assertEquals(CloudBackupStore.hash(transferred),response.getJSONObject("version").getString("sha256"));
  service.corruptDownload=true;rejected("DOWNLOAD_CHECKSUM",()->manager.download(copy(target).put("backupId",backupId)));
  System.out.println("CLOUD BACKUP PASS: verified download, transfer identity preserved for preview, tampered bytes rejected and no automatic restore.");
 }
 @Test public void canceledServerGenerationGetsANewIdWithoutLosingStaging() throws Exception {
  configured(false);due(System.currentTimeMillis()+3600000);stage(1,snapshot("cloud-test-shop","current revision"));jobs().cancel(CloudBackupPolicy.JOB_ID);due(0);service.failChunk=true;manager.process(new AtomicBoolean(false),true);String canceledId=disk().state.getJSONObject("pending").getString("backupId");
  service.invalidateGeneration();due(0);manager.process(new AtomicBoolean(false),true);assertNull(disk().state.optJSONObject("pending"));assertNotNull(disk().state.optJSONObject("latest"));assertEquals(0,service.versions.size());
  due(0);manager.process(new AtomicBoolean(false),true);assertEquals(1,service.versions.size());assertNotEquals(canceledId,manager.status(target,false).getJSONObject("lastBackup").getString("backupId"));assertFalse(manager.status(target,false).getBoolean("changesPending"));
  System.out.println("CLOUD BACKUP PASS: server canceled an unfinished generation, only the stale request ID was discarded and the current staged revision completed once.");
 }
 @Test public void operatingSystemRunsPersistedJobWithoutAWebView() throws Exception {
  configured(false);due(System.currentTimeMillis()+3600000);stage(1,snapshot("cloud-test-shop","background-only"));assertTrue(jobs().getPendingJob(CloudBackupPolicy.JOB_ID).isPersisted());
  // State and pending job survive manager recreation without any activity or WebView.
  manager=new CloudBackupManager(context,service,true);singleton().set(null,manager);due(0);manager.resume();
  try(android.os.ParcelFileDescriptor output=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("cmd jobscheduler run -f "+context.getPackageName()+" "+CloudBackupPolicy.JOB_ID);InputStream in=new android.os.ParcelFileDescriptor.AutoCloseInputStream(output)){while(in.read()!=-1){}}
  long deadline=System.currentTimeMillis()+20000;while(manager.status(target,false).getLong("lastSuccessAt")==0&&System.currentTimeMillis()<deadline)Thread.sleep(50);
  assertEquals(1,service.versions.size());assertTrue("An actual OS JobService handled the upload",service.jobThread);assertTrue(manager.status(target,false).getLong("lastSuccessAt")>0);
  System.out.println("CLOUD BACKUP PASS: actual OS JobService uploaded encrypted staged state after manager recreation, without an activity/WebView.");
 }
 private static final class FakeService implements ContatoolsClient.Transport {
  final Map<String,JSONObject> proofs=new HashMap<>(),uploads=new HashMap<>();
  final Map<String,byte[]> versions=new java.util.concurrent.ConcurrentHashMap<>();
  final Set<String> canceled=new HashSet<>();boolean consent,dropCommit,corruptDownload,failChunk;volatile boolean jobThread;int generation=0,calls;
  synchronized void invalidateGeneration(){generation++;for(String id:uploads.keySet())if(!versions.containsKey(id))canceled.add(id);uploads.keySet().removeIf(canceled::contains);}
  private JSONObject status() throws Exception {return new JSONObject().put("enabled",true).put("subscribed",true).put("consent",consent).put("writer",true).put("generation",generation).put("endsAt",System.currentTimeMillis()+86400000).put("downloadUntil",System.currentTimeMillis()+31*86400000L).put("maxSnapshotBytes",CloudBackupPolicy.MAX_BYTES).put("chunkBytes",CloudBackupPolicy.CHUNK_BYTES);}
  public synchronized JSONObject post(String path,JSONObject body) throws Exception {
   calls++;if(Thread.currentThread().getName().equals("AlKarnaBackupJob"))jobThread=true;String op=body.getString("operation");JSONObject p=body.getJSONObject("payload");
   if(path.endsWith("/challenge")){String id=UUID.randomUUID().toString();JSONObject proof=new JSONObject().put("schema","contatools-backup-proof").put("version",1).put("id",id).put("nonce",UUID.randomUUID().toString()).put("installationId",p.getString("installationId")).put("operation",op).put("payloadHash",ProtocolJson.hash(p)).put("expiresAt",System.currentTimeMillis()+60000);proofs.put(id,proof);return new JSONObject().put("id",id).put("message",ProtocolJson.canonical(proof));}
   JSONObject proof=proofs.remove(body.getString("challengeId"));assertNotNull(proof);assertEquals(op,proof.getString("operation"));assertEquals(ProtocolJson.hash(p),proof.getString("payloadHash"));KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);Signature verifier=Signature.getInstance("SHA256withECDSA");verifier.initVerify(keys.getCertificate(InstallationIdentity.ALIAS).getPublicKey());verifier.update(ProtocolJson.canonical(proof).getBytes(StandardCharsets.UTF_8));assertTrue(verifier.verify(LicenseVerifier.der(ProtocolJson.decode(body.getString("signature")))));
   if(op.equals("status"))return status();
   if(op.equals("consent")){if(!p.getBoolean("enabled")&&consent){generation++;uploads.clear();}consent=p.getBoolean("enabled");return status();}
   if(op.equals("upload.begin")){assertTrue(consent);assertEquals(generation,p.getInt("generation"));String id=p.getString("backupId");if(canceled.contains(id))throw new ContatoolsClient.ServiceFailure(409,true,0);JSONObject upload=uploads.get(id);if(upload==null){upload=copy(p).put("chunks",new JSONObject());uploads.put(id,upload);}JSONArray received=new JSONArray();Iterator<String> names=upload.getJSONObject("chunks").keys();while(names.hasNext())received.put(Integer.parseInt(names.next()));return new JSONObject().put("backupId",id).put("status",versions.containsKey(id)?"ready":"uploading").put("receivedChunks",received).put("chunkCount",(p.getInt("sizeBytes")+CloudBackupPolicy.CHUNK_BYTES-1)/CloudBackupPolicy.CHUNK_BYTES).put("chunkBytes",CloudBackupPolicy.CHUNK_BYTES);}
   if(op.equals("upload.chunk")){assertTrue(consent);if(failChunk){failChunk=false;throw new IOException("Deliberate interrupted upload");}uploads.get(p.getString("backupId")).getJSONObject("chunks").put(Integer.toString(p.getInt("index")),p.getString("data"));return new JSONObject().put("received",true);}
   if(op.equals("upload.commit")){String id=p.getString("backupId");JSONObject upload=uploads.get(id);ByteArrayOutputStream out=new ByteArrayOutputStream();JSONObject chunks=upload.getJSONObject("chunks");for(int n=0;n<chunks.length();n++)out.write(Base64.getDecoder().decode(chunks.getString(Integer.toString(n))));byte[] bytes=out.toByteArray();assertEquals(upload.getString("sha256"),CloudBackupStore.hash(bytes));versions.put(id,bytes);if(dropCommit)throw new IOException("Deliberately lost successful commit response");return new JSONObject().put("backupId",id).put("status","ready").put("sha256",CloudBackupStore.hash(bytes)).put("sizeBytes",bytes.length).put("createdAt",System.currentTimeMillis());}
   if(op.equals("list")){JSONArray items=new JSONArray();for(Map.Entry<String,byte[]> entry:versions.entrySet())items.put(new JSONObject().put("id",entry.getKey()).put("sizeBytes",entry.getValue().length).put("sha256",CloudBackupStore.hash(entry.getValue())).put("createdAt",System.currentTimeMillis()));return new JSONObject().put("versions",items).put("nextCursor",JSONObject.NULL);}
   if(op.equals("download.chunk")){byte[] bytes=versions.get(p.getString("backupId"));int index=p.getInt("index"),start=index*CloudBackupPolicy.CHUNK_BYTES;byte[] chunk=Arrays.copyOfRange(bytes,start,Math.min(bytes.length,start+CloudBackupPolicy.CHUNK_BYTES));if(corruptDownload&&chunk.length>0)chunk[0]^=1;return new JSONObject().put("backupId",p.getString("backupId")).put("index",index).put("data",Base64.getEncoder().encodeToString(chunk)).put("chunkCount",(bytes.length+CloudBackupPolicy.CHUNK_BYTES-1)/CloudBackupPolicy.CHUNK_BYTES).put("sizeBytes",bytes.length).put("sha256",CloudBackupStore.hash(bytes));}
   throw new IOException("Unknown fake operation");
  }
 }
}
