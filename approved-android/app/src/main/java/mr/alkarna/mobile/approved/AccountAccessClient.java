package mr.alkarna.mobile.approved;

import android.content.Context;
import android.net.*;
import android.os.Build;
import android.os.SystemClock;
import java.io.*;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.text.Normalizer;
import java.util.*;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import javax.net.ssl.HttpsURLConnection;
import org.json.*;

/** Explicit account mode; online authority is RAM-only and never a local licence. */
final class AccountAccessClient {
    static final class Failure extends IOException {
        final int status;
        final String code;
        Failure(int status, String code) { super(code); this.status = status; this.code = code; }
    }
    private final Context context;
    private final DeviceLicense license;
    private final InstallationIdentity identity;
    private final AccountVault vault;
    private final JSONObject issuers;
    private final ContatoolsClient.Transport transport;
    private DeviceLifecycleClient lifecycle;
    private volatile boolean storageFailed;
    private JSONObject stored, bootstrapCredential;
    private volatile JSONObject onlineContext;
    private volatile String mode = "none", sessionToken;
    private String pendingCode;
    private volatile long onlineChecked;
    private volatile boolean networkInvalid;
    private volatile boolean offlineBound;
    private volatile boolean localSetupRequired;
    private static final int ITERATIONS = 210000;

