package mr.alkarna.mobile.approved;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import java.io.*;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.interfaces.ECPublicKey;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.Assert.*;

/** Runs only in private Contatools CI against the actual extracted service, after install -r. */
@RunWith(AndroidJUnit4.class)
public class ContatoolsRecoveryTest {
 private ActivityScenario<MainActivity> activity;
 private UpgradePersistenceTest previous;
 private final Wire wire=new Wire();
 private String js(String script) throws Exception {ArrayBlockingQueue<String> q=new ArrayBlockingQueue<>(1);activity.onActivity(a->a.getWebView().evaluateJavascript(script,v->q.offer(v==null?"null":v)));String r=q.poll(20,TimeUnit.SECONDS);assertNotNull("WebView response",r);return r;}
 private String text(String script) throws Exception {return new JSONTokener(js(script)).nextValue().toString();}
 private void until(String condition) throws Exception {long end=System.currentTimeMillis()+45000;while(System.currentTimeMillis()<end){if("true".equals(js(condition)))return;Thread.sleep(100);}fail("Timed out: "+condition+"; "+js("document.body.innerText"));}
 private void async(String expression) throws Exception {js("window.__ctDone=false;window.__ctFailure=null;(async()=>{"+expression+"})().catch(e=>window.__ctFailure=e.message).finally(()=>window.__ctDone=true);true");until("window.__ctDone");assertEquals("null",js("window.__ctFailure"));}
 private void click(String selector) throws Exception {js("document.querySelector("+JSONObject.quote(selector)+").click();true");}
 private ContatoolsClient client(JSONObject keys) throws Exception {return new ContatoolsClient(InstrumentationRegistry.getInstrumentation().getTargetContext(),new DeviceLicense(InstrumentationRegistry.getInstrumentation().getTargetContext()),keys,wire);}
 private void inject(ContatoolsClient client) {activity.onActivity(a->{try{var field=MainActivity.class.getDeclaredField("administration");field.setAccessible(true);field.set(a,client);}catch(Exception e){throw new RuntimeException(e);}});}
 private static String coordinate(java.math.BigInteger value){byte[] raw=value.toByteArray(),bytes=new byte[32];System.arraycopy(raw,Math.max(0,raw.length-32),bytes,Math.max(0,32-raw.length),Math.min(32,raw.length));return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);}
 @Before public void prepare() throws Exception {
  assertEquals("true",InstrumentationRegistry.getArguments().getString("contatoolsIntegration"));
  previous=new UpgradePersistenceTest();previous.persistentInstrumentationIssuer();
  ECPublicKey key=(ECPublicKey)LicenseCompatibilityTest.keys().get("alkarna-license-v2");wire.post("/fixture/legacy-key",new JSONObject().put("kty","EC").put("crv","P-256").put("x",coordinate(key.getW().getAffineX())).put("y",coordinate(key.getW().getAffineY())));
 }
 @After public void close() throws Exception {if(activity!=null)activity.close();if(previous!=null)previous.closeAndRestoreKeys();}
 @Test public void ownerRecoveryBeforeLoginAndDurableCrashRetry() throws Exception {
  JSONObject keys=wire.post("/fixture/config",new JSONObject()).getJSONObject("publicKeys");
  DeviceLicense license=new DeviceLicense(InstrumentationRegistry.getInstrumentation().getTargetContext());String licenseId=license.status().getJSONObject("license").getString("licenseId");double remaining=license.status().getJSONObject("license").getDouble("remainingSeconds");
  activity=ActivityScenario.launch(MainActivity.class);until("!!document.querySelector('[data-action=\"site:login\"]')");ContatoolsClient client=client(keys);inject(client);
  async("const {ShopDatabase,passwordDigest}=await import('https://appassets.androidplatform.net/assets/approved/database.js');window.__ctDb=await new ShopDatabase().open();await __ctDb.put('users',{id:'worker-fixture',username:'worker-fixture',name:'العامل',role:'sales',active:true,password:await passwordDigest('worker-5678')});");
  js("location.reload();true");Thread.sleep(1000);
  until("!!document.querySelector('[data-action=\"site:login\"]')");inject(client);
  // Only the independent test bridge is online. Native external connectivity stays off.
  js("Object.defineProperty(navigator,'onLine',{get:()=>true,configurable:true});window.dispatchEvent(new Event('online'));true");
  long registrationDeadline=System.currentTimeMillis()+210000;
  while(wire.registrations.get()==0&&System.currentTimeMillis()<registrationDeadline)Thread.sleep(200);
  assertEquals("Foreground registration happens without opening recovery",1,wire.registrations.get());
  assertEquals(15,wire.lastRegistration.getInt("versionCode"));assertEquals("1.0.14",wire.lastRegistration.getString("appVersion"));assertEquals(license.deviceCode(),wire.lastRegistration.getString("deviceCode"));
  assertEquals(ProtocolJson.hash(new JSONObject(license.registrationSnapshot().getString("licenseDocument"))),ProtocolJson.hash(new JSONObject(wire.lastRegistration.getString("licenseDocument"))));
  client=client(keys);inject(client);js("for(let i=0;i<100;i++)window.dispatchEvent(new Event('online'));true");Thread.sleep(2500);
  assertEquals("Saved native success survives client recreation and event bursts",1,wire.registrations.get());
  System.out.println("AUTO REGISTER PASS: real candidate source, unchanged signed original document, persisted installation identity, one registration after initial jitter, 100 events plus recreated client = no duplicate HTTP registration.");
  async("const {ShopDatabase}=await import('https://appassets.androidplatform.net/assets/approved/database.js');window.__ctDb=await new ShopDatabase().open();window.__ctOwner=(await __ctDb.all('users')).find(u=>u.role==='owner').id;window.__ctWorker=JSON.stringify(await __ctDb.get('users','worker-fixture'));window.__ctBusiness=JSON.stringify(await __ctDb.all('snapshots'));");
  String worker=text("__ctWorker"),business=text("__ctBusiness");
  click("[data-owner-recovery]");until("!!document.querySelector('.recovery-actions select')");click(".recovery-actions > button");until("document.querySelector('[role=status]')?.textContent.includes('attente')||document.querySelector('[role=status]')?.textContent.includes('ينتظر')");
  JSONObject before=wire.post("/fixture/state",new JSONObject());assertEquals("waiting",before.getString("latestStatus"));assertFalse(before.getBoolean("credentialUploaded"));
  wire.post("/fixture/approve",new JSONObject());Thread.sleep(10500);click(".recovery-actions > button");until("!!document.querySelector('.recovery-actions input[name=password]')");
  js("document.querySelector('.recovery-actions input[name=password]').value='new-4321';document.querySelector('.recovery-actions input[name=confirm]').value='new-4321';true");click(".recovery-actions form button");until("document.querySelector('[role=status]')?.textContent.includes('enregistré')||document.querySelector('[role=status]')?.textContent.includes('حُفظت')");
  async("const {verifyPassword}=await import('https://appassets.androidplatform.net/assets/approved/database.js');const owner=await __ctDb.get('users',__ctOwner);window.__ctOld=await verifyPassword('1234',owner.password);window.__ctNew=await verifyPassword('new-4321',owner.password);window.__ctWorkerAfter=JSON.stringify(await __ctDb.get('users','worker-fixture'));window.__ctBusinessAfter=JSON.stringify(await __ctDb.all('snapshots'));");
  assertEquals("false",js("__ctOld"));assertEquals("true",js("__ctNew"));assertEquals(worker,text("__ctWorkerAfter"));assertEquals(business,text("__ctBusinessAfter"));assertEquals("true",js("!!document.querySelector('[data-action=\"site:login\"]')&&!document.querySelector('.nav')"));
  click(".owner-recovery-panel header button");js("document.querySelector('[name=username]').value='upgrade-owner';document.querySelector('[name=password]').value='new-4321';act('site:login');true");until("!!document.querySelector('.nav')");
  js("act('site:logout');true");until("!!document.querySelector('[data-action=\"site:login\"]')");
  client.acknowledgePending();
  // Reserve a second reset, drop the successful claim response and recreate the native client.
  String ownerId=text("__ctOwner");client.request(ownerId);wire.post("/fixture/approve",new JSONObject());client.poll();
  async("window.__ctDigest=await (await import('https://appassets.androidplatform.net/assets/approved/database.js')).passwordDigest('after-crash-8765')");JSONObject password=new JSONObject(text("JSON.stringify(__ctDigest)"));wire.dropClaim=true;try{client.prepare(password);fail("Lost claim response must be recoverable");}catch(IOException expected){}
  wire.dropClaim=false;wire.post("/fixture/advance",new JSONObject().put("milliseconds",400000));
  ContatoolsClient restarted=client(keys);JSONObject prepared=restarted.resume();assertEquals("prepared",prepared.getString("stage"));
  async("window.__ctReceipt=await __ctDb.recoverOwner("+prepared+")");
  // Simulate a crash after IndexedDB commit and before native finish/acknowledgement.
  ContatoolsClient afterCommit=client(keys);JSONObject retry=afterCommit.resume();assertEquals(prepared.getString("intentId"),retry.getString("intentId"));
  async("window.__ctRetry=await __ctDb.recoverOwner("+retry+")");assertEquals("true",js("__ctRetry.alreadyApplied"));
  wire.dropComplete=true;assertTrue(afterCommit.finish(retry.getString("grantId"),retry.getString("intentId")).getBoolean("ackPending"));wire.dropComplete=false;
  assertEquals("complete",client(keys).resume().getString("stage"));assertEquals("idle",client(keys).resume().getString("stage"));
  JSONObject state=wire.post("/fixture/state",new JSONObject());assertEquals("used",state.getString("latestStatus"));assertEquals(2,state.getInt("usedGrants"));assertEquals(1,state.getInt("registrations"));assertEquals(0,state.getInt("serviceLicensePeriods"));assertFalse(state.getBoolean("credentialUploaded"));
  async("const {verifyPassword}=await import('https://appassets.androidplatform.net/assets/approved/database.js');window.__ctFinal=await verifyPassword('after-crash-8765',(await __ctDb.get('users',__ctOwner)).password);window.__ctWorkerAfter=JSON.stringify(await __ctDb.get('users','worker-fixture'));window.__ctBusinessAfter=JSON.stringify(await __ctDb.all('snapshots'));");assertEquals("true",js("__ctFinal"));assertEquals(worker,text("__ctWorkerAfter"));assertEquals(business,text("__ctBusinessAfter"));
  ContatoolsClient checks=client(keys);wire.offline=true;
  try{checks.request(ownerId);fail("Outage must be reported without a local credential change");}catch(IOException expected){}finally{wire.offline=false;}
  checks.request(ownerId);wire.post("/fixture/reject",new JSONObject());assertEquals("rejected",checks.poll().getString("status"));
  try{checks.prepare(password);fail("Rejected recovery cannot reset credentials");}catch(Exception expected){}
  checks.request(ownerId);wire.post("/fixture/approve",new JSONObject());checks.poll();wire.post("/fixture/advance",new JSONObject().put("milliseconds",400000));assertEquals("expired",checks.prepare(password).getString("stage"));
  async("window.__ctFinal=await (await import('https://appassets.androidplatform.net/assets/approved/database.js')).verifyPassword('after-crash-8765',(await __ctDb.get('users',__ctOwner)).password)");assertEquals("true",js("__ctFinal"));
  JSONObject active=new DeviceLicense(InstrumentationRegistry.getInstrumentation().getTargetContext()).status();assertTrue(active.getBoolean("valid"));assertEquals(licenseId,active.getJSONObject("license").getString("licenseId"));assertTrue(active.getJSONObject("license").getDouble("remainingSeconds")<=remaining);
  System.out.println("CONTATOOLS PASS: real service + Keystore proof + pre-login owner UI + unchanged business/worker/license + lost responses + recreated journal + exactly-once local reset.");
 }
 private static final class Wire implements ContatoolsClient.Transport {
  boolean dropClaim,dropComplete,offline;
  final java.util.concurrent.atomic.AtomicInteger registrations=new java.util.concurrent.atomic.AtomicInteger();
  volatile JSONObject lastRegistration;
  public JSONObject post(String path,JSONObject body) throws Exception {
   if(offline)throw new IOException("Deliberate isolated outage");
   // Test APK only: local adb-reversed socket. Production client permits fixed HTTPS only.
   try(Socket socket=new Socket("127.0.0.1",8432)){
    socket.setSoTimeout(20000);byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);OutputStream out=socket.getOutputStream();out.write(("POST "+path+" HTTP/1.1\r\nHost: localhost\r\nAuthorization: Basic "+Base64.getEncoder().encodeToString("fixture-review:fixture-only-secret".getBytes(StandardCharsets.UTF_8))+"\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: "+bytes.length+"\r\n\r\n").getBytes(StandardCharsets.US_ASCII));out.write(bytes);out.flush();String raw=new String(socket.getInputStream().readAllBytes(),StandardCharsets.UTF_8);int split=raw.indexOf("\r\n\r\n");if(split<0||!raw.startsWith("HTTP/1.1 200"))throw new IOException("Fixture service rejected operation: "+path+" "+raw.substring(0,Math.min(300,raw.length())));JSONObject result=new JSONObject(raw.substring(split+4));if("/api/android/dispatch".equals(path)&&"register".equals(body.optString("operation"))){lastRegistration=new JSONObject(body.getJSONObject("payload").toString());registrations.incrementAndGet();}if("/api/android/dispatch".equals(path)&&((dropClaim&&"recovery.claim".equals(body.optString("operation")))||(dropComplete&&"recovery.complete".equals(body.optString("operation")))))throw new IOException("Deliberately lost fixture response");return result;
   }
  }
 }
}
