package mr.alkarna.mobile.approved;

import android.content.Context;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;

/** Explicit online issuance and blank-phone restore. It never writes the business database. */
final class DeviceLifecycleClient {
  private final DeviceLicense license;
  private final InstallationIdentity identity;
  private final JSONObject issuers;
  private final ContatoolsClient.Transport transport;
  private final DeviceLifecycleStore disk;

  DeviceLifecycleClient(Context context, DeviceLicense license) throws Exception {
    this(
        context,
        license,
        new JSONObject(BuildConfig.CONTATOOLS_ISSUERS),
        new ContatoolsClient.HttpsTransport(BuildConfig.CONTATOOLS_ORIGIN));
  }

  DeviceLifecycleClient(
      Context context,
      DeviceLicense license,
      JSONObject issuers,
      ContatoolsClient.Transport transport)
      throws Exception {
    this.license = license;
    this.issuers = ProtocolJson.copy(issuers);
    this.transport = transport;
    identity = new InstallationIdentity();
    disk = new DeviceLifecycleStore(context, license.deviceCode() + "|" + identity.fingerprint());
  }

  private JSONObject call(String operation, JSONObject payload) throws Exception {
    JSONObject wire = ProtocolJson.copy(payload).put("installationId", identity.id());
    JSONObject challenge =
        transport.post(
            "/api/android/lifecycle/challenge",
            new JSONObject().put("operation", operation).put("payload", wire));
    String message = challenge.getString("message");
    if (message.length() > 4096) throw new IOException("INVALID_LIFECYCLE_PROOF");
    JSONObject proof = new JSONObject(message);
    if (!"contatools-lifecycle-proof".equals(proof.optString("schema"))
        || proof.optInt("version") != 1
        || !operation.equals(proof.optString("operation"))
        || !identity.id().equals(proof.optString("installationId"))
        || !ProtocolJson.hash(wire).equals(proof.optString("payloadHash"))
        || !challenge.getString("id").equals(proof.optString("id")))
      throw new IOException("INVALID_LIFECYCLE_PROOF");
    return transport.post(
        "/api/android/lifecycle/dispatch",
        new JSONObject()
            .put("operation", operation)
            .put("payload", wire)
            .put("challengeId", challenge.getString("id"))
            .put("signature", identity.sign(message)));
  }

  private static void keys(JSONObject value, String... allowed) throws Exception {
    Set<String> names = new HashSet<>(Arrays.asList(allowed));
    Iterator<String> it = value.keys();
    while (it.hasNext())
      if (!names.contains(it.next())) throw new IOException("INVALID_LIFECYCLE_INPUT");
  }

  private static String id(JSONObject value, String name) throws Exception {
    Object raw = value.opt(name);
    if (!(raw instanceof String) || !((String) raw).matches("[A-Za-z0-9_.:-]{1,160}"))
      throw new IOException("INVALID_LIFECYCLE_SCOPE");
    return (String) raw;
  }

  private JSONObject bound(JSONObject envelope, String purpose, boolean current) throws Exception {
    JSONObject p = ProtocolJson.verifyEnvelope(envelope, issuers, purpose);
    if (!identity.id().equals(p.optString("installationId"))
        || !identity.fingerprint().equals(p.optString("keyFingerprint"))
        || !license.deviceCode().equals(p.optString("deviceCode")))
      throw new IOException("LIFECYCLE_SCOPE_MISMATCH");
    long issued = p.getLong("issuedAt"),
        expires = p.getLong("expiresAt"),
        maximum = purpose.equals("contatools-android-activation") ? 86400000 : 900000;
    if (issued < 0
        || expires <= issued
        || expires - issued > maximum
        || current && expires <= System.currentTimeMillis())
      throw new IOException("LIFECYCLE_GRANT_EXPIRED");
    return p;
  }

