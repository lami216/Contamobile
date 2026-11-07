package mr.alkarna.mobile.approved;

import static org.junit.Assert.*;
import android.content.Context;
import android.os.Build;
import android.util.AtomicFile;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.*;
import org.json.*;
import org.junit.*;
import org.junit.rules.TestWatcher;
import org.junit.runner.Description;
import org.junit.runner.RunWith;

/** Real Android Keystore and AtomicFile; disposable in-process signed service transport. */
@RunWith(AndroidJUnit4.class)
public final class PhoneReplacementTest {
  private Context context;private DeviceLicense license;private DeviceLifecycleClient client;private Service service;
  private Map<String,PublicKey> oldLegacy,oldOnline;private boolean owned;
  @Rule public final TestWatcher executed=new TestWatcher(){@Override protected void succeeded(Description d){android.os.Bundle b=new android.os.Bundle();b.putString("stream","\nPHONE REPLACEMENT CASE PASS "+d.getMethodName()+"\n");InstrumentationRegistry.getInstrumentation().sendStatus(0,b);}};
  private interface Work{void run()throws Exception;}
  private static void rejects(Work work)throws Exception{try{work.run();fail("Expected rejection");}catch(Exception expected){}}
  @SuppressWarnings("unchecked") private static Map<String,PublicKey> onlineKeys()throws Exception{var field=LicenseVerifier.class.getDeclaredField("ONLINE_KEYS");field.setAccessible(true);return (Map<String,PublicKey>)field.get(null);}
  private static JSONObject copy(JSONObject p)throws Exception{return new JSONObject(p.toString());}
  private void recreate()throws Exception{license=new DeviceLicense(context);client=new DeviceLifecycleClient(context,license,service.issuers,service);}
  @Before public void setup()throws Exception{
    assertEquals("true",InstrumentationRegistry.getArguments().getString("phoneReplacementIsolation"));
    assertTrue(Build.HARDWARE.equals("ranchu")||Build.HARDWARE.equals("goldfish")||Build.FINGERPRINT.contains("emulator")||Build.MODEL.contains("sdk_gphone"));
    context=InstrumentationRegistry.getInstrumentation().getTargetContext();
    for(String name:new String[]{"activation-v2.json",DeviceLifecycleStore.DIRECTORY,"contatools-v1.json","cloud-backup-v1",AccountingResetStore.FILE})assertFalse("Never overwrite customer state",new File(context.getNoBackupFilesDir(),name).exists());
    assertFalse(context.getSharedPreferences("activation-v2",Context.MODE_PRIVATE).contains("state"));
    oldLegacy=new HashMap<>(LicenseCompatibilityTest.keys());oldOnline=new HashMap<>(onlineKeys());owned=true;
    license=new DeviceLicense(context);service=new Service(license.deviceCode());LicenseCompatibilityTest.keys().put("alkarna-license-v2",service.pair.getPublic());onlineKeys().put("contatools-online-v2:fixture",service.pair.getPublic());recreate();
  }
  private void wipeOwnedActivation()throws Exception{
    assertTrue(owned);File directory=new File(context.getNoBackupFilesDir(),DeviceLifecycleStore.DIRECTORY);
    if(directory.exists()){for(File file:Objects.requireNonNull(directory.listFiles())){assertTrue(file.isFile());assertTrue(file.delete());}assertTrue(directory.delete());}
    for(String suffix:new String[]{"",".bak",".new"}){File file=new File(context.getNoBackupFilesDir(),"activation-v2.json"+suffix);if(file.exists())assertTrue(file.delete());}
    assertTrue(context.getSharedPreferences("activation-v2",Context.MODE_PRIVATE).edit().clear().commit());
    KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);for(String alias:new String[]{DeviceLifecycleStore.ALIAS,"alkarna.activation.state.v2",InstallationIdentity.ALIAS})if(keys.containsAlias(alias))keys.deleteEntry(alias);
  }
  @After public void cleanup()throws Exception{if(!owned)return;wipeOwnedActivation();LicenseCompatibilityTest.keys().clear();LicenseCompatibilityTest.keys().putAll(oldLegacy);onlineKeys().clear();onlineKeys().putAll(oldOnline);File marker=new File(context.getFilesDir(),"replacement-business-fixture.bin");if(marker.exists())assertTrue(marker.delete());}
  private void enrolled()throws Exception{client.enroll(new JSONObject().put("customerName","صاحب الفحص").put("storeName","متجر الفحص"));}
  private String marker()throws Exception{File file=new File(context.getFilesDir(),"replacement-business-fixture.bin");if(!file.exists())try(FileOutputStream stream=new FileOutputStream(file)){stream.write("bookkeeping retained".getBytes(StandardCharsets.UTF_8));}return new String(java.nio.file.Files.readAllBytes(file.toPath()),StandardCharsets.UTF_8);}
  @Test public void adoptionCapsTheOriginalClockAndManualFilesCannotRemoveTheSignedBarrier()throws Exception{
    JSONObject original=service.document("alkarna-license-v2");license.install(original.toString());enrolled();service.adopt(original);double before=license.status().getJSONObject("license").getDouble("remainingSeconds");client.status();
    assertTrue(license.status().getJSONObject("license").getDouble("remainingSeconds")<=before);String hash=license.documentHash();rejects(()->license.install(service.document("alkarna-license-v2").toString()));assertEquals(hash,license.documentHash());
    service.retire();client.status();assertFalse(license.status().getBoolean("valid"));assertEquals("ENTITLEMENT_REPLACED",license.status().getString("code"));assertEquals(hash,license.documentHash());
  }
  @Test public void replacementLostAcknowledgementAndColdReopenNeverRestartTheFixedTerm()throws Exception{
    String data=marker();enrolled();service.offer("replacement",10000);client.status();service.dropFinish=true;JSONObject accepted=client.activate();assertTrue(accepted.getBoolean("ackPending"));assertEquals(data,marker());String hash=license.documentHash();double remaining=license.status().getJSONObject("license").getDouble("remainingSeconds");Thread.sleep(150);recreate();client.status();
    assertEquals(hash,license.documentHash());assertEquals(1,service.claims);assertEquals(1,service.finished);assertTrue(license.status().getJSONObject("license").getDouble("remainingSeconds")<=remaining);assertEquals(service.endsAt,license.status().getJSONObject("entitlement").getLong("endsAt"));
  }
  @Test public void aLostClaimResponseRetriesTheIdenticalIntentAfterOfferExpiry()throws Exception{
    enrolled();service.offer("replacement",5000);client.status();String firstOffer=service.offer.getJSONObject("payload").getString("offerId");service.offline=true;rejects(()->client.activate());service.offline=false;service.offer("replacement",5000);client.status();service.dropClaim=true;rejects(()->client.activate());String intent=service.intent;long end=service.endsAt;Thread.sleep(5100);recreate();JSONObject result=client.activate();assertEquals("activated",result.getString("stage"));assertEquals(intent,service.intent);assertEquals(1,service.claims);assertEquals(end,license.status().getJSONObject("entitlement").getLong("endsAt"));DeviceLifecycleStore store=new DeviceLifecycleStore(context,license.deviceCode()+"|"+new InstallationIdentity().fingerprint());assertTrue(store.state.getJSONObject("entitlementHistory").has(firstOffer));
  }
  @Test public void onlyASignedReplacementNoticeLocksThePhoneAndKeepsAccountingAndHistory()throws Exception{
    String data=marker();JSONObject original=service.document("alkarna-license-v2");license.install(original.toString());enrolled();service.adopt(original);client.status();service.offline=true;rejects(()->client.status());assertTrue(license.status().getBoolean("valid"));service.offline=false;
    JSONObject old=service.snapshot();service.retire();client.status();assertEquals("ENTITLEMENT_REPLACED",license.status().getString("code"));assertEquals(data,marker());rejects(()->license.entitlement(old,service.issuers,new InstallationIdentity().id(),new InstallationIdentity().fingerprint()));recreate();assertEquals("ENTITLEMENT_REPLACED",license.status().getString("code"));
  }
  @Test public void freshStatusFencesAClaimThatWasReplacedBeforeLocalInstallation()throws Exception{
    String data=marker();enrolled();service.offer("replacement",10000);client.status();service.replaceAfterClaim=true;JSONObject result=client.activate();assertEquals("entitlement-replaced",result.getString("stage"));assertEquals("",license.documentHash());assertEquals(0,service.finished);assertEquals(data,marker());
    DeviceLifecycleStore store=new DeviceLifecycleStore(context,license.deviceCode()+"|"+new InstallationIdentity().fingerprint());assertTrue(store.state.getJSONObject("entitlementPending").has("prepared"));assertTrue(store.state.getJSONObject("entitlementPending").has("outcome"));
  }
  @Test public void failedAtomicPersistenceDoesNotAcknowledgeOrExposeAHalfInstalledActivation()throws Exception{
    enrolled();service.offer("replacement",10000);client.status();var field=DeviceLicense.class.getDeclaredField("file");field.setAccessible(true);AtomicFile original=(AtomicFile)field.get(license);
    field.set(license,new AtomicFile(new File(context.getNoBackupFilesDir(),"synthetic-no-write")){@Override public FileOutputStream startWrite()throws IOException{throw new IOException("Synthetic no space");}});
    rejects(()->client.activate());assertEquals(0,service.finished);field.set(license,original);recreate();assertEquals("",license.documentHash());assertEquals("activated",client.activate().getString("stage"));assertEquals(1,service.claims);
  }
  @Test public void theFixedDeadlineSurvivesAnOfflineColdStartIndependentlyOfLegacyDuration()throws Exception{
    enrolled();service.offer("replacement",10000);client.status();service.endsAt=System.currentTimeMillis()+4000;client.activate();service.offline=true;Thread.sleep(4300);recreate();assertFalse(license.status().getBoolean("valid"));assertEquals("ENTITLEMENT_EXPIRED",license.status().getString("code"));assertFalse(license.documentHash().isEmpty());
  }
  @Test public void sameCodeWithANewInstallationKeyNeedsANewBoundReceiptAndKeepsTheDeadline()throws Exception{
    enrolled();service.offer("replacement",10000);client.status();client.activate();String code=license.deviceCode(),oldKey=new InstallationIdentity().fingerprint(),oldInstallation=new InstallationIdentity().id();long end=service.endsAt;
    wipeOwnedActivation();recreate();assertEquals(code,license.deviceCode());assertNotEquals(oldKey,new InstallationIdentity().fingerprint());enrolled();
    JSONObject unreviewed=service.snapshot().getJSONObject("payload");assertEquals("replaced",unreviewed.getString("status"));assertEquals("",unreviewed.getString("licenseDocumentHash"));assertEquals(0,unreviewed.getLong("sequence"));assertEquals("",unreviewed.getString("intentId"));assertEquals(code,unreviewed.getString("currentDeviceCode"));assertEquals(oldInstallation,unreviewed.getString("currentInstallationId"));
    service.offer("reinstall",10000);service.endsAt=end;client.status();client.activate();assertEquals(end,license.status().getJSONObject("entitlement").getLong("endsAt"));assertEquals(2,service.claims);assertEquals(2,license.status().getJSONObject("entitlement").getLong("sequence"));
  }

  private static final class Service implements ContatoolsClient.Transport {
    final KeyPair pair;final JSONObject issuers;final String code;String installation,fingerprint,intent,role="pending",currentCode="other-code",currentInstallation="other-installation";long generation=1,endsAt=System.currentTimeMillis()+60000,sequence,highestSequence;JSONObject offer,prepared,doc,installationKey;int claims,finished;boolean dropClaim,dropFinish,replaceAfterClaim,offline,knownCustomer;final Map<String,JSONObject> challenges=new HashMap<>();
    Service(String code)throws Exception{this.code=code;KeyPairGenerator generator=KeyPairGenerator.getInstance("EC");generator.initialize(new ECGenParameterSpec("secp256r1"));pair=generator.generateKeyPair();ECPublicKey key=(ECPublicKey)pair.getPublic();issuers=new JSONObject().put("fixture",new JSONObject().put("kty","EC").put("crv","P-256").put("x",coordinate(key.getW().getAffineX())).put("y",coordinate(key.getW().getAffineY())));}
    private static String coordinate(java.math.BigInteger n){byte[] raw=n.toByteArray(),value=new byte[32];int count=Math.min(raw.length,32);System.arraycopy(raw,raw.length-count,value,32-count,count);return ProtocolJson.base64(value);}
    JSONObject sign(String purpose,JSONObject payload)throws Exception{JSONObject value=new JSONObject().put("schema",purpose).put("version",1).put("kid","fixture").put("payload",copy(payload));Signature signer=Signature.getInstance("SHA256withECDSA");signer.initSign(pair.getPrivate());signer.update(ProtocolJson.canonical(value).getBytes(StandardCharsets.UTF_8));return value.put("signature",ProtocolJson.base64(ProtocolJson.rawSignature(signer.sign())));}
    JSONObject document(String keyId)throws Exception{JSONObject p=new JSONObject().put("licenseId",UUID.randomUUID().toString()).put("storeId","same-client").put("customerName","صاحب الفحص").put("storeName","متجر الفحص").put("deviceId",code).put("edition","desktop").put("type","temporary").put("durationSeconds",3600).put("activationMode","single-install").put("notes","Synthetic phone replacement");Signature signer=Signature.getInstance("SHA256withECDSA");signer.initSign(pair.getPrivate());signer.update(LicenseVerifier.canonical(p,2).getBytes(StandardCharsets.UTF_8));return new JSONObject().put("schema","alkarna-license").put("version",2).put("keyId",keyId).put("algorithm","ECDSA_P256_SHA256").put("payload",p).put("signature",ProtocolJson.base64(ProtocolJson.rawSignature(signer.sign())));}
    void adopt(JSONObject existing)throws Exception{doc=copy(existing);role="active";sequence=highestSequence=1;offer=null;intent="";currentCode=code;currentInstallation=installation;knownCustomer=true;}
    void retire(){generation++;role="replaced";currentCode="other-code";currentInstallation="other-installation";}
    void offer(String kind,long lifetime)throws Exception{prepared=null;intent=null;role="pending";knownCustomer=true;long now=System.currentTimeMillis();offer=sign(PhoneEntitlement.OFFER_PURPOSE,new JSONObject().put("schemaVersion",1).put("offerId",UUID.randomUUID().toString()).put("entitlementId","same-entitlement").put("clientId","same-client").put("installationId",installation).put("keyFingerprint",fingerprint).put("deviceCode",code).put("expectedGeneration",generation).put("kind",kind).put("issuedAt",now).put("expiresAt",now+lifetime));}
    JSONObject snapshot()throws Exception{return sign(PhoneEntitlement.PURPOSE,new JSONObject().put("schemaVersion",1).put("decisionId",offer==null?"adoption":offer.getJSONObject("payload").getString("offerId")).put("entitlementId","same-entitlement").put("clientId","same-client").put("installationId",installation).put("keyFingerprint",fingerprint).put("deviceCode",code).put("licenseId",doc==null?"":doc.getJSONObject("payload").getString("licenseId")).put("licenseDocumentHash",doc==null?"":ProtocolJson.hash(doc)).put("sequence",sequence).put("bindingGeneration",generation).put("type","temporary").put("endsAt",endsAt).put("status",role).put("issuedAt",System.currentTimeMillis()).put("currentDeviceCode",currentCode).put("currentInstallationId",currentInstallation).put("reasonCode","active".equals(role)?"ACTIVE_PHONE":"pending".equals(role)?"PENDING_REPLACEMENT":code.equals(currentCode)?"REPLACED_INSTALLATION":"REPLACED_PHONE").put("intentId",intent==null?"":intent));}
    JSONObject status()throws Exception{JSONObject value=new JSONObject().put("status","pending").put("entitlementProtocol",1);if(knownCustomer||doc!=null||offer!=null)value.put("entitlement",snapshot());if(offer!=null&&prepared==null)value.put("entitlementOffer",copy(offer));return value;}
    @Override public JSONObject post(String path,JSONObject body)throws Exception{
      if(offline)throw new ContatoolsClient.ServiceFailure(403,false,0);
      if(path.endsWith("challenge")){String id=UUID.randomUUID().toString();JSONObject wire=body.getJSONObject("payload"),p=new JSONObject().put("schema","contatools-lifecycle-proof").put("version",1).put("id",id).put("operation",body.getString("operation")).put("installationId",wire.getString("installationId")).put("payloadHash",ProtocolJson.hash(wire));challenges.put(id,p);if(body.getString("operation").equals("enroll")){String previous=installation;installation=wire.getString("installationId");installationKey=copy(wire.getJSONObject("publicJwk"));fingerprint=ProtocolJson.fingerprint(installationKey);if(knownCustomer&&previous!=null&&!previous.equals(installation)){doc=null;sequence=0;intent="";offer=null;prepared=null;role="replaced";}}return new JSONObject().put("id",id).put("message",ProtocolJson.canonical(p));}
      JSONObject proof=challenges.remove(body.getString("challengeId")),p=body.getJSONObject("payload");assertNotNull(proof);assertEquals(proof.getString("payloadHash"),ProtocolJson.hash(p));String operation=body.getString("operation");Signature verify=Signature.getInstance("SHA256withECDSA");verify.initVerify(LicenseVerifier.key(installationKey.getString("x"),installationKey.getString("y")));verify.update(ProtocolJson.canonical(proof).getBytes(StandardCharsets.UTF_8));assertTrue(verify.verify(LicenseVerifier.der(ProtocolJson.decode(body.getString("signature")))));
      if(operation.equals("enroll")||operation.equals("status"))return status();
      if(operation.equals("entitlement.claim")){
        assertTrue(p.getBoolean("accepted"));assertEquals(offer.getJSONObject("payload").getString("offerId"),p.getString("offerId"));
        if(prepared==null){claims++;intent=p.getString("intentId");generation++;sequence=++highestSequence;doc=document("contatools-online-v2:fixture");role="active";currentCode=code;currentInstallation=installation;prepared=new JSONObject().put("stage","entitlement-prepared").put("offerId",p.getString("offerId")).put("intentId",intent).put("document",copy(doc)).put("entitlement",snapshot());if(replaceAfterClaim)retire();}
        assertEquals(intent,p.getString("intentId"));if(dropClaim){dropClaim=false;throw new ContatoolsClient.ServiceFailure(503,false,0);}return copy(prepared);
      }
      if(operation.equals("entitlement.finish")){assertEquals(intent,p.getString("intentId"));assertEquals(ProtocolJson.hash(doc),p.getString("licenseDocumentHash"));if(finished==0)finished++;if(dropFinish){dropFinish=false;throw new ContatoolsClient.ServiceFailure(503,false,0);}return new JSONObject().put("stage","active".equals(role)?"entitlement-complete":"entitlement-replaced").put("offerId",p.getString("offerId")).put("intentId",intent).put("entitlement",snapshot());}
      throw new IOException("Unexpected operation "+operation);
    }
  }
}

