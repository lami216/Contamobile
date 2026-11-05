package mr.alkarna.mobile.approved;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.*;
import org.json.*;
import org.junit.*;

public final class BootstrapOutcomeTest {
  private KeyPair pair;
  private JSONObject issuers, grant, payload;

  private static String coordinate(java.math.BigInteger value) {
    byte[] raw = value.toByteArray(), bytes = new byte[32];
    int count = Math.min(raw.length, 32);
    System.arraycopy(raw, raw.length - count, bytes, 32 - count, count);
    return ProtocolJson.base64(bytes);
  }

  private static JSONObject copy(JSONObject value) throws Exception {
    return new JSONObject(value.toString());
  }

  private JSONObject signed(String schema, JSONObject value) throws Exception {
    JSONObject envelope =
        new JSONObject()
            .put("schema", schema)
            .put("version", 1)
            .put("kid", "fixture")
            .put("payload", copy(value));
    Signature signer = Signature.getInstance("SHA256withECDSA");
    signer.initSign(pair.getPrivate());
    signer.update(ProtocolJson.canonical(envelope).getBytes(StandardCharsets.UTF_8));
    return envelope.put("signature", ProtocolJson.base64(ProtocolJson.rawSignature(signer.sign())));
  }

  private JSONObject verify(JSONObject envelope, String intent) throws Exception {
    return BootstrapOutcome.verify(
        envelope, issuers, grant, intent, "installation", "fingerprint", "device");
  }

  private interface Checked {
    void run() throws Exception;
  }

  private static void rejected(Checked work) throws Exception {
    try {
      work.run();
      fail("Invalid terminal diagnostic required rejection");
    } catch (Exception expected) {
    }
  }

  @Before
  public void setup() throws Exception {
    KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
    generator.initialize(new ECGenParameterSpec("secp256r1"));
    pair = generator.generateKeyPair();
    ECPublicKey key = (ECPublicKey) pair.getPublic();
    issuers =
        new JSONObject()
            .put(
                "fixture",
                new JSONObject()
                    .put("kty", "EC")
                    .put("crv", "P-256")
                    .put("x", coordinate(key.getW().getAffineX()))
                    .put("y", coordinate(key.getW().getAffineY())));
    JSONObject original =
        new JSONObject()
            .put("grantId", "old-grant")
            .put("clientId", "client")
            .put("installationId", "installation")
            .put("keyFingerprint", "fingerprint")
            .put("deviceCode", "device")
            .put("sourceInstallationId", "source")
            .put("subscriptionId", "stream")
            .put("backupId", "backup")
            .put("shopId", "shop")
            .put("ownerId", "owner")
            .put("sha256", "a".repeat(64))
            .put("sizeBytes", 120)
            .put("snapshotAt", 1)
            .put("localRevision", "1")
            .put("issuedAt", 1)
            .put("expiresAt", 2);
    grant = signed("contatools-cloud-bootstrap", original);
    payload =
        new JSONObject()
            .put("decisionId", "decision")
            .put("grantId", "old-grant")
            .put("intentId", "intent")
            .put("installationId", "installation")
            .put("keyFingerprint", "fingerprint")
            .put("deviceCode", "device")
            .put("subscriptionId", "stream")
            .put("backupId", "backup")
            .put("shopId", "shop")
            .put("ownerId", "owner")
            .put("sha256", "a".repeat(64))
            .put("grantHash", ProtocolJson.hash(grant))
            .put("fenceGeneration", 2)
            .put("outcome", "superseded-unknown")
            .put("reasonCode", "REPLACEMENT_PHONE_LOST")
            .put("decidedAt", 3)
            .put("replacementGrantId", "new-grant");
  }

  @Test
  public void permanentSignedDecisionRemainsValidAfterOriginalOfferExpiry() throws Exception {
    JSONObject value = verify(signed("contatools-cloud-bootstrap-outcome", payload), "intent");
    assertEquals("superseded-unknown", value.getString("outcome"));
    assertFalse(value.has("expiresAt"));
    assertEquals(2, value.getInt("fenceGeneration"));
  }

  @Test
  public void wrongSignatureAndWrongPurposeAreRejected() throws Exception {
    JSONObject envelope = signed("contatools-cloud-bootstrap-outcome", payload);
    envelope.getJSONObject("payload").put("fenceGeneration", 3);
    rejected(() -> verify(envelope, "intent"));
    rejected(() -> verify(signed("contatools-owner-reset", payload), "intent"));
  }

  @Test
  public void everyTargetBindingAndOriginalGrantHashMustMatch() throws Exception {
    for (String field :
        new String[] {
          "grantId",
          "intentId",
          "installationId",
          "keyFingerprint",
          "deviceCode",
          "subscriptionId",
          "backupId",
          "shopId",
          "ownerId",
          "sha256",
          "grantHash"
        }) {
      JSONObject wrong = copy(payload).put(field, "different");
      rejected(() -> verify(signed("contatools-cloud-bootstrap-outcome", wrong), "intent"));
    }
  }

  @Test
  public void missingAndAdditionalFieldsNeverBecomeAValidTerminalDecision() throws Exception {
    for (String field : new String[] {"decisionId", "replacementGrantId", "outcome", "decidedAt"}) {
      JSONObject missing = copy(payload);
      missing.remove(field);
      rejected(() -> verify(signed("contatools-cloud-bootstrap-outcome", missing), "intent"));
    }
    rejected(
        () ->
            verify(
                signed("contatools-cloud-bootstrap-outcome", copy(payload).put("extra", true)),
                "intent"));
  }

  @Test
  public void unknownStatusesAndUntrustedReasonTextAreRejected() throws Exception {
    rejected(
        () ->
            verify(
                signed(
                    "contatools-cloud-bootstrap-outcome", copy(payload).put("outcome", "active")),
                "intent"));
    rejected(
        () ->
            verify(
                signed(
                    "contatools-cloud-bootstrap-outcome",
                    copy(payload).put("reasonCode", "<script>wrong</script>")),
                "intent"));
  }

  @Test
  public void generationAndDecisionTimeRequireNonnegativeSafeIntegers() throws Exception {
    for (String field : new String[] {"fenceGeneration", "decidedAt"}) {
      for (Object value : new Object[] {-1, 1.5, "2", 9007199254740992d, JSONObject.NULL}) {
        JSONObject wrong = copy(payload).put(field, value);
        rejected(() -> verify(signed("contatools-cloud-bootstrap-outcome", wrong), "intent"));
      }
    }
  }

  @Test
  public void emptyIntentIsAcceptedOnlyForTheExactUnclaimedOfferContext() throws Exception {
    JSONObject unclaimed =
        copy(payload)
            .put("intentId", "")
            .put("outcome", "expired-unclaimed")
            .put("reasonCode", "OFFER_EXPIRED")
            .put("replacementGrantId", "");
    verify(signed("contatools-cloud-bootstrap-outcome", unclaimed), "");
    rejected(() -> verify(signed("contatools-cloud-bootstrap-outcome", unclaimed), "intent"));
  }
}
