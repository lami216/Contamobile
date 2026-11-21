package mr.alkarna.mobile.approved;

import static org.junit.Assert.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import org.json.*;
import org.junit.*;

public final class StandaloneControlPolicyTest {
  private static final String APP="mr.alkarna.mobile.approved",INSTALL="11111111-1111-4111-8111-111111111111",NONCE="22222222-2222-4222-8222-222222222222",DEVICE="AKD-1111-2222-3333-4444-5555",HASH="a".repeat(64),NEW_HASH="b".repeat(64),AUTH="33333333-3333-4333-8333-333333333333",FINGERPRINT="f".repeat(43);
  private KeyPair pair;private JSONObject issuers,payload;
  private interface Work{void run()throws Exception;}
  private static void rejects(Work action)throws Exception{try{action.run();fail("Invalid authority must fail closed");}catch(Exception expected){}}
  private static JSONObject copy(JSONObject p)throws Exception{return new JSONObject(p.toString());}
  private static String coordinate(java.math.BigInteger n){byte[] input=n.toByteArray(),out=new byte[32];int length=Math.min(input.length,32);System.arraycopy(input,input.length-length,out,32-length,length);return ProtocolJson.base64(out);}
  @Before public void setup()throws Exception{
    KeyPairGenerator generator=KeyPairGenerator.getInstance("EC");generator.initialize(new ECGenParameterSpec("secp256r1"));pair=generator.generateKeyPair();ECPublicKey key=(ECPublicKey)pair.getPublic();
    issuers=new JSONObject().put("fixture",new JSONObject().put("kty","EC").put("crv","P-256").put("x",coordinate(key.getW().getAffineX())).put("y",coordinate(key.getW().getAffineY())));
    payload=new JSONObject().put("schemaVersion",1).put("purpose","standalone-device-control").put("applicationId",APP).put("installationId",INSTALL).put("keyFingerprint",FINGERPRINT).put("deviceCode",DEVICE).put("requestNonce",NONCE).put("queryDocumentHash",HASH).put("controlGeneration",0).put("activationFence",0).put("banned",false).put("documentStatus","allowed").put("authorizationId","").put("sequence",0).put("issuedAt",1000);
  }
  private JSONObject sign(JSONObject p)throws Exception{JSONObject envelope=new JSONObject().put("schema",StandaloneControl.SCHEMA).put("version",1).put("kid","fixture").put("payload",copy(p));Signature signature=Signature.getInstance("SHA256withECDSA");signature.initSign(pair.getPrivate());signature.update(ProtocolJson.canonical(envelope).getBytes(StandardCharsets.UTF_8));return envelope.put("signature",ProtocolJson.base64(ProtocolJson.rawSignature(signature.sign())));}
  private JSONObject verify(JSONObject p)throws Exception{return StandaloneControl.verify(sign(p),issuers,APP,INSTALL,FINGERPRINT,DEVICE,NONCE,p.optString("queryDocumentHash"));}
  @Test public void exactIssuerSignatureAndEveryFreshQueryBindingAreRequired()throws Exception{
    assertEquals("allowed",verify(payload).getString("documentStatus"));JSONObject tampered=sign(payload);tampered.getJSONObject("payload").put("banned",true);rejects(()->StandaloneControl.verify(tampered,issuers,APP,INSTALL,FINGERPRINT,DEVICE,NONCE,HASH));
    rejects(()->StandaloneControl.verify(sign(payload),issuers,APP,INSTALL,FINGERPRINT,DEVICE,"44444444-4444-4444-8444-444444444444",HASH));rejects(()->StandaloneControl.verify(sign(payload),issuers,APP,INSTALL,FINGERPRINT,DEVICE,NONCE,NEW_HASH));
    for(String field:new String[]{"applicationId","installationId","keyFingerprint","deviceCode"})rejects(()->verify(copy(payload).put(field,"wrong")));
  }
  @Test public void fieldsPurposeNumbersAndBooleansAreStrict()throws Exception{
    JSONObject missing=copy(payload);missing.remove("banned");rejects(()->verify(missing));rejects(()->verify(copy(payload).put("visibility",false)));rejects(()->verify(copy(payload).put("purpose","accounting-reset")));
    for(String field:new String[]{"controlGeneration","activationFence","sequence","issuedAt","schemaVersion"})for(Object invalid:new Object[]{"1",-1,0.5,JSONObject.NULL,9007199254740992d})rejects(()->verify(copy(payload).put(field,invalid)));
    for(Object invalid:new Object[]{"false",0,JSONObject.NULL})rejects(()->verify(copy(payload).put("banned",invalid)));
  }
  @Test public void anUnsignedWrongPurposeOrUnknownIssuerNeverBecomesPolicy()throws Exception{
    JSONObject unsigned=sign(payload);unsigned.remove("signature");rejects(()->StandaloneControl.verify(unsigned,issuers,APP,INSTALL,FINGERPRINT,DEVICE,NONCE,HASH));
    JSONObject purpose=sign(payload).put("schema","contatools-owner-reset");rejects(()->StandaloneControl.verify(purpose,issuers,APP,INSTALL,FINGERPRINT,DEVICE,NONCE,HASH));
    JSONObject unknown=sign(payload).put("kid","other");rejects(()->StandaloneControl.verify(unknown,issuers,APP,INSTALL,FINGERPRINT,DEVICE,NONCE,HASH));
  }
  @Test public void aBlankDeviceCanReceiveABanWithoutALicenceDocument()throws Exception{
    JSONObject p=verify(copy(payload).put("queryDocumentHash","").put("documentStatus","none").put("banned",true).put("controlGeneration",2).put("activationFence",1));
    JSONObject cache=StandaloneControl.record(null,p,"");assertEquals("DEVICE_BANNED",StandaloneControl.denial(cache,""));assertEquals("DEVICE_BANNED",StandaloneControl.denial(cache,NEW_HASH));
    rejects(()->verify(copy(payload).put("queryDocumentHash","").put("documentStatus","allowed")));
  }
  @Test public void rollbackAndEqualGenerationBanChangesAreRejected()throws Exception{
    JSONObject deny=verify(copy(payload).put("controlGeneration",4).put("activationFence",3).put("banned",true).put("documentStatus","revoked"));
    rejects(()->StandaloneControl.monotonic(deny,verify(payload)));rejects(()->StandaloneControl.monotonic(deny,verify(copy(deny).put("banned",false))));rejects(()->StandaloneControl.monotonic(deny,verify(copy(deny).put("activationFence",2))));
    rejects(()->verify(copy(deny).put("activationFence",5)));
  }
  @Test public void unbanNeverRestoresAnyOldOrUnknownManualDocument()throws Exception{
    JSONObject banned=verify(copy(payload).put("controlGeneration",1).put("activationFence",1).put("banned",true).put("documentStatus","revoked")),cache=StandaloneControl.record(null,banned,HASH);
    JSONObject unbanned=verify(copy(banned).put("controlGeneration",2).put("banned",false));cache=StandaloneControl.record(cache,unbanned,HASH);
    assertEquals("ACTIVATION_REVOKED",StandaloneControl.denial(cache,HASH));assertEquals("ACTIVATION_REVOKED",StandaloneControl.denial(cache,NEW_HASH));
  }
  @Test public void onlyTheNewExactOwnerAuthorizedDocumentPassesAnExistingFence()throws Exception{
    JSONObject denied=verify(copy(payload).put("controlGeneration",1).put("activationFence",1).put("documentStatus","revoked")),cache=StandaloneControl.record(null,denied,HASH);
    JSONObject next=verify(copy(payload).put("controlGeneration",2).put("activationFence",1).put("queryDocumentHash",NEW_HASH).put("authorizationId",AUTH).put("sequence",2));cache=StandaloneControl.record(cache,next,HASH);
    assertEquals("",StandaloneControl.denial(cache,NEW_HASH));assertEquals("ACTIVATION_REVOKED",StandaloneControl.denial(cache,HASH));assertEquals("ACTIVATION_REVOKED",StandaloneControl.denial(cache,"c".repeat(64)));
    rejects(()->verify(copy(next).put("authorizationId","")));rejects(()->verify(copy(next).put("sequence",0)));
  }
  @Test public void aLaterFenceInvalidatesPreviouslyAuthorizedDocuments()throws Exception{
    JSONObject allowed=verify(copy(payload).put("controlGeneration",2).put("activationFence",1).put("authorizationId",AUTH).put("sequence",1)),cache=StandaloneControl.record(null,allowed,HASH);
    JSONObject newer=verify(copy(allowed).put("controlGeneration",3).put("activationFence",2).put("queryDocumentHash",NEW_HASH).put("documentStatus","revoked").put("authorizationId","").put("sequence",0));cache=StandaloneControl.record(cache,newer,HASH);
    assertEquals("ACTIVATION_REVOKED",StandaloneControl.denial(cache,HASH));
  }
  @Test public void replicaRepairUnionsRevocationsAndRetainsTheNewerBan()throws Exception{
    JSONObject one=verify(copy(payload).put("controlGeneration",1).put("activationFence",1).put("documentStatus","revoked"));JSONObject a=StandaloneControl.record(null,one,HASH);
    JSONObject two=verify(copy(one).put("controlGeneration",2).put("banned",true).put("queryDocumentHash",NEW_HASH));JSONObject b=StandaloneControl.record(null,two,NEW_HASH),merged=StandaloneControl.merge(a,b);
    assertEquals("DEVICE_BANNED",StandaloneControl.denial(merged,HASH));assertEquals(2,merged.getJSONArray("revokedDocumentHashes").length());assertEquals(ProtocolJson.canonical(merged),ProtocolJson.canonical(StandaloneControl.merge(b,a)));
  }
  @Test public void aNewInstallationKeyCannotLowerTheSamePhysicalDevicePolicy()throws Exception{
    JSONObject banned=verify(copy(payload).put("controlGeneration",1).put("activationFence",1).put("banned",true).put("documentStatus","revoked")),changed=copy(banned).put("installationId","44444444-4444-4444-8444-444444444444").put("keyFingerprint","g".repeat(43));
    StandaloneControl.monotonic(banned,changed);rejects(()->StandaloneControl.monotonic(banned,copy(changed).put("controlGeneration",0)));
    rejects(()->StandaloneControl.monotonic(banned,copy(changed).put("deviceCode","AKD-AAAA-BBBB-CCCC-DDDD-EEEE")));
  }
  @Test public void aFreshRequestDoesNotErasePriorRevocationHistory()throws Exception{
    JSONObject denied=verify(copy(payload).put("controlGeneration",1).put("activationFence",1).put("documentStatus","revoked")),cache=StandaloneControl.record(null,denied,HASH);
    JSONObject refresh=copy(denied).put("requestNonce","44444444-4444-4444-8444-444444444444").put("queryDocumentHash","").put("documentStatus","none").put("issuedAt",2000);cache=StandaloneControl.record(cache,refresh,HASH);
    assertEquals("ACTIVATION_REVOKED",StandaloneControl.denial(cache,HASH));assertEquals(1,cache.getJSONArray("revokedDocumentHashes").length());
  }
  @Test public void administrativeVisibilityAndClockFieldsCannotEnterNativeAuthority()throws Exception{
    for(String field:new String[]{"recordVisible","visibilityGeneration","durationSeconds","endsAt","ownerId","accounting"})rejects(()->verify(copy(payload).put(field,1)));
    JSONObject cache=StandaloneControl.record(null,verify(payload),HASH);assertEquals("",StandaloneControl.denial(cache,HASH));assertFalse(cache.has("clock"));
  }
  @Test public void monotonicFreshnessBoundsTheWholeRequestIncludingChallengeDelay()throws Exception{
    StandaloneControl.freshness(1000,15000,31000);
    rejects(()->StandaloneControl.freshness(1000,15000,31001));
    rejects(()->StandaloneControl.freshness(1000,1000,61000));
  }
  @Test public void invalidOrFutureNativeObservationsCannotAuthorizeAdmission()throws Exception{
    rejects(()->StandaloneControl.freshness(-1,0,1000));rejects(()->StandaloneControl.freshness(1000,999,2000));rejects(()->StandaloneControl.freshness(1000,2001,2000));rejects(()->StandaloneControl.freshness(2001,2001,2000));
  }
}