  synchronized JSONObject enroll(JSONObject value) throws Exception {
    keys(value, "customerName", "storeName");
    JSONObject payload =
        new JSONObject()
            .put("publicJwk", identity.publicJwk())
            .put("deviceCode", license.deviceCode())
            .put("applicationId", BuildConfig.APPLICATION_ID)
            .put("appVersion", BuildConfig.VERSION_NAME)
            .put("versionCode", BuildConfig.VERSION_CODE);
    String customer = value.optString("customerName").trim(),
        store = value.optString("storeName").trim();
    try {
      JSONObject snapshot = license.registrationSnapshot(),
          document = new JSONObject(snapshot.getString("licenseDocument")),
          p = document.getJSONObject("payload");
      if (customer.isEmpty()) customer = p.getString("customerName");
      if (store.isEmpty()) store = p.getString("storeName");
      payload
          .put("licenseDocument", snapshot.getString("licenseDocument"))
          .put("remainingSeconds", snapshot.getJSONObject("activation").opt("remainingSeconds"));
    } catch (Exception unavailable) {
      /* A never-activated phone enrolls without a license. */
    }
    if (customer.length() > 240 || store.length() > 240)
      throw new IOException("CUSTOMER_DETAILS_REQUIRED");
    payload.put("customerName", customer).put("storeName", store);
    JSONObject answer = call("enroll", payload);
    disk.state
        .put("enrolled", true)
        .put("lastEnrollmentAt", System.currentTimeMillis())
        .put(
            "enrolledLicenseHash",
            payload.has("licenseDocument")
                ? ProtocolJson.hash(new JSONObject(payload.getString("licenseDocument")))
                : "");
    disk.save();
    return sanitize(answer);
  }

  private JSONObject sanitize(JSONObject response) throws Exception {
    JSONObject result =
        new JSONObject()
            .put("status", response.optString("status", "pending"))
            .put("deviceCode", license.deviceCode())
            .put("installationId", identity.id())
            .put("activationAvailable", false)
            .put("bootstrapAvailable", false);
    if (response.has("clientId")) result.put("clientId", response.opt("clientId"));
    JSONObject activation = response.optJSONObject("activation");
    if (activation != null) {
      JSONObject p = activation(activation, true);
      if (p.getLong("sequence") > disk.state.optLong("licenseSequence"))
        result
            .put("activationAvailable", true)
            .put(
                "activationType",
                activation
                    .getJSONObject("licenseDocument")
                    .getJSONObject("payload")
                    .getString("type"));
      disk.state.put("activationOffer", activation);
    }
    JSONObject bootstrap = response.optJSONObject("bootstrap");
    if (bootstrap != null) {
      JSONObject grant = bootstrap.getJSONObject("grant"), p = bootstrapGrant(grant, true);
      if (!disk.used(p.getString("grantId"))) {
        result.put("bootstrapAvailable", true).put("bootstrapMeta", metadata(p));
        if (!disk.state.has("pending")) disk.state.put("offer", bootstrap);
      }
    }
    disk.save();
    return result;
  }

  synchronized JSONObject status() throws Exception {
    JSONObject saved = null;
    try {
      saved = license.registrationSnapshot();
    } catch (IOException unavailable) {
      if (!"Original activation unavailable for registration".equals(unavailable.getMessage()))
        throw unavailable;
    }
    if (saved != null) {
      String hash = ProtocolJson.hash(new JSONObject(saved.getString("licenseDocument")));
      if (!disk.state.optBoolean("enrolled")
          || !hash.equals(disk.state.optString("enrolledLicenseHash"))
          || System.currentTimeMillis() - disk.state.optLong("lastEnrollmentAt") >= 60000)
        enroll(new JSONObject());
    }
    JSONObject pending = disk.state.optJSONObject("activationPending");
    if (pending != null && installed(pending)) activate();
    return sanitize(call("status", new JSONObject()));
  }

