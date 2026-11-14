package mr.alkarna.mobile.approved;

import static org.junit.Assert.*;
import android.content.Context;
import android.os.Build;
import android.util.AtomicFile;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.json.*;
import org.junit.*;
import org.junit.rules.TestWatcher;
import org.junit.runner.Description;
import org.junit.runner.RunWith;

/** Disposable emulator only. Real Keystore, licence replicas and native gate; signed local service. */
@RunWith(AndroidJUnit4.class)
public final class StandaloneControlTest {
  private Context context;private DeviceLicense license;private DeviceLifecycleClient client;private Service service;
  private Map<String,PublicKey> oldLegacy,oldOnline;private boolean owned;
  private ActivityScenario<MainActivity> activity;
  private static final String[] OWNED_FILES={"activation-v2.json","contatools-v1.json",AccountingResetStore.FILE};
  private static final String[] OWNED_DIRECTORIES={DeviceLifecycleStore.DIRECTORY,"cloud-backup-v1"};
  private static final String[] OWNED_ALIASES={DeviceLifecycleStore.ALIAS,"alkarna.activation.state.v2",InstallationIdentity.ALIAS,"alkarna.contatools.journal.v1","alkarna.cloud.backup.v1",AccountingResetStore.ALIAS};
  @Rule public final TestWatcher executed=new TestWatcher(){@Override protected void succeeded(Description d){android.os.Bundle b=new android.os.Bundle();b.putString("stream","\nSTANDALONE CONTROL CASE PASS "+d.getMethodName()+"\n");InstrumentationRegistry.getInstrumentation().sendStatus(0,b);}};
  private interface Work{void run()throws Exception;}
  private static void rejects(Work work)throws Exception{try{work.run();fail("Expected native rejection");}catch(Exception expected){}}
  @SuppressWarnings("unchecked") private static Map<String,PublicKey> onlineKeys()throws Exception{var field=LicenseVerifier.class.getDeclaredField("ONLINE_KEYS");field.setAccessible(true);return (Map<String,PublicKey>)field.get(null);}
  private static JSONObject copy(JSONObject value)throws Exception{return new JSONObject(value.toString());}
  private void recreate()throws Exception{license=new DeviceLicense(context);client=new DeviceLifecycleClient(context,license,service.issuers,service);service.license=license;}
  private static java.lang.reflect.Field backupSingleton()throws Exception{var field=CloudBackupManager.class.getDeclaredField("singleton");field.setAccessible(true);return field;}
  private void assertFreshOwnedState()throws Exception{
    for(String name:OWNED_FILES)for(String suffix:new String[]{"",".bak",".new"})assertFalse("Never overwrite customer state: "+name+suffix,new File(context.getNoBackupFilesDir(),name+suffix).exists());
    for(String name:OWNED_DIRECTORIES)assertFalse("Never overwrite customer state: "+name,new File(context.getNoBackupFilesDir(),name).exists());
    for(String name:new String[]{"activation-v2","standalone-user-fixture"})assertTrue("Never overwrite customer preferences: "+name,context.getSharedPreferences(name,Context.MODE_PRIVATE).getAll().isEmpty());
    assertFalse("Never overwrite customer state: standalone-bookkeeping-fixture.bin",new File(context.getFilesDir(),"standalone-bookkeeping-fixture.bin").exists());
    KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);for(String alias:OWNED_ALIASES)assertFalse("Never overwrite customer key: "+alias,keys.containsAlias(alias));
    assertNull("Never replace an existing cloud-backup manager",backupSingleton().get(null));
  }
  @Before public void setup()throws Exception{
    assertEquals("true",InstrumentationRegistry.getArguments().getString("standaloneControlIsolation"));
    assertTrue(Build.HARDWARE.equals("ranchu")||Build.HARDWARE.equals("goldfish")||Build.FINGERPRINT.contains("emulator")||Build.MODEL.contains("sdk_gphone"));
    context=InstrumentationRegistry.getInstrumentation().getTargetContext();
    assertFreshOwnedState();
    oldLegacy=new HashMap<>(LicenseCompatibilityTest.keys());oldOnline=new HashMap<>(onlineKeys());owned=true;
    license=new DeviceLicense(context);service=new Service(license.deviceCode());LicenseCompatibilityTest.keys().put("alkarna-license-v2",service.pair.getPublic());onlineKeys().put("contatools-online-v2:fixture",service.pair.getPublic());recreate();
  }
  private void wipeOwned()throws Exception{
    assertTrue(owned);
    for(String name:OWNED_DIRECTORIES){File directory=new File(context.getNoBackupFilesDir(),name);if(directory.exists()){
      File[] files=directory.listFiles();assertNotNull("Owned journal directory is unreadable: "+name,files);
      for(File file:files){assertTrue("Unexpected owned journal entry: "+file,file.isFile()&&file.getName().matches("state\\.bin(?:\\.bak|\\.new)?"));assertTrue("Could not remove owned journal: "+file,file.delete());}
      assertTrue("Could not remove owned journal directory: "+directory,directory.delete());
    }}
    for(String name:OWNED_FILES)for(String suffix:new String[]{"",".bak",".new"}){File file=new File(context.getNoBackupFilesDir(),name+suffix);if(file.exists())assertTrue("Could not remove owned journal: "+file,file.delete());}
    assertTrue(context.getSharedPreferences("activation-v2",Context.MODE_PRIVATE).edit().clear().commit());
    KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);for(String alias:OWNED_ALIASES)if(keys.containsAlias(alias))keys.deleteEntry(alias);
  }
  private void quiesceOwnedActivity()throws Exception{
    if(activity!=null){activity.close();activity=null;}
    if(service!=null)service.closed=true;
    InstrumentationRegistry.getInstrumentation().waitForIdleSync();
    ((android.app.job.JobScheduler)context.getSystemService(Context.JOB_SCHEDULER_SERVICE)).cancel(CloudBackupPolicy.JOB_ID);
    for(String name:new String[]{"administrationQueue","backupQueue"}){
      var field=MainActivity.class.getDeclaredField(name);field.setAccessible(true);
      java.util.concurrent.ThreadPoolExecutor queue=(java.util.concurrent.ThreadPoolExecutor)field.get(null);
      queue.submit(()->{}).get(45,TimeUnit.SECONDS);
      assertTrue("Owned Activity queue did not drain: "+name,queue.getQueue().isEmpty());
    }
    Object manager=backupSingleton().get(null);if(manager!=null){
      var running=CloudBackupManager.class.getDeclaredField("running");running.setAccessible(true);long end=android.os.SystemClock.elapsedRealtime()+5000;
      while(running.getBoolean(manager)&&android.os.SystemClock.elapsedRealtime()<end)Thread.sleep(20);
      assertFalse("Owned cloud-backup work did not stop",running.getBoolean(manager));
    }
    ((android.app.job.JobScheduler)context.getSystemService(Context.JOB_SCHEDULER_SERVICE)).cancel(CloudBackupPolicy.JOB_ID);
    backupSingleton().set(null,null);
    InstrumentationRegistry.getInstrumentation().waitForIdleSync();
  }
  @After public void cleanup()throws Exception{
    if(!owned)return;quiesceOwnedActivity();wipeOwned();LicenseCompatibilityTest.keys().clear();LicenseCompatibilityTest.keys().putAll(oldLegacy);onlineKeys().clear();onlineKeys().putAll(oldOnline);
    File marker=new File(context.getFilesDir(),"standalone-bookkeeping-fixture.bin");if(marker.exists())assertTrue(marker.delete());context.getSharedPreferences("standalone-user-fixture",0).edit().clear().commit();
    assertFreshOwnedState();
  }
  private JSONObject historical()throws Exception{JSONObject document=service.document();license.install(document.toString());return document;}
  private void enroll()throws Exception{client.enroll(new JSONObject());}
  private JSONObject state()throws Exception{var field=DeviceLicense.class.getDeclaredField("state");field.setAccessible(true);return copy((JSONObject)field.get(license));}
  private String js(ActivityScenario<MainActivity> scenario,String script)throws Exception{ArrayBlockingQueue<String> answer=new ArrayBlockingQueue<>(1);scenario.onActivity(a->a.getWebView().evaluateJavascript(script,value->answer.offer(value==null?"null":value)));String value=answer.poll(15,TimeUnit.SECONDS);assertNotNull("JavaScript callback",value);return value;}
  @Test public void freshManualImportRequiresTheExactSignedOnlineAdmissionBeforeConsumption()throws Exception{
    JSONObject document=service.document();service.offline=true;rejects(()->client.importManual(document.toString()));assertEquals("",license.documentHash());assertEquals(0,state().getJSONArray("consumedLicenseIds").length());
    service.offline=false;assertTrue(client.importManual(document.toString()).getBoolean("valid"));assertEquals(ProtocolJson.hash(document),license.documentHash());assertEquals(1,service.admissions);assertEquals(1,state().getJSONArray("consumedLicenseIds").length());
  }
  @Test public void existingInstalledLicenceRemainsOfflineWithoutRestartingItsClock()throws Exception{
    JSONObject document=historical();double before=license.status().getJSONObject("license").getDouble("remainingSeconds");service.offline=true;rejects(()->client.refresh());Thread.sleep(150);recreate();assertTrue(license.status().getBoolean("valid"));assertEquals(ProtocolJson.hash(document),license.documentHash());assertTrue(license.status().getJSONObject("license").getDouble("remainingSeconds")<=before);
  }
  @Test public void signedRevocationPersistsAcrossColdOpenAndRejectsOldAndUnknownFiles()throws Exception{
    JSONObject original=historical();enroll();service.revoke(false);service.statusDenied=true;assertTrue(client.refresh().getBoolean("legacyStatusUnavailable"));assertEquals("ACTIVATION_REVOKED",license.status().getString("code"));recreate();assertEquals("ACTIVATION_REVOKED",license.status().getString("code"));rejects(()->license.install(original.toString()));rejects(()->client.importManual(service.document().toString()));assertEquals(ProtocolJson.hash(original),license.documentHash());
  }
  @Test public void banBlocksEveryDocumentAndSurvivesEitherAuthenticatedReplicaRepair()throws Exception{
    historical();enroll();service.revoke(true);client.refresh();assertEquals("DEVICE_BANNED",license.status().getString("code"));rejects(()->license.install(service.document().toString()));
    assertTrue(context.getSharedPreferences("activation-v2",0).edit().clear().commit());recreate();assertEquals("DEVICE_BANNED",license.status().getString("code"));
    assertTrue(new File(context.getNoBackupFilesDir(),"activation-v2.json").delete());recreate();assertEquals("DEVICE_BANNED",license.status().getString("code"));
  }
  @Test public void unbanDoesNotResurrectTheOldLicenceAndNeedsANewExactOwnerApproval()throws Exception{
    JSONObject original=historical();enroll();service.revoke(true);client.refresh();service.unban();client.refresh();assertEquals("ACTIVATION_REVOKED",license.status().getString("code"));
    JSONObject unknown=service.document();rejects(()->client.importManual(unknown.toString()));JSONObject next=service.document();service.approve(next);assertTrue(client.importManual(next.toString()).getBoolean("valid"));assertEquals(ProtocolJson.hash(next),license.documentHash());rejects(()->license.install(original.toString()));rejects(()->license.install(unknown.toString()));
  }
  @Test public void aFreshInstallationKeyStillReceivesTheSameAkdBan()throws Exception{
    historical();enroll();String code=license.deviceCode(),oldKey=new InstallationIdentity().fingerprint();service.revoke(true);client.refresh();wipeOwned();recreate();assertEquals(code,license.deviceCode());assertNotEquals(oldKey,new InstallationIdentity().fingerprint());
    rejects(()->client.importManual(service.document().toString()));assertEquals("",license.documentHash());assertEquals("DEVICE_BANNED",license.status().getString("code"));
  }
  @Test public void wrongNonceTamperedOrDelayedDecisionCannotRevokeOrInstallAnything()throws Exception{
    JSONObject original=historical();enroll();service.revoke(true);service.wrongNonce=true;rejects(()->client.refresh());assertTrue(license.status().getBoolean("valid"));service.wrongNonce=false;service.tamper=true;rejects(()->client.refresh());assertTrue(license.status().getBoolean("valid"));service.tamper=false;service.delayControlMs=30050;rejects(()->client.refresh());assertTrue(license.status().getBoolean("valid"));assertEquals(ProtocolJson.hash(original),license.documentHash());
  }
  @Test public void aLateAllowCannotOverrideANewerDurableDenyDuringActivation()throws Exception{
    enroll();JSONObject next=service.document();service.denyBeforeReturningAllow=true;rejects(()->client.importManual(next.toString()));assertEquals("DEVICE_BANNED",license.status().getString("code"));assertEquals("",license.documentHash());assertEquals(0,state().getJSONArray("consumedLicenseIds").length());
  }
  @Test public void failedPolicyPersistenceCannotConsumeOrAcknowledgeANewLicence()throws Exception{
    JSONObject previous=historical();enroll();JSONObject next=service.document();var field=DeviceLicense.class.getDeclaredField("file");field.setAccessible(true);AtomicFile original=(AtomicFile)field.get(license);
    field.set(license,new AtomicFile(new File(context.getNoBackupFilesDir(),"standalone-no-write")){@Override public FileOutputStream startWrite()throws IOException{throw new IOException("Synthetic full storage");}});
    rejects(()->client.importManual(next.toString()));assertFalse(license.status().getBoolean("valid"));field.set(license,original);recreate();assertEquals(ProtocolJson.hash(previous),license.documentHash());assertEquals(1,state().getJSONArray("consumedLicenseIds").length());assertTrue(client.importManual(next.toString()).getBoolean("valid"));
  }
  @Test public void stalePolicyReplayCannotRemoveAPersistedBan()throws Exception{
    historical();enroll();client.refresh();JSONObject old=copy(service.lastEnvelope);service.revoke(true);client.refresh();service.replay=old;rejects(()->client.refresh());assertEquals("DEVICE_BANNED",license.status().getString("code"));recreate();assertEquals("DEVICE_BANNED",license.status().getString("code"));
  }
  @Test public void securityDecisionsLeaveIndependentUserAndBookkeepingFixturesUntouched()throws Exception{
    historical();enroll();File marker=new File(context.getFilesDir(),"standalone-bookkeeping-fixture.bin");byte[] bytes="دفاتر الفحص · 123.45".getBytes(StandardCharsets.UTF_8);try(FileOutputStream out=new FileOutputStream(marker)){out.write(bytes);}String passwordHash="b".repeat(64);assertTrue(context.getSharedPreferences("standalone-user-fixture",0).edit().putString("passwordHash",passwordHash).commit());
    JSONObject before=state();service.revoke(true);client.refresh();service.unban();client.refresh();recreate();assertArrayEquals(bytes,java.nio.file.Files.readAllBytes(marker.toPath()));assertEquals(passwordHash,context.getSharedPreferences("standalone-user-fixture",0).getString("passwordHash",""));assertEquals(before.getJSONArray("consumedLicenseIds").toString(),state().getJSONArray("consumedLicenseIds").toString());assertEquals(before.getJSONObject("document").toString(),state().getJSONObject("document").toString());
  }
  @Test public void aVerifiedDenyClosesTheNativeBusinessGateWithoutErasingTheLicence()throws Exception{
    historical();enroll();String original=license.documentHash();try(ActivityScenario<MainActivity> scenario=activity=ActivityScenario.launch(MainActivity.class)){
      service.revoke(true);client.refresh();AtomicReference<String> current=new AtomicReference<>("");long end=android.os.SystemClock.elapsedRealtime()+15000;
      while(android.os.SystemClock.elapsedRealtime()<end){scenario.onActivity(a->current.set(a.getWebView()==null?"":a.getWebView().getUrl()));if(current.get()!=null&&current.get().endsWith("/activation.html"))break;Thread.sleep(100);}
      assertTrue("Native host must navigate to its activation gate",current.get()!=null&&current.get().endsWith("/activation.html"));scenario.onActivity(a->{assertFalse(a.new NativeHost().licenseAllowed());a.new NativeHost().activationContinue();});Thread.sleep(150);scenario.onActivity(a->current.set(a.getWebView().getUrl()));assertTrue(current.get().endsWith("/activation.html"));assertEquals(original,license.documentHash());
    }
  }
  @Test public void signedBanBlocksNewActionsButWaitsForTheAcceptedIndexedDbCommit()throws Exception{
    historical();enroll();String original=license.documentHash();try(ActivityScenario<MainActivity> scenario=activity=ActivityScenario.launch(MainActivity.class)){
      long ready=android.os.SystemClock.elapsedRealtime()+25000;while(!"true".equals(js(scenario,"typeof window.karnaPersistenceBusy==='function'"))){assertTrue("Local runtime did not finish boot",android.os.SystemClock.elapsedRealtime()<ready);Thread.sleep(100);}
      js(scenario,"window.__controlWriteDone=false;window.__controlReleaseWrite=false;window.__controlWriteStarted=false;window.__controlOriginalBusy=window.karnaPersistenceBusy;window.karnaPersistenceBusy=()=>!window.__controlWriteDone||window.__controlOriginalBusy();(()=>{const open=indexedDB.open('alkarna-site-v1',1);open.onsuccess=()=>{const db=open.result,tx=db.transaction('meta','readwrite'),store=tx.objectStore('meta');store.put({id:'standalone-accepted-write-fixture',value:'durable-before-navigation'});const keep=()=>{const read=store.get('standalone-accepted-write-fixture');read.onsuccess=()=>{window.__controlWriteStarted=true;if(!window.__controlReleaseWrite)keep()}};keep();tx.oncomplete=()=>{window.__controlWriteDone=true;db.close()};tx.onabort=()=>{window.__controlWriteError=true;window.__controlWriteDone=true;db.close()}}})();true");
      long started=android.os.SystemClock.elapsedRealtime()+10000;while(!"true".equals(js(scenario,"window.__controlWriteStarted===true"))){assertTrue("Synthetic accepted write did not start",android.os.SystemClock.elapsedRealtime()<started);Thread.sleep(50);}
      service.revoke(true);client.refresh();assertEquals("false",js(scenario,"NativeHost.licenseAllowed()"));Thread.sleep(1200);AtomicReference<String> current=new AtomicReference<>("");scenario.onActivity(a->current.set(a.getWebView().getUrl()));assertTrue("Navigation discarded an accepted transaction",current.get().endsWith("/index.html"));assertEquals("false",js(scenario,"window.__controlWriteDone"));
      js(scenario,"window.__controlReleaseWrite=true;true");long end=android.os.SystemClock.elapsedRealtime()+15000;do{scenario.onActivity(a->current.set(a.getWebView().getUrl()));if(current.get().endsWith("/activation.html"))break;Thread.sleep(100);}while(android.os.SystemClock.elapsedRealtime()<end);assertTrue(current.get().endsWith("/activation.html"));
      js(scenario,"window.__controlCommittedValue=null;(()=>{const open=indexedDB.open('alkarna-site-v1',1);open.onsuccess=()=>{const db=open.result,tx=db.transaction('meta','readonly'),read=tx.objectStore('meta').get('standalone-accepted-write-fixture');read.onsuccess=()=>window.__controlCommittedValue=read.result?.value;tx.oncomplete=()=>db.close()}})();true");long readEnd=android.os.SystemClock.elapsedRealtime()+10000;while(!"\"durable-before-navigation\"".equals(js(scenario,"window.__controlCommittedValue"))){assertTrue("Accepted write was lost",android.os.SystemClock.elapsedRealtime()<readEnd);Thread.sleep(100);}assertEquals(original,license.documentHash());
      js(scenario,"window.__controlFixtureRemoved=false;(()=>{const open=indexedDB.open('alkarna-site-v1',1);open.onsuccess=()=>{const db=open.result,tx=db.transaction('meta','readwrite');tx.objectStore('meta').delete('standalone-accepted-write-fixture');tx.oncomplete=()=>{window.__controlFixtureRemoved=true;db.close()}}})();true");long cleanupEnd=android.os.SystemClock.elapsedRealtime()+10000;while(!"true".equals(js(scenario,"window.__controlFixtureRemoved"))){assertTrue("Synthetic row cleanup did not commit",android.os.SystemClock.elapsedRealtime()<cleanupEnd);Thread.sleep(100);}
    }
  }

  private static final class Service implements ContatoolsClient.Transport {
    final KeyPair pair;final JSONObject issuers;final String code;final Map<String,JSONObject> challenges=new HashMap<>(),approved=new HashMap<>();
    JSONObject installationKey,lastEnvelope,replay;DeviceLicense license;long generation,fence,sequence,delayControlMs;boolean banned,offline,tamper,wrongNonce,denyBeforeReturningAllow,statusDenied;volatile boolean closed;int admissions;
    Service(String code)throws Exception{this.code=code;KeyPairGenerator generator=KeyPairGenerator.getInstance("EC");generator.initialize(new ECGenParameterSpec("secp256r1"));pair=generator.generateKeyPair();ECPublicKey key=(ECPublicKey)pair.getPublic();issuers=new JSONObject().put("fixture",new JSONObject().put("kty","EC").put("crv","P-256").put("x",coordinate(key.getW().getAffineX())).put("y",coordinate(key.getW().getAffineY())));}
    private static String coordinate(java.math.BigInteger n){byte[] input=n.toByteArray(),out=new byte[32];int length=Math.min(input.length,32);System.arraycopy(input,input.length-length,out,32-length,length);return ProtocolJson.base64(out);}
    JSONObject sign(JSONObject payload)throws Exception{JSONObject envelope=new JSONObject().put("schema",StandaloneControl.SCHEMA).put("version",1).put("kid","fixture").put("payload",copy(payload));Signature signature=Signature.getInstance("SHA256withECDSA");signature.initSign(pair.getPrivate());signature.update(ProtocolJson.canonical(envelope).getBytes(StandardCharsets.UTF_8));return envelope.put("signature",ProtocolJson.base64(ProtocolJson.rawSignature(signature.sign())));}
    JSONObject document()throws Exception{JSONObject payload=new JSONObject().put("licenseId",UUID.randomUUID().toString()).put("storeId","standalone-fixture").put("customerName","صاحب الفحص").put("storeName","متجر الفحص").put("deviceId",code).put("edition","desktop").put("type","temporary").put("durationSeconds",3600).put("activationMode","single-install").put("notes","Synthetic standalone native fixture");Signature signature=Signature.getInstance("SHA256withECDSA");signature.initSign(pair.getPrivate());signature.update(LicenseVerifier.canonical(payload,2).getBytes(StandardCharsets.UTF_8));return new JSONObject().put("schema","alkarna-license").put("version",2).put("keyId","alkarna-license-v2").put("algorithm","ECDSA_P256_SHA256").put("payload",payload).put("signature",ProtocolJson.base64(ProtocolJson.rawSignature(signature.sign())));}
    void revoke(boolean ban){generation++;fence++;banned=ban;approved.clear();}
    void unban(){generation++;banned=false;}
    void approve(JSONObject document)throws Exception{generation++;approved.put(ProtocolJson.hash(document),new JSONObject().put("authorizationId",UUID.randomUUID().toString()).put("sequence",++sequence));}
    JSONObject packet(JSONObject request)throws Exception{String hash=request.getString("queryDocumentHash");JSONObject authorization=approved.get(hash);boolean allowed=!banned&&(fence==0||authorization!=null);return new JSONObject().put("schemaVersion",1).put("purpose","standalone-device-control").put("applicationId",BuildConfig.APPLICATION_ID).put("installationId",request.getString("installationId")).put("keyFingerprint",ProtocolJson.fingerprint(installationKey)).put("deviceCode",code).put("requestNonce",wrongNonce?UUID.randomUUID().toString():request.getString("requestNonce")).put("queryDocumentHash",hash).put("controlGeneration",generation).put("activationFence",fence).put("banned",banned).put("documentStatus",hash.isEmpty()?"none":allowed?"allowed":"revoked").put("authorizationId",authorization==null?"":authorization.getString("authorizationId")).put("sequence",authorization==null?0:authorization.getLong("sequence")).put("issuedAt",System.currentTimeMillis());}
    @Override public JSONObject post(String path,JSONObject body)throws Exception{
      if(closed)throw new IOException("Standalone fixture transport is closed");
      if(offline)throw new ContatoolsClient.ServiceFailure(503,false,0);
      JSONObject request=body.getJSONObject("payload");String operation=body.getString("operation");
      if(path.endsWith("challenge")){if(operation.equals("enroll"))installationKey=copy(request.getJSONObject("publicJwk"));String id=UUID.randomUUID().toString();JSONObject proof=new JSONObject().put("schema","contatools-lifecycle-proof").put("version",1).put("id",id).put("operation",operation).put("installationId",request.getString("installationId")).put("payloadHash",ProtocolJson.hash(request));challenges.put(id,proof);return new JSONObject().put("id",id).put("message",ProtocolJson.canonical(proof));}
      JSONObject proof=challenges.remove(body.getString("challengeId"));assertNotNull(proof);assertEquals(proof.getString("payloadHash"),ProtocolJson.hash(request));Signature verify=Signature.getInstance("SHA256withECDSA");verify.initVerify(LicenseVerifier.key(installationKey.getString("x"),installationKey.getString("y")));verify.update(ProtocolJson.canonical(proof).getBytes(StandardCharsets.UTF_8));assertTrue(verify.verify(LicenseVerifier.der(ProtocolJson.decode(body.getString("signature")))));
      if(operation.equals("status")&&statusDenied)throw new ContatoolsClient.ServiceFailure(403,true,0);
      if(operation.equals("enroll")||operation.equals("status"))return new JSONObject().put("status","pending");
      if(operation.equals("control.status")||operation.equals("control.admit")){
        if(delayControlMs>0){long delay=delayControlMs;delayControlMs=0;Thread.sleep(delay);}
        if(operation.equals("control.admit")){admissions++;assertEquals(request.getString("queryDocumentHash"),ProtocolJson.hash(LicenseVerifier.verify(request.getString("licenseDocument"),code)));}
        JSONObject envelope=sign(packet(request));lastEnvelope=copy(envelope);
        if(denyBeforeReturningAllow){denyBeforeReturningAllow=false;revoke(true);JSONObject deny=copy(request).put("requestNonce",UUID.randomUUID().toString());JSONObject signed=sign(packet(deny));InstallationIdentity identity=new InstallationIdentity();license.control(signed,issuers,identity.id(),identity.fingerprint(),deny.getString("requestNonce"),deny.getString("queryDocumentHash"));}
        if(replay!=null)envelope=copy(replay);if(tamper)envelope.getJSONObject("payload").put("controlGeneration",generation+1);
        return new JSONObject().put("controlProtocol",1).put("control",envelope);
      }
      throw new IOException("Unexpected standalone fixture operation "+operation);
    }
  }
}
