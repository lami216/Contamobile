package mr.alkarna.mobile.approved;

import java.io.IOException;
import java.util.*;
import org.json.*;

/** A permanent scoped diagnostic, never an activation, claim or accounting authority. */
final class BootstrapOutcome {
  private static final Set<String> FIELDS =
      new HashSet<>(
          Arrays.asList(
              "decisionId",
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
              "grantHash",
              "fenceGeneration",
              "outcome",
              "reasonCode",
              "decidedAt",
              "replacementGrantId"));
  private static final Set<String> OUTCOMES =
      new HashSet<>(
          Arrays.asList(
              "superseded-unknown",
              "superseded-unclaimed",
              "revoked-service-restore",
              "expired-unclaimed"));
  private static final Set<String> REASONS =
      new HashSet<>(
          Arrays.asList(
              "REPLACEMENT_PHONE_LOST",
              "NEW_RESTORE_APPROVAL",
              "SERVICE_RESTORE",
              "OFFER_EXPIRED"));

  private static void require(boolean valid) throws IOException {
    if (!valid) throw new IOException("INVALID_BOOTSTRAP_OUTCOME");
  }

  private static long integer(JSONObject value, String name) throws Exception {
    Object raw = value.opt(name);
    require(raw instanceof Number);
    double number = ((Number) raw).doubleValue();
    require(
        Double.isFinite(number)
            && number >= 0
            && number <= 9007199254740991d
            && number == ((Number) raw).longValue());
    return ((Number) raw).longValue();
  }

  static JSONObject verify(
      JSONObject envelope,
      JSONObject issuers,
      JSONObject originalGrant,
      String intent,
      String installation,
      String fingerprint,
      String device)
      throws Exception {
    JSONObject grant =
        ProtocolJson.verifyEnvelope(originalGrant, issuers, "contatools-cloud-bootstrap");
    JSONObject outcome =
        ProtocolJson.verifyEnvelope(envelope, issuers, "contatools-cloud-bootstrap-outcome");
    require(outcome.length() == FIELDS.size());
    Iterator<String> names = outcome.keys();
    while (names.hasNext()) require(FIELDS.contains(names.next()));
    require(
        installation.equals(grant.optString("installationId"))
            && fingerprint.equals(grant.optString("keyFingerprint"))
            && device.equals(grant.optString("deviceCode")));
    for (String field :
        new String[] {
          "grantId",
          "installationId",
          "keyFingerprint",
          "deviceCode",
          "subscriptionId",
          "backupId",
          "shopId",
          "ownerId",
          "sha256"
        }) {
      require(
          outcome.opt(field) instanceof String
              && grant.getString(field).equals(outcome.getString(field)));
    }
    require(
        outcome.opt("intentId") instanceof String && intent.equals(outcome.getString("intentId")));
    require(
        outcome.opt("grantHash") instanceof String
            && ProtocolJson.hash(originalGrant).equals(outcome.getString("grantHash")));
    require(
        OUTCOMES.contains(outcome.optString("outcome"))
            && REASONS.contains(outcome.optString("reasonCode")));
    require(
        outcome.opt("decisionId") instanceof String
            && outcome.getString("decisionId").matches("[A-Za-z0-9_.:-]{1,160}"));
    require(
        outcome.opt("replacementGrantId") instanceof String
            && (outcome.getString("replacementGrantId").isEmpty()
                || outcome.getString("replacementGrantId").matches("[A-Za-z0-9_.:-]{1,160}")));
    integer(outcome, "fenceGeneration");
    integer(outcome, "decidedAt");
    return ProtocolJson.copy(outcome);
  }
}