    AccountAccessClient(Context context, DeviceLicense license) throws Exception {
        this(context, license, new JSONObject(BuildConfig.CONTATOOLS_ISSUERS), new AccountTransport(BuildConfig.CONTATOOLS_ORIGIN));
    }
    // Independent test APK injection only; the production constructor always fixes HTTPS origin/issuers.
    AccountAccessClient(Context context, DeviceLicense license, JSONObject issuers, ContatoolsClient.Transport transport) throws Exception {
        this.context = context.getApplicationContext(); this.license = license;
        identity = new InstallationIdentity(); vault = new AccountVault(context, identity.id());
        try { stored = vault.read(); } catch (Exception corrupted) { storageFailed = true; stored = new JSONObject().put("version", 1); }
        this.issuers = ProtocolJson.copy(issuers);
        this.transport = transport;
        refreshLocalFlags();
        if (!storageFailed) try { recoverInitialBinding(); recoverRenewalBinding(); } catch (Exception invalid) { storageFailed = true; }
        refreshLocalFlags();
    }
    boolean onlineMode() { return "online".equals(mode); }
    boolean hasOfflineBinding() { return offlineBound; }
    synchronized boolean enterLocalAutomatically() {
        if (!license.status().optBoolean("valid") || localSetupRequired || stored.optBoolean("preferOnlineEntry")) return false;
        try { command("legacy", new JSONObject()); return true; } catch (Exception unavailable) { return false; }
    }
    synchronized DeviceLifecycleClient lifecycleClient() throws Exception {
        if (lifecycle == null) lifecycle = transport instanceof AccountTransport ? new DeviceLifecycleClient(context, license) : new DeviceLifecycleClient(context, license, issuers, transport);
        return lifecycle;
    }
    boolean admitted() {
        if (storageFailed && !"legacy".equals(mode)) return false;
        if ("online".equals(mode)) return sessionToken != null && onlineContext != null && !networkInvalid && SystemClock.elapsedRealtime() - onlineChecked < 15000;
        return ("offline".equals(mode) || "legacy".equals(mode) && !localSetupRequired) && license.status().optBoolean("valid");
    }
    void disconnected() { networkInvalid = true; }
    private void persist() throws Exception {
        try { vault.write(stored); }
        catch (Exception unavailable) { storageFailed = true; disconnected(); throw new IOException("ACCOUNT_STORAGE_INVALID"); }
    }
    private boolean networkAvailable() {
        if (!(transport instanceof AccountTransport)) return true;
        ConnectivityManager manager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkCapabilities caps = manager == null ? null : manager.getNetworkCapabilities(manager.getActiveNetwork());
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }
    private JSONObject exchange(String operation, JSONObject payload, String token) throws Exception {
        if (!networkAvailable()) { disconnected(); throw new Failure(0, "ACCOUNT_NETWORK_REQUIRED"); }
        JSONObject body = new JSONObject().put("operation", operation).put("payload", payload);
        if (token != null) body.put("sessionToken", token);
        try {
            JSONObject challenge = transport.post("/api/android/access/v1/challenge", body);
            AccountProtocol.proof(challenge, operation, payload, token, identity.id(), BuildConfig.APPLICATION_ID, System.currentTimeMillis());
            return transport.post(AccountProtocol.DISPATCH, new JSONObject(body.toString()).put("challengeId", challenge.getString("challengeId")).put("signature", identity.sign(challenge.getString("message"))));
        } catch (Exception failure) { if ("online".equals(mode)) disconnected(); throw failure; }
    }
    synchronized JSONObject command(String command, JSONObject input) throws Exception {
        if (storageFailed) AccountProtocol.require(Arrays.asList("state", "legacy", "logout").contains(command) || ("legacy".equals(mode) && Arrays.asList("bootstrap", "bootstrap-complete").contains(command)), "ACCOUNT_STORAGE_INVALID");
        switch (command) {
            case "state": return state();
            case "legacy": AccountProtocol.require(license.status().optBoolean("valid"), "LOCAL_LICENSE_REQUIRED"); AccountProtocol.require(!localSetupRequired, "OFFLINE_SETUP_CREDENTIAL_REQUIRED"); preferOnline(false); clearSession(); pendingCode = null; bootstrapCredential = null; mode = "legacy"; return active("legacy");
            case "login": return login(input);
            case "offline-request": return request(input);
            case "offline-status": return offline(false);
            case "offline-activate": return offline(true);
            case "offline-current": return currentLocal();
            case "offline-renew": return renewLocal();
            case "bootstrap": return bootstrap();
            case "bootstrap-complete": return completeBootstrap();
            case "online-status": return refresh();
            case "online-pending": refresh(); return pending();
            case "online-ack": return acknowledgeOnline(input);
            case "online-call": return onlineCall(input);
            case "logout":
                if (sessionToken != null) try { exchange("session.logout", installation(), sessionToken); } catch (Exception ignored) { }
                clearSession(); pendingCode = null; bootstrapCredential = null; mode = "none"; return new JSONObject().put("signedOut", true);
            default: throw new Failure(0, "ACCOUNT_OPERATION_INVALID");
        }
    }
    private JSONObject installation() throws Exception { return new JSONObject().put("installationId", identity.id()); }
    private JSONObject base() throws Exception {
        return installation().put("applicationId", BuildConfig.APPLICATION_ID).put("appVersion", BuildConfig.VERSION_NAME)
                .put("deviceName", (Build.MANUFACTURER + " " + Build.MODEL).trim()).put("publicJwk", identity.publicJwk());
    }
    private JSONObject active(String selected) throws Exception { return new JSONObject().put("stage", "active").put("mode", selected); }
    private void preferOnline(boolean selected) throws Exception {
        if (stored.optBoolean("preferOnlineEntry") == selected) return;
        stored.put("preferOnlineEntry", selected); persist();
    }
    private JSONObject state() throws Exception {
        JSONObject response = new JSONObject().put("mode", mode).put("legacyAvailable", license.status().optBoolean("valid")).put("deviceId", license.deviceCode());
        JSONObject record = stored.optJSONObject("offline"), request = stored.optJSONObject("request");
        if (record != null) response.put("offline", localState(record));
        else if (request != null) response.put("offline", new JSONObject().put("phone", request.getString("identifier")).put("status", "pending"));
        if ("online".equals(mode)) response.put("online", new JSONObject().put("connected", admitted()).put("context", onlineContext == null ? JSONObject.NULL : ProtocolJson.copy(onlineContext)));
        return response;
    }
    private static String identifier(JSONObject input) throws Exception {
        String value = Normalizer.normalize(input.getString("identifier"), Normalizer.Form.NFKC).trim().toLowerCase(Locale.ROOT);
        AccountProtocol.require(value.length() <= 160, "ACCOUNT_IDENTIFIER_INVALID"); return value;
    }
    private static String code(JSONObject input, int minimum) throws Exception {
        String code = input.getString("code"); AccountProtocol.require(code.length() >= minimum && code.length() <= 256, "ACCOUNT_CODE_INVALID"); return code;
    }
    private JSONObject login(JSONObject input) throws Exception {
        String identifier = identifier(input);
        if (identifier.matches("[234][0-9]{7}")) {
            String secret = code(input, 6);
            JSONObject record = stored.optJSONObject("offline");
            if (record != null && identifier.equals(record.getJSONObject("binding").getJSONObject("payload").optString("phone"))) {
                AccountProtocol.require(matches(secret, record.getJSONObject("verifier")), "ACCOUNT_AUTH_INVALID");
                if (!license.status().optBoolean("valid")) {
                    bindingClaims(record, record.getJSONObject("binding"), license.documentHash()); preferOnline(false); clearSession(); bootstrapCredential = null; pendingCode = null; mode = "none";
                    JSONObject state = localState(record); return state.put("stage", state.getString("status")).put("mode", "offline");
                }
                validatedBinding(record); preferOnline(false); bootstrapCredential = new JSONObject().put("phone", identifier).put("code", secret); clearSession(); mode = "offline"; return active("offline");
            }
            JSONObject request = stored.optJSONObject("request");
            if (request != null && identifier.equals(request.optString("identifier"))) {
                AccountProtocol.require(matches(secret, request.getJSONObject("verifier")), "ACCOUNT_AUTH_INVALID");
                pendingCode = secret; return offline(false).put("activationRequired", true);
            }
            return request(new JSONObject(input.toString()).put("phone", identifier));
        }
        AccountProtocol.require(identifier.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+") && input.optBoolean("consent"), "ACCOUNT_IDENTIFIER_INVALID");
        String secret = code(input, 12);
        JSONObject answer = exchange("session.login", base().put("identifier", identifier).put("code", secret), null);
        String token = answer.getString("sessionToken"); AccountProtocol.require(token.matches("[A-Za-z0-9_-]{43}"), "ONLINE_SESSION_INVALID");
        JSONObject claims = AccountProtocol.online(answer, issuers, identity.id(), identity.fingerprint(), BuildConfig.APPLICATION_ID, System.currentTimeMillis());
        JSONObject pending = unresolved();
        if (pending != null) AccountProtocol.require(pending.getString("organizationId").equals(claims.getString("organizationId")) && pending.getString("memberId").equals(claims.getString("memberId")), "ONLINE_PENDING_OTHER_ACCOUNT");
        preferOnline(true); clearSession(); pendingCode = null; bootstrapCredential = null; sessionToken = token; mode = "online"; acceptOnline(answer);
        return active("online").put("context", ProtocolJson.copy(onlineContext));
    }
    private JSONObject request(JSONObject input) throws Exception {
        String phone = input.has("phone") ? input.getString("phone") : identifier(input), secret = code(input, 6);
        AccountProtocol.require(phone.matches("[234][0-9]{7}") && input.optBoolean("consent"), "OFFLINE_REQUEST_INVALID");
        AccountProtocol.require(!stored.has("offline"), "OFFLINE_ALREADY_BOUND");
        boolean linked = input.has("localOwnerId") || input.has("localShopId");
        AccountProtocol.require(!linked || (input.has("localOwnerId") && input.has("localShopId") && license.status().optBoolean("valid")), "OFFLINE_LOCAL_SCOPE_REQUIRED");
        AccountProtocol.require(linked || license.documentHash().isEmpty(), "OFFLINE_LOCAL_SCOPE_REQUIRED");
        JSONObject previous = stored.optJSONObject("request"), payload;
        if (previous != null) {
            AccountProtocol.require(phone.equals(previous.getString("identifier")) && matches(secret, previous.getJSONObject("verifier")), "OFFLINE_REQUEST_PENDING");
            payload = previous.getJSONObject("payload");
            for (String name : new String[]{"localOwnerId", "localShopId"}) AccountProtocol.require(payload.has(name) == input.has(name) && (!input.has(name) || payload.getString(name).equals(input.getString(name))), "OFFLINE_REQUEST_PENDING");
        } else {
            payload = base().put("versionCode", BuildConfig.VERSION_CODE).put("deviceCode", license.deviceCode()).put("identifier", phone).put("requestId", UUID.randomUUID().toString());
            if (linked) {
                for (String name : new String[]{"localOwnerId", "localShopId"}) { String value = input.getString(name); AccountProtocol.require(value.matches("[A-Za-z0-9_.:-]{1,160}"), "OFFLINE_LOCAL_SCOPE_REQUIRED"); payload.put(name, value); }
            }
            try { JSONObject snapshot = license.registrationSnapshot(); payload.put("licenseDocument", snapshot.getString("licenseDocument")).put("remainingSeconds", snapshot.getJSONObject("activation").get("remainingSeconds")); } catch (Exception absent) { if (linked) throw absent; }
            previous = new JSONObject().put("requestId", payload.getString("requestId")).put("identifier", phone).put("payload", payload).put("verifier", verifier(secret));
            stored.put("request", previous); persist();
        }
        pendingCode = secret;
        JSONObject answer = exchange("offline.request", new JSONObject(payload.toString()).put("code", secret), null);
        AccountProtocol.require(payload.getString("requestId").equals(answer.getString("requestId")), "OFFLINE_REQUEST_INVALID");
        return answer;
    }
    private JSONObject offline(boolean adopt) throws Exception {
        JSONObject request = stored.optJSONObject("request");
        AccountProtocol.require(request != null && pendingCode != null && matches(pendingCode, request.getJSONObject("verifier")), "ACCOUNT_LOGIN_REQUIRED");
        long requestStartedAt = SystemClock.elapsedRealtime();
        JSONObject answer = exchange(adopt ? "offline.activate" : "offline.status", installation().put("requestId", request.getString("requestId")).put("identifier", request.getString("identifier")).put("code", pendingCode), null);
        if (!adopt || !"active".equals(answer.optString("stage"))) return answer;
        Object documentValue = answer.get("licenseDocument");
        AccountProtocol.require(documentValue instanceof String || documentValue instanceof JSONObject, "OFFLINE_BINDING_INVALID");
        String document = documentValue.toString();
        JSONObject verified = LicenseVerifier.verify(document, license.deviceCode()), binding = answer.getJSONObject("binding");
        JSONObject claims = AccountProtocol.offline(binding, issuers, request.getJSONObject("payload"), identity.id(), identity.fingerprint(), license.deviceCode(), BuildConfig.APPLICATION_ID, ProtocolJson.hash(verified));
        AccountProtocol.require(claims.getString("licenseId").equals(verified.getJSONObject("payload").getString("licenseId")), "OFFLINE_BINDING_INVALID");
        JSONObject entitlement = answer.optJSONObject("phoneEntitlement");
        JSONObject activation = answer.optJSONObject("activation");
        AccountProtocol.require(activation != null || entitlement != null || license.documentHash().equals(ProtocolJson.hash(verified)), "OFFLINE_ACTIVATION_REQUIRED");
        if (activation != null) { lifecycleClient().validateAccountActivation(activation, verified); AccountProtocol.require(claims.getString("customerId").equals(activation.getJSONObject("payload").getString("clientId")), "OFFLINE_BINDING_SCOPE"); }
        if (entitlement != null) AccountProtocol.require(claims.getString("customerId").equals(PhoneEntitlement.snapshot(entitlement, issuers, identity.id(), identity.fingerprint(), license.deviceCode()).getString("clientId")), "OFFLINE_BINDING_SCOPE");
        JSONObject record = new JSONObject().put("binding", binding).put("request", request.getJSONObject("payload")).put("verifier", request.getJSONObject("verifier"))
                .put("setupRequired", !request.getJSONObject("payload").has("localOwnerId"));
        if (activation != null) record.put("activation", activation).put("activationDocument", verified).put("ackPending", true);
        JSONObject prepared = new JSONObject().put("record", record).put("document", verified);
        if (entitlement != null) {
            JSONObject snapshot=PhoneEntitlement.snapshot(entitlement,issuers,identity.id(),identity.fingerprint(),license.deviceCode());
            prepared.put("phoneEntitlement",entitlement).put("entitlementClock",EntitlementClock.begin(snapshot,null,System.currentTimeMillis(),SystemClock.elapsedRealtime(),Math.max(0,SystemClock.elapsedRealtime()-requestStartedAt)));
        }
        stored.put("pendingActivation", prepared); refreshLocalFlags(); persist();
        JSONObject status = entitlement == null ? license.installOnline(document) : license.installEntitlement(document, entitlement, issuers, identity.id(), identity.fingerprint(), Math.max(0, SystemClock.elapsedRealtime() - requestStartedAt));
        AccountProtocol.require(status.optBoolean("valid"), "LOCAL_LICENSE_REQUIRED");
        finishInitialBinding(record);
        bootstrapCredential = new JSONObject().put("phone", claims.getString("phone")).put("code", pendingCode);
        clearSession(); pendingCode = null; mode = "offline"; return active("offline");
    }
    private JSONObject validatedBinding(JSONObject record) throws Exception {
        AccountProtocol.require(license.status().optBoolean("valid"), "LOCAL_LICENSE_REQUIRED");
        return bindingClaims(record, record.getJSONObject("binding"), license.documentHash());
    }
    private JSONObject bindingClaims(JSONObject record, JSONObject binding, String documentHash) throws Exception {
        return AccountProtocol.offline(binding, issuers, record.getJSONObject("request"), identity.id(), identity.fingerprint(), license.deviceCode(), BuildConfig.APPLICATION_ID, documentHash);
    }
    private void refreshLocalFlags() {
        JSONObject record=stored.optJSONObject("offline"),pending=stored.optJSONObject("pendingActivation");
        JSONObject staged=pending==null?null:pending.optJSONObject("record");
        offlineBound=record!=null;localSetupRequired=record!=null&&record.optBoolean("setupRequired")||pending!=null&&(staged==null||staged.optBoolean("setupRequired"));
    }
    private void finishInitialBinding(JSONObject record) throws Exception {
        stored.put("offline",record);stored.remove("request");stored.remove("pendingActivation");stored.put("preferOnlineEntry",false);persist();refreshLocalFlags();
    }
    /** A crash after licence installation cannot fall back to an unrelated fresh local owner. */
    private void recoverInitialBinding() throws Exception {
        JSONObject pending=stored.optJSONObject("pendingActivation");if(pending==null)return;
        JSONObject record=pending.getJSONObject("record"),document=LicenseVerifier.verify(pending.getJSONObject("document").toString(),license.deviceCode());
        JSONObject claims=bindingClaims(record,record.getJSONObject("binding"),ProtocolJson.hash(document));
        if(!license.documentHash().equals(ProtocolJson.hash(document)))return;
        JSONObject activation=record.optJSONObject("activation");if(activation!=null){lifecycleClient().validateAccountActivation(activation,document);AccountProtocol.require(claims.getString("customerId").equals(activation.getJSONObject("payload").getString("clientId")),"OFFLINE_BINDING_SCOPE");}
        JSONObject entitlement=pending.optJSONObject("phoneEntitlement");if(entitlement!=null){
            JSONObject staged=PhoneEntitlement.snapshot(entitlement,issuers,identity.id(),identity.fingerprint(),license.deviceCode());AccountProtocol.require(claims.getString("customerId").equals(staged.getString("clientId")),"OFFLINE_BINDING_SCOPE");
            JSONObject current=license.status().optJSONObject("entitlement");boolean newer=false;if(current!=null)try{PhoneEntitlement.monotonic(staged,current);newer=true;}catch(Exception older){}
            if(!newer){
                JSONObject observation=pending.getJSONObject("entitlementClock");
                long observationDurationMillis=Math.max(0,EntitlementClock.effective(observation,System.currentTimeMillis(),SystemClock.elapsedRealtime())-PhoneEntitlement.number(staged,"issuedAt"));
                license.entitlement(entitlement,issuers,identity.id(),identity.fingerprint(),observationDurationMillis);
            }
        }
        finishInitialBinding(record);
    }
    private JSONObject completeBootstrap() throws Exception {
        JSONObject record=stored.optJSONObject("offline");
        if(record!=null&&record.optBoolean("setupRequired")){
            AccountProtocol.require("offline".equals(mode)&&bootstrapCredential!=null&&admitted(),"OFFLINE_SETUP_CREDENTIAL_REQUIRED");
            record.put("setupRequired",false);persist();refreshLocalFlags();
        }
        bootstrapCredential=null;return acknowledgeOffline().put("completed",true);
    }
    private JSONObject localState(JSONObject record) throws Exception {
        JSONObject status = license.status(); String code = status.optString("code");
        String selected = status.optBoolean("valid") ? "active" : code.equals("ENTITLEMENT_SUSPENDED") ? "suspended" : code.contains("EXPIRED") ? "expired" : code.equals("ENTITLEMENT_REPLACED") ? "replaced" : "unavailable";
        return new JSONObject().put("phone", record.getJSONObject("binding").getJSONObject("payload").getString("phone"))
                .put("bound", true).put("status", selected).put("setupRequired", record.optBoolean("setupRequired")).put("renewalAvailable", record.optBoolean("renewalAvailable"));
    }
    /** A server response can refresh the same installed binding, never silently install a new document. */
    private JSONObject currentLocal() throws Exception {
        JSONObject record = stored.optJSONObject("offline"); AccountProtocol.require(record != null, "OFFLINE_ACCOUNT_REQUIRED");
        recoverRenewalBinding(); record = stored.getJSONObject("offline"); lifecycleClient().ensureCurrentEnrollment(); acknowledgeOffline();
        long requestStartedAt = SystemClock.elapsedRealtime(); JSONObject answer = exchange("offline.current", installation().put("requestId", record.getJSONObject("request").getString("requestId")), null);
        applyLocalCurrent(record, answer, requestStartedAt);
        try { lifecycleClient().acknowledgeInstalledAccountEntitlement(); } catch (Exception retryLater) { /* Keep the durable accepted receipt and original clock. */ }
        JSONObject state = localState(stored.getJSONObject("offline")); return state.put("stage", state.getString("status")).put("mode", "offline");
    }
    private JSONObject checkedCurrent(JSONObject record, JSONObject answer) throws Exception {
        JSONObject document = LicenseVerifier.verify(answer.get("licenseDocument").toString(), license.deviceCode());
        JSONObject binding = answer.getJSONObject("binding"), previous = record.getJSONObject("binding");
        JSONObject old = bindingClaims(record, previous, previous.getJSONObject("payload").getString("licenseDocumentHash"));
        JSONObject next = bindingClaims(record, binding, ProtocolJson.hash(document)); AccountProtocol.sameOfflineScope(old, next);
        AccountProtocol.require(next.getString("licenseId").equals(document.getJSONObject("payload").getString("licenseId")), "OFFLINE_BINDING_INVALID");
        AccountProtocol.require(record.getJSONObject("request").getString("requestId").equals(answer.getString("requestId")), "OFFLINE_BINDING_INVALID");
        return document;
    }
    private void applyLocalCurrent(JSONObject record, JSONObject answer, long requestStartedAt) throws Exception {
        JSONObject document = checkedCurrent(record, answer), entitlement = answer.optJSONObject("phoneEntitlement");
        if (entitlement != null) {
            JSONObject p = PhoneEntitlement.snapshot(entitlement, issuers, identity.id(), identity.fingerprint(), license.deviceCode());
            AccountProtocol.require(p.getString("licenseDocumentHash").equals(ProtocolJson.hash(document)) && p.getString("licenseId").equals(document.getJSONObject("payload").getString("licenseId")), "OFFLINE_BINDING_INVALID");
            AccountProtocol.require(p.getString("clientId").equals(answer.getJSONObject("binding").getJSONObject("payload").getString("customerId")), "OFFLINE_BINDING_SCOPE");
            license.entitlement(entitlement, issuers, identity.id(), identity.fingerprint(), Math.max(0,SystemClock.elapsedRealtime()-requestStartedAt));
        }
        boolean sameDocument = license.documentHash().equals(ProtocolJson.hash(document));
        if (sameDocument) record.put("binding", ProtocolJson.copy(answer.getJSONObject("binding")));
        record.put("renewalAvailable", answer.optJSONObject("entitlementOffer") != null || !sameDocument); persist();
    }
    /** Stage the new signed same-account binding BEFORE the licence's atomic write. */
    private void stageRenewalBinding(JSONObject document, JSONObject entitlement, long originalObservationDurationMillis) throws Exception {
        long requestStartedAt=SystemClock.elapsedRealtime(); JSONObject record = stored.getJSONObject("offline"); JSONObject answer = exchange("offline.current", installation().put("requestId", record.getJSONObject("request").getString("requestId")), null);
        JSONObject current = checkedCurrent(record, answer), p = PhoneEntitlement.snapshot(entitlement, issuers, identity.id(), identity.fingerprint(), license.deviceCode());
        JSONObject fresh = PhoneEntitlement.snapshot(answer.getJSONObject("phoneEntitlement"), issuers, identity.id(), identity.fingerprint(), license.deviceCode());
        PhoneEntitlement.monotonic(p, fresh);
        AccountProtocol.require(p.getString("clientId").equals(answer.getJSONObject("binding").getJSONObject("payload").getString("customerId")), "OFFLINE_BINDING_SCOPE");
        if (!"active".equals(fresh.getString("status"))) license.entitlement(answer.getJSONObject("phoneEntitlement"), issuers, identity.id(), identity.fingerprint(), Math.max(0,SystemClock.elapsedRealtime()-requestStartedAt));
        AccountProtocol.require("active".equals(fresh.getString("status")) && p.getLong("sequence") == fresh.getLong("sequence") && p.getLong("bindingGeneration") == fresh.getLong("bindingGeneration") && ProtocolJson.hash(document).equals(ProtocolJson.hash(current)), "ENTITLEMENT_STATUS_CHANGED");
        record.put("pendingBinding", new JSONObject().put("binding", ProtocolJson.copy(answer.getJSONObject("binding"))).put("document", ProtocolJson.copy(document))); persist();
    }
    private void recoverRenewalBinding() throws Exception {
        JSONObject record = stored.optJSONObject("offline"), pending = record == null ? null : record.optJSONObject("pendingBinding");
        if (pending == null) return;
        JSONObject document = LicenseVerifier.verify(pending.getJSONObject("document").toString(), license.deviceCode());
        JSONObject previous = record.getJSONObject("binding"); JSONObject old = bindingClaims(record, previous, previous.getJSONObject("payload").getString("licenseDocumentHash"));
        JSONObject next = bindingClaims(record, pending.getJSONObject("binding"), ProtocolJson.hash(document)); AccountProtocol.sameOfflineScope(old, next);
        if (!license.documentHash().equals(ProtocolJson.hash(document))) return;
        record.put("binding", ProtocolJson.copy(pending.getJSONObject("binding"))).put("renewalAvailable", false); record.remove("pendingBinding"); persist();
    }
    private JSONObject renewLocal() throws Exception {
        AccountProtocol.require(stored.has("offline"), "OFFLINE_ACCOUNT_REQUIRED"); currentLocal();
        JSONObject answer = lifecycleClient().activateWithGuard(this::stageRenewalBinding); recoverRenewalBinding();
        if (!license.status().optBoolean("valid")) { JSONObject state = localState(stored.getJSONObject("offline")); return state.put("stage", state.getString("status")); }
        validatedBinding(stored.getJSONObject("offline")); preferOnline(false); clearSession(); pendingCode = null; bootstrapCredential = null;
        if(localSetupRequired){mode="none";return localState(stored.getJSONObject("offline")).put("stage","setup-required").put("mode","none");}mode = "legacy";
        return active("legacy").put("license", license.status()).put("ackPending", answer.optBoolean("ackPending"));
    }
    private JSONObject acknowledgeOffline() throws Exception {
        JSONObject record = stored.optJSONObject("offline");
        if (record == null || !record.optBoolean("ackPending")) return new JSONObject().put("ackPending", false);
        bindingClaims(record, record.getJSONObject("binding"), license.documentHash());
        if (!networkAvailable()) return new JSONObject().put("ackPending", true);
        try {
            lifecycleClient().ensureCurrentEnrollment();
            JSONObject receipt = lifecycleClient().acknowledgeAccountActivation(record.getJSONObject("activation"), record.getJSONObject("activationDocument"));
            if (!receipt.optBoolean("ackPending", true)) { record.put("ackPending", false); persist(); }
            return receipt;
        } catch (Exception retryLater) { return new JSONObject().put("ackPending", true); }
    }
    private JSONObject bootstrap() throws Exception {
        AccountProtocol.require(admitted(), "ACCOUNT_LOGIN_REQUIRED");
        if ("online".equals(mode)) {
            refresh(); JSONObject unresolved = unresolved();
            JSONObject response = new JSONObject().put("mode", "online").put("connected", true).put("context", onlineContext).put("pendingOnline", unresolved != null);
            if (unresolved != null) { sameScope(unresolved); response.put("pendingBranchId", unresolved.getJSONObject("payload").getString("branchId")); }
            return response;
        }
        JSONObject response = new JSONObject().put("mode", mode);
        if ("offline".equals(mode)) {
            response.put("binding", validatedBinding(stored.getJSONObject("offline")));
            if (bootstrapCredential != null) response.put("credential", bootstrapCredential);
        }
        return response;
    }
    private void clearSession() { sessionToken = null; onlineContext = null; onlineChecked = 0; networkInvalid = true; }
    private void acceptOnline(JSONObject answer) throws Exception {
        AccountProtocol.online(answer, issuers, identity.id(), identity.fingerprint(), BuildConfig.APPLICATION_ID, System.currentTimeMillis());
        JSONObject safe = ProtocolJson.copy(answer); safe.remove("sessionToken");
        onlineContext = safe; onlineChecked = SystemClock.elapsedRealtime(); networkInvalid = false;
    }
    private JSONObject refresh() throws Exception {
        AccountProtocol.require("online".equals(mode) && sessionToken != null, "ACCOUNT_LOGIN_REQUIRED");
        JSONObject answer = exchange("access.status", installation(), sessionToken); acceptOnline(answer);
        return ProtocolJson.copy(onlineContext).put("connected", true);
    }
    private JSONObject pending() throws Exception {
        JSONObject pending = unresolved();
        if (pending == null) return new JSONObject().put("pending", false);
        sameScope(pending); JSONObject response = new JSONObject().put("pending", true).put("operation", "sync.push").put("payload", pending.getJSONObject("payload"));
        if (pending.has("result")) response.put("completed", true).put("result", pending.getJSONObject("result"));
        return response;
    }
    private JSONObject unresolved() { JSONObject pending = stored.optJSONObject("onlinePending"); return pending == null ? stored.optJSONObject("onlineCompleted") : pending; }
    private JSONObject acknowledgeOnline(JSONObject input) throws Exception {
        refresh();
        JSONObject completed = stored.optJSONObject("onlineCompleted");
        if (completed == null) {
            JSONObject last = stored.optJSONObject("onlineAcknowledged");
            AccountProtocol.require(last != null, "ONLINE_RECEIPT_ACK_INVALID"); sameScope(last);
            AccountProtocol.require(ProtocolJson.canonical(input.getJSONArray("operationIds")).equals(ProtocolJson.canonical(last.getJSONArray("operationIds"))), "ONLINE_RECEIPT_ACK_INVALID");
            return new JSONObject().put("acknowledged", true);
        }
        sameScope(completed); JSONArray ids = new JSONArray(), commands = completed.getJSONObject("payload").getJSONArray("commands");
        for (int i = 0; i < commands.length(); i++) ids.put(commands.getJSONObject(i).getString("operationId"));
        AccountProtocol.require(ProtocolJson.canonical(ids).equals(ProtocolJson.canonical(input.getJSONArray("operationIds"))), "ONLINE_RECEIPT_ACK_INVALID");
        stored.put("onlineAcknowledged", new JSONObject().put("organizationId", completed.getString("organizationId")).put("memberId", completed.getString("memberId")).put("operationIds", ids));
        stored.remove("onlineCompleted"); persist();
        return new JSONObject().put("acknowledged", true);
    }
    private void sameScope(JSONObject pending) throws Exception {
        AccountProtocol.require(onlineContext != null && pending.getString("organizationId").equals(onlineContext.getJSONObject("organization").getString("id")) && pending.getString("memberId").equals(onlineContext.getJSONObject("member").getString("id")), "ONLINE_PENDING_OTHER_ACCOUNT");
    }
    private JSONObject onlineCall(JSONObject input) throws Exception {
        String operation = input.getString("operation");
        AccountProtocol.require(Arrays.asList("online.bootstrap", "sync.status", "sync.push", "sync.pull").contains(operation), "ACCOUNT_OPERATION_INVALID");
        refresh();
        JSONObject payload = new JSONObject(input.getJSONObject("payload").toString()).put("installationId", identity.id());
        JSONObject pending = unresolved();
        if ("sync.push".equals(operation)) {
            validatePush(payload);
            if (pending != null) {
                sameScope(pending); AccountProtocol.require(pending.getString("hash").equals(ProtocolJson.hash(payload)), "ONLINE_RESULT_UNCERTAIN");
                if (pending.has("result")) return ProtocolJson.copy(pending.getJSONObject("result"));
            }
            else { pending = new JSONObject().put("organizationId", onlineContext.getJSONObject("organization").getString("id")).put("memberId", onlineContext.getJSONObject("member").getString("id")).put("hash", ProtocolJson.hash(payload)).put("payload", payload); stored.put("onlinePending", pending); persist(); }
        }
        JSONObject answer = exchange(operation, payload, sessionToken);
        if ("sync.push".equals(operation)) {
            JSONArray commands = payload.getJSONArray("commands"), receipts = answer.getJSONArray("receipts");
            AccountProtocol.require(commands.length() == receipts.length(), "ONLINE_RECEIPT_INVALID");
            HashSet<String> ids = new HashSet<>();
            for (int i = 0; i < commands.length(); i++) {
                JSONObject command = commands.getJSONObject(i); String id = command.getString("operationId");
                AccountProtocol.require(ids.add(id), "ONLINE_RECEIPT_INVALID"); JSONObject match = null;
                for (int j = 0; j < receipts.length(); j++) if (id.equals(receipts.getJSONObject(j).optString("operationId"))) { AccountProtocol.require(match == null, "ONLINE_RECEIPT_INVALID"); match = receipts.getJSONObject(j); }
                AccountProtocol.require(match != null && ProtocolJson.hash(command).equals(match.getString("hash")) && Arrays.asList("accepted", "needs-settlement", "blocked").contains(match.getString("status")), "ONLINE_RECEIPT_INVALID");
            }
            JSONObject completed = ProtocolJson.copy(stored.getJSONObject("onlinePending")).put("result", ProtocolJson.copy(answer));
            stored.put("onlineCompleted", completed); stored.remove("onlinePending"); persist();
        }
        return answer;
    }
    private void validatePush(JSONObject payload) throws Exception {
        AccountProtocol.require(payload.length() == 4 && payload.has("installationId") && payload.has("branchId") && payload.has("epoch") && payload.has("commands"), "ONLINE_COMMAND_INVALID");
        String branch = payload.getString("branchId"); boolean allowed = false;
        JSONArray branches = onlineContext.getJSONArray("branches");
        for (int i = 0; i < branches.length(); i++) if (branch.equals(branches.getJSONObject(i).getString("id"))) allowed = true;
        AccountProtocol.require(allowed && payload.getLong("epoch") > 0, "ONLINE_COMMAND_SCOPE");
        JSONArray commands = payload.getJSONArray("commands"); AccountProtocol.require(commands.length() > 0 && commands.length() <= 100, "ONLINE_COMMAND_INVALID");
        HashSet<String> ids = new HashSet<>();
        for (int i = 0; i < commands.length(); i++) {
            JSONObject command = commands.getJSONObject(i); String id = command.getString("operationId");
            AccountProtocol.require(id.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}") && ids.add(id)
                    && command.getString("organizationId").equals(onlineContext.getJSONObject("organization").getString("id"))
                    && command.getString("authorMemberId").equals(onlineContext.getJSONObject("member").getString("id"))
                    && command.getString("branchId").equals(branch) && command.getLong("epoch") == payload.getLong("epoch"), "ONLINE_COMMAND_SCOPE");
            ProtocolJson.hash(command);
        }
        // Reserve the complete dispatch envelope budget before any durable pending write.
        JSONObject envelope = new JSONObject().put("operation", "sync.push").put("payload", payload).put("sessionToken", sessionToken)
                .put("challengeId", padding(160)).put("signature", padding(86));
        AccountProtocol.require(envelope.toString().getBytes(StandardCharsets.UTF_8).length <= 1048576, "ACCOUNT_REQUEST_TOO_LARGE");
    }
    private static String padding(int length) { char[] value = new char[length]; Arrays.fill(value, 'a'); return new String(value); }
    private static JSONObject verifier(String code) throws Exception {
        byte[] salt = new byte[32]; new SecureRandom().nextBytes(salt);
        return new JSONObject().put("iterations", ITERATIONS).put("salt", ProtocolJson.base64(salt)).put("hash", ProtocolJson.base64(derive(code, salt, ITERATIONS)));
    }
    private static byte[] derive(String code, byte[] salt, int iterations) throws Exception {
        PBEKeySpec spec = new PBEKeySpec(code.toCharArray(), salt, iterations, 256);
        try { return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded(); } finally { spec.clearPassword(); }
    }
    private static boolean matches(String code, JSONObject verifier) throws Exception {
        int iterations = verifier.getInt("iterations"); AccountProtocol.require(iterations == ITERATIONS, "ACCOUNT_STORAGE_INVALID");
        return MessageDigest.isEqual(derive(code, ProtocolJson.decode(verifier.getString("salt")), iterations), ProtocolJson.decode(verifier.getString("hash")));
    }
    private static final class AccountTransport implements ContatoolsClient.Transport {
        private final String origin;
        AccountTransport(String endpoint) throws Exception {
            URL url = new URL(endpoint);
            AccountProtocol.require("https".equals(url.getProtocol()) && url.getUserInfo() == null && (url.getPort() == -1 || url.getPort() == 443) && url.getQuery() == null && url.getRef() == null && (url.getPath().isEmpty() || "/".equals(url.getPath())), "ACCOUNT_ENDPOINT_INVALID");
            origin = endpoint.replaceAll("/+$", "");
        }
        public JSONObject post(String path, JSONObject body) throws Exception {
            AccountProtocol.require(path.equals(AccountProtocol.DISPATCH) || path.equals("/api/android/access/v1/challenge"), "ACCOUNT_ENDPOINT_INVALID");
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8); AccountProtocol.require(bytes.length <= 1048576, "ACCOUNT_REQUEST_TOO_LARGE");
            HttpsURLConnection connection = (HttpsURLConnection) new URL(origin + path).openConnection();
            try {
                connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(12000); connection.setReadTimeout(15000); connection.setRequestMethod("POST");
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8"); connection.setRequestProperty("Accept", "application/json");
                connection.setDoOutput(true); connection.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream output = connection.getOutputStream()) { output.write(bytes); }
                int status = connection.getResponseCode(); InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                if (stream != null) try (InputStream input = stream) { byte[] buffer = new byte[16384]; int n; while ((n = input.read(buffer)) != -1) { if (output.size() + n > 16 * 1024 * 1024) throw new Failure(status, "ACCOUNT_RESPONSE_TOO_LARGE"); output.write(buffer, 0, n); } }
                JSONObject response;
                try { response = new JSONObject(output.toString("UTF-8")); } catch (Exception invalid) { throw new Failure(status, "ACCOUNT_SERVICE_UNAVAILABLE"); }
                if (status < 200 || status >= 300) { String error = response.optString("code", "ACCOUNT_SERVICE_UNAVAILABLE"); throw new Failure(status, error.matches("[A-Z0-9_]{3,100}") ? error : "ACCOUNT_SERVICE_UNAVAILABLE"); }
                return response;
            } finally { java.util.Arrays.fill(bytes, (byte) 0); connection.disconnect(); }
        }
    }
}