  private JSONObject activation(JSONObject offer, boolean current) throws Exception {
    JSONObject p = bound(offer.getJSONObject("grant"), "contatools-android-activation", current),
        document = offer.getJSONObject("licenseDocument");
    if (p.length() != 10
        || !ProtocolJson.hash(document).equals(p.optString("licenseDocumentHash"))
        || !document
            .getJSONObject("payload")
            .getString("licenseId")
            .equals(p.optString("licenseId"))
        || !document
            .optString("keyId")
            .equals("contatools-online-v2:" + offer.getJSONObject("grant").getString("kid"))
        || p.getLong("sequence") < 1) throw new IOException("INVALID_ONLINE_LICENSE");
    LicenseVerifier.verify(document.toString(), license.deviceCode());
    return p;
  }

  private boolean installed(JSONObject offer) throws Exception {
    JSONObject p = activation(offer, false);
    try {
      return p.getString("licenseDocumentHash")
          .equals(
              ProtocolJson.hash(
                  new JSONObject(license.registrationSnapshot().getString("licenseDocument"))));
    } catch (IOException unavailable) {
      return false;
    }
  }

  private void sequence(JSONObject p) throws Exception {
    long next = p.getLong("sequence"), previous = disk.state.optLong("licenseSequence");
    if (next < previous
        || next == previous
            && (!p.getString("issuanceId").equals(disk.state.optString("lastIssuanceId"))
                || !p.getString("licenseDocumentHash")
                    .equals(disk.state.optString("lastLicenseHash"))))
      throw new IOException("ONLINE_LICENSE_REPLAY");
  }

  private void noDowngrade(JSONObject document) throws Exception {
    JSONObject before = license.status();
    if (before.optBoolean("valid")
        && before.getJSONObject("license").isNull("remainingSeconds")
        && "temporary".equals(document.getJSONObject("payload").getString("type")))
      throw new IOException("PERPETUAL_DOWNGRADE_REFUSED");
  }

  synchronized JSONObject activate() throws Exception {
    JSONObject offer = disk.state.optJSONObject("activationPending");
    boolean applied = offer != null && installed(offer);
    if (!applied) {
      JSONObject response = call("status", new JSONObject());
      offer = response.optJSONObject("activation");
      if (offer == null) {
        disk.state.remove("activationPending");
        disk.save();
        return sanitize(response);
      }
      JSONObject selected = activation(offer, true);
      sequence(selected);
      noDowngrade(offer.getJSONObject("licenseDocument"));
      disk.state.put("activationPending", offer);
      disk.save();
    }
    JSONObject p = activation(offer, !applied), document = offer.getJSONObject("licenseDocument");
    sequence(p);
    noDowngrade(document);
    JSONObject active = license.installOnline(document.toString());
    disk.state
        .put("licenseSequence", p.getLong("sequence"))
        .put("lastIssuanceId", p.getString("issuanceId"))
        .put("lastLicenseHash", p.getString("licenseDocumentHash"));
    disk.save();
    JSONObject result =
        new JSONObject()
            .put("stage", "activated")
            .put("license", active)
            .put("issuanceId", p.getString("issuanceId"));
    try {
      JSONObject ack =
          call("license.accept", new JSONObject().put("issuanceId", p.getString("issuanceId")));
      if (!p.getString("issuanceId").equals(ack.optString("issuanceId")))
        throw new IOException("INVALID_ACTIVATION_ACK");
      disk.state.remove("activationPending");
      disk.state.remove("activationOffer");
      disk.save();
      return result.put("ackPending", false);
    } catch (Exception failure) {
      if (failure instanceof ContatoolsClient.ServiceFailure
          && (((ContatoolsClient.ServiceFailure) failure).status == 404
              || ((ContatoolsClient.ServiceFailure) failure).status == 409)) {
        disk.state.remove("activationPending");
        disk.save();
        return result.put("ackPending", false).put("newerIssuanceAvailable", true);
      }
      return result.put("ackPending", true);
    }
  }

