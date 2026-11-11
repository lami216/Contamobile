package mr.alkarna.mobile.approved;

import android.content.Context;
import android.content.Intent;
import android.content.ComponentName;
import android.app.ActivityManager;
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

/** Disposable emulator only. Signed service proofs, real Keystore/journals and real IndexedDB. */
@RunWith(AndroidJUnit4.class)
public class AccountingResetTest {
 private Context context;
 private DeviceLicense license;
 private ContatoolsClient channel;
 private AccountingResetClient client;
 private FakeService service;
 private ActivityScenario<MainActivity> activity;
 private Map<String,PublicKey> originalKeys;
 private boolean ownsFixture;
 private File backupDirectory;
 private int pauses;
 private String originalLicense;
 private double originalRemaining;
 private final JSONObject target=target();
 @Rule public final TestWatcher executed=new TestWatcher(){@Override protected void succeeded(Description description){android.os.Bundle proof=new android.os.Bundle();proof.putString("stream","\nACCOUNTING RESET CASE PASS "+description.getMethodName()+"\n");InstrumentationRegistry.getInstrumentation().sendStatus(0,proof);}};
 private static JSONObject target(){try{return new JSONObject().put("shopId","reset-fixture-shop").put("ownerId","reset-fixture-owner");}catch(Exception error){throw new IllegalStateException(error);}}
 private static JSONObject copy(JSONObject value) throws Exception {return new JSONObject(value.toString());}
 private interface Checked {void run() throws Exception;}
 private static void rejected(Checked action) throws Exception {try{action.run();fail("Operation required rejection");}catch(Exception expected){}}
 private void recreate() throws Exception {
  license=new DeviceLicense(context);channel=new ContatoolsClient(context,license,service.issuers,service);client=new AccountingResetClient(context,license,service.issuers,channel,t->{assertEquals(target.getString("shopId"),t.getString("shopId"));pauses++;});
 }
 private JSONObject accepted(JSONObject pending) throws Exception {return copy(target).put("requestId",pending.getJSONObject("request").getString("requestId")).put("accepted",true);}
 private JSONObject receipt(JSONObject prepared) throws Exception {return new JSONObject().put("requestId",prepared.getString("requestId")).put("grantId",prepared.getString("grantId")).put("intentId",prepared.getString("intentId"));}
 @Before public void setup() throws Exception {
  Assume.assumeTrue("Explicit disposable emulator invocation only","true".equals(InstrumentationRegistry.getArguments().getString("accountingResetIsolation")));
  assertTrue("The shell additionally verifies ro.kernel.qemu=1",Build.HARDWARE.equals("ranchu")||Build.HARDWARE.equals("goldfish")||Build.FINGERPRINT.startsWith("generic")||Build.FINGERPRINT.contains("emulator")||Build.MODEL.contains("sdk_gphone"));
  context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  for(String name:new String[]{"activation-v2.json","contatools-v1.json",AccountingResetStore.FILE})assertFalse("Never replace an existing customer's private state",new File(context.getNoBackupFilesDir(),name).exists());
  backupDirectory=new File(context.getNoBackupFilesDir(),"cloud-backup-v1");
  assertFalse("Never replace an existing customer's backup staging",backupDirectory.exists());
  assertNull("Disposable reset fixture needs an unused backup singleton",backupSingleton().get(null));
  assertFalse(context.getSharedPreferences("activation-v2",Context.MODE_PRIVATE).contains("state"));
  originalKeys=new HashMap<>(LicenseCompatibilityTest.keys());ownsFixture=true;license=new DeviceLicense(context);license.install(TestLicenseIssuer.issue(license.deviceCode(),"temporary",600));
  originalLicense=license.status().getJSONObject("license").getString("licenseId");originalRemaining=license.status().getJSONObject("license").getDouble("remainingSeconds");
  service=new FakeService();recreate();channel.register(new JSONObject().put("shopId",target.getString("shopId")).put("owners",new JSONArray().put(new JSONObject().put("id",target.getString("ownerId")).put("name","مالك الفحص").put("role","owner"))));
 }
 @After public void cleanup() throws Exception {
  if(!ownsFixture)return;
  if(activity!=null){async("if(window.__resetDb)__resetDb.db?.close();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('alkarna-site-v1');r.onsuccess=resolve;r.onerror=reject;r.onblocked=resolve});");activity.close();}
  ((android.app.job.JobScheduler)context.getSystemService(Context.JOB_SCHEDULER_SERVICE)).cancel(CloudBackupPolicy.JOB_ID);
  Object backup=backupSingleton().get(null);
  if(backup!=null){
   var running=CloudBackupManager.class.getDeclaredField("running");running.setAccessible(true);long deadline=System.currentTimeMillis()+5000;
   while(running.getBoolean(backup)&&System.currentTimeMillis()<deadline)Thread.sleep(20);
   assertFalse("Disposable backup work must finish before cleanup",running.getBoolean(backup));
  }
  backupSingleton().set(null,null);
  if(backupDirectory.exists()){
   File[] files=backupDirectory.listFiles();assertNotNull(files);
   for(File file:files){assertTrue(file.isFile());assertTrue(file.delete());}
   assertTrue(backupDirectory.delete());
  }
  for(String name:new String[]{"activation-v2.json","contatools-v1.json",AccountingResetStore.FILE})for(String suffix:new String[]{"",".bak",".new"}){File file=new File(context.getNoBackupFilesDir(),name+suffix);if(file.exists())assertTrue(file.delete());}
  assertTrue(context.getSharedPreferences("activation-v2",Context.MODE_PRIVATE).edit().clear().commit());
  KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);for(String alias:new String[]{"alkarna.activation.state.v2","alkarna.contatools.journal.v1","alkarna.cloud.backup.v1",InstallationIdentity.ALIAS,AccountingResetStore.ALIAS})if(keys.containsAlias(alias))keys.deleteEntry(alias);
  LicenseCompatibilityTest.keys().clear();LicenseCompatibilityTest.keys().putAll(originalKeys);
 }
 private void activationUnchanged() throws Exception {JSONObject status=new DeviceLicense(context).status();assertTrue(status.getBoolean("valid"));assertEquals(originalLicense,status.getJSONObject("license").getString("licenseId"));assertTrue(status.getJSONObject("license").getDouble("remainingSeconds")<=originalRemaining);}
 @Test public void pollingAndMissingConsentNeverPrepareOrPause() throws Exception {
  JSONObject pending=client.poll(target);assertEquals("pending",pending.getString("stage"));assertEquals(0,pauses);assertEquals(0,service.claims);
  rejected(()->client.prepare(copy(target).put("requestId",pending.getJSONObject("request").getString("requestId")).put("accepted",false)));
  assertEquals("idle",client.resumeLocal().getString("stage"));assertEquals(0,service.claims);assertEquals(0,pauses);activationUnchanged();
  service.denyUnclaimed=true;assertEquals("unavailable",client.prepare(accepted(pending)).getString("stage"));assertEquals("idle",client.resumeLocal().getString("stage"));assertEquals(0,service.claims);assertEquals(0,pauses);
 }
 @Test public void refusalSurvivesAnOutageAndNeverClaims() throws Exception {
  JSONObject pending=client.poll(target);JSONObject decline=copy(target).put("requestId",pending.getJSONObject("request").getString("requestId"));service.offline=true;
  assertEquals("declined",client.decline(decline).getString("stage"));recreate();service.offline=false;assertEquals("none",client.poll(target).getString("stage"));assertEquals("declined",service.status);assertEquals(0,service.claims);assertEquals(0,pauses);activationUnchanged();
 }
 @Test public void lostClaimResponseResumesTheIdenticalAcceptedIntent() throws Exception {
  JSONObject pending=client.poll(target);service.dropClaim=true;rejected(()->client.prepare(accepted(pending)));assertEquals(1,service.claims);String intent=service.claim.getJSONObject("payload").getString("intentId");
  assertEquals("awaiting-network",client.resumeLocal().getString("stage"));assertEquals("awaiting-network",AccountingResetStore.localResume(context,license).getString("stage"));assertEquals(0,pauses);recreate();service.dropClaim=false;
  service.rejectClaimAuthentication=true;rejected(()->client.resume());assertEquals("awaiting-network",client.resumeLocal().getString("stage"));service.rejectClaimAuthentication=false;
  JSONObject prepared=client.resume();assertEquals("prepared",prepared.getString("stage"));assertEquals(intent,prepared.getString("intentId"));assertEquals(1,service.claims);assertEquals(1,pauses);
  service.offline=true;recreate();assertEquals(intent,client.resumeLocal().getString("intentId"));assertEquals(1,service.claims);activationUnchanged();
 }
 @Test public void completionIsDurableAndLostAcknowledgementCannotRepeatTheReset() throws Exception {
  JSONObject prepared=client.prepare(accepted(client.poll(target))),receipt=receipt(prepared);assertTrue(client.finish(receipt).getBoolean("ackPending"));
  assertEquals("complete",AccountingResetStore.localResume(context,license).getString("stage"));assertTrue(AccountingResetStore.localResume(context,license).getBoolean("ackPending"));
  recreate();assertEquals("complete",client.resumeLocal().getString("stage"));service.dropComplete=true;assertTrue(client.acknowledge().getBoolean("ackPending"));assertEquals(1,service.completions);
  recreate();service.dropComplete=false;assertEquals("complete",client.acknowledge().getString("stage"));assertEquals(1,service.completions);assertEquals("idle",client.resumeLocal().getString("stage"));assertEquals("complete",client.finish(receipt).getString("stage"));
  assertEquals("none",client.poll(target).getString("stage"));activationUnchanged();
 }
 @Test public void preparedResetPoisonsOldPasswordGrantsAndRejectsWrongScope() throws Exception {
  String oldGrant=UUID.randomUUID().toString();RecoveryJournal journal=new RecoveryJournal(context,license.deviceCode(),new InstallationIdentity().fingerprint());
  journal.state.put("grant",new JSONObject().put("payload",new JSONObject().put("grantId",oldGrant))).put("request",new JSONObject().put("requestId",UUID.randomUUID().toString()));journal.save();recreate();
  JSONObject waiting=client.poll(target);JSONObject wrong=accepted(waiting).put("ownerId","different-owner");rejected(()->client.prepare(wrong));assertEquals(0,service.claims);
  JSONObject prepared=client.prepare(accepted(waiting));journal=new RecoveryJournal(context,license.deviceCode(),new InstallationIdentity().fingerprint());assertTrue(journal.used(oldGrant));assertFalse(journal.state.has("grant"));assertFalse(journal.state.has("request"));assertEquals(prepared.getString("requestId"),journal.state.getString("lastAccountingResetId"));assertEquals("paused",channel.resumeLocal().getString("stage"));rejected(()->channel.request(target.getString("ownerId")));activationUnchanged();
 }
 @Test public void resetExitRequiresConsumedScopedReceiptAndIsOneShot() throws Exception {
  JSONObject prepared=client.prepare(accepted(client.poll(target)));
  JSONObject exit=receipt(prepared).put("shopId",target.getString("shopId")).put("ownerId",target.getString("ownerId")).put("purpose","accounting-reset-exit");
  rejected(()->client.authorizeExit(exit)); // A signed prepared grant is not a consumed receipt.
  client.finish(receipt(prepared));
  rejected(()->client.authorizeExit(copy(exit).put("purpose","password-recovery")));
  rejected(()->client.authorizeExit(copy(exit).put("shopId","other-shop")));
  rejected(()->client.authorizeExit(copy(exit).put("ownerId","other-owner")));
  rejected(()->client.authorizeExit(copy(exit).put("intentId",UUID.randomUUID().toString())));
  assertTrue(client.authorizeExit(exit));
  assertFalse(client.authorizeExit(exit));
  recreate();
  assertFalse("A restart must retain the one-shot close receipt",client.authorizeExit(exit));
  assertEquals(0,service.completions); // No network ACK was needed to authorize the exit.
  assertEquals("complete",client.resumeLocal().getString("stage"));
  activationUnchanged();
 }
 @Test public void ownerConsentExitsTaskBeforeAckAndLauncherReopensFreshSetupWithoutClosingAgain() throws Exception {
  // A real pause/job may be reached through the UI; never send fixture data to
  // the deployment origin, even while exercising the production native bridge.
  backupSingleton().set(null,new CloudBackupManager(context,(path,body)->{throw new IOException("Isolated backup outage");},true));
  Intent launcher=Intent.makeMainActivity(new ComponentName(context,MainActivity.class));
  activity=ActivityScenario.launch(launcher);ExistingLicenseAccess.enter(activity);
  injectResetTransport();
  until("!!document.querySelector('[data-action=\"site:setup\"]')");
  connectSyntheticResetEndpoint();
  // Keep polling paused only while the disposable owner is created and registered.
  // The tested consent, transaction, native receipt and close use production paths.
  js("Object.defineProperty(document,'hidden',{value:true,configurable:true});document.querySelector('[name=username]').value='old-owner';document.querySelector('[name=password]').value='1234';document.querySelector('[data-action=\"site:setup\"]').click();true");
  until("!!document.querySelector('.nav')");
  async("const {ShopDatabase}=await import('https://appassets.androidplatform.net/assets/approved/database.js');window.__resetDb=await new ShopDatabase().open();window.__uiResetOwner=(await __resetDb.all('users'))[0].id;window.__uiResetShop=(await __resetDb.load()).originId;");
  target.put("shopId",text("__uiResetShop")).put("ownerId",text("__uiResetOwner"));
  channel.register(new JSONObject().put("shopId",target.getString("shopId")).put("owners",new JSONArray().put(new JSONObject().put("id",target.getString("ownerId")).put("name","مالك الفحص").put("role","owner"))));
  async("await act('go:inventory');await act('open:product');document.querySelector('#sheet-form [name=name]').value='منتج قديم';document.querySelector('#sheet-form [name=price]').value='50';document.querySelector('#sheet-form [name=cost]').value='30';await act('save-product');");
  assertEquals("1",js("S.products.length"));
  async("await act('go:home');document.activeElement?.blur();");
  assertEquals("No accounting write may still be pending before a reset review", "false",js("karnaPersistenceBusy()"));
  assertEquals("The fixture must leave product entry before reviewing the request", "false",js("!!modal"));
  final MainActivity[] completedActivity={null};final int[] taskId={-1};
  activity.onActivity(a->{completedActivity[0]=a;taskId[0]=a.getTaskId();assertTrue("The launcher Activity must own its task",a.isTaskRoot());});
  service.offlineAfterClaim=true;
  js("delete document.hidden;document.activeElement?.blur();true");
  assertEquals("The signed local fixture is available despite the emulator's external firewall", "true",js("navigator.onLine"));
  assertEquals("The launcher page must actually be visible", "false",js("document.hidden"));
  assertEquals("A completed product form must not keep the reset review deferred", "false",js("!!document.activeElement?.matches('input,textarea,select')"));
  js("dispatchEvent(new Event('online'));true");
  untilResetReview();
  assertTrue("The real controller must have polled the signed native fixture",service.polls>0);
  assertEquals("true",js("document.querySelector('[data-accounting-reset=review] .recovery-primary').disabled"));
  // Actual consent UI, not a direct database reset or a manual Activity close.
  js("document.querySelector('[name=accountingResetConsent]').click();document.querySelector('[data-accounting-reset=review] .recovery-primary').click();true");
  long deadline=System.currentTimeMillis()+15000;
  while(activity.getState()!=androidx.lifecycle.Lifecycle.State.DESTROYED&&System.currentTimeMillis()<deadline)Thread.sleep(50);
  assertEquals("The live reset UI must finish without waiting for server ACK",androidx.lifecycle.Lifecycle.State.DESTROYED,activity.getState());
  assertTrue(completedActivity[0].isFinishing());
  assertTrue(completedActivity[0].isDestroyed());
  assertTaskRemoved(taskId[0]);
  activity=null; // It finished itself; no test close may mask a broken exit path.
  assertEquals(1,service.claims);
  assertEquals(0,service.completions);
  assertTrue(AccountingResetStore.localResume(context,license).getBoolean("ackPending"));
  activationUnchanged();

  activity=ActivityScenario.launch(Intent.makeMainActivity(new ComponentName(context,MainActivity.class)));ExistingLicenseAccess.enter(activity);
  injectResetTransport();
  until("!!document.querySelector('[data-action=\"site:setup\"]')");
  connectSyntheticResetEndpoint();
  js("document.activeElement?.blur();dispatchEvent(new Event('online'));true");
  assertEquals("false",js("!!document.querySelector('[name=name], [name=shop]')"));
  assertEquals("true",js("!!document.querySelector('[name=username]')&&!!document.querySelector('[name=password]')"));
  async("await new Promise(resolve=>setTimeout(resolve,1500));");
  assertEquals("A pending or lost ACK cannot close the reopened app",androidx.lifecycle.Lifecycle.State.RESUMED,activity.getState());
  js("document.querySelector('[name=username]').value='fresh-owner';document.querySelector('[name=password]').value='4321';document.querySelector('[data-action=\"site:setup\"]').click();true");
  until("!!document.querySelector('.nav')");
  async("const {ShopDatabase,verifyPassword}=await import('https://appassets.androidplatform.net/assets/approved/database.js');window.__resetDb=await new ShopDatabase().open();window.__resetAfter=await __resetDb.load();window.__resetOwners=await __resetDb.all('users');window.__resetPassword=await verifyPassword('4321',__resetOwners[0].password);");
  assertEquals(target.getString("shopId"),text("__resetAfter.originId"));
  assertEquals(target.getString("ownerId"),text("__resetOwners[0].id"));
  assertEquals("true",js("__resetPassword"));
  assertEquals("0",js("__resetAfter.products.length+__resetAfter.records.length+__resetAfter.parties.length"));
  service.offline=false;
  js("dispatchEvent(new Event('online'));true");
  deadline=System.currentTimeMillis()+10000;
  while(service.completions!=1&&System.currentTimeMillis()<deadline)Thread.sleep(50);
  assertEquals(1,service.completions);
  async("await new Promise(resolve=>setTimeout(resolve,300));");
  assertEquals("A successful later ACK must not trigger another exit",androidx.lifecycle.Lifecycle.State.RESUMED,activity.getState());
  assertEquals(1,service.claims);
  activationUnchanged();
 }
 private void injectResetTransport(){
  activity.onActivity(a->{try{
   var channelField=MainActivity.class.getDeclaredField("administration");channelField.setAccessible(true);channelField.set(a,channel);
   var resetField=MainActivity.class.getDeclaredField("accountingReset");resetField.setAccessible(true);resetField.set(a,client);
  }catch(Exception error){throw new AssertionError(error);}});
 }
 private void connectSyntheticResetEndpoint() throws Exception {
  // The signed Java transport is deliberately local; CI blocks external egress.
  // Model availability of THAT endpoint instead of borrowing the emulator's
  // navigator.onLine value. Keep the real controller, NativeHost, signatures,
  // consent UI and durable receipts; no poll/prepare/close shortcut is installed.
  js("Object.defineProperty(navigator,'onLine',{value:true,configurable:true});window.__resetUiNativeTrace=[];const resetCall=NativeFiles.accountingReset.bind(NativeFiles);NativeFiles.accountingReset=async(command,payload)=>{try{const value=await resetCall(command,payload);__resetUiNativeTrace.push({command,stage:value?.stage});return value}catch(error){__resetUiNativeTrace.push({command,code:error.code,message:error.message});throw error}};true");
  assertEquals("true",js("navigator.onLine"));
 }
 private void untilResetReview() throws Exception {
  long deadline=System.currentTimeMillis()+45000;
  while(System.currentTimeMillis()<deadline){
   if("true".equals(js("!!document.querySelector('[data-accounting-reset=review]')")))return;
   Thread.sleep(50);
  }
  fail("Reset review missing; signed fixture polls="+service.polls+", claims="+service.claims+", status="+service.status+", lastOperation="+service.lastOperation+"; UI="+
    js("JSON.stringify({online:navigator.onLine,hidden:document.hidden,busy:window.karnaPersistenceBusy?.(),active:document.activeElement?.tagName,field:document.activeElement?.name,modal:typeof modal==='undefined'?null:modal,overlays:document.querySelectorAll('.owner-recovery-overlay').length,trace:window.__resetUiNativeTrace,body:document.body.innerText})"));
 }
 private static java.lang.reflect.Field backupSingleton() throws Exception {
  var field=CloudBackupManager.class.getDeclaredField("singleton");field.setAccessible(true);return field;
 }
 private void assertTaskRemoved(int taskId) throws Exception {
  ActivityManager manager=(ActivityManager)context.getSystemService(Context.ACTIVITY_SERVICE);
  assertNotNull(manager);
  long deadline=System.currentTimeMillis()+5000;
  while(System.currentTimeMillis()<deadline){
   boolean present=false;
   for(ActivityManager.AppTask task:manager.getAppTasks())try{if(task.getTaskInfo().id==taskId)present=true;}catch(IllegalArgumentException removed){}
   if(!present)return;
   Thread.sleep(50);
  }
  fail("Completed reset task remains in recent tasks");
 }
 @Test public void atomicDatabaseResetReopensOwnerSetupAndKeepsActivation() throws Exception {
  // A never-used accounting-reset feature must not turn optional support damage into
  // a mandatory online startup dependency. A stranded reset key still fails closed.
  for(String suffix:new String[]{"",".bak",".new"}){File f=new File(context.getNoBackupFilesDir(),AccountingResetStore.FILE+suffix);if(f.exists())assertTrue(f.delete());}
  assertFalse("Missing file with a surviving reset key is uncertain, not idle",AccountingResetStore.noLocalState(context));
  KeyStore resetKeys=KeyStore.getInstance("AndroidKeyStore");resetKeys.load(null);resetKeys.deleteEntry(AccountingResetStore.ALIAS);assertTrue(AccountingResetStore.noLocalState(context));
  assertEquals("idle",AccountingResetStore.localResume(context,license).getString("stage"));assertFalse(new File(context.getNoBackupFilesDir(),AccountingResetStore.FILE).exists());assertFalse(resetKeys.containsAlias(AccountingResetStore.ALIAS));
  // Merely polling once creates a valid empty journal: that must be equally optional.
  new AccountingResetStore(context,license.deviceCode(),new InstallationIdentity(false).fingerprint());assertFalse(AccountingResetStore.noLocalState(context));assertEquals("idle",AccountingResetStore.localResume(context,license).getString("stage"));
  try(FileOutputStream out=new FileOutputStream(new File(context.getNoBackupFilesDir(),"contatools-v1.json"))){out.write("intentionally-corrupt-optional-support-journal".getBytes(StandardCharsets.UTF_8));}
  rejected(()->new ContatoolsClient(context,license,service.issuers,service));
  var queueField=MainActivity.class.getDeclaredField("administrationQueue");queueField.setAccessible(true);ThreadPoolExecutor supportQueue=(ThreadPoolExecutor)queueField.get(null);CountDownLatch supportHeld=new CountDownLatch(1),supportStarted=new CountDownLatch(1);
  supportQueue.execute(()->{supportStarted.countDown();try{supportHeld.await(60,TimeUnit.SECONDS);}catch(InterruptedException interrupted){Thread.currentThread().interrupt();}});assertTrue(supportStarted.await(10,TimeUnit.SECONDS));for(int i=0;i<8;i++)supportQueue.execute(()->{});
  try{activity=ActivityScenario.launch(MainActivity.class);ExistingLicenseAccess.enter(activity);until("!!document.querySelector('[data-action=\"site:setup\"]')");}finally{supportHeld.countDown();}
  async("const {ShopDatabase,passwordDigest}=await import('https://appassets.androidplatform.net/assets/approved/database.js');const {prepareFeatureState}=await import('https://appassets.androidplatform.net/assets/approved/features.js');window.__resetDb=await new ShopDatabase().open();window.__resetBlank={originId:'reset-fixture-shop',products:[],parties:[],records:[],users:[],accounts:[],warehouses:['المخزن الرئيسي'],warehouse:'المخزن الرئيسي',branding:'متجر الفحص',opening:{accounts:{},parties:{},stocks:{}}};prepareFeatureState(__resetBlank);window.__resetBusiness=structuredClone(__resetBlank);__resetBusiness.accounts=[{id:1,name:'نقدي',balance:123}];__resetBusiness.opening.accounts={1:123};await __resetDb.replace(__resetBusiness,[{id:'reset-fixture-owner',name:'مالك الفحص',username:'old-owner',role:'owner',active:true,password:await passwordDigest('1234')},{id:'worker-reset-fixture',name:'عامل',username:'worker',role:'sales',active:true,password:await passwordDigest('5678')}]);await __resetDb.put('meta',{id:'session:old-fixture',user:'reset-fixture-owner'});await __resetDb.put('snapshots',{id:'old-fixture',state:__resetBusiness});");
  JSONObject prepared=client.prepare(accepted(client.poll(target)));async("window.__resetReceipt=await __resetDb.resetAccounting("+prepared+",__resetBlank);window.__resetUsers=await __resetDb.all('users');window.__resetBootstrap=await __resetDb.accountingResetBootstrap();window.__resetSession=await __resetDb.get('meta','session:old-fixture');");
  assertEquals("0",js("__resetUsers.length"));assertEquals("reset-fixture-owner",text("__resetBootstrap.ownerId"));assertEquals("\"undefined\"",js("typeof __resetSession"));
  // Crash after IndexedDB commit and before native finish: same intent must be idempotent.
  recreate();JSONObject resumed=client.resumeLocal();async("window.__resetRetried=await __resetDb.resetAccounting("+resumed+",__resetBlank)");assertEquals("true",js("__resetRetried.alreadyApplied"));client.finish(receipt(resumed));client.acknowledge();
  async("__resetDb.db.close()");activity.close();activity=ActivityScenario.launch(MainActivity.class);ExistingLicenseAccess.enter(activity);until("!!document.querySelector('[data-action=\"site:setup\"]')");assertEquals("false",js("!!document.querySelector('[name=name], [name=shop]')"));assertEquals("true",js("!!document.querySelector('[name=username]')&&!!document.querySelector('[name=password]')"));
  js("document.querySelector('[name=username]').value='fresh-owner';document.querySelector('[name=password]').value='4321';document.querySelector('[data-action=\"site:setup\"]').click();true");until("!!document.querySelector('.nav')");
  async("const {ShopDatabase,verifyPassword}=await import('https://appassets.androidplatform.net/assets/approved/database.js');window.__resetDb=await new ShopDatabase().open();window.__resetAfter=await __resetDb.load();window.__resetOwners=await __resetDb.all('users');window.__resetPassword=await verifyPassword('4321',__resetOwners[0].password)");assertEquals("reset-fixture-shop",text("__resetAfter.originId"));assertEquals("reset-fixture-owner",text("__resetOwners[0].id"));assertEquals("true",js("__resetPassword"));assertEquals("0",js("__resetAfter.records.length"));activationUnchanged();
 }
 private String js(String script) throws Exception {ArrayBlockingQueue<String> result=new ArrayBlockingQueue<>(1);activity.onActivity(a->a.getWebView().evaluateJavascript(script,value->result.offer(value==null?"null":value)));String value=result.poll(20,TimeUnit.SECONDS);assertNotNull("WebView response",value);return value;}
 private String text(String script) throws Exception {return new JSONTokener(js(script)).nextValue().toString();}
 private void until(String expression) throws Exception {long until=System.currentTimeMillis()+45000;while(System.currentTimeMillis()<until){if("true".equals(js(expression)))return;Thread.sleep(50);}fail("Timed out: "+expression+"; "+js("document.body.innerText"));}
 private void async(String script) throws Exception {js("window.__resetDone=false;window.__resetError=null;(async()=>{"+script+"})().catch(e=>window.__resetError=e.message).finally(()=>window.__resetDone=true);true");until("window.__resetDone");assertEquals("null",js("window.__resetError"));}
 private static String coordinate(BigInteger value){byte[] bytes=value.toByteArray(),out=new byte[32];int count=Math.min(32,bytes.length);System.arraycopy(bytes,bytes.length-count,out,32-count,count);return ProtocolJson.base64(out);}
 private static final class FakeService implements ContatoolsClient.Transport {
  final KeyPair pair;
  final JSONObject issuers;
  final Map<String,JSONObject> challenges=new HashMap<>();
  JSONObject registration,grant,claim;
  volatile String status="waiting",lastOperation="none";
  volatile boolean offline,dropClaim,dropComplete,denyUnclaimed,rejectClaimAuthentication,offlineAfterClaim;
  volatile int polls,claims,completions;
  FakeService() throws Exception {KeyPairGenerator generator=KeyPairGenerator.getInstance("EC");generator.initialize(new ECGenParameterSpec("secp256r1"));pair=generator.generateKeyPair();ECPublicKey key=(ECPublicKey)pair.getPublic();issuers=new JSONObject().put("reset-fixture",new JSONObject().put("kty","EC").put("crv","P-256").put("x",coordinate(key.getW().getAffineX())).put("y",coordinate(key.getW().getAffineY())));}
  JSONObject envelope(String purpose,JSONObject value) throws Exception {JSONObject result=new JSONObject().put("schema",purpose).put("version",1).put("kid","reset-fixture").put("payload",copy(value));Signature signer=Signature.getInstance("SHA256withECDSA");signer.initSign(pair.getPrivate());signer.update(ProtocolJson.canonical(result).getBytes(StandardCharsets.UTF_8));return result.put("signature",ProtocolJson.base64(ProtocolJson.rawSignature(signer.sign())));}
  public synchronized JSONObject post(String path,JSONObject body) throws Exception {
   String operation=body.getString("operation");lastOperation=operation;if(offline)throw new IOException("Isolated outage");JSONObject p=body.getJSONObject("payload");
   if(path.endsWith("/challenge")){String id=UUID.randomUUID().toString();JSONObject proof=new JSONObject().put("schema","contatools-device-proof").put("version",1).put("id",id).put("nonce",UUID.randomUUID().toString()).put("installationId",p.getString("installationId")).put("operation",operation).put("payloadHash",ProtocolJson.hash(p)).put("expiresAt",System.currentTimeMillis()+60000);challenges.put(id,proof);return new JSONObject().put("id",id).put("message",ProtocolJson.canonical(proof));}
   JSONObject proof=challenges.remove(body.getString("challengeId"));assertNotNull(proof);assertEquals(operation,proof.getString("operation"));assertEquals(ProtocolJson.hash(p),proof.getString("payloadHash"));JSONObject jwk="register".equals(operation)?p.getJSONObject("publicJwk"):registration.getJSONObject("publicJwk");Signature verifier=Signature.getInstance("SHA256withECDSA");verifier.initVerify(LicenseVerifier.key(jwk.getString("x"),jwk.getString("y")));verifier.update(ProtocolJson.canonical(proof).getBytes(StandardCharsets.UTF_8));assertTrue(verifier.verify(LicenseVerifier.der(ProtocolJson.decode(body.getString("signature")))));
   if("register".equals(operation)){registration=copy(p);return new JSONObject().put("registered",true);}
   if(grant==null){JSONObject doc=new JSONObject(registration.getString("licenseDocument"));long now=System.currentTimeMillis();grant=envelope("contatools-accounting-reset",new JSONObject().put("grantId",UUID.randomUUID().toString()).put("requestId",UUID.randomUUID().toString()).put("installationId",registration.getString("installationId")).put("keyFingerprint",ProtocolJson.fingerprint(registration.getJSONObject("publicJwk"))).put("deviceCode",registration.getString("deviceCode")).put("licenseDocumentHash",ProtocolJson.hash(doc)).put("licenseId",doc.getJSONObject("payload").getString("licenseId")).put("shopId",registration.getString("localShopId")).put("ownerId",registration.getJSONArray("owners").getJSONObject(0).getString("id")).put("issuedAt",now).put("expiresAt",now+86400000));}
   JSONObject g=grant.getJSONObject("payload");assertEquals(g.getString("shopId"),p.getString("shopId"));assertEquals(g.getString("ownerId"),p.getString("ownerId"));
   switch(operation){
    case "accounting-reset.poll":polls++;return new JSONObject().put("status",status).put("requestId",g.getString("requestId")).put("expiresAt",g.getLong("expiresAt")).put("reason","طلب صاحب المحل بدء المحاسبة من جديد").put("grant",grant);
    case "accounting-reset.decline":assertEquals("waiting",status);status="declined";return new JSONObject().put("ok",true).put("status",status);
    case "accounting-reset.claim":assertTrue(p.getBoolean("accepted"));if(rejectClaimAuthentication)throw new ContatoolsClient.ServiceFailure(403,true,0);if(denyUnclaimed){assertNull(claim);return new JSONObject().put("status","unavailable").put("denial",envelope("contatools-accounting-reset-denial",copy(g).put("intentId",p.getString("intentId")).put("deniedAt",System.currentTimeMillis()).put("status","cancelled")));}if(claim==null){assertEquals("waiting",status);claim=envelope("contatools-accounting-reset-claim",copy(g).put("intentId",p.getString("intentId")).put("claimedAt",System.currentTimeMillis()));claims++;status="claimed";}else assertEquals(claim.getJSONObject("payload").getString("intentId"),p.getString("intentId"));if(dropClaim)throw new IOException("Lost signed claim response");if(offlineAfterClaim)offline=true;return new JSONObject().put("status",status).put("claim",claim);
    case "accounting-reset.complete":assertEquals(claim.getJSONObject("payload").getString("intentId"),p.getString("intentId"));if(!"completed".equals(status)){completions++;status="completed";}if(dropComplete)throw new IOException("Lost complete response");return new JSONObject().put("status",status).put("ok",true);
    default:throw new IOException("Unexpected fixture operation "+operation);
   }
  }
 }
}
