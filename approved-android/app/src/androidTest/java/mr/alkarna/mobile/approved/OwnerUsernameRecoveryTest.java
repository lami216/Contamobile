package mr.alkarna.mobile.approved;

import android.content.Context;
import android.os.Build;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.*;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;
import org.junit.*;
import org.junit.rules.TestWatcher;
import org.junit.runner.Description;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Disposable emulator: current server protocol, signed grants, real encrypted journal and IndexedDB. */
@RunWith(AndroidJUnit4.class)
public class OwnerUsernameRecoveryTest {
 private Context context;
 private DeviceLicense license;
 private ContatoolsClient client;
 private FakeService service;
 private ActivityScenario<MainActivity> activity;
 private Map<String,PublicKey> originalKeys;
 private boolean ownsFixture;
 private String activation;
 private double remaining;
 @Rule public final TestWatcher executed=new TestWatcher(){@Override protected void succeeded(Description description){android.os.Bundle proof=new android.os.Bundle();proof.putString("stream","\nOWNER USERNAME RECOVERY CASE PASS "+description.getMethodName()+"\n");InstrumentationRegistry.getInstrumentation().sendStatus(0,proof);}};
 private interface Checked {void run() throws Exception;}
 private static void rejected(Checked work) throws Exception {try{work.run();fail("Operation required rejection");}catch(Exception expected){}}
 private static JSONObject copy(JSONObject value) throws Exception {return new JSONObject(value.toString());}
 private void recreate() throws Exception {license=new DeviceLicense(context);client=new ContatoolsClient(context,license,service.issuers,service);}
 @Before public void setup() throws Exception {
  assertEquals("true",InstrumentationRegistry.getArguments().getString("ownerUsernameRecoveryIsolation"));
  assertTrue("Disposable emulator only",Build.HARDWARE.equals("ranchu")||Build.HARDWARE.equals("goldfish")||Build.FINGERPRINT.startsWith("generic")||Build.FINGERPRINT.contains("emulator")||Build.MODEL.contains("sdk_gphone"));
  context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  for(String name:new String[]{"activation-v2.json","contatools-v1.json",AccountingResetStore.FILE})assertFalse("Never replace customer private state",new File(context.getNoBackupFilesDir(),name).exists());
  assertFalse(context.getSharedPreferences("activation-v2",Context.MODE_PRIVATE).contains("state"));
  assertNull(backupSingleton().get(null));assertFalse(new File(context.getNoBackupFilesDir(),"cloud-backup-v1").exists());
  originalKeys=new HashMap<>(LicenseCompatibilityTest.keys());ownsFixture=true;license=new DeviceLicense(context);license.install(TestLicenseIssuer.issue(license.deviceCode(),"temporary",600));
  activation=license.status().getJSONObject("license").getString("licenseId");remaining=license.status().getJSONObject("license").getDouble("remainingSeconds");
  service=new FakeService();recreate();client.register(new JSONObject().put("shopId","username-fixture-shop").put("owners",new JSONArray().put(new JSONObject().put("id","username-fixture-owner").put("name","اسم صاحب المحل").put("role","owner"))));
 }
 @After public void cleanup() throws Exception {
  if(!ownsFixture)return;
  if(activity!=null){async("if(window.__nameDb)__nameDb.db?.close();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('alkarna-site-v1');r.onsuccess=resolve;r.onerror=reject;r.onblocked=resolve});");activity.close();}
  ((android.app.job.JobScheduler)context.getSystemService(Context.JOB_SCHEDULER_SERVICE)).cancel(CloudBackupPolicy.JOB_ID);
  Object manager=backupSingleton().get(null);if(manager!=null){var running=CloudBackupManager.class.getDeclaredField("running");running.setAccessible(true);long deadline=System.currentTimeMillis()+5000;while(running.getBoolean(manager)&&System.currentTimeMillis()<deadline)Thread.sleep(20);assertFalse(running.getBoolean(manager));}
  backupSingleton().set(null,null);File directory=new File(context.getNoBackupFilesDir(),"cloud-backup-v1");if(directory.exists()){File[] files=directory.listFiles();assertNotNull(files);for(File file:files){assertTrue(file.isFile());assertTrue(file.delete());}assertTrue(directory.delete());}
  for(String name:new String[]{"activation-v2.json","contatools-v1.json",AccountingResetStore.FILE})for(String suffix:new String[]{"",".bak",".new"}){File file=new File(context.getNoBackupFilesDir(),name+suffix);if(file.exists())assertTrue(file.delete());}
  assertTrue(context.getSharedPreferences("activation-v2",Context.MODE_PRIVATE).edit().clear().commit());
  KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);for(String alias:new String[]{"alkarna.activation.state.v2","alkarna.contatools.journal.v1","alkarna.cloud.backup.v1",InstallationIdentity.ALIAS,AccountingResetStore.ALIAS})if(keys.containsAlias(alias))keys.deleteEntry(alias);
  LicenseCompatibilityTest.keys().clear();LicenseCompatibilityTest.keys().putAll(originalKeys);
 }
 private void activationUnchanged() throws Exception {JSONObject status=new DeviceLicense(context).status();assertTrue(status.getBoolean("valid"));assertEquals(activation,status.getJSONObject("license").getString("licenseId"));assertTrue(status.getJSONObject("license").getDouble("remainingSeconds")<=remaining);}
 private JSONObject digest() throws Exception {return new JSONObject().put("algorithm","PBKDF2-SHA256").put("iterations",210000).put("salt","b".repeat(32)).put("hash","c".repeat(64));}
 private JSONObject credentials(String name) throws Exception {return new JSONObject().put("password",digest()).put("username",name);}
 private void approve() throws Exception {client.request("username-fixture-owner");service.status="approved";JSONObject result=client.poll();assertEquals("approved",result.getString("status"));assertEquals("username-fixture-shop",result.getString("shopId"));assertEquals("username-fixture-owner",result.getString("ownerId"));assertFalse(result.has("grant"));assertFalse(result.has("username"));}
 private void seed() throws Exception {
  backupSingleton().set(null,new CloudBackupManager(context,(path,body)->{throw new IOException("Isolated backup outage");},true));
  activity=ActivityScenario.launch(MainActivity.class);until("!!document.querySelector('[data-action=\"site:setup\"]')");
  async("const {ShopDatabase}=await import('https://appassets.androidplatform.net/assets/approved/database.js');const {prepareFeatureState}=await import('https://appassets.androidplatform.net/assets/approved/features.js');window.__nameDb=await new ShopDatabase().open();const password={algorithm:'PBKDF2-SHA256',iterations:210000,salt:'b'.repeat(32),hash:'a'.repeat(64)};window.__nameUsers=[{id:'username-fixture-owner',name:'اسم صاحب المحل',username:'original-login',role:'owner',active:true,password},{id:'username-fixture-worker',name:'عامل',username:'Taken.Login',role:'sales',active:false,password}];window.__nameState={originId:'username-fixture-shop',branding:'متجر الفحص',products:[],parties:[],records:[],accounts:[{id:1,name:'نقدي',balance:120}],warehouses:['الرئيسي'],warehouse:'الرئيسي',users:__nameUsers.map(({password,...user})=>user),opening:{accounts:{1:120},parties:{},stocks:{}}};prepareFeatureState(__nameState);await __nameDb.replace(__nameState,__nameUsers);await __nameDb.put('meta',{id:'session:owner-fixture',user:'username-fixture-owner'});await __nameDb.put('meta',{id:'session:worker-fixture',user:'username-fixture-worker'});window.__nameBefore=JSON.stringify(await __nameDb.all('snapshots'));window.__nameWorker=JSON.stringify(await __nameDb.get('users','username-fixture-worker'));window.__nameDump=async()=>JSON.stringify({snapshots:await __nameDb.all('snapshots'),users:await __nameDb.all('users'),meta:await __nameDb.all('meta')});");
 }
 private void apply(JSONObject prepared) throws Exception {async("window.__nameResult=await __nameDb.recoverOwner("+prepared+")");}
 @Test public void approvalControlsIdentityAndUnapprovedInputCannotPrepare() throws Exception {
  JSONObject waiting=client.request("username-fixture-owner");assertEquals("waiting",waiting.getString("status"));assertFalse(waiting.has("username"));assertFalse(waiting.has("ownerId"));rejected(()->client.prepare(credentials("new-login")));assertEquals(0,service.claims);assertEquals("idle",client.resumeLocal().getString("stage"));
  service.status="approved";client.poll();recreate();JSONObject resumed=client.resume();assertEquals("approved",resumed.getString("status"));assertEquals("username-fixture-owner",resumed.getString("ownerId"));assertFalse(resumed.has("username"));
  rejected(()->client.prepare(new JSONObject().put("password",digest()).put("username","   ")));assertEquals(0,service.claims);activationUnchanged();
  long now=System.currentTimeMillis();service.grant=service.signed("contatools-owner-reset",copy(service.grant.getJSONObject("payload")).put("issuedAt",now-900000).put("expiresAt",now-1));
  JSONObject expired=client.poll();assertEquals("expired",expired.getString("status"));assertFalse(expired.has("ownerId"));assertFalse(expired.has("username"));recreate();assertEquals("idle",client.resume().getString("stage"));rejected(()->client.prepare(credentials("must-not-apply")));assertEquals(0,service.claims);
 }
 @Test public void encryptedPendingRetainsArabicUsernameAcrossLostClaimAndOfflineRestart() throws Exception {
  approve();service.dropClaim=true;rejected(()->client.prepare(credentials("  صاحب.المتجر  ")));assertEquals(1,service.claims);String intent=service.claim.getJSONObject("payload").getString("intentId");
  recreate();assertEquals("awaiting-network",client.resumeLocal().getString("stage"));service.dropClaim=false;JSONObject result=client.resume();assertEquals(intent,result.getString("intentId"));assertEquals("صاحب.المتجر",result.getString("username"));
  service.offline=true;recreate();JSONObject offline=client.resumeLocal();assertEquals(intent,offline.getString("intentId"));assertEquals("صاحب.المتجر",offline.getString("username"));assertEquals(intent,client.poll().getString("intentId"));assertEquals(1,service.claims);assertTrue(service.credentialFree);activationUnchanged();
 }
 @Test public void atomicCollisionCanBeCorrectedUnderSameApprovedIntentWithoutChangingOtherAccounts() throws Exception {
  seed();approve();JSONObject prepared=client.prepare(credentials("  TAKEN.LOGIN "));async("window.__nameCollision=null;window.__nameOriginalDump=await __nameDump();try{await __nameDb.recoverOwner("+prepared+")}catch(error){window.__nameCollision=error.code};window.__nameAfterCollision=await __nameDump();");
  assertEquals("RECOVERY_USERNAME_TAKEN",text("__nameCollision"));assertEquals(text("__nameOriginalDump"),text("__nameAfterCollision"));
  JSONObject corrected=client.prepare(credentials("  Recovered.Login "));assertEquals(prepared.getString("intentId"),corrected.getString("intentId"));assertEquals(1,service.claims);apply(corrected);
  assertEquals("recovered.login",text("__nameResult.username"));
  async("window.__nameShop=await __nameDb.get('snapshots','shop');window.__nameOwner=await __nameDb.get('users','username-fixture-owner');window.__nameAfterWorker=JSON.stringify(await __nameDb.get('users','username-fixture-worker'));window.__nameOwnerSession=await __nameDb.get('meta','session:owner-fixture');window.__nameWorkerSession=await __nameDb.get('meta','session:worker-fixture');");
  assertEquals("username-fixture-owner",text("__nameOwner.id"));assertEquals("اسم صاحب المحل",text("__nameOwner.name"));assertEquals("owner",text("__nameOwner.role"));assertEquals(text("__nameWorker"),text("__nameAfterWorker"));assertEquals("true",js("__nameOwnerSession===undefined&&!!__nameWorkerSession"));assertEquals("recovered.login",text("__nameShop.state.users.find(u=>u.role==='owner').username"));assertEquals("false",js("__nameShop.state.users.some(u=>'password' in u)"));assertEquals("120",js("__nameShop.state.accounts[0].balance"));activationUnchanged();
 }
 @Test public void commitThenCrashAndDifferentRetryNeverApplyOrRenameTwice() throws Exception {
  seed();approve();JSONObject first=client.prepare(credentials("first-name"));apply(first);async("window.__nameAfterCommit=await __nameDump()");
  recreate();JSONObject changed=client.prepare(credentials("second-name"));assertEquals(first.getString("intentId"),changed.getString("intentId"));apply(changed);assertEquals("true",js("__nameResult.alreadyApplied"));assertEquals("first-name",text("__nameResult.username"));async("window.__nameAfterRetry=await __nameDump()");assertEquals(text("__nameAfterCommit"),text("__nameAfterRetry"));
  JSONObject completed=client.finishLocally(first.getString("grantId"),first.getString("intentId"));assertTrue(completed.getBoolean("ackPending"));assertCompletion(first,completed);service.offline=true;recreate();JSONObject reopened=client.resumeLocal();assertEquals("complete",reopened.getString("stage"));assertCompletion(first,reopened);assertFalse(reopened.has("username"));assertEquals("complete",client.prepare(credentials("third-name")).getString("stage"));service.offline=false;JSONObject acknowledged=client.acknowledgePending();assertEquals("complete",acknowledged.getString("stage"));assertCompletion(first,acknowledged);assertEquals("idle",client.resumeLocal().getString("stage"));assertEquals(1,service.claims);assertEquals(1,service.completions);activationUnchanged();
 }
 @Test public void legacyPasswordOnlyPendingStillKeepsUsernameAndBusinessSnapshotBytes() throws Exception {
  seed();approve();JSONObject old=client.prepare(digest());assertFalse(old.has("username"));recreate();JSONObject resumed=client.resumeLocal();assertFalse(resumed.has("username"));apply(resumed);
  async("window.__nameLegacyOwner=await __nameDb.get('users','username-fixture-owner');window.__nameLegacyBusiness=JSON.stringify(await __nameDb.all('snapshots'));");assertEquals("original-login",text("__nameLegacyOwner.username"));assertEquals("c".repeat(64),text("__nameLegacyOwner.password.hash"));assertEquals(text("__nameBefore"),text("__nameLegacyBusiness"));activationUnchanged();
 }
 @Test public void failedWriteAndWrongScopeLeaveCredentialsReceiptsSessionsAndAccountingUnchanged() throws Exception {
  seed();approve();JSONObject prepared=client.prepare(credentials("new-login"));async("window.__nameOriginalDump=await __nameDump();window.__nameWrongScope=false;try{await __nameDb.recoverOwner({..."+prepared+",shopId:'other-shop'})}catch{__nameWrongScope=true};window.__nameWrongDump=await __nameDump();");assertEquals("true",js("__nameWrongScope"));assertEquals(text("__nameOriginalDump"),text("__nameWrongDump"));
  async("const nativePut=IDBObjectStore.prototype.put;window.__nameAborted=false;IDBObjectStore.prototype.put=function(value,...rest){if(this.name==='meta'&&value.id.startsWith('owner-recovery:'))throw new DOMException('Synthetic write failure','QuotaExceededError');return nativePut.call(this,value,...rest)};try{await __nameDb.recoverOwner("+prepared+")}catch{__nameAborted=true}finally{IDBObjectStore.prototype.put=nativePut}window.__nameFailedDump=await __nameDump();");assertEquals("true",js("__nameAborted"));assertEquals(text("__nameOriginalDump"),text("__nameFailedDump"));
  recreate();apply(client.resumeLocal());assertEquals("new-login",text("__nameResult.username"));assertEquals(1,service.claims);activationUnchanged();
 }
 private static java.lang.reflect.Field backupSingleton() throws Exception {var field=CloudBackupManager.class.getDeclaredField("singleton");field.setAccessible(true);return field;}
 private static void assertCompletion(JSONObject expected,JSONObject actual) throws Exception {for(String field:new String[]{"shopId","ownerId","requestId","grantId","intentId"})assertEquals(field,expected.getString(field),actual.getString(field));}
 private String js(String script) throws Exception {ArrayBlockingQueue<String> results=new ArrayBlockingQueue<>(1);activity.onActivity(a->a.getWebView().evaluateJavascript(script,value->results.offer(value==null?"null":value)));String result=results.poll(20,TimeUnit.SECONDS);assertNotNull(result);return result;}
 private String text(String script) throws Exception {return new JSONTokener(js(script)).nextValue().toString();}
 private void until(String expression) throws Exception {long deadline=System.currentTimeMillis()+45000;while(System.currentTimeMillis()<deadline){if("true".equals(js(expression)))return;Thread.sleep(50);}fail("Timed out "+expression+"; "+js("document.body.innerText"));}
 private void async(String script) throws Exception {js("window.__nameDone=false;window.__nameError=null;(async()=>{"+script+"})().catch(error=>window.__nameError=error.message).finally(()=>window.__nameDone=true);true");until("window.__nameDone");assertEquals("null",js("window.__nameError"));}
 private static String coordinate(BigInteger value){byte[] raw=value.toByteArray(),out=new byte[32];int count=Math.min(raw.length,32);System.arraycopy(raw,raw.length-count,out,32-count,count);return ProtocolJson.base64(out);}
 private static final class FakeService implements ContatoolsClient.Transport {
  final KeyPair pair;final JSONObject issuers;final Map<String,JSONObject> challenges=new HashMap<>();
  JSONObject registration,request,grant,claim;String status="waiting";boolean offline,dropClaim,credentialFree=true;int claims,completions;
  FakeService() throws Exception {KeyPairGenerator generator=KeyPairGenerator.getInstance("EC");generator.initialize(new ECGenParameterSpec("secp256r1"));pair=generator.generateKeyPair();ECPublicKey publicKey=(ECPublicKey)pair.getPublic();issuers=new JSONObject().put("owner-username-fixture",new JSONObject().put("kty","EC").put("crv","P-256").put("x",coordinate(publicKey.getW().getAffineX())).put("y",coordinate(publicKey.getW().getAffineY())));}
  JSONObject signed(String purpose,JSONObject value) throws Exception {JSONObject envelope=new JSONObject().put("schema",purpose).put("version",1).put("kid","owner-username-fixture").put("payload",copy(value));Signature signer=Signature.getInstance("SHA256withECDSA");signer.initSign(pair.getPrivate());signer.update(ProtocolJson.canonical(envelope).getBytes(StandardCharsets.UTF_8));return envelope.put("signature",ProtocolJson.base64(ProtocolJson.rawSignature(signer.sign())));}
  public synchronized JSONObject post(String path,JSONObject body) throws Exception {
   if(offline)throw new IOException("Isolated endpoint outage");String operation=body.getString("operation");JSONObject p=body.getJSONObject("payload");assertFalse(p.has("username"));assertFalse(p.has("password"));assertFalse(p.has("hash"));
   if(path.endsWith("/challenge")){String id=UUID.randomUUID().toString();JSONObject proof=new JSONObject().put("schema","contatools-device-proof").put("version",1).put("id",id).put("installationId",p.getString("installationId")).put("operation",operation).put("payloadHash",ProtocolJson.hash(p));challenges.put(id,proof);return new JSONObject().put("id",id).put("message",ProtocolJson.canonical(proof));}
   JSONObject proof=challenges.remove(body.getString("challengeId"));assertNotNull(proof);assertEquals(operation,proof.getString("operation"));assertEquals(ProtocolJson.hash(p),proof.getString("payloadHash"));JSONObject jwk="register".equals(operation)?p.getJSONObject("publicJwk"):registration.getJSONObject("publicJwk");Signature verifier=Signature.getInstance("SHA256withECDSA");verifier.initVerify(LicenseVerifier.key(jwk.getString("x"),jwk.getString("y")));verifier.update(ProtocolJson.canonical(proof).getBytes(StandardCharsets.UTF_8));assertTrue(verifier.verify(LicenseVerifier.der(ProtocolJson.decode(body.getString("signature")))));
   if("register".equals(operation)){registration=copy(p);for(int i=0;i<p.getJSONArray("owners").length();i++)assertEquals(3,p.getJSONArray("owners").getJSONObject(i).length());return new JSONObject().put("registered",true);}
   assertEquals("Unchanged existing backend wire fields",operation.equals("recovery.claim")||operation.equals("recovery.complete")?6:4,p.length());
   if("recovery.request".equals(operation))request=copy(p);
   assertEquals("username-fixture-shop",p.getString("shopId"));assertEquals("username-fixture-owner",p.getString("ownerId"));assertEquals(request.getString("requestId"),p.getString("requestId"));
   if(grant==null){JSONObject doc=new JSONObject(registration.getString("licenseDocument"));long now=System.currentTimeMillis();grant=signed("contatools-owner-reset",new JSONObject().put("grantId",UUID.randomUUID().toString()).put("requestId",request.getString("requestId")).put("installationId",registration.getString("installationId")).put("keyFingerprint",ProtocolJson.fingerprint(registration.getJSONObject("publicJwk"))).put("deviceCode",registration.getString("deviceCode")).put("licenseDocumentHash",ProtocolJson.hash(doc)).put("licenseId",doc.getJSONObject("payload").getString("licenseId")).put("shopId",p.getString("shopId")).put("ownerId",p.getString("ownerId")).put("issuedAt",now).put("expiresAt",now+900000));}
   switch(operation){
    case "recovery.request":case "recovery.poll":return "approved".equals(status)?new JSONObject().put("status",status).put("requestId",request.getString("requestId")).put("grant",grant):new JSONObject().put("status",status).put("requestId",request.getString("requestId"));
    case "recovery.claim":assertEquals("approved",status);assertEquals(grant.getJSONObject("payload").getString("grantId"),p.getString("grantId"));if(claim==null){claim=signed("contatools-reset-claim",copy(grant.getJSONObject("payload")).put("intentId",p.getString("intentId")).put("claimedAt",System.currentTimeMillis()));claims++;}else assertEquals(claim.getJSONObject("payload").getString("intentId"),p.getString("intentId"));if(dropClaim)throw new IOException("Lost signed claim response");return new JSONObject().put("claim",claim);
    case "recovery.complete":assertEquals(claim.getJSONObject("payload").getString("intentId"),p.getString("intentId"));if(!"used".equals(status)){status="used";completions++;}return new JSONObject().put("status",status);
    default:throw new IOException("Unexpected existing protocol operation "+operation);
   }
  }
 }
}
