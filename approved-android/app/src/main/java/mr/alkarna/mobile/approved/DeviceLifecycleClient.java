package mr.alkarna.mobile.approved;

import android.content.Context;
import android.os.SystemClock;
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

  private static final class TerminalOutcome extends Exception {
    final JSONObject value;

    TerminalOutcome(JSONObject value) {
      this.value = value;
    }
  }

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
    if (operation.startsWith("bootstrap.")) wire.put("protocolVersion", 2);
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
    long dispatchStarted=SystemClock.elapsedRealtime();
    JSONObject response =
        transport.post(
            "/api/android/lifecycle/dispatch",
            new JSONObject()
                .put("operation", operation)
                .put("payload", wire)
                .put("challengeId", challenge.getString("id"))
                .put("signature", identity.sign(message)));
    response.put("_nativeEntitlementObservationStart",dispatchStarted);
    if (operation.startsWith("bootstrap.") && "terminal".equals(response.optString("stage"))) {
      throw new TerminalOutcome(
          acceptOutcome(response, savedBootstrap(payload.getString("grantId"))));
    }
    return response;
  }

  private JSONObject savedBootstrap(String grantId) throws Exception {
    for (String slot : new String[] {"pending", "offer"}) {
      JSONObject item = disk.state.optJSONObject(slot);
      if (item != null
          && grantId.equals(
              item.getJSONObject("grant").getJSONObject("payload").optString("grantId"))) {
        return item;
      }
    }
    for (String slot : new String[] {"terminalOffers", "archives"}) {
      JSONObject saved = disk.state.optJSONObject(slot);
      if (saved != null && saved.optJSONObject(grantId) != null)
        return saved.getJSONObject(grantId);
    }
    throw new IOException("BOOTSTRAP_SCOPE_MISMATCH");
  }

  private String localIntent(JSONObject item) {
    return item.optString("intentId", "");
  }

  private JSONObject cachedTerminal(String grantId) throws Exception {
    for (String slot : new String[] {"pending", "offer"}) {
      JSONObject item = disk.state.optJSONObject(slot);
      if (item != null
          && grantId.equals(
              item.getJSONObject("grant").getJSONObject("payload").optString("grantId"))) {
        return terminal(item);
      }
    }
    for (String slot : new String[] {"terminalOffers", "archives"}) {
      JSONObject saved = disk.state.optJSONObject(slot);
      if (saved != null && saved.optJSONObject(grantId) != null)
        return terminal(saved.getJSONObject(grantId));
    }
    return null;
  }

  private JSONObject terminal(JSONObject item) throws Exception {
    JSONObject envelope = item.optJSONObject("outcome");
    if (envelope == null) return null;
    JSONObject payload =
        BootstrapOutcome.verify(
            envelope,
            issuers,
            item.getJSONObject("grant"),
            localIntent(item),
            identity.id(),
            identity.fingerprint(),
            license.deviceCode());
    if (item.has("claim") && payload.getString("outcome").endsWith("-unclaimed")) {
      throw new IOException("BOOTSTRAP_OUTCOME_CONTRADICTS_CLAIM");
    }
    JSONObject grant = bootstrapGrant(item.getJSONObject("grant"), false);
    return metadata(grant)
        .put("stage", "terminal")
        .put("purpose", "cloud-bootstrap")
        .put("intentId", localIntent(item))
        .put("localPhase", item.optString("stage", "preview"))
        .put("ackPending", false)
        .put(
            "outcome",
            new JSONObject()
                .put("status", payload.getString("outcome"))
                .put("reasonCode", payload.getString("reasonCode"))
                .put("decisionId", payload.getString("decisionId"))
                .put("decidedAt", payload.getLong("decidedAt"))
                .put("minVersionCode", 26)
                .put("chainGeneration", payload.getLong("fenceGeneration"))
                .put("replacementGrantId", payload.getString("replacementGrantId")));
  }

  private JSONObject acceptOutcome(JSONObject response, JSONObject item) throws Exception {
    if (!"terminal".equals(response.optString("stage"))) return null;
    JSONObject envelope = response.getJSONObject("outcome");
    BootstrapOutcome.verify(
        envelope,
        issuers,
        item.getJSONObject("grant"),
        localIntent(item),
        identity.id(),
        identity.fingerprint(),
        license.deviceCode());
    JSONObject candidate = ProtocolJson.copy(item).put("outcome", ProtocolJson.copy(envelope));
    terminal(candidate); // Validate local signed-claim consistency before changing durable state.
    // Preserve the original stage, intent, signed claim, used receipt and bytes.
    // A signed permanent decision closes only this optional recovery authority.
    item.put("outcome", ProtocolJson.copy(envelope));
    if (!item.has("stage")) {
      JSONObject history = disk.state.optJSONObject("terminalOffers");
      if (history == null) history = new JSONObject();
      history.put(
          item.getJSONObject("grant").getJSONObject("payload").getString("grantId"),
          ProtocolJson.copy(item));
      disk.state.put("terminalOffers", history);
    }
    disk.save();
    return terminal(item);
  }

  private byte[] snapshotFor(JSONObject item) throws Exception {
    return item.has("snapshotGrantId")
        ? disk.previewSnapshot(item.getString("snapshotGrantId"))
        : disk.snapshot();
  }

  private void archiveClosedPending(JSONObject pending) throws Exception {
    if (terminal(pending) == null) throw new IOException("BOOTSTRAP_BUSY");
    JSONObject grant = bootstrapGrant(pending.getJSONObject("grant"), false);
    byte[] bytes = snapshotFor(pending);
    validateSnapshot(bytes, grant);
    String grantId = grant.getString("grantId");
    disk.archiveSnapshot(grantId, bytes);
    JSONObject history = disk.state.optJSONObject("archives");
    if (history == null) history = new JSONObject();
    history.put(
        grantId,
        ProtocolJson.copy(pending)
            .put("archiveSnapshotId", grantId)
            .put("wasConsumed", disk.used(grantId)));
    disk.state.put("archives", history);
    // Save the archive before replacing pending. A crash leaves the old phase
    // and bytes usable; status/preview alone never performs this transition.
    disk.save();
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
        .put("enrolledVersionCode", BuildConfig.VERSION_CODE)
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
    JSONObject entitlement=entitlementResponse(response);
    if ("terminal".equals(response.optString("stage"))) {
      String grantId =
          response.getJSONObject("outcome").getJSONObject("payload").getString("grantId");
      return acceptOutcome(response, savedBootstrap(grantId));
    }
    JSONObject result =
        new JSONObject()
            .put("status", response.optString("status", "pending"))
            .put("deviceCode", license.deviceCode())
            .put("installationId", identity.id())
            .put("activationAvailable", false)
            .put("bootstrapAvailable", false);
    if(entitlement!=null)result.put("entitlement",entitlement);
    JSONObject entitlementOffer=disk.state.optJSONObject("entitlementOffer"),entitlementPending=disk.state.optJSONObject("entitlementPending");
    boolean pendingAccepted=entitlementPending!=null&&!entitlementPending.has("outcome");
    if(entitlementOffer!=null||pendingAccepted)result.put("entitlementAvailable",true).put("entitlementKind",entitlementOffer!=null?entitlementOffer.getJSONObject("payload").getString("kind"):entitlementPending.getJSONObject("offer").getJSONObject("payload").getString("kind")).put("activationAvailable",true);
    if (response.has("clientId")) result.put("clientId", response.opt("clientId"));
    JSONObject activation = response.optJSONObject("activation");
    if (activation != null && entitlement==null) {
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
        JSONObject pending = disk.state.optJSONObject("pending");
        if (pending == null
            || (terminal(pending) != null
                && !p.getString("grantId")
                    .equals(
                        pending
                            .getJSONObject("grant")
                            .getJSONObject("payload")
                            .getString("grantId")))) {
          disk.state.put("offer", bootstrap);
        }
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
          || disk.state.optInt("enrolledVersionCode") != BuildConfig.VERSION_CODE
          || !hash.equals(disk.state.optString("enrolledLicenseHash"))
          || System.currentTimeMillis() - disk.state.optLong("lastEnrollmentAt") >= 60000)
        enroll(new JSONObject());
    }
    JSONObject pending = disk.state.optJSONObject("activationPending");
    if (pending != null && installed(pending)) activate();
    JSONObject result=sanitize(call("status",new JSONObject())),entitlement=disk.state.optJSONObject("entitlementPending");
    if(entitlement!=null&&!entitlement.has("outcome")&&entitlementInstalled(entitlement)){
      try{return activateEntitlement(entitlement);}catch(Exception acknowledgement){result.put("entitlementAckPending",true);}
    }
    return result;
  }

  /** Optional sibling documents never change the legacy request or ten-field activation contract. */
  private JSONObject entitlementResponse(JSONObject response) throws Exception {
    JSONObject envelope=response.optJSONObject("entitlement"),value=null;
    if(envelope!=null){
      if(response.has("entitlementProtocol")&&response.optInt("entitlementProtocol")!=1)throw new IOException("ENTITLEMENT_PROTOCOL_REQUIRED");
      value=PhoneEntitlement.snapshot(envelope,issuers,identity.id(),identity.fingerprint(),license.deviceCode());
      JSONObject previous=disk.state.optJSONObject("entitlementSnapshot");
      PhoneEntitlement.monotonic(previous==null?null:PhoneEntitlement.snapshot(previous,issuers,identity.id(),identity.fingerprint(),license.deviceCode()),value);
      license.entitlement(envelope,issuers,identity.id(),identity.fingerprint(),observation(response));
      disk.state.put("entitlementSnapshot",ProtocolJson.copy(envelope));
      JSONObject pending=disk.state.optJSONObject("entitlementPending");
      if(pending!=null){
        JSONObject offered=pending.getJSONObject("offer").getJSONObject("payload");
        boolean same=offered.getString("offerId").equals(value.getString("decisionId"))&&pending.getString("intentId").equals(value.getString("intentId"));
        if("replaced".equals(value.getString("status"))||!same&&PhoneEntitlement.number(value,"bindingGeneration")>PhoneEntitlement.number(offered,"expectedGeneration"))pending.put("outcome",ProtocolJson.copy(envelope));
      }
    }
    JSONObject offer=response.optJSONObject("entitlementOffer");
    if(offer!=null){
      if(response.has("entitlementProtocol")&&response.optInt("entitlementProtocol")!=1)throw new IOException("ENTITLEMENT_PROTOCOL_REQUIRED");
      JSONObject pending=disk.state.optJSONObject("entitlementPending");
      boolean durable=pending!=null&&offer.getJSONObject("payload").optString("offerId").equals(pending.getJSONObject("offer").getJSONObject("payload").optString("offerId"));
      PhoneEntitlement.offer(offer,issuers,identity.id(),identity.fingerprint(),license.deviceCode(),!durable,System.currentTimeMillis());
      disk.state.put("entitlementOffer",ProtocolJson.copy(offer));
    }else disk.state.remove("entitlementOffer");
    disk.save();return value;
  }
  private boolean entitlementInstalled(JSONObject pending) throws Exception {
    JSONObject prepared=pending.optJSONObject("prepared");
    return prepared!=null&&ProtocolJson.hash(prepared.getJSONObject("document")).equals(license.documentHash());
  }
  private long observation(JSONObject response){return response.has("_nativeEntitlementObservationStart")?Math.max(0,SystemClock.elapsedRealtime()-response.optLong("_nativeEntitlementObservationStart")):0;}
  private JSONObject beginEntitlement(JSONObject envelope) throws Exception {
    JSONObject p=PhoneEntitlement.offer(envelope,issuers,identity.id(),identity.fingerprint(),license.deviceCode(),true,System.currentTimeMillis());
    JSONObject old=disk.state.optJSONObject("entitlementPending");
    if(old!=null){
      if(p.getString("offerId").equals(old.getJSONObject("offer").getJSONObject("payload").getString("offerId")))return activateEntitlement(old);
      JSONObject history=disk.state.optJSONObject("entitlementHistory");if(history==null)history=new JSONObject();
      if(history.length()>=50)throw new IOException("ENTITLEMENT_HISTORY_FULL");
      history.put(old.getJSONObject("offer").getJSONObject("payload").getString("offerId"),ProtocolJson.copy(old));disk.state.put("entitlementHistory",history);
    }
    JSONObject pending=new JSONObject().put("offer",ProtocolJson.copy(envelope)).put("intentId",UUID.randomUUID().toString()).put("stage","offered");
    disk.state.put("entitlementPending",pending);disk.save();return activateEntitlement(pending);
  }
  private JSONObject activateEntitlement(JSONObject pending) throws Exception {
    JSONObject offer=PhoneEntitlement.offer(pending.getJSONObject("offer"),issuers,identity.id(),identity.fingerprint(),license.deviceCode(),false,System.currentTimeMillis());
    if(pending.has("outcome"))return new JSONObject().put("stage","entitlement-replaced").put("entitlement",PhoneEntitlement.snapshot(pending.getJSONObject("outcome"),issuers,identity.id(),identity.fingerprint(),license.deviceCode()));
    String offerId=offer.getString("offerId"),intent=pending.getString("intentId");
    JSONObject prepared=pending.optJSONObject("prepared");
    if(prepared==null){
      prepared=call("entitlement.claim",new JSONObject().put("offerId",offerId).put("intentId",intent).put("accepted",true));
      if(prepared.has("entitlement")&&!"entitlement-prepared".equals(prepared.optString("stage"))){entitlementResponse(prepared);return new JSONObject().put("stage","entitlement-replaced").put("entitlement",prepared.getJSONObject("entitlement").getJSONObject("payload"));}
      if(!"entitlement-prepared".equals(prepared.optString("stage"))||!offerId.equals(prepared.optString("offerId"))||!intent.equals(prepared.optString("intentId")))throw new IOException("ENTITLEMENT_CLAIM_MISMATCH");
      JSONObject p=PhoneEntitlement.snapshot(prepared.getJSONObject("entitlement"),issuers,identity.id(),identity.fingerprint(),license.deviceCode());
      PhoneEntitlement.claimed(offer,p,intent,ProtocolJson.hash(prepared.getJSONObject("document")));
      pending.put("prepared",ProtocolJson.copy(prepared)).put("stage","prepared");disk.save();
    }
    // A received old claim is not permission to install after another replacement.
    JSONObject fresh=call("status",new JSONObject());
    JSONObject p=entitlementResponse(fresh);
    if(p==null)throw new IOException("ENTITLEMENT_PROTOCOL_REQUIRED");
    if(!"active".equals(p.getString("status"))){pending.put("outcome",fresh.getJSONObject("entitlement"));disk.save();return new JSONObject().put("stage","entitlement-replaced").put("entitlement",p);}
    PhoneEntitlement.claimed(offer,p,intent,ProtocolJson.hash(prepared.getJSONObject("document")));
    JSONObject original=PhoneEntitlement.snapshot(prepared.getJSONObject("entitlement"),issuers,identity.id(),identity.fingerprint(),license.deviceCode());PhoneEntitlement.monotonic(original,p);
    JSONObject active=license.installEntitlement(prepared.getJSONObject("document").toString(),fresh.getJSONObject("entitlement"),issuers,identity.id(),identity.fingerprint(),observation(fresh));
    pending.put("stage","installed");disk.save();
    JSONObject result=new JSONObject().put("stage","activated").put("license",active).put("entitlement",p).put("offerId",offerId);
    try{
      JSONObject ack=call("entitlement.finish",new JSONObject().put("offerId",offerId).put("intentId",intent).put("licenseDocumentHash",p.getString("licenseDocumentHash")));
      JSONObject finalSnapshot=entitlementResponse(ack);
      if(!"entitlement-complete".equals(ack.optString("stage"))||!offerId.equals(ack.optString("offerId"))||!intent.equals(ack.optString("intentId"))||finalSnapshot==null||!"active".equals(finalSnapshot.getString("status"))){pending.put("outcome",ack.getJSONObject("entitlement"));disk.save();return result.put("stage","entitlement-replaced").put("entitlement",finalSnapshot);}
      pending.put("stage","complete");disk.state.put("entitlementReceipt",ProtocolJson.copy(pending));disk.state.remove("entitlementPending");disk.state.remove("entitlementOffer");disk.save();return result.put("ackPending",false);
    }catch(Exception unavailable){return result.put("ackPending",true);}
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
    JSONObject entitlementPending=disk.state.optJSONObject("entitlementPending"),entitlementOffer=disk.state.optJSONObject("entitlementOffer");
    if(entitlementOffer!=null&&(entitlementPending==null||!entitlementOffer.getJSONObject("payload").getString("offerId").equals(entitlementPending.getJSONObject("offer").getJSONObject("payload").getString("offerId"))))return beginEntitlement(entitlementOffer);
    if(entitlementPending!=null&&(!entitlementPending.has("outcome")||entitlementOffer==null))return activateEntitlement(entitlementPending);
    if(entitlementOffer!=null)return beginEntitlement(entitlementOffer);
    JSONObject offer = disk.state.optJSONObject("activationPending");
    boolean applied = offer != null && installed(offer);
    if (!applied) {
      JSONObject response = call("status", new JSONObject());
      JSONObject entitlement=entitlementResponse(response);
      if(response.optJSONObject("entitlementOffer")!=null)return beginEntitlement(response.getJSONObject("entitlementOffer"));
      if(entitlement!=null&&!"active".equals(entitlement.getString("status")))return new JSONObject().put("stage","entitlement-replaced").put("entitlement",entitlement);
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

  /** Account approval already installed this exact signed document. ACK is not a new activation. */
  synchronized void validateAccountActivation(JSONObject grant, JSONObject document) throws Exception {
    JSONObject offer = new JSONObject().put("grant", grant).put("licenseDocument", document);
    boolean applied = installed(offer);
    JSONObject p = activation(offer, !applied);
    sequence(p);
    noDowngrade(document);
  }

  /** Account approval already installed this exact signed document. ACK is not a new activation. */
  synchronized JSONObject acknowledgeAccountActivation(JSONObject grant, JSONObject document) throws Exception {
    JSONObject offer = new JSONObject().put("grant", grant).put("licenseDocument", document);
    JSONObject p = activation(offer, false);
    if (!installed(offer)) throw new IOException("ACCOUNT_ACTIVATION_NOT_INSTALLED");
    sequence(p);
    disk.state.put("activationPending", offer).put("licenseSequence", p.getLong("sequence"))
        .put("lastIssuanceId", p.getString("issuanceId")).put("lastLicenseHash", p.getString("licenseDocumentHash"));
    disk.save();
    JSONObject result = new JSONObject().put("issuanceId", p.getString("issuanceId"));
    try {
      JSONObject receipt = call("license.accept", new JSONObject().put("issuanceId", p.getString("issuanceId")));
      if (!p.getString("issuanceId").equals(receipt.optString("issuanceId"))) throw new IOException("INVALID_ACTIVATION_ACK");
      JSONObject pending = disk.state.optJSONObject("activationPending");
      if (pending != null && p.getString("issuanceId").equals(pending.getJSONObject("grant").getJSONObject("payload").optString("issuanceId"))) disk.state.remove("activationPending");
      disk.save();return result.put("ackPending", false);
    } catch (Exception unavailable) { return result.put("ackPending", true); }
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
    JSONObject closed = cachedTerminal(grantId);
    if (closed != null) return closed;
    try {
      JSONObject response = call("bootstrap.list", new JSONObject().put("grantId", grantId)),
          p = bootstrapGrant(response.getJSONObject("grant"), true);
      if (!grantId.equals(p.getString("grantId")) || disk.used(grantId))
        throw new IOException("BOOTSTRAP_ALREADY_USED");
      disk.state.put("offer", new JSONObject().put("grant", response.getJSONObject("grant")));
      disk.save();
      return metadata(p).put("versions", response.getJSONArray("versions"));
    } catch (TerminalOutcome closedOutcome) {
      return closedOutcome.value;
    }
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
    JSONObject closed = cachedTerminal(grant);
    if (closed != null) return closed;
    try {
      JSONObject item = offer(grant, false), p = bootstrapGrant(item.getJSONObject("grant"), false);
      byte[] bytes = download(p, null);
      disk.previewSnapshot(grant, bytes);
      disk.state.put("previewGrantId", grant);
      disk.save();
      return metadata(p)
          .put("stage", "preview")
          .put("text", new String(bytes, StandardCharsets.UTF_8));
    } catch (TerminalOutcome closedOutcome) {
      return closedOutcome.value;
    }
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
    JSONObject candidate = ProtocolJson.copy(pending).put("claim", answer.getJSONObject("claim"));
    verifyClaim(candidate);
    pending.put("claim", candidate.getJSONObject("claim"));
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
    byte[] bytes = snapshotFor(pending);
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
    JSONObject closed = cachedTerminal(grantId);
    if (closed != null) return closed;
    JSONObject pending = disk.state.optJSONObject("pending");
    if (pending != null
        && !grantId.equals(
            pending.getJSONObject("grant").getJSONObject("payload").getString("grantId"))) {
      if (terminal(pending) == null) throw new IOException("BOOTSTRAP_BUSY");
      JSONObject selected = offer(grantId, false);
      if (!grantId.equals(disk.state.optString("previewGrantId")))
        throw new IOException("BOOTSTRAP_PREVIEW_REQUIRED");
      validateSnapshot(
          disk.previewSnapshot(grantId), bootstrapGrant(selected.getJSONObject("grant"), false));
      archiveClosedPending(pending);
      pending = null;
    }
    if (pending == null) {
      JSONObject item = offer(grantId, false),
          p = bootstrapGrant(item.getJSONObject("grant"), false);
      if (!grantId.equals(disk.state.optString("previewGrantId")))
        throw new IOException("BOOTSTRAP_PREVIEW_REQUIRED");
      validateSnapshot(disk.previewSnapshot(grantId), p);
      pending =
          new JSONObject()
              .put("stage", "awaiting-claim")
              .put("grant", item.getJSONObject("grant"))
              .put("snapshotGrantId", grantId)
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
    if (pending == null) {
      JSONObject offer = disk.state.optJSONObject("offer");
      JSONObject closed = offer == null ? null : terminal(offer);
      return closed != null ? closed : new JSONObject().put("stage", "idle");
    }
    JSONObject closed = terminal(pending);
    if (closed != null) return closed;
    if ("applied".equals(pending.optString("stage")))
      return complete(pending).put("ackPending", true);
    if ("awaiting-claim".equals(pending.optString("stage")))
      return new JSONObject().put("stage", "awaiting-network");
    return prepared(pending);
  }

  synchronized JSONObject resume() throws Exception {
    JSONObject pending = disk.state.optJSONObject("pending");
    if (pending == null) return resumeLocal();
    JSONObject closed = terminal(pending);
    if (closed != null) return closed;
    if ("applied".equals(pending.optString("stage"))) return acknowledge(pending);
    try {
      // Revalidate the identical durable claim before a new local commit. A
      // cached v25 prepared claim can have been fenced while the phone was away.
      // HTTP errors alone never prove a final decision and never erase intent.
      claim(pending);
    } catch (TerminalOutcome closedOutcome) {
      return closedOutcome.value;
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
    JSONObject closed = cachedTerminal(id(input, "grantId"));
    if (closed != null) {
      if (!id(input, "intentId").equals(closed.getString("intentId")))
        throw new IOException("BOOTSTRAP_RECEIPT_SCOPE");
      return closed;
    }
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
      if (pending.has("snapshotGrantId"))
        disk.clearPreviewSnapshot(pending.getString("snapshotGrantId"));
      disk.clearSnapshot();
      return completed.put("ackPending", false);
    } catch (TerminalOutcome closedOutcome) {
      return closedOutcome.value;
    } catch (Exception failure) {
      return completed.put("ackPending", true);
    }
  }
}
