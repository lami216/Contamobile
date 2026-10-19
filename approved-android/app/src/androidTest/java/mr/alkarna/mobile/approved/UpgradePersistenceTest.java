package mr.alkarna.mobile.approved;

import android.content.Context;
import android.content.pm.PackageManager;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Two instrumentation invocations separated by a real `adb install -r`, with no data clear. */
@RunWith(AndroidJUnit4.class)
public class UpgradePersistenceTest {
    private ActivityScenario<MainActivity> activity;
    private Map<String,PublicKey> originalKeys;
    private Context target() { return InstrumentationRegistry.getInstrumentation().getTargetContext(); }
    // Instrumentation executes with the target UID. Its temporary emulator-only state
    // must live under that UID, and survives the target APK replacement between phases.
    private File testFile(String name) { return new File(target().getNoBackupFilesDir(),"instrumentation-"+name); }
    private void write(String name,String content) throws Exception {try(var out=new FileOutputStream(testFile(name))){out.write(content.getBytes(StandardCharsets.UTF_8));}}
    private String read(String name) throws Exception {try(var in=new FileInputStream(testFile(name))){return new String(in.readAllBytes(),StandardCharsets.UTF_8);}}
    @Before public void persistentInstrumentationIssuer() throws Exception {
        // This issuer lives only in the separate test APK, never in the installed customer APK.
        originalKeys=new HashMap<>(LicenseCompatibilityTest.keys());
        if(!testFile("upgrade-issuer.json").exists()){
            KeyPairGenerator generator=KeyPairGenerator.getInstance("EC");generator.initialize(new ECGenParameterSpec("secp256r1"));KeyPair key=generator.generateKeyPair();
            write("upgrade-issuer.json",new JSONObject().put("public",Base64.getEncoder().encodeToString(key.getPublic().getEncoded())).put("private",Base64.getEncoder().encodeToString(key.getPrivate().getEncoded())).toString());
        }
        JSONObject issuer=new JSONObject(read("upgrade-issuer.json"));
        KeyFactory factory=KeyFactory.getInstance("EC");
        KeyPair pair=new KeyPair(factory.generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(issuer.getString("public")))),factory.generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(issuer.getString("private")))));
        var field=TestLicenseIssuer.class.getDeclaredField("pair");field.setAccessible(true);field.set(null,pair);
        LicenseCompatibilityTest.keys().put("alkarna-license-v2",pair.getPublic());
    }
    @After public void closeAndRestoreKeys() throws Exception {
        if(activity!=null)activity.close();
        LicenseCompatibilityTest.keys().clear();LicenseCompatibilityTest.keys().putAll(originalKeys);
    }
    private String js(String script) throws Exception {
        var result=new ArrayBlockingQueue<String>(1);
        activity.onActivity(a->a.getWebView().evaluateJavascript(script,v->result.offer(v==null?"null":v)));
        String value=result.poll(20,TimeUnit.SECONDS);assertNotNull("WebView callback",value);return value;
    }
    private String text(String script) throws Exception {return new JSONTokener(js(script)).nextValue().toString();}
    private void until(String condition) throws Exception {
        long end=System.currentTimeMillis()+25000;
        while(System.currentTimeMillis()<end){if("true".equals(js(condition)))return;Thread.sleep(100);}
        fail("Timed out: "+condition+"; "+js("document.body.innerText"));
    }
    private void action(String name) throws Exception {
        js("window.__upgradeAction=false;act("+JSONObject.quote(name)+").finally(()=>window.__upgradeAction=true);true");
        until("window.__upgradeAction===true&&!document.querySelector('.busy')");
    }
    private String databaseSnapshot() throws Exception {
        js("window.__upgradeSnapshot=null;(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('alkarna-site-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const result={};for(const name of ['snapshots','users','meta'])result[name]=await new Promise((resolve,reject)=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});db.close();window.__upgradeSnapshot=JSON.stringify(result)})();true");
        until("window.__upgradeSnapshot!==null");return text("window.__upgradeSnapshot");
    }
    private String signer() throws Exception {
        var info=target().getPackageManager().getPackageInfo(target().getPackageName(),PackageManager.GET_SIGNATURES);
        byte[] hash=MessageDigest.getInstance("SHA-256").digest(info.signatures[0].toByteArray());StringBuilder out=new StringBuilder();for(byte b:hash)out.append(String.format("%02x",b&255));return out.toString();
    }
    private void checkVersion() throws Exception {
        long expected=Long.parseLong(InstrumentationRegistry.getArguments().getString("expectedVersionCode"));
        assertEquals(expected,target().getPackageManager().getPackageInfo(target().getPackageName(),0).getLongVersionCode());
    }
    @Test public void seedPreviousVersion() throws Exception {
        checkVersion();DeviceLicense license=new DeviceLicense(target());
        String document=TestLicenseIssuer.issue(license.deviceCode(),"temporary",10800);
        assertTrue(license.install(document).getBoolean("valid"));
        activity=ActivityScenario.launch(MainActivity.class);
        until("!!document.querySelector('[data-action=\"site:setup\"]')");
        js("document.querySelector('[name=username]').value='upgrade-owner';document.querySelector('[name=password]').value='1234';true");action("site:setup");
        until("!!document.querySelector('.nav')");action("go:inventory");action("open:product");
        js("(()=>{const values={name:'قهوة',price:'150',cost:'60',qty:'12',openingWarehouse:S.warehouse};for(const [key,value] of Object.entries(values))document.querySelector('#sheet-form [name='+key+']').value=value;return true})()");action("save-product");
        until("S.products.length===1&&modal===null");action("new:sale");action("pos:add:"+js("S.products[0].id"));action("pos:checkout");action("post-sale");
        assertEquals("11",js("S.products[0].qty"));assertEquals("150",js("S.records.find(r=>r.kind==='sale').total"));
        action("site:language:fr");action("appearance:light");action("site:logout");
        until("!!document.querySelector('[data-action=\"site:login\"]')");
        JSONObject snapshot=new JSONObject().put("database",databaseSnapshot()).put("device",license.deviceCode()).put("certificate",signer()).put("document",document)
            .put("licenseId",license.status().getJSONObject("license").getString("licenseId"))
            .put("remainingSeconds",license.status().getJSONObject("license").getDouble("remainingSeconds"))
            .put("localStorage",text("JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])))"));
        license.checkpoint();write("upgrade-before.json",snapshot.toString());
        System.out.println("UPGRADE seed: saved user credentials, inventory, sale, account balance, French/light preferences and temporary activation.");
    }
    @Test public void verifyAfterInPlaceUpdate() throws Exception {
        checkVersion();JSONObject before=new JSONObject(read("upgrade-before.json"));DeviceLicense license=new DeviceLicense(target());
        assertEquals(before.getString("certificate"),signer());assertEquals(before.getString("device"),license.deviceCode());
        JSONObject status=license.status();assertTrue("Activation survived APK replacement",status.getBoolean("valid"));JSONObject active=status.getJSONObject("license");
        assertEquals(before.getString("licenseId"),active.getString("licenseId"));assertTrue(active.getDouble("remainingSeconds")>0);assertTrue("Update must not restart license duration",active.getDouble("remainingSeconds")<=before.getDouble("remainingSeconds"));
        try{license.install(before.getString("document"));fail("Consumed activation was reset by update");}catch(LicenseVerifier.Rejected e){assertEquals("LICENSE_ALREADY_USED",e.code);}
        activity=ActivityScenario.launch(MainActivity.class);
        until("!!document.querySelector('[data-action=\"site:login\"]')");
        assertEquals("All persisted business tables and credentials unchanged",before.getString("database"),databaseSnapshot());
        assertEquals(before.getString("localStorage"),text("JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])))"));
        js("document.querySelector('[name=username]').value='upgrade-owner';document.querySelector('[name=password]').value='1234';true");action("site:login");until("!!document.querySelector('.nav')");
        assertEquals("11",js("S.products[0].qty"));assertEquals("150",js("S.records.find(r=>r.kind==='sale').total"));assertEquals("true",js("document.documentElement.lang==='fr'&&document.querySelector('#phone').dir==='ltr'&&previewAppearance29==='light'"));
        System.out.println("UPGRADE PASS: real install -r preserved every business store, password, device code, certificate, native activation key, consumed license and remaining duration.");
    }
}

