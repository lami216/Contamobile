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

/** Independent real APK upgrades, offline process death and repeat install-r without a data clear. */
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
    private void fields(String values) throws Exception {
        assertEquals("All seed fields exist","true",js("(()=>{for(const [key,value]of Object.entries("+values+")){const input=document.querySelector('#sheet-form [name='+key+']');if(!input)throw Error('Missing field '+key);input.value=value}return true})()"));
    }
    private String databaseSnapshot() throws Exception {
        js("window.__upgradeSnapshot=null;(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('alkarna-site-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const result={};for(const name of [...db.objectStoreNames].sort())result[name]=await new Promise((resolve,reject)=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});db.close();window.__upgradeSnapshot=JSON.stringify(result)})();true");
        until("window.__upgradeSnapshot!==null");return text("window.__upgradeSnapshot");
    }
    private String preferences() throws Exception {return text("JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])))");}
    private String signer() throws Exception {
        var info=target().getPackageManager().getPackageInfo(target().getPackageName(),PackageManager.GET_SIGNATURES);
        byte[] hash=MessageDigest.getInstance("SHA-256").digest(info.signatures[0].toByteArray());StringBuilder out=new StringBuilder();for(byte b:hash)out.append(String.format("%02x",b&255));return out.toString();
    }
    private void checkVersion() throws Exception {
        long expected=Long.parseLong(InstrumentationRegistry.getArguments().getString("expectedVersionCode"));
        assertEquals(expected,target().getPackageManager().getPackageInfo(target().getPackageName(),0).getLongVersionCode());
    }
    private void preserved(Object oldValue,Object newValue,String path) throws Exception {
        if(oldValue instanceof JSONObject){assertTrue(path,newValue instanceof JSONObject);JSONObject old=(JSONObject)oldValue,next=(JSONObject)newValue;for(Iterator<String> keys=old.keys();keys.hasNext();){String key=keys.next();assertTrue(path+"."+key+" retained",next.has(key));preserved(old.get(key),next.get(key),path+"."+key);}}
        else if(oldValue instanceof JSONArray){assertTrue(path,newValue instanceof JSONArray);JSONArray old=(JSONArray)oldValue,next=(JSONArray)newValue;assertEquals(path+" length",old.length(),next.length());for(int i=0;i<old.length();i++)preserved(old.get(i),next.get(i),path+"["+i+"]");}
        else assertEquals(path,oldValue,newValue);
    }
    private void businessPreserved(String beforeText,String afterText) throws Exception {
        JSONObject old=new JSONObject(beforeText),next=new JSONObject(afterText);
        for(Iterator<String> names=old.keys();names.hasNext();){String name=names.next();assertTrue("Existing store retained: "+name,next.has(name));if(!"snapshots".equals(name))preserved(old.getJSONArray(name),next.getJSONArray(name),name);}
        JSONArray snapshots=old.getJSONArray("snapshots"),updated=next.getJSONArray("snapshots");
        for(int i=0;i<snapshots.length();i++){JSONObject row=snapshots.getJSONObject(i),found=null;for(int j=0;j<updated.length();j++)if(updated.getJSONObject(j).getString("id").equals(row.getString("id")))found=updated.getJSONObject(j);assertNotNull("Old snapshot retained",found);if(row.getString("id").equals("shop")){preserved(row.getJSONObject("state"),found.getJSONObject("state"),"all existing business fields");assertTrue("Additive migration schema",found.getJSONObject("state").getInt("featureSchema")>=2);}else preserved(row,found,"historical snapshot");}
        for(int i=0;i<updated.length();i++){String id=updated.getJSONObject(i).getString("id");boolean existed=false;for(int j=0;j<snapshots.length();j++)existed|=id.equals(snapshots.getJSONObject(j).getString("id"));assertTrue("Only known migration backup rows may be added: "+id,existed||"before-compact-product-names".equals(id)||"safety-backup".equals(id));}
    }
    private DeviceLicense nativePreserved(JSONObject before,boolean chargedOfflineInterval) throws Exception {
        checkVersion();DeviceLicense license=new DeviceLicense(target());
        assertEquals(before.getString("certificate"),signer());assertEquals(before.getString("device"),license.deviceCode());
        JSONObject status=license.status();assertTrue("Activation survived APK replacement/process death: "+status,status.getBoolean("valid"));JSONObject active=status.getJSONObject("license");
        assertEquals(before.getString("licenseId"),active.getString("licenseId"));assertEquals(before.getString("type"),active.getString("type"));
        if(before.has("installationId")){assertEquals(before.getString("installationId"),new InstallationIdentity().id());assertEquals(before.getString("installationFingerprint"),new InstallationIdentity().fingerprint());}
        else assertFalse("New optional identity exists after upgrading original v13",new InstallationIdentity().id().isEmpty());
        if("temporary".equals(before.getString("type"))){assertTrue("Temporary activation must retain a countdown",active.getDouble("remainingSeconds")>0);assertTrue("Update/restart must not restart license duration",active.getDouble("remainingSeconds")<=before.getDouble("remainingSeconds")-(chargedOfflineInterval?1:0));}
        else assertTrue("Perpetual stays perpetual with no countdown",active.isNull("remainingSeconds"));
        try{license.install(before.getString("document"));fail("Consumed activation was reset by update/restart");}catch(LicenseVerifier.Rejected e){assertEquals("LICENSE_ALREADY_USED",e.code);}
        return license;
    }
    private JSONObject checkpoint(JSONObject before,DeviceLicense license) throws Exception {
        license.checkpoint();JSONObject snapshot=new JSONObject(before.toString());
        return snapshot.put("database",databaseSnapshot()).put("localStorage",preferences())
            .put("remainingSeconds",license.status().getJSONObject("license").get("remainingSeconds"))
            .put("installationId",new InstallationIdentity().id()).put("installationFingerprint",new InstallationIdentity().fingerprint());
    }
    private void verifyReadOnlyRestart(String phase) throws Exception {
        JSONObject before=new JSONObject(read("upgrade-after.json"));DeviceLicense license=nativePreserved(before,false);
        activity=ActivityScenario.launch(MainActivity.class);until("!!document.querySelector('[data-action=\"site:login\"]')");
        JSONObject old=new JSONObject(before.getString("database")),next=new JSONObject(databaseSnapshot());
        // Login verification deliberately adds expired session rows in the first phase.
        // This later baseline includes those rows, so a cold boot/reinstall must be fully idempotent.
        preserved(old,next,"offline "+phase);preserved(next,old,"offline "+phase+" has no new writes");
        assertEquals(before.getString("localStorage"),preferences());
        write("upgrade-after.json",checkpoint(before,license).toString());
        System.out.println("UPGRADE PASS: "+phase+" preserved every store, credentials, business rows, preferences, identities and activation countdown.");
    }
    @Test public void seedPreviousVersion() throws Exception {
        checkVersion();DeviceLicense license=new DeviceLicense(target());
        String type=InstrumentationRegistry.getArguments().getString("upgradeLicenseType","temporary");
        String document=TestLicenseIssuer.issue(license.deviceCode(),type,10800);
        assertTrue(license.install(document).getBoolean("valid"));
        activity=ActivityScenario.launch(MainActivity.class);
        until("!!document.querySelector('[data-action=\"site:setup\"]')");
        js("document.querySelector('[name=username]').value='upgrade-owner';document.querySelector('[name=password]').value='1234';true");action("site:setup");
        until("!!document.querySelector('.nav')");action("go:inventory");action("open:product");
        fields("{name:'قهوة',price:'150',cost:'60',qty:'12',openingWarehouse:S.warehouse}");action("save-product");
        until("S.products.length===1&&modal===null");action("new:sale");action("pos:add:"+js("S.products[0].id"));action("pos:checkout");action("post-sale");
        assertEquals("11",js("S.products[0].qty"));assertEquals("150",js("S.records.find(r=>r.kind==='sale').total"));
        action("go:parties");action("partytype:supplier");action("open:party");fields("{name:'مورد الترقية'}");action("save-party");
        String supplierId=js("S.parties.find(p=>p.name==='مورد الترقية').id");
        action("new:purchase");action("pos:add:"+js("S.products[0].id"));action("pos:party");action("pos:party-pick:"+supplierId);action("pos:checkout");action("post-sale");
        action("open:pay");fields("{direction:'pay',partyType:'supplier',party:"+supplierId+",account:S.accounts[0].id,amount:'5',note:'دفع محفوظ عبر التحديث'}");action("post-party");
        action("go:parties");action("partytype:customer");action("open:party");fields("{name:'عميل الترقية'}");action("save-party");
        String customerId=js("S.parties.find(p=>p.name==='عميل الترقية').id");
        action("open:receive");fields("{direction:'receive',partyType:'customer',party:"+customerId+",account:S.accounts[0].id,amount:'7',note:'إيصال محفوظ عبر التحديث'}");action("post-party");
        assertEquals("true",js("['sale','purchase','receive','pay'].every(kind=>S.records.some(r=>r.kind===kind))&&S.products[0].qty===12&&S.parties.length===2"));
        action("site:new-user");fields("{name:'عامل المحل',username:'upgrade-worker',password:'worker-5678',role:'sales'}");action("site:save-user");
        action("site:language:fr");action("appearance:light");action("site:logout");
        until("!!document.querySelector('[data-action=\"site:login\"]')");
        // Settle the existing first-cold-launch product-name migration on the old
        // version before taking a byte-for-byte baseline of every stored row.
        activity.close();activity=ActivityScenario.launch(MainActivity.class);
        until("!!document.querySelector('[data-action=\"site:login\"]')");
        JSONObject snapshot=new JSONObject().put("database",databaseSnapshot()).put("device",license.deviceCode()).put("certificate",signer()).put("document",document)
            .put("licenseId",license.status().getJSONObject("license").getString("licenseId"))
            .put("type",type).put("remainingSeconds",license.status().getJSONObject("license").get("remainingSeconds"))
            .put("localStorage",preferences());
        // The actual v13 APK predates Contatools; do not manufacture a pre-upgrade identity.
        if(target().getPackageManager().getPackageInfo(target().getPackageName(),0).getLongVersionCode()>=14)
            snapshot.put("installationId",new InstallationIdentity().id()).put("installationFingerprint",new InstallationIdentity().fingerprint());
        license.checkpoint();write("upgrade-before.json",snapshot.toString());
        System.out.println("UPGRADE seed: two real UI-created users/passwords, inventory, customer/supplier, sale/purchase, receive/pay receipts, balances, French/light preferences and "+type+" activation.");
    }
    @Test public void verifyAfterInPlaceUpdate() throws Exception {
        JSONObject before=new JSONObject(read("upgrade-before.json"));boolean chargedOffline="true".equals(InstrumentationRegistry.getArguments().getString("requireOfflineElapsed"));DeviceLicense license=nativePreserved(before,chargedOffline);
        activity=ActivityScenario.launch(MainActivity.class);
        until("!!document.querySelector('[data-action=\"site:login\"]')");
        businessPreserved(before.getString("database"),databaseSnapshot());
        assertEquals(before.getString("localStorage"),preferences());
        js("document.querySelector('[name=username]').value='upgrade-owner';document.querySelector('[name=password]').value='1234';true");action("site:login");until("!!document.querySelector('.nav')");
        assertEquals("true",js("S.products[0].qty===12&&S.parties.length===2&&['sale','purchase','receive','pay'].every(kind=>S.records.some(r=>r.kind===kind))"));assertEquals("150",js("S.records.find(r=>r.kind==='sale').total"));assertEquals("true",js("document.documentElement.lang==='fr'&&document.querySelector('#phone').dir==='ltr'&&previewAppearance29==='light'"));
        action("site:logout");until("!!document.querySelector('[data-action=\"site:login\"]')");
        js("document.querySelector('[name=username]').value='upgrade-worker';document.querySelector('[name=password]').value='worker-5678';true");action("site:login");until("!!document.querySelector('.nav')");
        assertEquals("12",js("S.products[0].qty"));action("site:logout");until("!!document.querySelector('[data-action=\"site:login\"]')");
        write("upgrade-after.json",checkpoint(before,license).toString());
        System.out.println("UPGRADE PASS: real install -r preserved every business store, password, device code, certificate, native activation key, consumed license and remaining duration.");
    }
    @Test public void verifyAfterOfflineColdRestart() throws Exception {verifyReadOnlyRestart("force-stopped cold restart");}
    @Test public void verifyAfterRepeatedInPlaceUpdate() throws Exception {verifyReadOnlyRestart("second install-r of the identical candidate APK");}
}
