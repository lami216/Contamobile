package mr.alkarna.mobile.approved;

import android.content.Context;
import android.os.Build;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.*;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.time.Instant;
import java.util.*;
import org.json.*;
import org.junit.*;
import org.junit.rules.TestWatcher;
import org.junit.runner.Description;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Emulator-only real client/vault/Keystore tests with a synthetic, proof-verifying service. */
@RunWith(AndroidJUnit4.class)
public final class AccountAccessTest {
 private static final String VAULT_FILE="account-access-v1.json",VAULT_KEY="alkarna.account.access.v1";
 static final String CODE="synthetic-account-code-2026";
 private Context context;
 private Service service;
 private AccountAccessClient client;
 private boolean ownsFixture;
 @Rule public final TestWatcher executed=new TestWatcher(){@Override protected void succeeded(Description description){android.os.Bundle proof=new android.os.Bundle();proof.putString("stream","\nACCOUNT ACCESS CASE PASS "+description.getMethodName()+"\n");InstrumentationRegistry.getInstrumentation().sendStatus(0,proof);}};

 @Before public void isolatedFixture() throws Exception {
  assertEquals("Explicit disposable account-access invocation required","true",InstrumentationRegistry.getArguments().getString("accountAccessIsolation"));
  assertTrue("The harness also verifies ro.kernel.qemu=1",Build.HARDWARE.equals("ranchu")||Build.HARDWARE.equals("goldfish")||Build.FINGERPRINT.startsWith("generic")||Build.FINGERPRINT.contains("emulator")||Build.MODEL.contains("sdk_gphone"));
  context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  for(String suffix:new String[]{"",".bak",".new"})assertFalse("Never replace customer account state",new File(context.getNoBackupFilesDir(),VAULT_FILE+suffix).exists());
  KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);
  assertFalse("Never replace a customer's account key",keys.containsAlias(VAULT_KEY));
  assertFalse("Disposable fixture requires no existing installation key",keys.containsAlias(InstallationIdentity.ALIAS));
  assertFalse("Online access must not manufacture an activation",new DeviceLicense(context).status().optBoolean("valid"));
  ownsFixture=true;service=new Service();recreate();
 }
 @After public void removeOnlyOwnSyntheticFixture() throws Exception {
  if(!ownsFixture)return;
  for(String suffix:new String[]{"",".bak",".new"}){File file=new File(context.getNoBackupFilesDir(),VAULT_FILE+suffix);if(file.exists()){assertTrue(file.isFile());assertTrue(file.delete());}}
  KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);
  for(String alias:new String[]{VAULT_KEY,InstallationIdentity.ALIAS})if(keys.containsAlias(alias))keys.deleteEntry(alias);
  assertFalse("Tests never install a local activation",new File(context.getNoBackupFilesDir(),"activation-v2.json").exists());
 }
 private void recreate() throws Exception {client=new AccountAccessClient(context,new DeviceLicense(context),service.issuers,service);}
 private void login() throws Exception {JSONObject result=client.command("login",new JSONObject().put("identifier","fixture-account@example.invalid").put("code",CODE).put("consent",true));assertEquals("online",result.getString("mode"));assertTrue(client.admitted());}
 private static JSONObject copy(JSONObject value)throws Exception{return new JSONObject(value.toString());}
 private static JSONArray ids(JSONObject payload)throws Exception{JSONArray ids=new JSONArray(),commands=payload.getJSONArray("commands");for(int i=0;i<commands.length();i++)ids.put(commands.getJSONObject(i).getString("operationId"));return ids;}
 private static JSONObject payload(String branch)throws Exception{
  String id=UUID.randomUUID().toString(),now=Instant.now().toString();
  JSONObject record=new JSONObject().put("globalId",UUID.randomUUID().toString()).put("kind","expense").put("number","TEST-"+id).put("date",now.substring(0,10)).put("time","12:00").put("title","Synthetic expense").put("total",13.37).put("paid",13.37).put("due",0).put("account","fixture-cash-account").put("lines",new JSONArray());
  JSONObject command=new JSONObject().put("schemaVersion",1).put("operationId",id).put("organizationId","fixture-org").put("authorMemberId","fixture-member").put("branchId",branch).put("epoch",1).put("kind","record.post").put("occurredAt",now).put("dependencies",new JSONArray()).put("payload",new JSONObject().put("record",record));
  return new JSONObject().put("branchId",branch).put("epoch",1).put("commands",new JSONArray().put(command));
 }
 private JSONObject push(JSONObject payload)throws Exception{return client.command("online-call",new JSONObject().put("operation","sync.push").put("payload",copy(payload)));}
 private JSONObject pending()throws Exception{return client.command("online-pending",new JSONObject());}
 private JSONObject ack(JSONObject payload)throws Exception{return client.command("online-ack",new JSONObject().put("operationIds",ids(payload)));}
 private JSONObject journal()throws Exception{return new AccountVault(context,new InstallationIdentity().id()).read();}
 private byte[] encryptedBytes()throws Exception{return Files.readAllBytes(new File(context.getNoBackupFilesDir(),VAULT_FILE).toPath());}
 private interface Work {void run()throws Exception;}
 private static void rejected(String expected,Work work)throws Exception{try{work.run();fail("Expected rejection "+expected);}catch(IOException error){assertEquals(expected,error.getMessage());}}
 private void assertEncrypted(JSONObject original)throws Exception{
  String raw=new String(encryptedBytes(),StandardCharsets.UTF_8);JSONObject wire=new JSONObject(raw);
  assertEquals(3,wire.length());assertTrue(wire.has("iv")&&wire.has("ciphertext"));assertEquals(1,wire.getInt("version"));assertEquals(12,ProtocolJson.decode(wire.getString("iv")).length);
  assertFalse("Operation IDs must not be plaintext on disk",raw.contains(ids(original).getString(0)));assertFalse(raw.contains("Synthetic expense"));
  String decrypted=journal().toString();assertFalse("A login code is never retained in the receipt journal",decrypted.contains(CODE));assertFalse("Online session tokens are RAM-only",decrypted.contains(service.token));
 }

 @Test public void lostDispatchResponseRetainsEncryptedExactUuidAcrossNewClientLogin()throws Exception{
  login();JSONObject original=payload("branch-A");service.dropPushResponse=true;
  rejected("Synthetic response interrupted",()->push(original));assertEquals(1,service.applied);assertEquals(1,service.pushCalls);assertEncrypted(original);
  recreate();assertFalse("A cold client has no saved online authority",client.admitted());login();
  JSONObject resumed=pending();assertTrue(resumed.getBoolean("pending"));assertFalse(resumed.optBoolean("completed"));
  JSONObject expected=copy(original).put("installationId",new InstallationIdentity().id());assertEquals(ProtocolJson.canonical(expected),ProtocolJson.canonical(resumed.getJSONObject("payload")));
  JSONObject result=push(original);assertEquals(ids(original).getString(0),result.getJSONArray("receipts").getJSONObject(0).getString("operationId"));assertEquals(1,service.applied);assertEquals(2,service.pushCalls);assertEquals(service.dispatchedIds.get(0),service.dispatchedIds.get(1));
 }
 @Test public void completedCallbackGapSurvivesColdClientLoginAndReturnsStoredReceipt()throws Exception{
  login();JSONObject original=payload("branch-A"),result=push(original);assertEncrypted(original);
  recreate();assertFalse(client.admitted());login();JSONObject resumed=pending();assertTrue(resumed.getBoolean("completed"));assertEquals(ProtocolJson.canonical(result),ProtocolJson.canonical(resumed.getJSONObject("result")));
  assertEquals(ProtocolJson.canonical(result),ProtocolJson.canonical(push(original)));assertEquals("The completed native callback gap must not dispatch again",1,service.pushCalls);assertEquals(1,service.applied);assertTrue(journal().has("onlineCompleted"));
 }
 @Test public void changedPushIsBlockedUntilTheExactReceiptIsAcknowledged()throws Exception{
  login();JSONObject original=payload("branch-A");push(original);JSONObject changed=copy(original);changed.getJSONArray("commands").getJSONObject(0).getJSONObject("payload").getJSONObject("record").put("total",88);
  rejected("ONLINE_RESULT_UNCERTAIN",()->push(changed));JSONObject next=payload("branch-A");rejected("ONLINE_RESULT_UNCERTAIN",()->push(next));rejected("ONLINE_RECEIPT_ACK_INVALID",()->ack(next));
  assertEquals(1,service.applied);assertTrue(pending().getBoolean("completed"));assertTrue(ack(original).getBoolean("acknowledged"));assertFalse(pending().getBoolean("pending"));
  push(next);assertEquals(2,service.applied);
 }
 @Test public void revokedAckPreservesCompletedResultForFreshAuthorizedLogin()throws Exception{
  login();JSONObject original=payload("branch-A");push(original);byte[] before=encryptedBytes();service.revoked=true;
  rejected("ACCOUNT_ACCESS_REVOKED",()->ack(original));assertFalse(client.admitted());assertArrayEquals("An authorization failure must not consume the completed receipt",before,encryptedBytes());assertTrue(journal().has("onlineCompleted"));
  recreate();rejected("ACCOUNT_LOGIN_REQUIRED",()->pending());service.revoked=false;login();assertTrue(pending().getBoolean("completed"));assertTrue(ack(original).getBoolean("acknowledged"));assertFalse(pending().getBoolean("pending"));assertEquals(1,service.applied);
 }
 @Test public void bootstrapSelectsPendingBranchBRatherThanFirstBranchA()throws Exception{
  login();JSONObject original=payload("branch-B");service.dropPushResponse=true;rejected("Synthetic response interrupted",()->push(original));recreate();login();
  JSONObject bootstrap=client.command("bootstrap",new JSONObject());assertTrue(bootstrap.getBoolean("pendingOnline"));assertEquals("branch-B",bootstrap.getString("pendingBranchId"));assertEquals("branch-A",bootstrap.getJSONObject("context").getJSONArray("branches").getJSONObject(0).getString("id"));
  push(original);recreate();login();assertEquals("A completed but unacknowledged result keeps its branch", "branch-B",client.command("bootstrap",new JSONObject()).getString("pendingBranchId"));assertEquals(1,service.applied);
 }
 @Test public void latestDuplicateAckIsIdempotentAcrossRestartAndOlderAckIsRejected()throws Exception{
  login();JSONObject first=payload("branch-A");push(first);assertTrue(ack(first).getBoolean("acknowledged"));assertTrue(ack(first).getBoolean("acknowledged"));recreate();login();assertTrue(ack(first).getBoolean("acknowledged"));
  JSONObject latest=payload("branch-B");push(latest);assertTrue(ack(latest).getBoolean("acknowledged"));rejected("ONLINE_RECEIPT_ACK_INVALID",()->ack(first));recreate();login();assertTrue(ack(latest).getBoolean("acknowledged"));assertFalse(pending().getBoolean("pending"));assertEquals(2,service.applied);assertEquals(2,service.pushCalls);
 }
 @Test public void utf8OversizeIsRejectedBeforeJournalCreationOrFinancialDispatch()throws Exception{
  login();byte[] before=encryptedBytes();JSONObject oversized=payload("branch-A");oversized.getJSONArray("commands").getJSONObject(0).getJSONObject("payload").getJSONObject("record").put("note","محاسبة".repeat(100000));
  assertTrue("The boundary test must distinguish UTF-8 bytes from Java character count",oversized.toString().length()<1048576&&oversized.toString().getBytes(StandardCharsets.UTF_8).length>1048576);
  rejected("ACCOUNT_REQUEST_TOO_LARGE",()->push(oversized));assertEquals(0,service.pushCalls);assertEquals(0,service.applied);assertArrayEquals("An oversized command leaves only the unchanged noncredential entry preference",before,encryptedBytes());assertFalse(journal().has("onlinePending"));assertFalse(pending().getBoolean("pending"));
  JSONObject valid=payload("branch-A");push(valid);assertEquals("A corrected operation can proceed without a poisoned pending record",1,service.applied);
 }
 @Test public void journalWriteFailureBlocksDispatchAndFurtherOnlineCommandsUntilReopen()throws Exception{
  login();byte[] before=encryptedBytes();JSONObject original=payload("branch-A");File blocker=new File(context.getNoBackupFilesDir(),VAULT_FILE+".new");assertTrue("Only this fixture's AtomicFile staging path is blocked",blocker.mkdir());
  try{
   rejected("ACCOUNT_STORAGE_INVALID",()->push(original));assertFalse(client.admitted());assertEquals(0,service.pushCalls);assertEquals(0,service.applied);assertArrayEquals("The failed write keeps the exact preceding preference-only vault",before,encryptedBytes());
   rejected("ACCOUNT_STORAGE_INVALID",()->pending());rejected("ACCOUNT_STORAGE_INVALID",()->push(original));
  }finally{assertTrue(blocker.isDirectory());assertTrue(blocker.delete());}
  // AtomicFile.openRead removes a stale .new directory when the base exists.
  // Inspect the decrypted state after releasing the deliberate write blocker.
  assertFalse(journal().has("onlinePending"));
  recreate();login();assertFalse(pending().getBoolean("pending"));push(original);assertEquals("The failed local save must never have reached the financial service",1,service.applied);
 }

 @Test public void recentAdmissionAvoidsDuplicatePreflightsButEveryWriteStillProvesAndChecksAuthority() throws Exception {
  login();client.command("online-status",new JSONObject());assertEquals(1,service.statusCalls);
  client.command("online-status",new JSONObject().put("allowRecent",true));client.command("online-status",new JSONObject().put("allowRecent",true));
  assertEquals("Rapid draft interactions do not make duplicate status requests",1,service.statusCalls);
  JSONObject first=payload("branch-A");push(first);
  assertEquals("One foreground action reuses only its very recent signed status",1,service.statusCalls);
  ack(first);assertEquals("Consuming a completed receipt always obtains fresh authority",2,service.statusCalls);
  assertEquals(1,service.applied);assertTrue(service.proofs.isEmpty());
  android.os.SystemClock.sleep(4100);
  JSONObject second=payload("branch-A");push(second);
  assertEquals("The short reuse window never extends itself",3,service.statusCalls);
  ack(second);assertEquals("Each receipt consumption retains its fresh revocation check",4,service.statusCalls);
  service.revoked=true;rejected("ACCOUNT_ACCESS_REVOKED",()->push(payload("branch-A")));
  assertEquals("Fresh installation proofs still reach the authority before applying a revoked write",2,service.applied);
  assertFalse(client.admitted());assertTrue(service.proofs.isEmpty());
 }
 @Test public void negotiatedCapabilitiesMustBeBoundToTheSignedAdmission() throws Exception {
  service.unboundCapabilities=true;rejected("ONLINE_ACCESS_SCOPE",()->login());assertFalse(client.admitted());
  service.unboundCapabilities=false;login();assertTrue(client.admitted());
 }
 @Test public void newCompanyDeviceStaysPendingAcrossReopenUntilExplicitApprovedLogin() throws Exception {
  service.pendingLogin=true;
  JSONObject input=new JSONObject().put("identifier","fixture-account@example.invalid").put("code",CODE).put("consent",true);
  JSONObject first=client.command("login",input);assertEquals("pending",first.getString("stage"));assertEquals("online",first.getString("mode"));assertEquals("pending",first.getString("deviceStatus"));assertFalse(client.admitted());assertFalse(client.onlineMode());
  assertFalse(new DeviceLicense(context).status().getBoolean("valid"));assertFalse(journal().optBoolean("preferOnlineEntry"));
  assertFalse("Pending metadata never retains the password",journal().toString().contains(CODE));assertNull("No session is issued for a pending device",service.token);
  assertEquals(ProtocolJson.canonical(first),ProtocolJson.canonical(client.command("state",new JSONObject()).getJSONObject("companyEnrollment")));
  rejected("ACCOUNT_LOGIN_REQUIRED",()->client.command("bootstrap",new JSONObject()));rejected("ACCOUNT_LOGIN_REQUIRED",()->push(payload("branch-A")));assertEquals(0,service.applied);
  recreate();assertFalse(client.admitted());assertEquals(first.getString("requestId"),client.command("state",new JSONObject()).getJSONObject("companyEnrollment").getString("requestId"));assertEquals(1,service.loginCalls);
  assertEquals(first.getString("requestId"),client.command("login",input).getString("requestId"));assertEquals("Pending status is checked only by explicit credential login",2,service.loginCalls);
  service.pendingLogin=false;login();assertFalse(journal().has("companyEnrollment"));assertFalse(new DeviceLicense(context).status().getBoolean("valid"));
 }
 @Test public void pendingReplyRejectsForeignDeviceAuthorityFieldsAndAnUnapprovedSignedGrant() throws Exception {
  service.pendingLogin=true;
  for(JSONObject change:new JSONObject[]{new JSONObject().put("sessionToken","forbidden"),new JSONObject().put("installationId",UUID.randomUUID().toString()),new JSONObject().put("requestId","not-a-uuid"),new JSONObject().put("deviceStatus","approved")}){
   service.pendingOverrides=change;rejected("ONLINE_DEVICE_PENDING_INVALID",()->client.command("login",new JSONObject().put("identifier","fixture-account@example.invalid").put("code",CODE).put("consent",true)));assertFalse(client.admitted());assertFalse(client.onlineMode());
  }
  assertFalse(journal().has("companyEnrollment"));service.pendingLogin=false;service.omitDeviceApproval=true;rejected("ONLINE_ACCESS_INVALID",()->login());assertFalse(client.admitted());
  service.omitDeviceApproval=false;login();assertTrue(client.admitted());
 }
 @Test public void pendingCompanyEnrollmentCannotReplaceUnresolvedAccountingAuthority() throws Exception {
  for(boolean interrupted:new boolean[]{false,true}){
   login();JSONObject original=payload("branch-B");service.dropPushResponse=interrupted;
   if(interrupted)rejected("Synthetic response interrupted",()->push(original));else push(original);
   byte[] before=encryptedBytes();boolean admittedBefore=client.admitted();String storedName=interrupted?"onlinePending":"onlineCompleted";String receipt=ProtocolJson.canonical(journal().getJSONObject(storedName));
   service.pendingLogin=true;rejected("ONLINE_PENDING_OTHER_ACCOUNT",()->client.command("login",new JSONObject().put("identifier","fixture-account@example.invalid").put("code",CODE).put("consent",true)));
   assertTrue("The original session mode remains available for resolving its receipt",client.onlineMode());assertEquals(admittedBefore,client.admitted());assertArrayEquals("No pending-account switch may write or consume the financial vault",before,encryptedBytes());assertEquals(receipt,ProtocolJson.canonical(journal().getJSONObject(storedName)));assertFalse(journal().has("companyEnrollment"));
   service.pendingLogin=false;login();assertEquals(!interrupted,pending().optBoolean("completed"));push(original);assertTrue(ack(original).getBoolean("acknowledged"));assertFalse(pending().getBoolean("pending"));
  }
  assertEquals("Original operation UUIDs must not be applied twice during recovery",2,service.applied);
 }
 static final class Service implements ContatoolsClient.Transport {
  final KeyPair authority;
  final JSONObject issuers;
  final Map<String,String> proofs=new HashMap<>();
  final Map<String,JSONObject> installations=new HashMap<>(),receipts=new HashMap<>();
  final List<String> dispatchedIds=new ArrayList<>();
  boolean revoked,dropPushResponse,unboundCapabilities,pendingLogin,omitDeviceApproval;
  final String deviceRequestId=UUID.randomUUID().toString();
  JSONObject pendingOverrides=new JSONObject();
  int applied,pushCalls,statusCalls,loginCalls;
  String token;
  Service()throws Exception{
   KeyPairGenerator generator=KeyPairGenerator.getInstance("EC");generator.initialize(new ECGenParameterSpec("secp256r1"));authority=generator.generateKeyPair();ECPublicKey key=(ECPublicKey)authority.getPublic();
   issuers=new JSONObject().put("account-fixture",new JSONObject().put("kty","EC").put("crv","P-256").put("x",coordinate(key.getW().getAffineX())).put("y",coordinate(key.getW().getAffineY())));
  }
  private static String coordinate(java.math.BigInteger value){byte[] source=value.toByteArray(),target=new byte[32];int n=Math.min(source.length,32);System.arraycopy(source,source.length-n,target,32-n,n);return ProtocolJson.base64(target);}
  private JSONObject grant(String installation)throws Exception{
   long now=System.currentTimeMillis();JSONArray branches=new JSONArray().put(new JSONObject().put("id","branch-A").put("name","Synthetic A").put("originId","origin-A")).put(new JSONObject().put("id","branch-B").put("name","Synthetic B").put("originId","origin-B")),caps=new JSONArray().put("branch.read").put("transaction.post");
   JSONObject claims=new JSONObject().put("purpose","android-online-access").put("applicationId",BuildConfig.APPLICATION_ID).put("mode","online").put("organizationId","fixture-org").put("memberId","fixture-member").put("installationId",installation).put("keyFingerprint",ProtocolJson.fingerprint(installations.get(installation))).put("status","active").put("role","owner").put("membershipVersion",1).put("capabilities",caps).put("branches",branches).put("issuedAt",Instant.ofEpochMilli(now).toString()).put("expiresAt",Instant.ofEpochMilli(now+60000).toString());
   if(!omitDeviceApproval)claims.put("deviceApproval","approved");
   JSONObject signed=new JSONObject().put("schema","contatools-android-online-access").put("version",1).put("kid","account-fixture").put("payload",claims);Signature signer=Signature.getInstance("SHA256withECDSA");signer.initSign(authority.getPrivate());signer.update(ProtocolJson.canonical(signed).getBytes(StandardCharsets.UTF_8));signed.put("signature",ProtocolJson.base64(ProtocolJson.rawSignature(signer.sign())));
   return new JSONObject().put("stage","active").put("mode","online").put("organization",new JSONObject().put("id","fixture-org")).put("member",new JSONObject().put("id","fixture-member").put("role","owner").put("membershipVersion",1).put("capabilities",caps).put("branchIds",new JSONArray().put("branch-A").put("branch-B"))).put("branches",branches).put("entitlement",signed);
  }
  @Override public JSONObject post(String path,JSONObject body)throws Exception{
   String operation=body.getString("operation");JSONObject payload=body.getJSONObject("payload");String installation=payload.getString("installationId");
   if(path.equals("/api/android/access/v1/challenge")){
    if(operation.equals("session.login"))installations.put(installation,copy(payload.getJSONObject("publicJwk")));
    long now=System.currentTimeMillis();String id=UUID.randomUUID().toString().replace("-","");JSONObject proof=new JSONObject().put("schema","contatools-android-access-proof").put("version",1).put("method","POST").put("path",AccountProtocol.DISPATCH).put("operation",operation).put("applicationId",BuildConfig.APPLICATION_ID).put("installationId",installation).put("nonce",UUID.randomUUID().toString().replace("-","")).put("payloadHash",ProtocolJson.hash(payload)).put("sessionTokenHash",body.has("sessionToken")?ProtocolJson.hash(body.getString("sessionToken")):JSONObject.NULL).put("issuedAt",Instant.ofEpochMilli(now).toString()).put("expiresAt",Instant.ofEpochMilli(now+90000).toString());String message=ProtocolJson.canonical(proof);proofs.put(id,message);
    return new JSONObject().put("challengeId",id).put("message",message).put("expiresAt",proof.getString("expiresAt"));
   }
   assertEquals(AccountProtocol.DISPATCH,path);String message=proofs.remove(body.getString("challengeId"));assertNotNull("Every dispatch requires a fresh one-shot challenge",message);JSONObject proof=new JSONObject(message);assertEquals(operation,proof.getString("operation"));assertEquals(ProtocolJson.hash(payload),proof.getString("payloadHash"));assertEquals(installation,proof.getString("installationId"));
   JSONObject jwk=installations.get(installation);assertNotNull(jwk);Signature verifier=Signature.getInstance("SHA256withECDSA");verifier.initVerify(LicenseVerifier.key(jwk.getString("x"),jwk.getString("y")));verifier.update(message.getBytes(StandardCharsets.UTF_8));assertTrue("The real Android Keystore signed the exact payload proof",verifier.verify(LicenseVerifier.der(ProtocolJson.decode(body.getString("signature")))));
   if(revoked)throw new AccountAccessClient.Failure(403,"ACCOUNT_ACCESS_REVOKED");
   if(operation.equals("session.login")){loginCalls++;assertEquals(CODE,payload.getString("code"));assertEquals(1,payload.getJSONObject("clientProtocol").getInt("deviceApprovalVersion"));if(pendingLogin){JSONObject pending=new JSONObject().put("stage","pending").put("mode","online").put("deviceStatus","pending").put("installationId",installation).put("requestId",deviceRequestId);for(String key:pendingOverrides.keySet())pending.put(key,pendingOverrides.get(key));return pending;}byte[] random=new byte[32];new SecureRandom().nextBytes(random);token=ProtocolJson.base64(random);JSONObject answer=grant(installation).put("sessionToken",token);if(unboundCapabilities)answer.put("protocolCapabilities",new JSONObject().put("sharedDeltaVersion",1));return answer;}
   assertEquals(token,body.getString("sessionToken"));assertEquals(ProtocolJson.hash(token),proof.getString("sessionTokenHash"));
   if(operation.equals("session.logout"))return new JSONObject().put("signedOut",true);
   if(operation.equals("access.status")){statusCalls++;return grant(installation);}
   if(operation.equals("sync.push")){
    pushCalls++;JSONArray response=new JSONArray(),commands=payload.getJSONArray("commands");
    for(int i=0;i<commands.length();i++){JSONObject command=commands.getJSONObject(i);String id=command.getString("operationId"),hash=ProtocolJson.hash(command);dispatchedIds.add(id);JSONObject receipt=receipts.get(id);if(receipt==null){applied++;receipt=new JSONObject().put("operationId",id).put("hash",hash).put("status","accepted");receipts.put(id,receipt);}else assertEquals("Same UUID may only retry identical content",hash,receipt.getString("hash"));response.put(copy(receipt));}
    if(dropPushResponse){dropPushResponse=false;throw new IOException("Synthetic response interrupted");}return new JSONObject().put("receipts",response);
   }
   throw new IOException("Unexpected synthetic operation "+operation);
  }
 }
}
