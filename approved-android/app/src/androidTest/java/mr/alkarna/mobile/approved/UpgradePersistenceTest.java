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
    protected ActivityScenario<MainActivity> activity;
    private Map<String,PublicKey> originalKeys;
    protected Context target() { return InstrumentationRegistry.getInstrumentation().getTargetContext(); }
    // Instrumentation executes with the target UID. Its temporary emulator-only state
    // must live under that UID, and survives the target APK replacement between phases.
    protected File testFile(String name) { return new File(target().getNoBackupFilesDir(),"instrumentation-"+name); }
    protected void write(String name,String content) throws Exception {try(var out=new FileOutputStream(testFile(name))){out.write(content.getBytes(StandardCharsets.UTF_8));}}
    protected String read(String name) throws Exception {try(var in=new FileInputStream(testFile(name))){return new String(in.readAllBytes(),StandardCharsets.UTF_8);}}
    @Before public void persistentInstrumentationIssuer() throws Exception {
        assertTrue("Upgrade fixtures may only run on an isolated emulator",android.os.Build.HARDWARE.equals("ranchu")||android.os.Build.HARDWARE.equals("goldfish")||android.os.Build.FINGERPRINT.contains("emulator")||android.os.Build.MODEL.contains("sdk_gphone"));
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
    protected String js(String script) throws Exception {
        var result=new ArrayBlockingQueue<String>(1);
        activity.onActivity(a->a.getWebView().evaluateJavascript(script,v->result.offer(v==null?"null":v)));
        String value=result.poll(20,TimeUnit.SECONDS);assertNotNull("WebView callback",value);return value;
    }
    protected String text(String script) throws Exception {return new JSONTokener(js(script)).nextValue().toString();}
    protected void until(String condition) throws Exception {
        long end=System.currentTimeMillis()+25000;
        while(System.currentTimeMillis()<end){if("true".equals(js(condition)))return;Thread.sleep(100);}
        fail("Timed out: "+condition+"; "+js("document.body.innerText"));
    }
    protected void action(String name) throws Exception {
        js("window.__upgradeAction=false;act("+JSONObject.quote(name)+").finally(()=>window.__upgradeAction=true);true");
        until("window.__upgradeAction===true&&!document.querySelector('.busy')");
    }
    protected void fields(String values) throws Exception {
        assertEquals("All seed fields exist","true",js("(()=>{for(const [key,value]of Object.entries("+values+")){const input=document.querySelector('#sheet-form [name='+key+']');if(!input)throw Error('Missing field '+key);input.value=value}return true})()"));
    }
    protected String databaseSnapshot() throws Exception {
        js("window.__upgradeSnapshot=null;(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('alkarna-site-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const result={};for(const name of [...db.objectStoreNames].sort())result[name]=await new Promise((resolve,reject)=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});db.close();window.__upgradeSnapshot=JSON.stringify(result)})();true");
        until("window.__upgradeSnapshot!==null");return text("window.__upgradeSnapshot");
    }
    protected String preferences() throws Exception {return text("JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])))");}
    private String signer() throws Exception {
        var info=target().getPackageManager().getPackageInfo(target().getPackageName(),PackageManager.GET_SIGNATURES);
        byte[] hash=MessageDigest.getInstance("SHA-256").digest(info.signatures[0].toByteArray());StringBuilder out=new StringBuilder();for(byte b:hash)out.append(String.format("%02x",b&255));return out.toString();
    }
    private void checkVersion() throws Exception {
        long expected=Long.parseLong(InstrumentationRegistry.getArguments().getString("expectedVersionCode"));
        assertEquals(expected,target().getPackageManager().getPackageInfo(target().getPackageName(),0).getLongVersionCode());
    }
    protected void preserved(Object oldValue,Object newValue,String path) throws Exception {
        if(oldValue instanceof JSONObject){assertTrue(path,newValue instanceof JSONObject);JSONObject old=(JSONObject)oldValue,next=(JSONObject)newValue;for(Iterator<String> keys=old.keys();keys.hasNext();){String key=keys.next();assertTrue(path+"."+key+" retained",next.has(key));preserved(old.get(key),next.get(key),path+"."+key);}}
        else if(oldValue instanceof JSONArray){assertTrue(path,newValue instanceof JSONArray);JSONArray old=(JSONArray)oldValue,next=(JSONArray)newValue;assertEquals(path+" length",old.length(),next.length());for(int i=0;i<old.length();i++)preserved(old.get(i),next.get(i),path+"["+i+"]");}
        else assertEquals(path,oldValue,newValue);
    }
    private JSONObject shopRow(JSONArray rows) throws Exception {
        for(int i=0;i<rows.length();i++)if("shop".equals(rows.getJSONObject(i).getString("id")))return rows.getJSONObject(i);
        throw new AssertionError("Shop snapshot is missing");
    }
    private JSONObject byId(JSONArray rows,String id) throws Exception {
        for(int i=0;i<rows.length();i++)if(id.equals(rows.getJSONObject(i).getString("id")))return rows.getJSONObject(i);
        return null;
    }
    private boolean ordinarySettlement(JSONObject row) {
        if(!"adjustment".equals(row.optString("kind"))||row.optBoolean("productArchiveStockClearance"))return false;
        String number=row.optString("number").trim(),title=row.optString("title").trim();
        return !(row.optBoolean("openingStock")||row.optBoolean("openingCorrection")||number.startsWith("OPEN-COR")||number.equals("OPEN")||number.startsWith("OPEN-")||Arrays.asList("رصيد بداية","تصحيح رصيد البداية","إضافة رصيد افتتاحي").contains(title)||row.has("openingStockAfter")||row.has("openingTotalBefore")&&row.has("openingTotalAfter"));
    }
    /** Only the declared additive migrations may change the old shop. In particular,
     * salaries, invoice raw numbers/IDs, balances and opaque provenance stay exact. */
    private JSONObject migratedBusiness(JSONObject original,int schema) throws Exception {
        JSONObject expected=new JSONObject(original.toString());expected.put("featureSchema",schema);
        if(schema>=3)for(String name:new String[]{"employees","payrollFinancialMovements","auditEvents","expenseCategories"})if(!expected.has(name))expected.put(name,new JSONArray());
        if(schema>=4){
            assertTrue("Only reviewed schema2/schema3 -> schema4 migrations are accepted",original.getInt("featureSchema")==2||original.getInt("featureSchema")==3||original.getInt("featureSchema")==4);
            if(!expected.has("counters"))expected.put("counters",new JSONArray());
            JSONArray counters=expected.getJSONArray("counters");JSONObject counter=null;
            for(int i=0;i<counters.length();i++)if("documentSequence:stock-settlement".equals(counters.getJSONObject(i).optString("_id")))counter=counters.getJSONObject(i);
            JSONObject sequences=expected.getJSONObject("sequences");long maximum=Math.max(counter==null?0:counter.getLong("value"),sequences.optLong("stock-settlement",0));
            ArrayList<JSONObject> rows=new ArrayList<>();JSONArray records=expected.getJSONArray("records");
            for(int i=0;i<records.length();i++)if(ordinarySettlement(records.getJSONObject(i)))rows.add(records.getJSONObject(i));
            rows.sort(Comparator.comparingLong(row->row.optLong("id")));Set<Long> used=new HashSet<>();ArrayList<JSONObject> missing=new ArrayList<>();
            for(JSONObject row:rows){if(row.has("settlementSequence")){long sequence=row.getLong("settlementSequence");assertTrue("Existing settlement sequence is a unique positive integer",sequence>0&&used.add(sequence));maximum=Math.max(maximum,sequence);}else missing.add(row);}
            for(JSONObject row:missing)row.put("settlementSequence",++maximum);
            if(!rows.isEmpty()||counter!=null||maximum>0){
                if(counter==null){counter=new JSONObject().put("_id","documentSequence:stock-settlement");counters.put(counter);}counter.put("value",maximum);sequences.put("stock-settlement",maximum);
            }
        }
        return expected;
    }
    private void businessPreserved(String beforeText,String afterText) throws Exception {
        JSONObject old=new JSONObject(beforeText),next=new JSONObject(afterText);
        JSONArray snapshots=old.getJSONArray("snapshots"),updated=next.getJSONArray("snapshots");
        JSONObject oldShop=shopRow(snapshots),newShop=shopRow(updated),oldState=oldShop.getJSONObject("state"),newState=newShop.getJSONObject("state");
        int expectedSchema=Integer.parseInt(InstrumentationRegistry.getArguments().getString("expectedFeatureSchema","4"));
        assertEquals("The installed runtime has the expected additive schema",expectedSchema,newState.getInt("featureSchema"));
        boolean migrated=oldState.optInt("featureSchema",0)<expectedSchema;
        assertEquals("Exactly one atomic migration commit",oldShop.getLong("revision")+(migrated?1:0),newShop.getLong("revision"));
        for(Iterator<String> names=old.keys();names.hasNext();){String name=names.next();assertTrue("Existing store retained: "+name,next.has(name));
            if("snapshots".equals(name))continue;
            if(!"meta".equals(name)||!migrated){preserved(old.getJSONArray(name),next.getJSONArray(name),name);continue;}
            JSONArray prior=old.getJSONArray(name),current=next.getJSONArray(name);
            JSONObject oldCloud=byId(prior,"cloud-backup-revision"),newCloud=byId(current,"cloud-backup-revision");
            assertNotNull("Migration retains/creates the backup revision",newCloud);
            long cloudBefore=oldCloud==null?oldShop.getLong("revision"):oldCloud.getLong("value");
            assertEquals("Only the committed migration advances cloud backup revision",Math.max(cloudBefore,oldShop.getLong("revision"))+1,newCloud.getLong("value"));
            for(int i=0;i<prior.length();i++){JSONObject row=prior.getJSONObject(i),found=byId(current,row.getString("id"));assertNotNull("Metadata retained",found);if(!row.getString("id").equals("cloud-backup-revision"))preserved(row,found,"metadata "+row.getString("id"));}
            assertEquals("No unrelated metadata is introduced",prior.length()+(oldCloud==null?1:0),current.length());
        }
        for(int i=0;i<snapshots.length();i++){JSONObject row=snapshots.getJSONObject(i),found=byId(updated,row.getString("id"));assertNotNull("Old snapshot retained",found);
            if(row.getString("id").equals("shop")){JSONObject expected=migratedBusiness(row.getJSONObject("state"),expectedSchema);preserved(expected,found.getJSONObject("state"),"all existing business fields");preserved(found.getJSONObject("state"),expected,"no undeclared business migration");}
            else preserved(row,found,"historical snapshot");
        }
        for(int i=0;i<updated.length();i++){JSONObject row=updated.getJSONObject(i);String id=row.getString("id");boolean existed=byId(snapshots,id)!=null;
            if((expectedSchema>=4?"before-feature-upgrade-870":"before-feature-upgrade-862").equals(id)&&!existed){assertTrue("Migration backup requires a real migration",migrated);preserved(oldState,row.getJSONObject("state"),"exact pre-migration backup");preserved(row.getJSONObject("state"),oldState,"pre-migration backup has no substituted fields");}
            else assertTrue("Only known migration backup rows may be added: "+id,existed||expectedSchema<4&&("before-compact-product-names".equals(id)||"safety-backup".equals(id)));
        }
        if(migrated)assertNotNull("An exact pre-migration copy is retained",byId(updated,expectedSchema>=4?"before-feature-upgrade-870":"before-feature-upgrade-862"));
    }
    protected DeviceLicense nativePreserved(JSONObject before,boolean chargedOfflineInterval) throws Exception {
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
    protected JSONObject checkpoint(JSONObject before,DeviceLicense license) throws Exception {
        license.checkpoint();JSONObject snapshot=new JSONObject(before.toString());
        return snapshot.put("database",databaseSnapshot()).put("localStorage",preferences())
            .put("remainingSeconds",license.status().getJSONObject("license").get("remainingSeconds"))
            .put("installationId",new InstallationIdentity().id()).put("installationFingerprint",new InstallationIdentity().fingerprint());
    }
    private void verifyReadOnlyRestart(String phase) throws Exception {
        JSONObject before=new JSONObject(read("upgrade-after.json"));DeviceLicense license=nativePreserved(before,false);
        activity=ActivityScenario.launch(MainActivity.class);ExistingLicenseAccess.enter(activity);until("!!document.querySelector('[data-action=\"site:login\"]')");
        JSONObject old=new JSONObject(before.getString("database")),next=new JSONObject(databaseSnapshot());
        // Login verification deliberately adds expired session rows in the first phase.
        // This later baseline includes those rows, so a cold boot/reinstall must be fully idempotent.
        preserved(old,next,"offline "+phase);preserved(next,old,"offline "+phase+" has no new writes");
        assertEquals(before.getString("localStorage"),preferences());
        write("upgrade-after.json",checkpoint(before,license).toString());
        System.out.println("UPGRADE PASS: "+phase+" preserved every store, credentials, business rows, preferences, identities and activation countdown.");
    }
    private void verifyReviewedEntryAndReturn(JSONObject before) throws Exception {
        assertTrue("This check belongs to the local standalone-control candidate",ExistingLicenseAccess.installedVersion()>=34);
        String databaseBefore=databaseSnapshot(),preferencesBefore=preferences();
        assertEquals("The local fork has no institution entry bridge","true",js("typeof NativeHost.openAccountAccess==='undefined'"));
        assertEquals("Existing owners see their ordinary local login","true",js("!!document.querySelector('#site-auth-form [name=username]')&&!!document.querySelector('#site-auth-form [name=password]')&&!document.querySelector('[data-action=\"site:account-entry\"]')"));
        assertEquals("The ordinary local login preserves every database row",databaseBefore,databaseSnapshot());
        assertEquals("The ordinary local login preserves local preferences",preferencesBefore,preferences());
        nativePreserved(before,false);
        System.out.println("UPGRADE LOCAL ENTRY PASS: normal local login, no institution bridge, unchanged database/preferences/licence.");
    }
    private void warmOldEntryBeforeSnapshot() throws Exception {
        long version=ExistingLicenseAccess.installedVersion();if(version!=29&&version!=30&&version!=31&&version!=32&&version!=33)return;
        String databaseBefore=databaseSnapshot(),preferencesBefore=preferences();
        js("NativeHost.openAccountAccess();true");
        until("location.pathname.endsWith('/access.html')&&!!document.querySelector('#identifier')&&!!document.querySelector('#legacy:not(:disabled)')");
        if(version<=30)assertEquals("The actual old v29/v30 entry still exposes its original manual-import control","true",js("!!document.querySelector('#manual')&&!!document.querySelector('#identifier')&&!!document.querySelector('#code')"));
        else if(version==31)assertEquals("The actual old v31 entry still exposes its delivered phone-or-company explanation","true",js("!!document.querySelector('#login-form #code')&&/رقم الهاتف أو بريد المنشأة|Téléphone ou e-mail de l’établissement/.test(document.body.innerText)"));
        else if(version==32)assertEquals("The actual old v32 entry retains its framed generic form before the familiar-layout upgrade","true",js("!!document.querySelector('#brand-caption')&&!!document.querySelector('#login-form #identifier')&&!!document.querySelector('#login-form #code')&&!document.querySelector('#company-retry,#activate,#manual')"));
        else assertEquals("The actual old v33 entry retains its delivered flat form before upgrade","true",js("!!document.querySelector('.auth-screen .auth-card #login-form #identifier')&&!!document.querySelector('#login-form #code')&&!!document.querySelector('#login-form #consent')&&!document.querySelector('#company-retry,#activate,#manual')"));
        js("document.querySelector('#legacy').click();true");
        until("location.pathname.endsWith('/index.html')&&document.documentElement?.dataset.runtimeState==='ready'&&!!document.querySelector('[data-action=\"site:login\"]')");
        assertEquals("Warming the old entry cannot change a local database row",databaseBefore,databaseSnapshot());
        assertEquals("Warming the old entry cannot change a local preference",preferencesBefore,preferences());
        System.out.println("UPGRADE OLD ENTRY WARMED: actual v"+version+" original delivered entry loaded and returned to local login without clearing cache or changing data.");
    }
    @Test public void seedPreviousVersion() throws Exception {
        checkVersion();DeviceLicense license=new DeviceLicense(target());
        String type=InstrumentationRegistry.getArguments().getString("upgradeLicenseType","temporary");
        String document=TestLicenseIssuer.issue(license.deviceCode(),type,10800);
        assertTrue(license.install(document).getBoolean("valid"));
        activity=ActivityScenario.launch(MainActivity.class);ExistingLicenseAccess.enter(activity);
        until("!!document.querySelector('[data-action=\"site:setup\"]')");
        js("document.querySelector('[name=username]').value='upgrade-owner';document.querySelector('[name=password]').value='1234';true");action("site:setup");
        until("!!document.querySelector('.nav')");action("go:inventory");action("open:product");
        fields("{name:'قهوة',price:'150',cost:'60',qty:'12',openingWarehouse:S.warehouse}");action("save-product");
        until("S.products.length===1&&modal===null");action("new:sale");action("pos:add:"+js("S.products[0].id"));action("pos:checkout");action("post-sale");
        assertEquals("11",js("S.products[0].qty"));assertEquals("150",js("S.records.find(r=>r.kind==='sale').total"));
        long seedSaleId=Long.parseLong(js("S.records.find(r=>r.kind==='sale').id"));
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
        activity.close();activity=ActivityScenario.launch(MainActivity.class);ExistingLicenseAccess.enter(activity);
        until("!!document.querySelector('[data-action=\"site:login\"]')");
        warmOldEntryBeforeSnapshot();
        JSONObject snapshot=new JSONObject().put("database",databaseSnapshot()).put("device",license.deviceCode()).put("certificate",signer()).put("document",document)
            .put("licenseId",license.status().getJSONObject("license").getString("licenseId"))
            .put("type",type).put("remainingSeconds",license.status().getJSONObject("license").get("remainingSeconds"))
            .put("localStorage",preferences()).put("seedSaleId",seedSaleId);
        // The actual v13 APK predates Contatools; do not manufacture a pre-upgrade identity.
        if(target().getPackageManager().getPackageInfo(target().getPackageName(),0).getLongVersionCode()>=14)
            snapshot.put("installationId",new InstallationIdentity().id()).put("installationFingerprint",new InstallationIdentity().fingerprint());
        license.checkpoint();write("upgrade-before.json",snapshot.toString());
        System.out.println("UPGRADE seed: two real UI-created users/passwords, inventory, customer/supplier, sale/purchase, receive/pay receipts, balances, French/light preferences and "+type+" activation.");
    }
    @Test public void verifyAfterInPlaceUpdate() throws Exception {
        JSONObject before=new JSONObject(read("upgrade-before.json"));boolean chargedOffline="true".equals(InstrumentationRegistry.getArguments().getString("requireOfflineElapsed"));DeviceLicense license=nativePreserved(before,chargedOffline);
        activity=ActivityScenario.launch(MainActivity.class);ExistingLicenseAccess.enter(activity);
        until("!!document.querySelector('[data-action=\"site:login\"]')");
        businessPreserved(before.getString("database"),databaseSnapshot());
        assertEquals(before.getString("localStorage"),preferences());
        js("document.querySelector('[name=username]').value='upgrade-owner';document.querySelector('[name=password]').value='1234';true");action("site:login");until("!!document.querySelector('.nav')");
        assertEquals("true",js("S.products[0].qty===12&&S.parties.length===2&&['sale','purchase','receive','pay'].every(kind=>S.records.some(r=>r.kind===kind))"));assertEquals("150",js("S.records.find(r=>r.id==="+before.getLong("seedSaleId")+").total"));assertEquals("true",js("document.documentElement.lang==='fr'&&document.querySelector('#phone').dir==='ltr'&&previewAppearance29==='light'"));
        action("site:logout");until("!!document.querySelector('[data-action=\"site:login\"]')");
        js("document.querySelector('[name=username]').value='upgrade-worker';document.querySelector('[name=password]').value='worker-5678';true");action("site:login");until("!!document.querySelector('.nav')");
        assertEquals("12",js("S.products[0].qty"));action("site:logout");until("!!document.querySelector('[data-action=\"site:login\"]')");
        verifyReviewedEntryAndReturn(before);
        write("upgrade-after.json",checkpoint(before,license).toString());
        System.out.println("UPGRADE PASS: real install -r preserved every business store, password, device code, certificate, native activation key, consumed license and remaining duration.");
    }
    @Test public void verifyAfterOfflineColdRestart() throws Exception {verifyReadOnlyRestart("force-stopped cold restart");}
    @Test public void verifyAfterRepeatedInPlaceUpdate() throws Exception {verifyReadOnlyRestart("second install-r of the identical candidate APK");}
}
