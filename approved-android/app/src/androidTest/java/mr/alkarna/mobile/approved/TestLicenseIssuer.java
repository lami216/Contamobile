package mr.alkarna.mobile.approved;

import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.ECGenParameterSpec;
import java.util.*;

/** Instrumentation APK only. Never packaged in, or callable by, the customer APK. */
final class TestLicenseIssuer {
    private static KeyPair pair;
    static String issue(String device,String type,long seconds) throws Exception {
        if(pair==null){KeyPairGenerator generator=KeyPairGenerator.getInstance("EC");generator.initialize(new ECGenParameterSpec("secp256r1"));pair=generator.generateKeyPair();}
        LicenseCompatibilityTest.keys().put("alkarna-license-v2",pair.getPublic());
        JSONObject p=new JSONObject().put("licenseId",UUID.randomUUID().toString()).put("storeId","qa-store").put("customerName","مالك الفحص").put("storeName","متجر الفحص").put("deviceId",device).put("edition","desktop").put("type",type).put("durationSeconds","temporary".equals(type)?seconds:JSONObject.NULL).put("activationMode","single-install").put("notes","");
        Signature signer=Signature.getInstance("SHA256withECDSA");signer.initSign(pair.getPrivate());signer.update(LicenseVerifier.canonical(p,2).getBytes(StandardCharsets.UTF_8));byte[] der=signer.sign(),raw=new byte[64];int offset=2;
        for(int n=0;n<2;n++){if(der[offset++]!=2)throw new Exception("DER integer expected");int length=der[offset++]&255;int source=offset+Math.max(0,length-32),count=Math.min(32,length);System.arraycopy(der,source,raw,n*32+32-count,count);offset+=length;}
        return new JSONObject().put("schema","alkarna-license").put("version",2).put("keyId","alkarna-license-v2").put("algorithm","ECDSA_P256_SHA256").put("payload",p).put("signature",Base64.getUrlEncoder().withoutPadding().encodeToString(raw)).toString();
    }
}