  private JSONObject bootstrapGrant(JSONObject grant, boolean current) throws Exception {
    JSONObject p = bound(grant, "contatools-cloud-bootstrap", current);
    if (p.length() != 16
        || p.getInt("sizeBytes") < 2
        || p.getInt("sizeBytes") > CloudBackupPolicy.MAX_BYTES
        || !p.optString("sha256").matches("[a-f0-9]{64}"))
      throw new IOException("INVALID_BOOTSTRAP_GRANT");
    for (String name :
        new String[] {
          "grantId",
          "clientId",
          "sourceInstallationId",
          "subscriptionId",
          "backupId",
          "shopId",
          "ownerId"
        }) id(p, name);
    return p;
  }

  private JSONObject metadata(JSONObject p) throws Exception {
    return new JSONObject()
        .put("grantId", p.getString("grantId"))
        .put("shopId", p.getString("shopId"))
        .put("ownerId", p.getString("ownerId"))
        .put("backupId", p.getString("backupId"))
        .put("sha256", p.getString("sha256"))
        .put("sizeBytes", p.getInt("sizeBytes"))
        .put("snapshotAt", p.getLong("snapshotAt"))
        .put("localRevision", p.getString("localRevision"))
        .put("expiresAt", p.getLong("expiresAt"));
  }

  synchronized JSONObject list(JSONObject input) throws Exception {
    keys(input, "grantId");
    String grantId = id(input, "grantId");
    JSONObject response = call("bootstrap.list", new JSONObject().put("grantId", grantId)),
        p = bootstrapGrant(response.getJSONObject("grant"), true);
    if (!grantId.equals(p.getString("grantId")) || disk.used(grantId))
      throw new IOException("BOOTSTRAP_ALREADY_USED");
    disk.state.put("offer", new JSONObject().put("grant", response.getJSONObject("grant")));
    disk.save();
    return metadata(p).put("versions", response.getJSONArray("versions"));
  }

  private JSONObject offer(String grantId, boolean current) throws Exception {
    JSONObject item = disk.state.getJSONObject("offer"),
        p = bootstrapGrant(item.getJSONObject("grant"), current);
    if (!grantId.equals(p.getString("grantId")) || disk.used(grantId))
      throw new IOException("BOOTSTRAP_SCOPE_MISMATCH");
    return item;
  }

  private byte[] download(JSONObject p, String intent) throws Exception {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    int size = p.getInt("sizeBytes"),
        count = (size + CloudBackupPolicy.CHUNK_BYTES - 1) / CloudBackupPolicy.CHUNK_BYTES;
    for (int index = 0; index < count; index++) {
      JSONObject payload =
          new JSONObject().put("grantId", p.getString("grantId")).put("index", index);
      if (intent != null) payload.put("intentId", intent);
      JSONObject piece = call("bootstrap.download", payload);
      if (!p.getString("backupId").equals(piece.optString("backupId"))
          || piece.optInt("index", -1) != index
          || piece.optInt("sizeBytes") != size
          || piece.optInt("chunkCount") != count
          || !p.getString("sha256").equals(piece.optString("sha256")))
        throw new IOException("INVALID_BOOTSTRAP_DOWNLOAD");
      byte[] raw = Base64.getDecoder().decode(piece.getString("data"));
      if (raw.length > CloudBackupPolicy.CHUNK_BYTES || out.size() + raw.length > size)
        throw new IOException("INVALID_BOOTSTRAP_DOWNLOAD");
      out.write(raw);
    }
    byte[] bytes = out.toByteArray();
    validateSnapshot(bytes, p);
    return bytes;
  }

  private void validateSnapshot(byte[] bytes, JSONObject p) throws Exception {
    if (bytes.length != p.getInt("sizeBytes")
        || !CloudBackupStore.hash(bytes).equals(p.getString("sha256")))
      throw new IOException("BOOTSTRAP_CHECKSUM");
    CloudBackupStore.validateSnapshot(bytes, p.getString("shopId"));
    JSONObject value = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
    JSONArray users = value.getJSONArray("users");
    boolean found = false;
    for (int i = 0; i < users.length(); i++) {
      JSONObject user = users.getJSONObject(i);
      if (p.getString("ownerId").equals(user.optString("id"))
          && "owner".equals(user.optString("role"))
          && user.optBoolean("active", true)) found = true;
    }
    if (!found) throw new IOException("BOOTSTRAP_OWNER_MISMATCH");
  }

