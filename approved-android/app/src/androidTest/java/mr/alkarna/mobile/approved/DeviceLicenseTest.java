package mr.alkarna.mobile.approved;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.*;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import java.util.*;
import java.security.PublicKey;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class DeviceLicenseTest {
    @Test public void activationPersistsAndCannotBeReusedOrMoved() throws Exception {
        var context=InstrumentationRegistry.getInstrumentation().getTargetContext();Map<String,PublicKey> original=new HashMap<>(LicenseCompatibilityTest.keys());
        try{
            DeviceLicense manager=new DeviceLicense(context);String device=manager.deviceCode();
            String other=TestLicenseIssuer.issue("AKD-0000-0000-0000-0000-0000","perpetual",0);
            try{manager.install(other);fail("Other device accepted");}catch(LicenseVerifier.Rejected e){assertEquals("LICENSE_DEVICE_MISMATCH",e.code);}
            String temporary=TestLicenseIssuer.issue(device,"temporary",10800);assertTrue(manager.install(temporary).getBoolean("valid"));
            DeviceLicense reloaded=new DeviceLicense(context);assertEquals(device,reloaded.deviceCode());assertTrue(reloaded.status().getBoolean("valid"));
            assertTrue(reloaded.status().getJSONObject("license").getDouble("remainingSeconds")<=10800);
            try{reloaded.install(temporary);fail("Reused license accepted");}catch(LicenseVerifier.Rejected e){assertEquals("LICENSE_ALREADY_USED",e.code);}
            // Erasing the preference replica does not erase the consumed license or restart its duration.
            assertTrue(context.getSharedPreferences("activation-v2",0).edit().clear().commit());
            reloaded=new DeviceLicense(context);assertTrue(reloaded.status().getBoolean("valid"));
            try{reloaded.install(temporary);fail("Consumed license lost");}catch(LicenseVerifier.Rejected e){assertEquals("LICENSE_ALREADY_USED",e.code);}
            String perpetual=TestLicenseIssuer.issue(device,"perpetual",0);assertTrue(reloaded.install(perpetual).getBoolean("valid"));
            assertTrue(new DeviceLicense(context).status().getBoolean("valid"));
        }finally{LicenseCompatibilityTest.keys().clear();LicenseCompatibilityTest.keys().putAll(original);}
    }
}
