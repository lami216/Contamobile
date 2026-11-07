package mr.alkarna.mobile.approved;

import static org.junit.Assert.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import org.json.*;
import org.junit.*;

public final class PhoneEntitlementTest {
  private KeyPair pair;private JSONObject issuers,payload;
  private interface Work{void run()throws Exception;}
  private static void rejects(Work work)throws Exception{try{work.run();fail("Invalid authority must be rejected");}catch(Exception expected){}}
  private static JSONObject copy(JSONObject p)throws Exception{return new JSONObject(p.toString());}
  private static String coordinate(java.math.BigInteger n){byte[] input=n.toByteArray(),out=new byte[32];int length=Math.min(input.length,32);System.arraycopy(input,input.length-length,out,32-length,length);return ProtocolJson.base64(out);}
  private JSONObject signed(String purpose,JSONObject p)throws Exception{
    JSONObject value=new JSONObject().put("schema",purpose).put("version",1).put("kid","fixture").put("payload",copy(p));
    Signature sign=Signature.getInstance("SHA256withECDSA");sign.initSign(pair.getPrivate());sign.update(ProtocolJson.canonical(value).getBytes(StandardCharsets.UTF_8));return value.put("signature",ProtocolJson.base64(ProtocolJson.rawSignature(sign.sign())));
  }
  private JSONObject verify(JSONObject p)throws Exception{return PhoneEntitlement.snapshot(signed(PhoneEntitlement.PURPOSE,p),issuers,"installation","fingerprint","code");}
  @Before public void setup()throws Exception{
    KeyPairGenerator generator=KeyPairGenerator.getInstance("EC");generator.initialize(new ECGenParameterSpec("secp256r1"));pair=generator.generateKeyPair();ECPublicKey key=(ECPublicKey)pair.getPublic();
    issuers=new JSONObject().put("fixture",new JSONObject().put("kty","EC").put("crv","P-256").put("x",coordinate(key.getW().getAffineX())).put("y",coordinate(key.getW().getAffineY())));
    payload=new JSONObject().put("schemaVersion",1).put("decisionId","offer").put("entitlementId","entitlement").put("clientId","client").put("installationId","installation").put("keyFingerprint","fingerprint").put("deviceCode","code").put("licenseId","licence").put("licenseDocumentHash","a".repeat(64)).put("sequence",1).put("bindingGeneration",2).put("type","temporary").put("endsAt",100000).put("status","active").put("issuedAt",1000).put("currentDeviceCode","code").put("currentInstallationId","installation").put("reasonCode","ACTIVE_PHONE").put("intentId","intent");
  }
  @Test public void snapshotRequiresExactPurposeSignatureAndTargetBindings()throws Exception{
    assertEquals("active",verify(payload).getString("status"));
    JSONObject changed=signed(PhoneEntitlement.PURPOSE,payload);changed.getJSONObject("payload").put("endsAt",200000);rejects(()->PhoneEntitlement.snapshot(changed,issuers,"installation","fingerprint","code"));
    rejects(()->PhoneEntitlement.snapshot(signed("contatools-owner-reset",payload),issuers,"installation","fingerprint","code"));
    for(String name:new String[]{"installationId","keyFingerprint","deviceCode"})rejects(()->verify(copy(payload).put(name,"different")));
  }
  @Test public void extraMissingAndCoercedNumbersCannotBecomeAnEntitlement()throws Exception{
    JSONObject missing=copy(payload);missing.remove("decisionId");rejects(()->verify(missing));rejects(()->verify(copy(payload).put("extra",true)));
    for(String name:new String[]{"sequence","bindingGeneration","issuedAt","endsAt"})for(Object invalid:new Object[]{-1,1.5,"2",9007199254740992d,JSONObject.NULL})rejects(()->verify(copy(payload).put(name,invalid)));
  }
  @Test public void pendingOrReplacedMayDescribeAnUnlicensedPhoneButCannotPretendItIsActive()throws Exception{
    JSONObject pending=copy(payload).put("licenseId","").put("licenseDocumentHash","").put("sequence",0).put("intentId","").put("status","pending").put("reasonCode","PENDING_REPLACEMENT").put("currentDeviceCode","old-code").put("currentInstallationId","old-installation");
    assertEquals("pending",verify(pending).getString("status"));rejects(()->verify(copy(pending).put("status","active").put("reasonCode","ACTIVE_PHONE")));
    assertEquals("replaced",verify(copy(pending).put("status","replaced").put("reasonCode","REPLACED_INSTALLATION")).getString("status"));
  }
  @Test public void freshTimeDoesNotChangeAReplayedDecisionOrReenableAReplacedPhone()throws Exception{
    JSONObject first=verify(payload),fresh=verify(copy(payload).put("issuedAt",2000));PhoneEntitlement.monotonic(first,fresh);
    rejects(()->PhoneEntitlement.monotonic(fresh,first));rejects(()->PhoneEntitlement.monotonic(first,verify(copy(payload).put("endsAt",200000))));
    JSONObject replaced=verify(copy(payload).put("bindingGeneration",3).put("status","replaced").put("reasonCode","REPLACED_PHONE").put("currentDeviceCode","new-code").put("currentInstallationId","new-installation").put("decisionId","new-offer"));
    PhoneEntitlement.monotonic(first,replaced);rejects(()->PhoneEntitlement.monotonic(replaced,first));
  }
  @Test public void aNewPendingOfferCanRefreshWithoutGrantingActivation()throws Exception{
    JSONObject first=verify(copy(payload).put("status","pending").put("reasonCode","PENDING_REPLACEMENT").put("currentDeviceCode","old-code").put("currentInstallationId","old-installation"));
    JSONObject next=verify(copy(first).put("decisionId","other-offer").put("issuedAt",2000));PhoneEntitlement.monotonic(first,next);
    rejects(()->PhoneEntitlement.monotonic(first,verify(copy(next).put("endsAt",200000))));
  }
  @Test public void onlyTheClaimedOfferIntentAndDocumentMayBeInstalled()throws Exception{
    JSONObject offer=new JSONObject().put("schemaVersion",1).put("offerId","offer").put("entitlementId","entitlement").put("clientId","client").put("installationId","installation").put("keyFingerprint","fingerprint").put("deviceCode","code").put("expectedGeneration",1).put("kind","replacement").put("issuedAt",1000).put("expiresAt",5000);
    JSONObject verified=PhoneEntitlement.offer(signed(PhoneEntitlement.OFFER_PURPOSE,offer),issuers,"installation","fingerprint","code",true,2000);PhoneEntitlement.claimed(verified,verify(payload),"intent","a".repeat(64));
    rejects(()->PhoneEntitlement.claimed(verified,verify(payload),"other-intent","a".repeat(64)));rejects(()->PhoneEntitlement.claimed(verified,verify(payload),"intent","b".repeat(64)));
    rejects(()->PhoneEntitlement.offer(signed(PhoneEntitlement.OFFER_PURPOSE,offer),issuers,"installation","fingerprint","code",true,6000));
    PhoneEntitlement.offer(signed(PhoneEntitlement.OFFER_PURPOSE,offer),issuers,"installation","fingerprint","code",false,6000);
  }
  @Test public void delayedAcceptanceColdRestartAndFreshSamplesNeverMoveTheFixedDeadline()throws Exception{
    JSONObject p=verify(payload),clock=EntitlementClock.begin(p,null,1000000,1000);assertEquals(99000,EntitlementClock.remaining(p,clock,1000000,1000));
    JSONObject delayed=EntitlementClock.begin(p,null,1000000,1000,10000);assertEquals(89000,EntitlementClock.remaining(p,delayed,1000000,1000));
    JSONObject saved=copy(clock);assertEquals(89000,EntitlementClock.remaining(p,saved,1010000,11000));
    JSONObject fresh=EntitlementClock.begin(copy(p).put("issuedAt",15000),saved,1010000,11000);assertEquals(85000,EntitlementClock.remaining(p,fresh,1010000,11000));
    JSONObject reinstalled=EntitlementClock.begin(copy(p).put("issuedAt",90000),null,3000000,100);assertEquals(10000,EntitlementClock.remaining(p,reinstalled,3000000,100));assertEquals(0,EntitlementClock.remaining(p,reinstalled,3010000,10100));
  }
  @Test public void perpetualTermsRemainPerpetualWhileClockRollbackIsRejected()throws Exception{
    JSONObject p=verify(copy(payload).put("type","perpetual").put("endsAt",JSONObject.NULL)),clock=EntitlementClock.begin(p,null,1000000,1000);assertEquals(Long.MAX_VALUE,EntitlementClock.remaining(p,clock,999999999,500000));
    JSONObject temporary=EntitlementClock.begin(payload,null,1000000,1000);EntitlementClock.remaining(payload,temporary,1010000,11000);rejects(()->EntitlementClock.remaining(payload,temporary,1000,12000));
    rejects(()->verify(copy(payload).put("type","perpetual")));rejects(()->verify(copy(payload).put("endsAt",JSONObject.NULL)));
  }
}
