package mr.alkarna.mobile.approved;

import android.content.Context;
import android.net.ConnectivityManager;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.interfaces.ECPublicKey;
import java.time.Instant;
import java.util.*;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Two real APK phases. The original signed v34 creates every business row;
 * install-r replaces only its APK, without uninstall/clear/backup restoration.
 * Fixture signing material exists solely in the instrumentation APK/emulator. */
@RunWith(AndroidJUnit4.class)
public class Desktop862UpgradeTest extends UpgradePersistenceTest {
    private void offline() {
        ConnectivityManager connectivity=(ConnectivityManager)target().getSystemService(Context.CONNECTIVITY_SERVICE);
        assertNull("Upgrade fixture must stay offline; never contact the live service",connectivity.getActiveNetwork());
    }
    private void loginOwner() throws Exception {
        js("document.querySelector('[name=username]').value='upgrade-owner';document.querySelector('[name=password]').value='1234';true");
        action("site:login");until("!!document.querySelector('.nav')");
    }
    private JSONObject shop(JSONObject snapshot) throws Exception {
        JSONArray rows=snapshot.getJSONArray("snapshots");
        for(int i=0;i<rows.length();i++)if("shop".equals(rows.getJSONObject(i).getString("id")))return rows.getJSONObject(i);
        throw new AssertionError("Missing actual shop snapshot");
    }
    private long cloudRevision(JSONObject snapshot) throws Exception {
        JSONArray rows=snapshot.getJSONArray("meta");
        for(int i=0;i<rows.length();i++)if("cloud-backup-revision".equals(rows.getJSONObject(i).getString("id")))return rows.getJSONObject(i).getLong("value");
        return shop(snapshot).getLong("revision");
    }
    private static String coordinate(BigInteger value) {
        byte[] bytes=value.toByteArray(),result=new byte[32];int count=Math.min(bytes.length,32);System.arraycopy(bytes,bytes.length-count,result,32-count,count);return ProtocolJson.base64(result);
    }
    private JSONObject fixtureControl(DeviceLicense license,InstallationIdentity identity,String document) throws Exception {
        var field=TestLicenseIssuer.class.getDeclaredField("pair");field.setAccessible(true);KeyPair pair=(KeyPair)field.get(null);
        ECPublicKey key=(ECPublicKey)pair.getPublic();JSONObject jwk=new JSONObject().put("kty","EC").put("crv","P-256").put("x",coordinate(key.getW().getAffineX())).put("y",coordinate(key.getW().getAffineY()));
        String nonce=UUID.randomUUID().toString(),hash=ProtocolJson.hash(new JSONObject(document));
        JSONObject payload=new JSONObject().put("schemaVersion",1).put("purpose","standalone-device-control").put("applicationId",target().getPackageName())
            .put("installationId",identity.id()).put("keyFingerprint",identity.fingerprint()).put("deviceCode",license.deviceCode()).put("requestNonce",nonce).put("queryDocumentHash",hash)
            .put("controlGeneration",7).put("activationFence",0).put("banned",false).put("documentStatus","allowed").put("authorizationId","").put("sequence",0).put("issuedAt",System.currentTimeMillis());
        JSONObject envelope=new JSONObject().put("schema",StandaloneControl.SCHEMA).put("version",1).put("kid","upgrade-862-fixture").put("payload",payload);
        Signature signer=Signature.getInstance("SHA256withECDSA");signer.initSign(pair.getPrivate());signer.update(ProtocolJson.canonical(envelope).getBytes(StandardCharsets.UTF_8));envelope.put("signature",ProtocolJson.base64(ProtocolJson.rawSignature(signer.sign())));
        license.control(envelope,new JSONObject().put("upgrade-862-fixture",jwk),identity.id(),identity.fingerprint(),nonce,hash);
        return license.status().getJSONObject("control");
    }
    private JSONObject seedIndependentNativeState(JSONObject baseline) throws Exception {
        InstallationIdentity identity=new InstallationIdentity();DeviceLicense license=new DeviceLicense(target());
        JSONObject database=new JSONObject(baseline.getString("database")),business=shop(database).getJSONObject("state");JSONArray users=database.getJSONArray("users");String owner="";
        for(int i=0;i<users.length();i++)if("owner".equals(users.getJSONObject(i).optString("role")))owner=users.getJSONObject(i).getString("id");
        assertFalse("Actual owner identity is available for the backup",owner.isEmpty());
        byte[] bytes=new JSONObject().put("format","alkarna-web-backup").put("schemaVersion",1).put("createdAt",Instant.now().toString()).put("state",business).put("users",users).toString().getBytes(StandardCharsets.UTF_8);
        CloudBackupStore.validateSnapshot(bytes,business.getString("originId"));
        CloudBackupStore backup=new CloudBackupStore(target(),identity.fingerprint());
        JSONObject settings=CloudBackupPolicy.settings(new JSONObject().put("consent",true).put("schedule","weekly").put("time","13:37").put("weekday",5).put("wifiOnly",true).put("snapshotWindowMs",60000).put("startSpreadMs",30000));
        String id=UUID.randomUUID().toString(),hash=CloudBackupStore.hash(bytes);long due=System.currentTimeMillis()+7L*24*60*60*1000;
        backup.writeSnapshot(id,bytes);backup.state.put("settings",settings).put("context",new JSONObject().put("shopId",business.getString("originId")).put("ownerId",owner))
            .put("latest",new JSONObject().put("id",id).put("sha256",hash).put("sizeBytes",bytes.length).put("localRevision",Long.toString(cloudRevision(database))).put("snapshotAt",System.currentTimeMillis()))
            .put("stage","scheduled").put("dueAt",due);backup.save();
        String consumed=UUID.randomUUID().toString();DeviceLifecycleStore lifecycle=new DeviceLifecycleStore(target(),identity.fingerprint());lifecycle.consume(consumed);
        JSONObject control=fixtureControl(license,identity,baseline.getString("document"));license.checkpoint();
        return new JSONObject().put("backupId",id).put("backupHash",hash).put("backupSettings",settings).put("backupContext",backup.state.getJSONObject("context"))
            .put("lifecycleConsumedId",consumed).put("identityJwk",identity.publicJwk()).put("control",control);
    }
    private void assertNativeSurvived(JSONObject baseline,boolean requireOldBlob) throws Exception {
        JSONObject expected=baseline.getJSONObject("desktop862Native");InstallationIdentity identity=new InstallationIdentity(false);
        JSONObject jwk=expected.getJSONObject("identityJwk");assertEquals(ProtocolJson.canonical(jwk),ProtocolJson.canonical(identity.publicJwk()));
        String message="desktop862-upgrade-private-key-proof:"+UUID.randomUUID();byte[] raw=ProtocolJson.decode(identity.sign(message));
        Signature verifier=Signature.getInstance("SHA256withECDSA");verifier.initVerify(LicenseVerifier.key(jwk.getString("x"),jwk.getString("y")));verifier.update(message.getBytes(StandardCharsets.UTF_8));assertTrue("The original Keystore private identity still signs",verifier.verify(LicenseVerifier.der(raw)));
        CloudBackupStore backup=new CloudBackupStore(target(),identity.fingerprint());
        assertEquals("Backup schedule/consent survive",ProtocolJson.canonical(expected.getJSONObject("backupSettings")),ProtocolJson.canonical(backup.state.getJSONObject("settings")));
        assertEquals("Backup stays attached to the original owner/shop",ProtocolJson.canonical(expected.getJSONObject("backupContext")),ProtocolJson.canonical(backup.state.getJSONObject("context")));
        if(requireOldBlob){byte[] bytes=backup.snapshot(expected.getString("backupId"));assertEquals("Original encrypted backup decrypts after APK replacement",expected.getString("backupHash"),CloudBackupStore.hash(bytes));CloudBackupStore.validateSnapshot(bytes,backup.state.getJSONObject("context").getString("shopId"));}
        assertTrue("A consumed lifecycle authorization remains consumed",new DeviceLifecycleStore(target(),identity.fingerprint()).used(expected.getString("lifecycleConsumedId")));
        JSONObject control=new DeviceLicense(target()).status().getJSONObject("control");assertEquals("Remote control generation/fence are not reset",ProtocolJson.canonical(expected.getJSONObject("control")),ProtocolJson.canonical(control));
    }
    private void check(String message,String condition) throws Exception {assertEquals(message,"true",js(condition));}
    private void businessSmokeOnCandidate() throws Exception {
        // Preservation was verified above. These are now explicit new operations
        // against that same migrated shop, not a replacement/imported fixture.
        double cash=Double.parseDouble(js("S.accounts[0].balance"));
        action("open:deposit");fields("{account:S.accounts[0].id,amount:'1000',note:'رصيد فحص القواعد'}");action("post-cash");
        action("site:feature:employees-list");action("site:feature:employees-new");String start=text("document.querySelector('#sheet-form [name=startDate]').value");
        fields("{name:'موظف 862',phone:'22001122',startDate:"+JSONObject.quote(start)+",amount:'500',intervalMonths:'1',entitlement:'beginning'}");action("site:feature:employees-save");
        check("Beginning-period salary accrues once without spending cash","S.employees.length===1&&S.employees[0].balance===500&&Math.abs(S.accounts[0].balance-("+cash+"+1000))<1e-8");
        action("site:feature:employees-payment-new");fields("{amount:'200',direction:'withdraw',paymentMethod:String(S.accounts[0].id),note:'دفعة راتب'}");action("site:feature:employees-payment-save");
        js("window.__862Payroll=null;import('./payroll-domain.js').then(({payrollFacts})=>{const f=payrollFacts(S);window.__862Payroll=[f.workersAccrued,f.workersExpense,f.workersReserveChange]});true");until("window.__862Payroll!==null");
        assertEquals("Desktop salary/recognized expense/reserve agree","[500,200,300]",text("JSON.stringify(window.__862Payroll)"));
        check("Employee withdrawal spends only its actual cash","S.employees[0].balance===300&&Math.abs(S.accounts[0].balance-("+cash+"+800))<1e-8&&S.payrollFinancialMovements.length===1");
        String customer=js("S.parties.find(p=>p.type==='customer').id");double debt=Double.parseDouble(js("S.parties.find(p=>p.id==="+customer+").balance"));
        action("ledger:"+customer);action("site:feature:party-opening:"+customer);fields("{direction:'receivable',amount:'100',note:'رصيد سابق'}");action("site:feature:party-opening-review");action("site:feature:party-opening-save");
        check("Opening debt does not duplicate cash","Math.abs(S.parties.find(p=>p.id==="+customer+").balance-("+debt+"+100))<1e-8&&Math.abs(S.accounts[0].balance-("+cash+"+800))<1e-8");
        action("open:expense");fields("{name:'تشغيل المحل',amount:'30',note:'مصروف مصنف'}");action("site:feature:expense-categories");action("site:feature:expense-category-new");fields("{name:'تشغيل 862',kind:'recurring'}");action("site:feature:expense-category-save");action("site:feature:expense-category-close");action("post-cash");
        check("Expense category classification does not post extra money","S.expenseCategories.length===1&&S.records.some(r=>r.kind==='expense'&&r.total===30&&r.expenseCategoryId===S.expenseCategories[0].id)&&Math.abs(S.accounts[0].balance-("+cash+"+770))<1e-8");
        // The old draft survived. Discard it explicitly now before the new exact invoice.
        action("pos:clear");action("pos:confirm-clear");action("new:sale");String product=js("S.products[0].id");action("pos:add:"+product);action("pos:line:"+product);
        fields("{quantity:'3',price:'150',lineTotal:'100'}");js("document.querySelector('#sheet-form [name=lineTotal]').dispatchEvent(new Event('input',{bubbles:true}));true");action("pos:save-line");action("pos:checkout");action("post-sale");
        if("true".equals(js("modal==='pos-below-cost'")))action("pos:confirm-below-cost");
        check("Real Android WebView posts explicit total100/quantity3 without integer rounding","view==='invoice'&&S.records.find(r=>r.id===selected).total===100&&S.records.find(r=>r.id===selected).lines[0].lineTotalMode==='exact'&&S.records.find(r=>r.id===selected).lines[0].lineTotal===100&&S.products[0].qty===9&&Math.abs(S.accounts[0].balance-("+cash+"+870))<1e-8");
        String number=js("selected");action("source-location:"+number);check("Go-to-source locates, never enters an editor","view==='sale-source'&&modal===null&&editingId===null");action("invoice:"+number);
        check("The source invoice offers the explicit edit action","!!document.querySelector('[data-action=\"source:"+number+"\"]')&&!document.querySelector('[data-action=\"source-location:"+number+"\"]')");
        System.out.println("UPGRADE 862 BUSINESS PASS: native WebView salary500/payment200/reserve300, noncash opening debt, classified expense and exact100/3 invoice/source navigation persist on the migrated shop.");
    }
    @Test public void seedDesktop862PreviousVersion() throws Exception {
        assertFalse("Never overwrite an existing emulator activation",new java.io.File(target().getNoBackupFilesDir(),"activation-v2.json").exists());
        assertFalse("Never overwrite existing activation preferences",target().getSharedPreferences("activation-v2",Context.MODE_PRIVATE).contains("state"));
        assertEquals("This seed must use the original distributed APK34",34,ExistingLicenseAccess.installedVersion());offline();
        super.seedPreviousVersion();JSONObject before=new JSONObject(read("upgrade-before.json"));loginOwner();
        action("go:inventory");action("open:product");fields("{name:'سكر',price:'0.149',cost:'0.01',qty:'3',openingWarehouse:S.warehouse}");action("save-product");until("S.products.length===2&&modal===null");
        String product=js("S.products.find(p=>p.name==='سكر').id"),customer=js("S.parties.find(p=>p.type==='customer').id");
        action("new:sale");action("pos:add:"+product);action("pos:party");action("pos:party-pick:"+customer);action("pos:checkout");action("pos:settlement:note");action("post-sale");
        assertEquals("The actual v34 engine retains its cent-rounded agreement","0.15",js("S.records.find(r=>r.id===selected).total"));long sale=Long.parseLong(js("selected"));
        action("open:expense");fields("{name:'مصروف غير مكتمل',account:S.accounts[0].id,amount:'12.75',note:'مسودة محفوظة'}");js("document.querySelector('#sheet-form [name=amount]').dispatchEvent(new Event('input',{bubbles:true}));true");action("close");
        action("new:sale");action("pos:add:"+js("S.products[0].id"));action("pos:note");fields("{note:'مسودة فاتورة محفوظة عبر تحديث 862'}");action("pos:save-note");
        action("site:logout");until("!!document.querySelector('[data-action=\"site:login\"]')");
        assertEquals("Both real old-app drafts were saved","true",js("Object.keys(localStorage).some(k=>k.startsWith('alkarna-pos-draft:'))&&Object.keys(localStorage).some(k=>k.startsWith('alkarna-workflow-draft:')&&k.endsWith(':expense'))"));
        before.put("database",databaseSnapshot()).put("localStorage",preferences()).put("desktop862LegacySaleId",sale).put("desktop862LegacyProductId",Long.parseLong(product));
        assertEquals("Seeded schema is the actual previous version",2,shop(new JSONObject(before.getString("database"))).getJSONObject("state").getInt("featureSchema"));
        activity.close();activity=null;before.put("desktop862Native",seedIndependentNativeState(before));
        before.put("remainingSeconds",new DeviceLicense(target()).status().getJSONObject("license").get("remainingSeconds"));write("upgrade-before.json",before.toString());
        System.out.println("UPGRADE 862 SEED PASS: original APK34 UI, legacy cent credit, real drafts, original owner/worker hashes, encrypted backup/settings, signed remote-control fence and consumed receipt.");
    }
    @Test public void verifyDesktop862AfterInPlaceUpdate() throws Exception {
        assertTrue("Candidate version must advance beyond APK34",ExistingLicenseAccess.installedVersion()>34);offline();JSONObject before=new JSONObject(read("upgrade-before.json"));
        assertNativeSurvived(before,true);super.verifyAfterInPlaceUpdate();loginOwner();
        assertEquals("Schema3 collections were added without replacing business history","true",js("S.featureSchema===3&&Array.isArray(S.employees)&&Array.isArray(S.expenseCategories)&&Array.isArray(S.payrollFinancialMovements)&&S.employees.length===0&&S.expenseCategories.length===0&&S.payrollFinancialMovements.length===0"));
        long id=before.getLong("desktop862LegacySaleId");assertEquals("Legacy invoice money must not be reinterpreted","0.15",js("S.records.find(r=>r.id==="+id+").total"));
        assertEquals("Legacy line price stays exact","0.149",js("S.records.find(r=>r.id==="+id+").lines[0].price"));
        assertEquals("The unposted old POS draft is available unchanged","true",js("cart.length===1&&cart[0].qty===1&&posNote==='مسودة فاتورة محفوظة عبر تحديث 862'"));
        businessSmokeOnCandidate();
        action("site:logout");until("!!document.querySelector('[data-action=\"site:login\"]')");assertNativeSurvived(before,false);
        write("upgrade-after.json",checkpoint(before,new DeviceLicense(target())).toString());
        System.out.println("UPGRADE 862 PASS: original signed APK34 -> candidate install-r; full schema2 history, passwords/drafts, native license countdown/control/private identity, backup consent/schedule/encrypted content and consumed authorization retained.");
    }
    @Override @Test public void verifyAfterOfflineColdRestart() throws Exception {super.verifyAfterOfflineColdRestart();assertNativeSurvived(new JSONObject(read("upgrade-after.json")),false);}
    @Override @Test public void verifyAfterRepeatedInPlaceUpdate() throws Exception {super.verifyAfterRepeatedInPlaceUpdate();assertNativeSurvived(new JSONObject(read("upgrade-after.json")),false);}
}
