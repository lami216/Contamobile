package mr.alkarna.mobile.approved;

import static org.junit.Assert.*;
import android.content.Context;
import android.os.Build;
import android.util.AtomicFile;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.*;
import java.time.Instant;
import java.util.*;
import org.json.*;
import org.junit.*;
import org.junit.rules.TestWatcher;
import org.junit.runner.Description;
import org.junit.runner.RunWith;

/** Real Keystore/AtomicFile/account client, with one isolated signed service fixture. */
@RunWith(AndroidJUnit4.class)
public final class OfflineAccountControlTest {
 private static final String PHONE="22345678",CODE="synthetic-local-secret",VAULT="account-access-v1.json";
 private Context context;private DeviceLicense license;private AccountAccessClient client;private Service service;
 private Map<String,PublicKey> oldLegacy,oldOnline;private boolean owned;
 @Rule public final TestWatcher executed=new TestWatcher(){@Override protected void succeeded(Description d){android.os.Bundle b=new android.os.Bundle();b.putString("stream","\nOFFLINE ACCOUNT CONTROL CASE PASS "+d.getMethodName()+"\n");InstrumentationRegistry.getInstrumentation().sendStatus(0,b);}};
 private interface Work{void run()throws Exception;}
 private static JSONObject copy(JSONObject p)throws Exception{return new JSONObject(p.toString());}
 private static void rejects(Work work)throws Exception{try{work.run();fail("Expected rejection");}catch(Exception expected){}}
 @SuppressWarnings("unchecked") private static Map<String,PublicKey> onlineKeys()throws Exception{var f=LicenseVerifier.class.getDeclaredField("ONLINE_KEYS");f.setAccessible(true);return (Map<String,PublicKey>)f.get(null);}
 private File file(String name){return new File(context.getNoBackupFilesDir(),name);}
 private JSONObject journal()throws Exception{return new AccountVault(context,new InstallationIdentity().id()).read();}
 private void recreate()throws Exception{license=new DeviceLicense(context);client=new AccountAccessClient(context,license,service.lifecycle.issuers,service);}
 @Before public void isolated()throws Exception{
  assertEquals("true",InstrumentationRegistry.getArguments().getString("offlineAccountIsolation"));
  assertTrue(Build.HARDWARE.equals("ranchu")||Build.HARDWARE.equals("goldfish")||Build.FINGERPRINT.contains("emulator")||Build.MODEL.contains("sdk_gphone"));
  context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  for(String name:new String[]{"activation-v2.json",VAULT,DeviceLifecycleStore.DIRECTORY,"offline-account-sentinel.bin"})assertFalse("Never overwrite customer state",file(name).exists());
  assertFalse(context.getSharedPreferences("activation-v2",Context.MODE_PRIVATE).contains("state"));
  KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);for(String alias:new String[]{InstallationIdentity.ALIAS,"alkarna.account.access.v1","alkarna.activation.state.v2",DeviceLifecycleStore.ALIAS})assertFalse("Disposable fixture key",keys.containsAlias(alias));
  oldLegacy=new HashMap<>(LicenseCompatibilityTest.keys());oldOnline=new HashMap<>(onlineKeys());owned=true;
  license=new DeviceLicense(context);service=new Service(license.deviceCode());onlineKeys().put("contatools-online-v2:fixture",service.lifecycle.pair.getPublic());recreate();
  Files.write(file("offline-account-sentinel.bin").toPath(),"synthetic-ledger-bytes-unchanged".getBytes(StandardCharsets.UTF_8));
 }
 @After public void cleanup()throws Exception{
  if(!owned)return;assertEquals("synthetic-ledger-bytes-unchanged",new String(Files.readAllBytes(file("offline-account-sentinel.bin").toPath()),StandardCharsets.UTF_8));
  File dir=file(DeviceLifecycleStore.DIRECTORY);if(dir.exists()){for(File f:Objects.requireNonNull(dir.listFiles())){assertTrue(f.isFile());assertTrue(f.delete());}assertTrue(dir.delete());}
  for(String name:new String[]{"activation-v2.json",VAULT,"offline-account-sentinel.bin"})for(String suffix:new String[]{"",".bak",".new"}){File f=file(name+suffix);if(f.exists()){assertTrue(f.isFile());assertTrue(f.delete());}}
  assertTrue(context.getSharedPreferences("activation-v2",Context.MODE_PRIVATE).edit().clear().commit());
  KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);for(String alias:new String[]{InstallationIdentity.ALIAS,"alkarna.account.access.v1","alkarna.activation.state.v2",DeviceLifecycleStore.ALIAS})if(keys.containsAlias(alias))keys.deleteEntry(alias);
  LicenseCompatibilityTest.keys().clear();LicenseCompatibilityTest.keys().putAll(oldLegacy);onlineKeys().clear();onlineKeys().putAll(oldOnline);
 }
 private void activated(boolean linked)throws Exception{
  JSONObject input=new JSONObject().put("identifier",PHONE).put("code",CODE).put("consent",true);
  if(linked){license.install(TestLicenseIssuer.issue(license.deviceCode(),"temporary",3600));input.put("localOwnerId","existing-owner").put("localShopId","existing-shop");client.command("offline-request",input);}
  else assertEquals("pending",client.command("login",input).getString("stage"));
  service.approve();assertEquals("active",client.command("offline-status",new JSONObject()).getString("stage"));
  assertEquals("offline",client.command("offline-activate",new JSONObject()).getString("mode"));assertTrue(license.status().getBoolean("valid"));
  if(linked){double remaining=license.status().getJSONObject("license").getDouble("remainingSeconds");double expected=Math.max(0,(service.lifecycle.endsAt-System.currentTimeMillis())/1000d);assertTrue("Only request latency, never Android uptime, may reduce the received fixed term",remaining>=expected-2);}
 }
 private JSONObject current()throws Exception{return client.command("offline-current",new JSONObject());}
 private void completed()throws Exception{client.command("bootstrap-complete",new JSONObject());current();}
 private void renew()throws Exception{service.renew(System.currentTimeMillis()+1200000);current();}
 @Test public void legacyAutomaticEntryKeepsLicenseAndNeverCreatesAccountMigration()throws Exception{
  license.install(TestLicenseIssuer.issue(license.deviceCode(),"temporary",3600));String hash=license.documentHash();
  assertFalse(file(VAULT).exists());assertTrue(client.enterLocalAutomatically());assertEquals("legacy",client.command("bootstrap",new JSONObject()).getString("mode"));
  assertFalse(file(VAULT).exists());assertEquals(hash,license.documentHash());assertFalse(service.accepted);assertEquals(0,service.currentCalls);
 }
 @Test public void directActivationLostAckConvergesWithoutRepeatingTheTerm()throws Exception{
  activated(false);String hash=license.documentHash();service.dropAccept=true;
  assertTrue(client.command("bootstrap-complete",new JSONObject()).getBoolean("ackPending"));long end=service.lifecycle.endsAt;
  recreate();assertTrue(client.enterLocalAutomatically());assertEquals("active",current().getString("status"));
  assertFalse(journal().getJSONObject("offline").getBoolean("ackPending"));assertEquals(hash,license.documentHash());assertEquals(end,license.status().getJSONObject("entitlement").getLong("endsAt"));assertEquals(1,service.acceptedCount);assertEquals(BuildConfig.VERSION_CODE,service.enrolledVersion);
  assertFalse("A background retry cannot restore a secret owner login",client.command("bootstrap",new JSONObject()).has("credential"));
 }
 @Test public void signedSuspensionSurvivesRestartAndBlocksLegacyAndFileImport()throws Exception{
  activated(false);completed();service.control(true);assertEquals("suspended",current().getString("status"));
  recreate();assertEquals("ENTITLEMENT_SUSPENDED",license.status().getString("code"));assertFalse(client.enterLocalAutomatically());
  rejects(()->client.command("legacy",new JSONObject()));rejects(()->license.install(TestLicenseIssuer.issue(license.deviceCode(),"perpetual",0)));
  client.command("logout",new JSONObject());assertFalse(license.status().getBoolean("valid"));
  assertEquals("suspended",client.command("login",new JSONObject().put("identifier",PHONE).put("code",CODE).put("consent",true)).getString("stage"));assertFalse(client.admitted());rejects(()->client.command("bootstrap",new JSONObject()));assertFalse(new DeviceLicense(context).status().getBoolean("valid"));
 }
 @Test public void resumePreservesTheDeadlineAndCannotReopenAnExpiredTerm()throws Exception{
  activated(false);completed();long end=license.status().getJSONObject("entitlement").getLong("endsAt");service.control(true);current();service.control(false);assertEquals("active",current().getString("status"));assertEquals(end,license.status().getJSONObject("entitlement").getLong("endsAt"));
  service.serverNow=end+1;assertEquals("expired",current().getString("status"));assertFalse(client.enterLocalAutomatically());
  service.control(true);current();service.control(false);assertEquals("expired",current().getString("status"));assertEquals(end,license.status().getJSONObject("entitlement").getLong("endsAt"));
  recreate();JSONObject management=client.command("login",new JSONObject().put("identifier",PHONE).put("code",CODE).put("consent",true));assertEquals("expired",management.getString("stage"));assertFalse(client.admitted());rejects(()->client.command("bootstrap",new JSONObject()));renew();assertEquals("legacy",client.command("offline-renew",new JSONObject()).getString("mode"));assertFalse(client.command("bootstrap",new JSONObject()).has("credential"));
 }
 @Test public void networkAndForeignAccountScopeCannotChangeWorkingLocalRights()throws Exception{
  activated(false);completed();String hash=license.documentHash();long end=license.status().getJSONObject("entitlement").getLong("endsAt");
  service.offline=true;rejects(()->current());assertTrue(license.status().getBoolean("valid"));service.offline=false;service.wrongOwner=true;service.control(true);rejects(()->current());
  assertTrue(license.status().getBoolean("valid"));assertEquals(hash,license.documentHash());assertEquals(end,license.status().getJSONObject("entitlement").getLong("endsAt"));
 }
 @Test public void renewalBeforeLicenseWriteFailureRetriesOneClaimAndSameOwner()throws Exception{
  activated(false);completed();String original=license.documentHash();JSONObject before=journal().getJSONObject("offline");renew();service.blockLicenseAfterClaim=true;
  rejects(()->client.command("offline-renew",new JSONObject()));
  assertEquals(original,new DeviceLicense(context).documentHash());assertTrue(journal().getJSONObject("offline").has("pendingBinding"));
  recreate();JSONObject result=client.command("offline-renew",new JSONObject());assertEquals("legacy",result.getString("mode"));assertEquals(1,service.lifecycle.claims);assertFalse(journal().getJSONObject("offline").has("pendingBinding"));
  assertEquals(ProtocolJson.canonical(before.getJSONObject("verifier")),ProtocolJson.canonical(journal().getJSONObject("offline").getJSONObject("verifier")));assertFalse(client.command("bootstrap",new JSONObject()).has("credential"));
 }
 @Test public void renewalAfterLicenseWriteRecoversBindingOfflineWithoutNewAuthority()throws Exception{
  activated(false);completed();renew();service.blockVaultAfterInstall=true;File blocker=file(VAULT+".new");
  try{rejects(()->client.command("offline-renew",new JSONObject()));assertTrue(blocker.isDirectory());}finally{if(blocker.exists())assertTrue(blocker.delete());}
  String hash=new DeviceLicense(context).documentHash();long end=new DeviceLicense(context).status().getJSONObject("entitlement").getLong("endsAt");assertTrue(journal().getJSONObject("offline").has("pendingBinding"));
  service.offline=true;recreate();assertFalse(journal().getJSONObject("offline").has("pendingBinding"));assertEquals(hash,journal().getJSONObject("offline").getJSONObject("binding").getJSONObject("payload").getString("licenseDocumentHash"));assertEquals(end,license.status().getJSONObject("entitlement").getLong("endsAt"));assertTrue(client.enterLocalAutomatically());assertEquals("legacy",client.command("bootstrap",new JSONObject()).getString("mode"));assertEquals(1,service.lifecycle.claims);
 }
 @Test public void suspensionDuringRenewalGuardIsDurableBeforeAnyLicenseInstall()throws Exception{
  activated(false);completed();String old=license.documentHash();renew();service.suspendDuringGuard=true;rejects(()->client.command("offline-renew",new JSONObject()));
  assertEquals(old,license.documentHash());assertEquals("ENTITLEMENT_SUSPENDED",new DeviceLicense(context).status().getString("code"));assertFalse(journal().getJSONObject("offline").has("pendingBinding"));
  service.control(false);recreate();assertEquals("legacy",client.command("offline-renew",new JSONObject()).getString("mode"));assertEquals(1,service.lifecycle.claims);
 }
 @Test public void aSameGenerationResumeCannotUnlockAStoredSuspension()throws Exception{
  activated(false);completed();service.control(true);current();service.lifecycle.role="active";
  rejects(()->current());assertEquals("ENTITLEMENT_SUSPENDED",license.status().getString("code"));assertFalse(client.enterLocalAutomatically());
 }
 @Test public void onlineEntryPreferenceNeverBecomesLocalOrOnlineAuthority()throws Exception{
  license.install(TestLicenseIssuer.issue(license.deviceCode(),"temporary",3600));new AccountVault(context,new InstallationIdentity().id()).write(new JSONObject().put("version",1).put("preferOnlineEntry",true));recreate();
  assertFalse(client.enterLocalAutomatically());assertFalse(client.admitted());assertEquals("legacy",client.command("legacy",new JSONObject()).getString("mode"));assertFalse(journal().optBoolean("preferOnlineEntry"));assertTrue(client.admitted());
 }
 @Test public void linkedLegacyShopKeepsItsCanonicalCustomerOwnerAndDeadlineThroughControlAndRenew()throws Exception{
  activated(true);JSONObject before=journal().getJSONObject("offline"),claims=before.getJSONObject("binding").getJSONObject("payload");assertEquals("existing-owner",claims.getString("localOwnerId"));assertEquals("same-client",claims.getString("customerId"));service.enrolledVersion=28;DeviceLifecycleStore oldEnrollment=new DeviceLifecycleStore(context,license.deviceCode()+"|"+new InstallationIdentity().fingerprint());oldEnrollment.state.put("enrolled",true).put("enrolledVersionCode",28).put("enrolledLicenseHash",license.documentHash()).put("lastEnrollmentAt",System.currentTimeMillis());oldEnrollment.save();current();assertEquals(BuildConfig.VERSION_CODE,service.enrolledVersion);
  double beforePolls=license.status().getJSONObject("license").getDouble("remainingSeconds");Thread.sleep(1100);current();current();double afterPolls=license.status().getJSONObject("license").getDouble("remainingSeconds");assertTrue("Repeated signed polls consume elapsed time rather than Android uptime or a new term",afterPolls<=beforePolls-0.8);
  service.control(true);current();assertFalse(license.status().getBoolean("valid"));service.control(false);current();assertTrue("Resume cannot restore time already consumed before suspension",license.status().getJSONObject("license").getDouble("remainingSeconds")<=afterPolls);renew();assertEquals("legacy",client.command("offline-renew",new JSONObject()).getString("mode"));
  JSONObject next=journal().getJSONObject("offline");AccountProtocol.sameOfflineScope(claims,next.getJSONObject("binding").getJSONObject("payload"));assertEquals(ProtocolJson.canonical(before.getJSONObject("verifier")),ProtocolJson.canonical(next.getJSONObject("verifier")));assertEquals(1,service.lifecycle.claims);
 }


 @Test public void renewalStageVaultFailureLeavesOldLicenseAndRetriesTheAcceptedClaim()throws Exception{
  activated(false);completed();String old=license.documentHash();renew();service.blockVaultBeforeStage=true;File blocker=file(VAULT+".new");
  try{rejects(()->client.command("offline-renew",new JSONObject()));assertTrue(blocker.isDirectory());}finally{if(blocker.exists())assertTrue(blocker.delete());}
  assertEquals(old,new DeviceLicense(context).documentHash());assertFalse(journal().getJSONObject("offline").has("pendingBinding"));assertEquals(1,service.lifecycle.claims);
  recreate();assertEquals("legacy",client.command("offline-renew",new JSONObject()).getString("mode"));assertEquals(1,service.lifecycle.claims);
 }
 @Test public void aVaultFailureCannotDiscardAnAlreadyPersistedSignedSuspension()throws Exception{
  activated(false);completed();File blocker=file(VAULT+".new");assertTrue(blocker.mkdir());service.control(true);
  try{rejects(()->current());}finally{assertTrue(blocker.delete());}
  recreate();assertEquals("ENTITLEMENT_SUSPENDED",license.status().getString("code"));assertFalse(client.enterLocalAutomatically());rejects(()->client.command("legacy",new JSONObject()));
 }
 @Test public void aLostRenewalFinishConvergesInBackgroundWithoutSelectingANewOffer()throws Exception{
  activated(false);completed();renew();service.lifecycle.dropFinish=true;JSONObject result=client.command("offline-renew",new JSONObject());assertTrue(result.getBoolean("ackPending"));String hash=license.documentHash();long end=license.status().getJSONObject("entitlement").getLong("endsAt");
  recreate();current();DeviceLifecycleStore store=new DeviceLifecycleStore(context,license.deviceCode()+"|"+new InstallationIdentity().fingerprint());assertFalse(store.state.has("entitlementPending"));assertEquals(hash,license.documentHash());assertEquals(end,license.status().getJSONObject("entitlement").getLong("endsAt"));assertEquals(1,service.lifecycle.claims);assertEquals(1,service.lifecycle.finished);assertFalse(client.admitted());
 }


 @Test public void expiredInitialGrantRedeliveryDoesNotRestartAnAlreadyConsumedLicense()throws Exception{
  client.command("login",new JSONObject().put("identifier",PHONE).put("code",CODE).put("consent",true));service.approve();String hash=ProtocolJson.hash(service.initialDocument),id=service.activation.getJSONObject("payload").getString("issuanceId");
  service.redeliver(true);rejects(()->client.command("offline-activate",new JSONObject()));assertEquals("",license.documentHash());
  service.redeliver(false);File blocker=file(VAULT+".new");assertTrue(blocker.mkdir());
  try{rejects(()->client.command("offline-activate",new JSONObject()));}finally{assertTrue(blocker.delete());}
  assertEquals("The signed initial account intent is durable before any licence write","",new DeviceLicense(context).documentHash());
  recreate();client.command("login",new JSONObject().put("identifier",PHONE).put("code",CODE).put("consent",true));JSONObject priorRequest=copy(journal().getJSONObject("request"));client.command("offline-activate",new JSONObject());assertEquals(hash,license.documentHash());assertTrue(journal().getJSONObject("offline").getBoolean("setupRequired"));assertFalse(client.enterLocalAutomatically());rejects(()->client.command("legacy",new JSONObject()));
  // Restore only this fixture's durable pre-final-vault checkpoint. The exact
  // signed binding and document come from the real accepted native result;
  // no licence, identity, clock or signature is manufactured by the checkpoint.
  JSONObject acceptedRecord=copy(journal().getJSONObject("offline"));service.redeliver(true);acceptedRecord.put("activation",copy(service.activation));new AccountVault(context,new InstallationIdentity().id()).write(new JSONObject().put("version",1).put("request",priorRequest).put("pendingActivation",new JSONObject().put("record",acceptedRecord).put("document",copy(service.initialDocument))));
  recreate();assertFalse(journal().has("pendingActivation"));assertEquals(hash,license.documentHash());assertTrue(journal().getJSONObject("offline").getBoolean("setupRequired"));assertFalse(client.enterLocalAutomatically());client.command("login",new JSONObject().put("identifier",PHONE).put("code",CODE).put("consent",true));assertEquals("approved-owner",client.command("bootstrap",new JSONObject()).getJSONObject("binding").getString("localOwnerId"));
  Thread.sleep(1100);double before=license.status().getJSONObject("license").getDouble("remainingSeconds");service.redeliver(false);assertEquals(id,service.activation.getJSONObject("payload").getString("issuanceId"));client.lifecycleClient().validateAccountActivation(service.activation,service.initialDocument);license.installOnline(service.initialDocument.toString());assertTrue(license.status().getJSONObject("license").getDouble("remainingSeconds")<=before);
  service.dropAccept=true;current();long end=service.lifecycle.endsAt;client.command("logout",new JSONObject());recreate();current();assertEquals(hash,license.documentHash());assertEquals(end,license.status().getJSONObject("entitlement").getLong("endsAt"));assertEquals(1,service.acceptedCount);assertFalse(client.enterLocalAutomatically());
  service.serverNow=end+1;assertEquals("expired",current().getString("status"));assertEquals("expired",client.command("login",new JSONObject().put("identifier",PHONE).put("code",CODE).put("consent",true)).getString("stage"));renew();JSONObject renewed=client.command("offline-renew",new JSONObject());assertEquals("setup-required",renewed.getString("stage"));assertEquals("none",renewed.getString("mode"));assertFalse(client.admitted());rejects(()->client.command("bootstrap",new JSONObject()));
  assertEquals("offline",client.command("login",new JSONObject().put("identifier",PHONE).put("code",CODE).put("consent",true)).getString("mode"));assertEquals("approved-owner",client.command("bootstrap",new JSONObject()).getJSONObject("binding").getString("localOwnerId"));client.command("bootstrap-complete",new JSONObject());assertTrue(client.enterLocalAutomatically());
 }

 private final class Service implements ContatoolsClient.Transport {
  final PhoneReplacementTest.Service lifecycle;final Map<String,String> proofs=new HashMap<>();JSONObject request,initialDocument,activation;boolean approved,accepted,dropAccept,offline,wrongOwner,blockVaultAfterInstall,blockVaultBeforeStage,blockLicenseAfterClaim,suspendDuringGuard;int acceptedCount,enrolledVersion,currentCalls;long nextEnd,serverNow;String assignmentDecision="adoption",assignmentIntent="";
  Service(String device)throws Exception{lifecycle=new PhoneReplacementTest.Service(device);}
  void approve()throws Exception{
   approved=true;initialDocument=request.has("licenseDocument")?new JSONObject(request.getString("licenseDocument")):lifecycle.document("contatools-online-v2:fixture");lifecycle.doc=copy(initialDocument);lifecycle.role="active";lifecycle.currentCode=lifecycle.code;lifecycle.currentInstallation=lifecycle.installation;lifecycle.sequence=lifecycle.highestSequence=1;
   if(request.has("licenseDocument")){accepted=true;lifecycle.adopt(initialDocument);return;}
   long now=System.currentTimeMillis();JSONObject p=new JSONObject().put("issuanceId","initial-issuance").put("clientId","same-client").put("installationId",lifecycle.installation).put("keyFingerprint",lifecycle.fingerprint).put("deviceCode",lifecycle.code).put("licenseDocumentHash",ProtocolJson.hash(initialDocument)).put("licenseId",initialDocument.getJSONObject("payload").getString("licenseId")).put("sequence",1).put("issuedAt",now).put("expiresAt",now+86400000);
   activation=lifecycle.sign("contatools-android-activation",p);
  }
  void redeliver(boolean expired)throws Exception{JSONObject p=copy(activation.getJSONObject("payload"));long now=System.currentTimeMillis();p.put("issuedAt",expired?now-86400001L:now).put("expiresAt",expired?now-1:now+86400000L);activation=lifecycle.sign("contatools-android-activation",p);}
  void control(boolean pause){lifecycle.generation++;lifecycle.role=pause?"suspended":"active";if(lifecycle.prepared==null)lifecycle.offer=null;}
  void renew(long end)throws Exception{nextEnd=end;lifecycle.offer("renew",60000);lifecycle.role="active";}
  JSONObject normalizeSnapshot(JSONObject envelope)throws Exception{JSONObject p=copy(envelope.getJSONObject("payload"));if(lifecycle.offer!=null&&lifecycle.prepared==null&&"active".equals(lifecycle.role)){p.put("decisionId",assignmentDecision).put("intentId",assignmentIntent);}if(serverNow>0)p.put("issuedAt",serverNow);return lifecycle.sign(PhoneEntitlement.PURPOSE,p);}
  JSONObject snapshot()throws Exception{return normalizeSnapshot(lifecycle.snapshot());}
  JSONObject bundle()throws Exception{
   if(!approved)return new JSONObject().put("stage","pending").put("requestId",request.getString("requestId")).put("identifier",PHONE);
   JSONObject doc=lifecycle.doc,p=new JSONObject().put("purpose","android-offline-account").put("version",1).put("applicationId",BuildConfig.APPLICATION_ID).put("requestId",request.getString("requestId")).put("credentialId",request.getString("requestId")).put("credentialVersion",1).put("phone",PHONE).put("installationId",lifecycle.installation).put("keyFingerprint",lifecycle.fingerprint).put("deviceCode",lifecycle.code).put("localOwnerId",wrongOwner?"foreign-owner":request.optString("localOwnerId","approved-owner")).put("localShopId",request.optString("localShopId","approved-shop")).put("customerId","same-client").put("ownerName","Synthetic owner").put("shopName","Synthetic shop").put("licenseDocumentHash",ProtocolJson.hash(doc)).put("licenseId",doc.getJSONObject("payload").getString("licenseId")).put("term",new JSONObject().put("type","temporary").put("endsAt",lifecycle.endsAt)).put("issuedAt",Instant.now().toString());
   JSONObject b=new JSONObject().put("stage",lifecycle.role.equals("suspended")?"suspended":"active").put("mode","offline").put("requestId",request.getString("requestId")).put("identifier",PHONE).put("binding",lifecycle.sign("alkarna-android-offline-account",p)).put("licenseDocument",copy(doc)).put("entitlementOffer",lifecycle.offer!=null&&lifecycle.prepared==null?copy(lifecycle.offer):JSONObject.NULL);
   if(accepted)b.put("phoneEntitlement",snapshot());if(activation!=null&&ProtocolJson.hash(doc).equals(ProtocolJson.hash(initialDocument)))b.put("activation",activation);return b;
  }
  private void verify(JSONObject proof,JSONObject body)throws Exception{JSONObject key=lifecycle.installationKey;Signature v=Signature.getInstance("SHA256withECDSA");v.initVerify(LicenseVerifier.key(key.getString("x"),key.getString("y")));v.update(ProtocolJson.canonical(proof).getBytes(StandardCharsets.UTF_8));assertTrue(v.verify(LicenseVerifier.der(ProtocolJson.decode(body.getString("signature")))));}
  @Override public JSONObject post(String path,JSONObject body)throws Exception{
   if(offline)throw new IOException("Synthetic offline transport");String operation=body.getString("operation");JSONObject p=body.getJSONObject("payload");
   if(path.startsWith("/api/android/lifecycle/")){
    if(operation.equals("enroll"))enrolledVersion=p.getInt("versionCode");
    if(path.endsWith("dispatch")&&operation.equals("license.accept")){
     JSONObject proof=lifecycle.challenges.remove(body.getString("challengeId"));assertNotNull(proof);assertEquals(ProtocolJson.hash(p),proof.getString("payloadHash"));verify(proof,body);assertEquals("initial-issuance",p.getString("issuanceId"));
     if(!accepted){accepted=true;acceptedCount++;lifecycle.adopt(initialDocument);}if(dropAccept){dropAccept=false;throw new IOException("Synthetic lost initial ACK");}return new JSONObject().put("issuanceId","initial-issuance");
    }
    if(path.endsWith("dispatch")&&operation.equals("entitlement.claim")&&lifecycle.prepared==null)lifecycle.endsAt=nextEnd;
    if(path.endsWith("dispatch")&&operation.equals("entitlement.finish")&&blockVaultAfterInstall){blockVaultAfterInstall=false;assertTrue(file(VAULT+".new").mkdir());}
    JSONObject result=lifecycle.post(path,body);
    if(result.optJSONObject("entitlement")!=null){if(operation.equals("entitlement.claim")&&"entitlement-prepared".equals(result.optString("stage"))){JSONObject assigned=result.getJSONObject("entitlement").getJSONObject("payload");assignmentDecision=assigned.getString("decisionId");assignmentIntent=assigned.getString("intentId");}result.put("entitlement",normalizeSnapshot(result.getJSONObject("entitlement")));}
    return operation.equals("enroll")&&!accepted&&path.endsWith("dispatch")?new JSONObject().put("status","pending"):result;
   }
   if(path.endsWith("challenge")){
    if(operation.equals("offline.request")){request=copy(p);lifecycle.installation=p.getString("installationId");lifecycle.installationKey=copy(p.getJSONObject("publicJwk"));lifecycle.fingerprint=ProtocolJson.fingerprint(lifecycle.installationKey);}
    long now=System.currentTimeMillis();String id=UUID.randomUUID().toString().replace("-","");JSONObject proof=new JSONObject().put("schema","contatools-android-access-proof").put("version",1).put("method","POST").put("path",AccountProtocol.DISPATCH).put("operation",operation).put("applicationId",BuildConfig.APPLICATION_ID).put("installationId",p.getString("installationId")).put("nonce",UUID.randomUUID().toString().replace("-","")).put("payloadHash",ProtocolJson.hash(p)).put("sessionTokenHash",JSONObject.NULL).put("issuedAt",Instant.ofEpochMilli(now).toString()).put("expiresAt",Instant.ofEpochMilli(now+90000).toString());String message=ProtocolJson.canonical(proof);proofs.put(id,message);return new JSONObject().put("challengeId",id).put("message",message).put("expiresAt",proof.getString("expiresAt"));
   }
   assertEquals(AccountProtocol.DISPATCH,path);String message=proofs.remove(body.getString("challengeId"));assertNotNull(message);JSONObject proof=new JSONObject(message);assertEquals(ProtocolJson.hash(p),proof.getString("payloadHash"));assertEquals(operation,proof.getString("operation"));verify(proof,body);
   if(operation.equals("offline.current")){currentCalls++;if(suspendDuringGuard&&lifecycle.claims>0){suspendDuringGuard=false;control(true);}if(blockVaultBeforeStage&&lifecycle.claims>0){blockVaultBeforeStage=false;assertTrue(file(VAULT+".new").mkdir());}if(blockLicenseAfterClaim&&lifecycle.claims>0){blockLicenseAfterClaim=false;var field=DeviceLicense.class.getDeclaredField("file");field.setAccessible(true);AtomicFile original=(AtomicFile)field.get(license);field.set(license,new AtomicFile(original.getBaseFile()){@Override public FileOutputStream startWrite()throws IOException{throw new IOException("Synthetic no-space after binding stage");}});}}
   if(operation.equals("offline.request"))return new JSONObject().put("stage","pending").put("requestId",request.getString("requestId")).put("identifier",PHONE);
   if(operation.equals("offline.status")||operation.equals("offline.activate"))assertEquals(CODE,p.getString("code"));
   return bundle();
  }
 }
}
