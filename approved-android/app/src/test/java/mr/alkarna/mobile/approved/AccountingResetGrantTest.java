package mr.alkarna.mobile.approved;

import org.json.*;
import org.junit.Test;
import java.security.*;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import static org.junit.Assert.*;

public class AccountingResetGrantTest {
 private static final long NOW=1793520000000L;
 private final KeyPair pair;
 private final JSONObject issuers,license,payload;
 public AccountingResetGrantTest() throws Exception {
  KeyPairGenerator generator=KeyPairGenerator.getInstance("EC");generator.initialize(new ECGenParameterSpec("secp256r1"));pair=generator.generateKeyPair();ECPublicKey key=(ECPublicKey)pair.getPublic();
  issuers=new JSONObject().put("fixture",new JSONObject().put("kty","EC").put("crv","P-256").put("x",coordinate(key.getW().getAffineX())).put("y",coordinate(key.getW().getAffineY())));
  JSONObject document=new JSONObject().put("payload",new JSONObject().put("licenseId","original-license"));license=new JSONObject().put("licenseDocument",document.toString());
  payload=new JSONObject().put("grantId",UUID.randomUUID().toString()).put("requestId",UUID.randomUUID().toString()).put("installationId","installation").put("keyFingerprint","fingerprint").put("deviceCode","DEVICE").put("licenseDocumentHash",ProtocolJson.hash(document)).put("licenseId","original-license").put("shopId","shop").put("ownerId","owner").put("issuedAt",NOW-1000).put("expiresAt",NOW+60000);
 }
 private static String coordinate(BigInteger number){byte[] value=number.toByteArray(),out=new byte[32];int count=Math.min(value.length,32);System.arraycopy(value,value.length-count,out,32-count,count);return ProtocolJson.base64(out);}
 private JSONObject envelope(String purpose,JSONObject value) throws Exception {
  JSONObject envelope=new JSONObject().put("schema",purpose).put("version",1).put("kid","fixture").put("payload",value);Signature signer=Signature.getInstance("SHA256withECDSA");signer.initSign(pair.getPrivate());signer.update(ProtocolJson.canonical(envelope).getBytes(StandardCharsets.UTF_8));return envelope.put("signature",ProtocolJson.base64(ProtocolJson.rawSignature(signer.sign())));
 }
 private JSONObject verify(JSONObject envelope,boolean claimed) throws Exception {return AccountingResetGrant.verify(envelope,issuers,"installation","fingerprint","DEVICE",license,"shop","owner",NOW,claimed);}
 private interface Checked {void run() throws Exception;}
 private static void denied(Checked action) throws Exception {try{action.run();fail("Unsafe reset grant accepted");}catch(Exception expected){}}
 @Test public void validGrantIsBoundToAllOriginalIdentitiesAndExactPurpose() throws Exception {
  assertEquals(payload.getString("requestId"),verify(envelope("contatools-accounting-reset",payload),false).getString("requestId"));
  denied(()->verify(envelope("contatools-owner-reset",payload),false));
  for(String key:new String[]{"installationId","keyFingerprint","deviceCode","licenseDocumentHash","licenseId","shopId","ownerId"}){JSONObject altered=ProtocolJson.copy(payload).put(key,"another-target");denied(()->verify(envelope("contatools-accounting-reset",altered),false));}
 }
 @Test public void expiryAndExtraFieldsCannotAuthorizeFreshConsent() throws Exception {
  denied(()->verify(envelope("contatools-accounting-reset",ProtocolJson.copy(payload).put("expiresAt",NOW)),false));
  denied(()->verify(envelope("contatools-accounting-reset",ProtocolJson.copy(payload).put("expiresAt",NOW+86400001L)),false));
  denied(()->verify(envelope("contatools-accounting-reset",ProtocolJson.copy(payload).put("scope","everything")),false));
  denied(()->verify(envelope("contatools-accounting-reset",ProtocolJson.copy(payload).put("issuedAt",NOW+60001).put("expiresAt",NOW+120000)),false));
 }
 @Test public void onlyMatchingSignedClaimMayResumeAfterExpiry() throws Exception {
  String intent=UUID.randomUUID().toString();JSONObject expired=ProtocolJson.copy(payload).put("expiresAt",NOW-1);
  JSONObject original=verify(envelope("contatools-accounting-reset",expired),true);
  JSONObject claim=ProtocolJson.copy(original).put("intentId",intent).put("claimedAt",NOW-500);AccountingResetGrant.verifyClaim(envelope("contatools-accounting-reset-claim",claim),issuers,original,intent);
  denied(()->AccountingResetGrant.verifyClaim(envelope("contatools-accounting-reset-claim",claim),issuers,original,UUID.randomUUID().toString()));
  denied(()->AccountingResetGrant.verifyClaim(envelope("contatools-accounting-reset-claim",ProtocolJson.copy(claim).put("claimedAt",NOW)),issuers,original,intent));
  denied(()->AccountingResetGrant.verifyClaim(envelope("contatools-reset-claim",claim),issuers,original,intent));
 }
 @Test public void tamperedSignatureOrClaimScopeIsRejected() throws Exception {
  JSONObject signed=envelope("contatools-accounting-reset",payload);signed.getJSONObject("payload").put("ownerId","changed");denied(()->verify(signed,false));payload.put("ownerId","owner");
  String intent=UUID.randomUUID().toString();JSONObject claim=ProtocolJson.copy(payload).put("intentId",intent).put("claimedAt",NOW);claim.put("shopId","different");denied(()->AccountingResetGrant.verifyClaim(envelope("contatools-accounting-reset-claim",claim),issuers,payload,intent));
 }
 @Test public void onlyAnExactSignedNeverClaimedDenialCanReleaseAnAcceptedIntent() throws Exception {
  String intent=UUID.randomUUID().toString();JSONObject denial=ProtocolJson.copy(payload).put("intentId",intent).put("deniedAt",NOW).put("status","cancelled");
  AccountingResetGrant.verifyDenial(envelope("contatools-accounting-reset-denial",denial),issuers,payload,intent);
  denied(()->AccountingResetGrant.verifyDenial(envelope("contatools-accounting-reset-denial",denial),issuers,payload,UUID.randomUUID().toString()));
  denied(()->AccountingResetGrant.verifyDenial(envelope("contatools-accounting-reset-denial",ProtocolJson.copy(denial).put("status","claimed")),issuers,payload,intent));
  denied(()->AccountingResetGrant.verifyDenial(envelope("contatools-accounting-reset-denial",ProtocolJson.copy(denial).put("status","expired")),issuers,payload,intent));
 }
}
