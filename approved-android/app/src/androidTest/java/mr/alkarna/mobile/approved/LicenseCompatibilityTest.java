package mr.alkarna.mobile.approved;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.*;
import org.junit.runner.RunWith;
import org.json.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.ECGenParameterSpec;
import java.util.*;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class LicenseCompatibilityTest {
    private JSONObject fixtures;
    private Map<String,PublicKey> original;
    @SuppressWarnings("unchecked") static Map<String,PublicKey> keys() throws Exception {var field=LicenseVerifier.class.getDeclaredField("PUBLIC_KEYS");field.setAccessible(true);return (Map<String,PublicKey>)field.get(null);}
    @Before public void prepare() throws Exception {
        try(var input=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("license-contract.json")){fixtures=new JSONObject(new String(input.readAllBytes(),StandardCharsets.UTF_8));}
        original=new HashMap<>(keys());JSONObject p=fixtures.getJSONObject("publicKey");PublicKey fixture=LicenseVerifier.key(p.getString("x"),p.getString("y"));keys().put("alkarna-license-v1",fixture);keys().put("alkarna-license-v2",fixture);
    }
    @After public void restore() throws Exception {keys().clear();keys().putAll(original);}
    private JSONObject document(String key) throws Exception{return new JSONObject(fixtures.getJSONObject(key).toString());}
    private void rejects(JSONObject doc,String device,String code) throws Exception{try{LicenseVerifier.verify(doc.toString(),device);fail("Accepted invalid license");}catch(LicenseVerifier.Rejected e){assertEquals(code,e.code);}}
    @Test public void matchesDesktopIssuerBytesAndDeviceCode() throws Exception {
        assertEquals(fixtures.getString("device"),LicenseVerifier.deviceCode(fixtures.getString("identity")));
        for(String type:new String[]{"v1","v2","perpetual"}){JSONObject d=document(type);assertNotNull(LicenseVerifier.verify(d.toString(),fixtures.getString("device")));}
        assertEquals(fixtures.getString("canonical1"),LicenseVerifier.canonical(document("v1").getJSONObject("payload"),1));
        assertEquals(fixtures.getString("canonical2"),LicenseVerifier.canonical(document("v2").getJSONObject("payload"),2));
        // The production build contains only the exact desktop public verification keys.
        assertEquals(LicenseVerifier.key("VafWOl9h-bF8auIQTUvS5AATeR8yyxJu49p-QSzk7-s","Pz7QrSsgtgcKhvc_eSblH0BPcBwEo9lCo-0zkXwIDzM"),original.get("alkarna-license-v1"));
        assertEquals(LicenseVerifier.key("-kAStxv0yNuJ9GyzSNaiywfrZ5BziSWL5kJVMFOnRUY","AburlAjGDOBSzFeNa2sxyd4XgLM5CWKuDR4Hpe57GYU"),original.get("alkarna-license-v2"));
    }
    @Test public void rejectsTamperingWrongDeviceAndMalformedEnvelopes() throws Exception {
        String device=fixtures.getString("device");JSONObject d=document("v2");d.getJSONObject("payload").put("storeName","changed");rejects(d,device,"LICENSE_INVALID");
        rejects(document("v2"),"AKD-0000-0000-0000-0000-0000","LICENSE_DEVICE_MISMATCH");
        d=document("v2");d.put("signature",d.getString("signature")+"=");rejects(d,device,"LICENSE_INVALID");
        d=document("v2");d.put("keyId","unknown");rejects(d,device,"LICENSE_INVALID");
        d=document("v2");d.getJSONObject("payload").put("expiresAt","2099-01-01");rejects(d,device,"LICENSE_INVALID");
        for(Object value:new Object[]{0,-1,0.5,"10800",JSONObject.NULL}){d=document("v2");d.getJSONObject("payload").put("durationSeconds",value);rejects(d,device,"LICENSE_INVALID");}
        d=document("perpetual");d.getJSONObject("payload").put("durationSeconds",0);rejects(d,device,"LICENSE_INVALID");
        try{LicenseVerifier.verify(" ".repeat(65537),device);fail("Oversize accepted");}catch(LicenseVerifier.Rejected e){assertEquals("LICENSE_TOO_LARGE",e.code);}
        keys().clear();keys().putAll(original);rejects(document("v2"),device,"LICENSE_INVALID");
    }
    private JSONObject active(long now,long duration) throws Exception{return new JSONObject().put("licenseId","clock").put("remainingMs",duration).put("lastWallClockMs",now).put("expired",false).put("clockRollbackDetected",false);}
    @Test public void countsOpenClosedTimeAndDoesNotDoubleCount() throws Exception {
        long wall=2000000000000L;JSONObject a=active(wall,10800000);LicenseClock clock=new LicenseClock();
        assertEquals(10800000,clock.evaluate(a,wall,0),.001);assertEquals(10200000,clock.evaluate(a,wall+600000,600000),.001);
        clock=new LicenseClock();assertEquals(9000000,clock.evaluate(a,wall+1800000,0),.001);
        a=active(wall,10800000);clock=new LicenseClock();clock.evaluate(a,wall,0);assertEquals(3600000,clock.evaluate(a,wall+7200000,600000),.001);
    }
    @Test public void expiryAndRollbackCannotBeRevivedByClockChange() throws Exception {
        long wall=2000000000000L;JSONObject a=active(wall,10800000);LicenseClock clock=new LicenseClock();clock.evaluate(a,wall,0);
        try{clock.evaluate(a,wall-120001,1000);fail();}catch(LicenseVerifier.Rejected e){assertEquals("LICENSE_CLOCK_ROLLBACK",e.code);}
        try{new LicenseClock().evaluate(a,wall+1000,0);fail();}catch(LicenseVerifier.Rejected e){assertEquals("LICENSE_CLOCK_ROLLBACK",e.code);}
        a=active(wall,10800000);clock=new LicenseClock();clock.evaluate(a,wall,0);try{clock.evaluate(a,wall+18000000,1000);fail();}catch(LicenseVerifier.Rejected e){assertEquals("LICENSE_EXPIRED",e.code);}
        try{new LicenseClock().evaluate(a,wall,0);fail();}catch(LicenseVerifier.Rejected e){assertEquals("LICENSE_EXPIRED",e.code);}
    }
}