  synchronized JSONObject preview(JSONObject input) throws Exception {
    keys(input, "grantId");
    String grant = id(input, "grantId");
    JSONObject item = offer(grant, true), p = bootstrapGrant(item.getJSONObject("grant"), true);
    byte[] bytes = download(p, null);
    disk.snapshot(bytes);
    disk.state.put("previewGrantId", grant);
    disk.save();
    return metadata(p)
        .put("stage", "preview")
        .put("text", new String(bytes, StandardCharsets.UTF_8));
  }

  private void claim(JSONObject pending) throws Exception {
    JSONObject p = bootstrapGrant(pending.getJSONObject("grant"), false),
        answer =
            call(
                "bootstrap.prepare",
                new JSONObject()
                    .put("grantId", p.getString("grantId"))
                    .put("intentId", pending.getString("intentId"))
                    .put("accepted", true));
    JSONObject grant = answer.getJSONObject("grant");
    if (!ProtocolJson.canonical(p).equals(ProtocolJson.canonical(bootstrapGrant(grant, false))))
      throw new IOException("BOOTSTRAP_CLAIM_SCOPE");
    pending.put("claim", answer.getJSONObject("claim"));
    verifyClaim(pending);
    pending.put("stage", "prepared");
    disk.save();
  }

  private JSONObject verifyClaim(JSONObject pending) throws Exception {
    JSONObject p = bootstrapGrant(pending.getJSONObject("grant"), false),
        claim =
            ProtocolJson.verifyEnvelope(
                pending.getJSONObject("claim"), issuers, "contatools-cloud-bootstrap-claim");
    if (claim.length() != p.length() + 2
        || !pending.getString("intentId").equals(claim.optString("intentId"))
        || claim.getLong("claimedAt") < p.getLong("issuedAt")
        || claim.getLong("claimedAt") >= p.getLong("expiresAt"))
      throw new IOException("INVALID_BOOTSTRAP_CLAIM");
    Iterator<String> names = p.keys();
    while (names.hasNext()) {
      String key = names.next();
      if (!ProtocolJson.canonical(p.get(key)).equals(ProtocolJson.canonical(claim.get(key))))
        throw new IOException("BOOTSTRAP_CLAIM_SCOPE");
    }
    return p;
  }

  private JSONObject prepared(JSONObject pending) throws Exception {
    JSONObject p = verifyClaim(pending);
    if (disk.used(p.getString("grantId"))) throw new IOException("BOOTSTRAP_ALREADY_USED");
    byte[] bytes = disk.snapshot();
    validateSnapshot(bytes, p);
    return metadata(p)
        .put("stage", "prepared")
        .put("purpose", "cloud-bootstrap")
        .put("intentId", pending.getString("intentId"))
        .put("text", new String(bytes, StandardCharsets.UTF_8));
  }

  synchronized JSONObject prepare(JSONObject input) throws Exception {
    keys(input, "grantId", "accepted");
    if (!Boolean.TRUE.equals(input.opt("accepted")))
      throw new IOException("BOOTSTRAP_CONSENT_REQUIRED");
    String grantId = id(input, "grantId");
    JSONObject pending = disk.state.optJSONObject("pending");
    if (pending == null) {
      JSONObject item = offer(grantId, true), p = bootstrapGrant(item.getJSONObject("grant"), true);
      if (!grantId.equals(disk.state.optString("previewGrantId")))
        throw new IOException("BOOTSTRAP_PREVIEW_REQUIRED");
      validateSnapshot(disk.snapshot(), p);
      pending =
          new JSONObject()
              .put("stage", "awaiting-claim")
              .put("grant", item.getJSONObject("grant"))
              .put("intentId", UUID.randomUUID().toString());
      disk.state.put("pending", pending);
      disk.save();
    } else if (!grantId.equals(
        pending.getJSONObject("grant").getJSONObject("payload").getString("grantId")))
      throw new IOException("BOOTSTRAP_BUSY");
    return resume();
  }

