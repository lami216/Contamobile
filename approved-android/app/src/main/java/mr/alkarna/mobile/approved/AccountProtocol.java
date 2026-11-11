package mr.alkarna.mobile.approved;

import java.io.IOException;
import java.time.Instant;
import java.util.Arrays;
import java.util.HashSet;
import org.json.*;

/** Closed wire checks kept independent of Android storage and UI. */
final class AccountProtocol {
    static final String DISPATCH = "/api/android/access/v1/dispatch";
    static void require(boolean condition, String code) throws IOException { if (!condition) throw new IOException(code); }
    static long time(String value) throws Exception { return Instant.parse(value).toEpochMilli(); }
    static void proof(JSONObject challenge, String operation, JSONObject payload, String token,
                      String installation, String application, long now) throws Exception {
        String message = challenge.getString("message");
        require(message.length() <= 8192, "ACCOUNT_PROOF_INVALID");
        JSONObject p = new JSONObject(message);
        HashSet<String> names = new HashSet<>(Arrays.asList("schema", "version", "method", "path", "operation", "applicationId", "installationId", "nonce", "payloadHash", "sessionTokenHash", "issuedAt", "expiresAt"));
        require(p.length() == names.size(), "ACCOUNT_PROOF_INVALID");
        for (String key : names) require(p.has(key), "ACCOUNT_PROOF_INVALID");
        require(message.equals(ProtocolJson.canonical(p)), "ACCOUNT_PROOF_INVALID");
        require("contatools-android-access-proof".equals(p.getString("schema")) && p.getInt("version") == 1
                && "POST".equals(p.getString("method")) && DISPATCH.equals(p.getString("path"))
                && operation.equals(p.getString("operation")) && application.equals(p.getString("applicationId"))
                && installation.equals(p.getString("installationId")) && ProtocolJson.hash(payload).equals(p.getString("payloadHash")), "ACCOUNT_PROOF_INVALID");
        require(token == null ? p.isNull("sessionTokenHash") : ProtocolJson.hash(token).equals(p.getString("sessionTokenHash")), "ACCOUNT_PROOF_INVALID");
        require(p.getString("nonce").matches("[A-Za-z0-9_-]{20,128}") && challenge.getString("challengeId").matches("[A-Za-z0-9_-]{16,160}"), "ACCOUNT_PROOF_INVALID");
        long issued = time(p.getString("issuedAt")), expires = time(p.getString("expiresAt"));
        require(expires > issued && expires - issued <= 90000 && issued <= now + 120000 && expires >= now - 120000
                && expires == time(challenge.getString("expiresAt")), "ACCOUNT_PROOF_EXPIRED");
    }
    static JSONObject online(JSONObject response, JSONObject issuers, String installation, String fingerprint, String application, long now) throws Exception {
        require("active".equals(response.optString("stage")) && "online".equals(response.optString("mode")), "ONLINE_ACCESS_INVALID");
        JSONObject p = ProtocolJson.verifyEnvelope(response.getJSONObject("entitlement"), issuers, "contatools-android-online-access");
        require("android-online-access".equals(p.getString("purpose")) && "online".equals(p.getString("mode"))
                && "active".equals(p.getString("status")) && application.equals(p.getString("applicationId"))
                && installation.equals(p.getString("installationId")) && fingerprint.equals(p.getString("keyFingerprint")), "ONLINE_ACCESS_INVALID");
        long issued = time(p.getString("issuedAt")), expires = time(p.getString("expiresAt"));
        require(issued <= now + 120000 && expires > now && expires > issued && expires - issued <= 900000, "ONLINE_ACCESS_EXPIRED");
        JSONObject organization = response.getJSONObject("organization"), member = response.getJSONObject("member");
        require(p.getString("organizationId").equals(organization.getString("id")) && p.getString("memberId").equals(member.getString("id"))
                && p.getString("role").equals(member.getString("role")) && p.getLong("membershipVersion") == member.getLong("membershipVersion")
                && ProtocolJson.canonical(p.getJSONArray("capabilities")).equals(ProtocolJson.canonical(member.getJSONArray("capabilities")))
                && ProtocolJson.canonical(p.getJSONArray("branches")).equals(ProtocolJson.canonical(response.getJSONArray("branches"))), "ONLINE_ACCESS_SCOPE");
        return p;
    }
    static JSONObject offline(JSONObject envelope, JSONObject issuers, JSONObject request, String installation,
                              String fingerprint, String device, String application, String documentHash) throws Exception {
        JSONObject p = ProtocolJson.verifyEnvelope(envelope, issuers, "alkarna-android-offline-account");
        require("android-offline-account".equals(p.getString("purpose")) && p.getInt("version") == 1
                && application.equals(p.getString("applicationId")) && installation.equals(p.getString("installationId"))
                && fingerprint.equals(p.getString("keyFingerprint")) && device.equals(p.getString("deviceCode"))
                && request.getString("requestId").equals(p.getString("requestId")) && request.getString("identifier").equals(p.getString("phone"))
                && documentHash.equals(p.getString("licenseDocumentHash")) && p.getString("phone").matches("[234][0-9]{7}"), "OFFLINE_BINDING_INVALID");
        for (String key : new String[]{"localOwnerId", "localShopId"}) {
            require(p.getString(key).matches("[A-Za-z0-9_.:-]{1,160}"), "OFFLINE_BINDING_INVALID");
            if (request.has(key)) require(request.getString(key).equals(p.getString(key)), "OFFLINE_BINDING_SCOPE");
        }
        require(p.getLong("credentialVersion") > 0 && !p.getString("credentialId").isEmpty() && !p.getString("licenseId").isEmpty(), "OFFLINE_BINDING_INVALID");
        return p;
    }
    static void sameOfflineScope(JSONObject previous, JSONObject next) throws Exception {
        for (String key : new String[]{"purpose", "version", "applicationId", "installationId", "keyFingerprint", "deviceCode", "requestId", "phone", "credentialId", "credentialVersion", "customerId", "localOwnerId", "localShopId"})
            require(ProtocolJson.canonical(previous.get(key)).equals(ProtocolJson.canonical(next.get(key))), "OFFLINE_BINDING_SCOPE");
    }
}
