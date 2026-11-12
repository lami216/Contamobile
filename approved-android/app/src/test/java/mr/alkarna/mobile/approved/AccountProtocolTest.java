package mr.alkarna.mobile.approved;

import static org.junit.Assert.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.time.Instant;
import org.json.*;
import org.junit.*;

public final class AccountProtocolTest {
    private static final long NOW=1800000000000L;
    private JSONObject payload,proof,challenge,issuers;
    private KeyPair pair;
    private interface Work { void run() throws Exception; }
    private static void rejects(Work action)throws Exception { try {action.run();fail("Authority must fail closed");}catch(Exception expected){} }
    private static String iso(long value){return Instant.ofEpochMilli(value).toString();}
    private static JSONObject copy(JSONObject o)throws Exception{return new JSONObject(o.toString());}
    private static String coordinate(java.math.BigInteger n){byte[] a=n.toByteArray(),b=new byte[32];int len=Math.min(a.length,32);System.arraycopy(a,a.length-len,b,32-len,len);return ProtocolJson.base64(b);}
    private JSONObject signed(String schema,JSONObject p)throws Exception{
        JSONObject e=new JSONObject().put("schema",schema).put("version",1).put("kid","fixture").put("payload",p);
        Signature s=Signature.getInstance("SHA256withECDSA");s.initSign(pair.getPrivate());s.update(ProtocolJson.canonical(e).getBytes(StandardCharsets.UTF_8));return e.put("signature",ProtocolJson.base64(ProtocolJson.rawSignature(s.sign())));
    }
    @Before public void fixture()throws Exception{
        payload=new JSONObject().put("installationId","installation").put("branchId","branch");
        proof=new JSONObject().put("schema","contatools-android-access-proof").put("version",1).put("method","POST").put("path",AccountProtocol.DISPATCH).put("operation","online.bootstrap").put("applicationId","app").put("installationId","installation").put("nonce","a".repeat(32)).put("payloadHash",ProtocolJson.hash(payload)).put("sessionTokenHash",ProtocolJson.hash("session")).put("issuedAt",iso(NOW)).put("expiresAt",iso(NOW+90000));
        challenge=new JSONObject().put("challengeId","b".repeat(32)).put("message",ProtocolJson.canonical(proof)).put("expiresAt",iso(NOW+90000));
        KeyPairGenerator g=KeyPairGenerator.getInstance("EC");g.initialize(new ECGenParameterSpec("secp256r1"));pair=g.generateKeyPair();ECPublicKey k=(ECPublicKey)pair.getPublic();
        issuers=new JSONObject().put("fixture",new JSONObject().put("kty","EC").put("crv","P-256").put("x",coordinate(k.getW().getAffineX())).put("y",coordinate(k.getW().getAffineY())));
    }
    private void check(JSONObject c)throws Exception{AccountProtocol.proof(c,"online.bootstrap",payload,"session","installation","app",NOW);}
    @Test public void proofBindsExactOperationBodySessionAndInstallation()throws Exception{
        check(challenge);
        for(String key:new String[]{"path","method","operation","payloadHash","sessionTokenHash","installationId","applicationId"}){
            JSONObject p=copy(proof).put(key,"different");rejects(()->check(copy(challenge).put("message",ProtocolJson.canonical(p))));
        }
        rejects(()->AccountProtocol.proof(challenge,"online.bootstrap",copy(payload).put("branchId","another"),"session","installation","app",NOW));
        rejects(()->AccountProtocol.proof(challenge,"online.bootstrap",payload,null,"installation","app",NOW));
    }
    @Test public void staleExtendedNoncanonicalAndAdditionalProofFieldsAreRejected()throws Exception{
        rejects(()->check(copy(challenge).put("message",proof.toString(2))));
        rejects(()->check(copy(challenge).put("message",ProtocolJson.canonical(copy(proof).put("extra",true)))));
        JSONObject extended=copy(proof).put("expiresAt",iso(NOW+90001));rejects(()->check(copy(challenge).put("message",ProtocolJson.canonical(extended)).put("expiresAt",iso(NOW+90001))));
        rejects(()->AccountProtocol.proof(challenge,"online.bootstrap",payload,"session","installation","app",NOW+300000));
    }
    @Test public void offlineAuthorityCannotMoveToAnotherPhoneOwnerOrLicense()throws Exception{
        JSONObject request=new JSONObject().put("requestId","request").put("identifier","22345678").put("localOwnerId","owner").put("localShopId","shop");
        JSONObject p=new JSONObject().put("purpose","android-offline-account").put("applicationId","app").put("version",1).put("requestId","request").put("credentialId","credential").put("credentialVersion",1).put("phone","22345678").put("installationId","installation").put("keyFingerprint","fingerprint").put("deviceCode","device").put("localOwnerId","owner").put("localShopId","shop").put("licenseDocumentHash","hash").put("licenseId","licence");
        assertEquals("owner",AccountProtocol.offline(signed("alkarna-android-offline-account",p),issuers,request,"installation","fingerprint","device","app","hash").getString("localOwnerId"));
        for(String name:new String[]{"phone","requestId","localOwnerId","localShopId","installationId","keyFingerprint","deviceCode","licenseDocumentHash"})rejects(()->AccountProtocol.offline(signed("alkarna-android-offline-account",copy(p).put(name,"another")),issuers,request,"installation","fingerprint","device","app","hash"));
        JSONObject tampered=signed("alkarna-android-offline-account",p);tampered.getJSONObject("payload").put("phone","32345678");rejects(()->AccountProtocol.offline(tampered,issuers,request,"installation","fingerprint","device","app","hash"));
    }
    @Test public void onlineStatusMustMatchSignedRoleScopeAndLiveTime()throws Exception{
        JSONArray capabilities=new JSONArray().put("branch.read"),branches=new JSONArray().put(new JSONObject().put("id","branch").put("name","Shop").put("originId","origin"));
        JSONObject claims=new JSONObject().put("purpose","android-online-access").put("applicationId","app").put("mode","online").put("organizationId","org").put("memberId","member").put("installationId","installation").put("keyFingerprint","fingerprint").put("status","active").put("role","owner").put("membershipVersion",1).put("capabilities",capabilities).put("branches",branches).put("issuedAt",iso(NOW)).put("expiresAt",iso(NOW+60000));
        claims.put("deviceApproval","approved");
        JSONObject response=new JSONObject().put("stage","active").put("mode","online").put("organization",new JSONObject().put("id","org")).put("member",new JSONObject().put("id","member").put("role","owner").put("membershipVersion",1).put("capabilities",capabilities)).put("branches",branches).put("entitlement",signed("contatools-android-online-access",claims));
        AccountProtocol.online(response,issuers,"installation","fingerprint","app",NOW);
        JSONObject changed=copy(response);changed.getJSONObject("member").put("role","cashier");rejects(()->AccountProtocol.online(changed,issuers,"installation","fingerprint","app",NOW));
        rejects(()->AccountProtocol.online(response,issuers,"another","fingerprint","app",NOW));
        rejects(()->AccountProtocol.online(response,issuers,"installation","fingerprint","app",NOW+60001));
        JSONObject oldClaims=copy(claims);oldClaims.remove("deviceApproval");
        JSONObject oldAutomatic=copy(response).put("deviceApproval","approved").put("entitlement",signed("contatools-android-online-access",oldClaims));
        rejects(()->AccountProtocol.online(oldAutomatic,issuers,"installation","fingerprint","app",NOW));
        JSONObject pendingClaim=copy(response).put("entitlement",signed("contatools-android-online-access",copy(claims).put("deviceApproval","pending")));
        rejects(()->AccountProtocol.online(pendingClaim,issuers,"installation","fingerprint","app",NOW));
    }
    private JSONObject companyPending()throws Exception{
        return new JSONObject().put("stage","pending").put("mode","online").put("deviceStatus","pending").put("installationId","installation").put("requestId","11111111-2222-4333-8444-555555555555");
    }
    @Test public void pendingCompanyRegistrationIsDisplayOnlyAndBoundToItsInstallation()throws Exception{
        JSONObject pending=companyPending();assertEquals(ProtocolJson.canonical(pending),ProtocolJson.canonical(AccountProtocol.pendingOnlineDevice(pending,"installation")));
        rejects(()->AccountProtocol.pendingOnlineDevice(pending,"another-installation"));
        for(String field:new String[]{"stage","mode","deviceStatus","installationId","requestId"}){JSONObject missing=copy(pending);missing.remove(field);rejects(()->AccountProtocol.pendingOnlineDevice(missing,"installation"));}
    }
    @Test public void pendingCompanyRegistrationRejectsEveryAuthorityAndUnknownField()throws Exception{
        for(String field:new String[]{"sessionToken","entitlement","context","organization","member","branches","capabilities","data","unknown"})
            rejects(()->AccountProtocol.pendingOnlineDevice(companyPending().put(field,"forbidden"),"installation"));
    }
    @Test public void pendingCompanyRegistrationRequiresExactStatusesAndCanonicalRequestUuid()throws Exception{
        for(String field:new String[]{"stage","mode","deviceStatus"})rejects(()->AccountProtocol.pendingOnlineDevice(companyPending().put(field,"active"),"installation"));
        for(String id:new String[]{"", "request", "1-2-3-4-5", "11111111-2222-4333-8444-55555555555Z"})rejects(()->AccountProtocol.pendingOnlineDevice(companyPending().put("requestId",id),"installation"));
    }
    @Test public void actualNodeServiceVectorsAgreeWithJavaCanonicalProofsAndSignatures()throws Exception{
        JSONObject vectors;
        try(java.io.InputStream input=getClass().getResourceAsStream("/android-access-vectors.json")){
            assertNotNull("Server-produced synthetic protocol vectors must be packaged",input);
            vectors=new JSONObject(new String(input.readAllBytes(),StandardCharsets.UTF_8));
        }
        long now=vectors.getLong("now");String application=vectors.getString("applicationId");
        JSONObject issuer=vectors.getJSONObject("issuer"),keys=new JSONObject().put(issuer.getString("keyId"),issuer.getJSONObject("publicJwk"));
        JSONObject online=vectors.getJSONObject("online"),login=online.getJSONObject("payload");
        String installation=login.getString("installationId"),fingerprint=ProtocolJson.fingerprint(login.getJSONObject("publicJwk"));
        JSONObject waiting=online.getJSONObject("pending"),waitingInput=waiting.getJSONObject("payload");
        AccountProtocol.proof(waiting.getJSONObject("challenge"),"session.login",waitingInput,null,waitingInput.getString("installationId"),application,now);
        AccountProtocol.pendingOnlineDevice(waiting.getJSONObject("response"),waitingInput.getString("installationId"));
        AccountProtocol.proof(online.getJSONObject("challenge"),"session.login",login,null,installation,application,now);
        AccountProtocol.online(online.getJSONObject("response"),keys,installation,fingerprint,application,now);
        JSONObject status=online.getJSONObject("status");
        AccountProtocol.proof(status.getJSONObject("challenge"),"access.status",status.getJSONObject("payload"),status.getString("sessionToken"),installation,application,now);
        AccountProtocol.online(status.getJSONObject("response"),keys,installation,fingerprint,application,now);
        JSONObject offline=vectors.getJSONObject("offline"),request=offline.getJSONObject("payload"),activate=offline.getJSONObject("activate"),bundle=activate.getJSONObject("response");
        installation=request.getString("installationId");fingerprint=ProtocolJson.fingerprint(request.getJSONObject("publicJwk"));
        AccountProtocol.proof(offline.getJSONObject("challenge"),"offline.request",request,null,installation,application,now);
        AccountProtocol.proof(activate.getJSONObject("challenge"),"offline.activate",activate.getJSONObject("payload"),null,installation,application,now);
        String documentHash=ProtocolJson.hash(bundle.getJSONObject("licenseDocument"));assertEquals(offline.getString("licenseDocumentHash"),documentHash);
        AccountProtocol.offline(bundle.getJSONObject("binding"),keys,request,installation,fingerprint,request.getString("deviceCode"),application,documentHash);
    }
    private JSONObject localBinding()throws Exception{
        return new JSONObject().put("purpose","android-offline-account").put("version",1).put("applicationId","app").put("installationId","installation").put("keyFingerprint","fingerprint").put("deviceCode","device").put("requestId","request").put("phone","22345678").put("credentialId","credential").put("credentialVersion",1).put("customerId","customer").put("localOwnerId","owner").put("localShopId","shop").put("licenseId","old-license").put("licenseDocumentHash","old-hash");
    }
    @Test public void legitimateRenewalChangesOnlyItsLicenseBindingNotAccountIdentity()throws Exception{
        JSONObject old=localBinding(),renewed=copy(old).put("licenseId","new-license").put("licenseDocumentHash","new-hash").put("issuedAt",iso(NOW));
        AccountProtocol.sameOfflineScope(old,renewed);
        for(String name:new String[]{"purpose","version","applicationId","installationId","keyFingerprint","deviceCode","requestId","phone","credentialId","credentialVersion","customerId","localOwnerId","localShopId"})rejects(()->AccountProtocol.sameOfflineScope(old,copy(renewed).put(name,"changed")));
    }
    @Test public void aFreshSignedBindingCannotTakeOverTheFirstApprovedOwnerOrShop()throws Exception{
        JSONObject request=new JSONObject().put("requestId","request").put("identifier","22345678"),old=localBinding();
        JSONObject changed=copy(old).put("localOwnerId","another-owner").put("licenseId","new-license").put("licenseDocumentHash","new-hash");
        JSONObject signedClaim=AccountProtocol.offline(signed("alkarna-android-offline-account",changed),issuers,request,"installation","fingerprint","device","app","new-hash");
        rejects(()->AccountProtocol.sameOfflineScope(old,signedClaim));
        JSONObject coerced=copy(old).put("credentialVersion","1");rejects(()->AccountProtocol.sameOfflineScope(old,coerced));
    }
}