  synchronized JSONObject resumeLocal() throws Exception {
    JSONObject pending = disk.state.optJSONObject("pending");
    if (pending == null) return new JSONObject().put("stage", "idle");
    if ("applied".equals(pending.optString("stage")))
      return complete(pending).put("ackPending", true);
    if ("awaiting-claim".equals(pending.optString("stage")))
      return new JSONObject().put("stage", "awaiting-network");
    return prepared(pending);
  }

  synchronized JSONObject resume() throws Exception {
    JSONObject pending = disk.state.optJSONObject("pending");
    if (pending == null) return new JSONObject().put("stage", "idle");
    if ("applied".equals(pending.optString("stage"))) return acknowledge(pending);
    if ("awaiting-claim".equals(pending.optString("stage"))) {
      try {
        // Always retry the identical durable intent first: a successful claim
        // response may have been lost, including before the expiry boundary.
        claim(pending);
      } catch (ContatoolsClient.ServiceFailure refusal) {
        if (!refusal.permanent
            || !(refusal.status == 403 || refusal.status == 404
                || refusal.status == 409 || refusal.status == 410)) {
          throw refusal;
        }
        // No verified claim and no local commit exist in this stage. A definitive
        // refusal can release this unused intent so a fresh approval is usable.
        disk.state.remove("pending");
        disk.state.remove("offer");
        disk.state.remove("previewGrantId");
        disk.save();
        disk.clearSnapshot();
        return new JSONObject().put("stage", "expired");
      }
    }
    return prepared(pending);
  }

  private JSONObject complete(JSONObject pending) throws Exception {
    JSONObject p = verifyClaim(pending);
    if (!"applied".equals(pending.optString("stage")) || !disk.used(p.getString("grantId")))
      throw new IOException("BOOTSTRAP_RECEIPT_MISSING");
    return metadata(p).put("stage", "complete").put("intentId", pending.getString("intentId"));
  }

  synchronized JSONObject finish(JSONObject input) throws Exception {
    keys(input, "grantId", "intentId");
    JSONObject pending = disk.state.optJSONObject("pending");
    if (pending == null) {
      JSONObject previous = disk.state.optJSONObject("lastReceipt");
      if (previous != null
          && id(input, "grantId").equals(previous.optString("grantId"))
          && id(input, "intentId").equals(previous.optString("intentId")))
        return ProtocolJson.copy(previous);
      throw new IOException("BOOTSTRAP_RECEIPT_MISSING");
    }
    JSONObject p = verifyClaim(pending);
    if (!p.getString("grantId").equals(id(input, "grantId"))
        || !pending.getString("intentId").equals(id(input, "intentId")))
      throw new IOException("BOOTSTRAP_RECEIPT_SCOPE");
    pending.put("stage", "applied");
    disk.consume(p.getString("grantId"));
    return acknowledge(pending);
  }

  private JSONObject acknowledge(JSONObject pending) throws Exception {
    JSONObject completed = complete(pending);
    try {
      JSONObject result =
          call(
              "bootstrap.finish",
              new JSONObject()
                  .put("grantId", completed.getString("grantId"))
                  .put("intentId", completed.getString("intentId")));
      for (String field : new String[] {"grantId", "intentId", "shopId", "ownerId"})
        if (!completed.getString(field).equals(result.optString(field)))
          throw new IOException("INVALID_BOOTSTRAP_ACK");
      disk.state.put("lastReceipt", completed);
      disk.state.remove("pending");
      disk.state.remove("offer");
      disk.state.remove("previewGrantId");
      disk.save();
      disk.clearSnapshot();
      return completed.put("ackPending", false);
    } catch (Exception failure) {
      return completed.put("ackPending", true);
    }
  }
}
