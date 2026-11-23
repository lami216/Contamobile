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

/** Two real APK phases. The original signed v39 creates every business row;
 * install-r replaces only its APK, without uninstall/clear/backup restoration.
 * Fixture signing material exists solely in the instrumentation APK/emulator. */
@RunWith(AndroidJUnit4.class)
public class Desktop0130UpgradeTest extends UpgradePersistenceTest {
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
        JSONObject envelope=new JSONObject().put("schema",StandaloneControl.SCHEMA).put("version",1).put("kid","upgrade-870-fixture").put("payload",payload);
        Signature signer=Signature.getInstance("SHA256withECDSA");signer.initSign(pair.getPrivate());signer.update(ProtocolJson.canonical(envelope).getBytes(StandardCharsets.UTF_8));envelope.put("signature",ProtocolJson.base64(ProtocolJson.rawSignature(signer.sign())));
        license.control(envelope,new JSONObject().put("upgrade-870-fixture",jwk),identity.id(),identity.fingerprint(),nonce,hash);
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
        JSONObject settings=CloudBackupPolicy.settings(new JSONObject().put("consent",true).put("schedule","weekly").put("time","13:38").put("weekday",5).put("wifiOnly",true).put("snapshotWindowMs",60000).put("startSpreadMs",30000));
        String id=UUID.randomUUID().toString(),hash=CloudBackupStore.hash(bytes);long due=System.currentTimeMillis()+7L*24*60*60*1000;
        backup.writeSnapshot(id,bytes);backup.state.put("settings",settings).put("context",new JSONObject().put("shopId",business.getString("originId")).put("ownerId",owner))
            .put("latest",new JSONObject().put("id",id).put("sha256",hash).put("sizeBytes",bytes.length).put("localRevision",Long.toString(cloudRevision(database))).put("snapshotAt",System.currentTimeMillis()))
            .put("stage","scheduled").put("dueAt",due);backup.save();
        String recoveryConsumed=UUID.randomUUID().toString();new RecoveryJournal(target(),license.deviceCode(),identity.fingerprint()).consume(recoveryConsumed);
        String consumed=UUID.randomUUID().toString();DeviceLifecycleStore lifecycle=new DeviceLifecycleStore(target(),license.deviceCode()+"|"+identity.fingerprint());lifecycle.consume(consumed);
        JSONObject control=fixtureControl(license,identity,baseline.getString("document"));license.checkpoint();
        return new JSONObject().put("backupId",id).put("backupHash",hash).put("backupSettings",settings).put("backupContext",backup.state.getJSONObject("context"))
            .put("recoveryConsumedId",recoveryConsumed).put("lifecycleConsumedId",consumed).put("identityJwk",identity.publicJwk()).put("control",control);
    }
    private void assertNativeSurvived(JSONObject baseline,boolean requireOldBlob) throws Exception {
        JSONObject expected=baseline.getJSONObject("parity0130Native");InstallationIdentity identity=new InstallationIdentity(false);
        JSONObject jwk=expected.getJSONObject("identityJwk");assertEquals(ProtocolJson.canonical(jwk),ProtocolJson.canonical(identity.publicJwk()));
        String message="parity0130-upgrade-private-key-proof:"+UUID.randomUUID();byte[] raw=ProtocolJson.decode(identity.sign(message));
        Signature verifier=Signature.getInstance("SHA256withECDSA");verifier.initVerify(LicenseVerifier.key(jwk.getString("x"),jwk.getString("y")));verifier.update(message.getBytes(StandardCharsets.UTF_8));assertTrue("The original Keystore private identity still signs",verifier.verify(LicenseVerifier.der(raw)));
        CloudBackupStore backup=new CloudBackupStore(target(),identity.fingerprint());
        assertEquals("Backup schedule/consent survive",ProtocolJson.canonical(expected.getJSONObject("backupSettings")),ProtocolJson.canonical(backup.state.getJSONObject("settings")));
        assertEquals("Backup stays attached to the original owner/shop",ProtocolJson.canonical(expected.getJSONObject("backupContext")),ProtocolJson.canonical(backup.state.getJSONObject("context")));
        if(requireOldBlob){byte[] bytes=backup.snapshot(expected.getString("backupId"));assertEquals("Original encrypted backup decrypts after APK replacement",expected.getString("backupHash"),CloudBackupStore.hash(bytes));CloudBackupStore.validateSnapshot(bytes,backup.state.getJSONObject("context").getString("shopId"));}
        assertTrue("A consumed lifecycle authorization remains consumed",new DeviceLifecycleStore(target(),new DeviceLicense(target()).deviceCode()+"|"+identity.fingerprint()).used(expected.getString("lifecycleConsumedId")));
        assertTrue("A consumed owner recovery authorization remains consumed",new RecoveryJournal(target(),new DeviceLicense(target()).deviceCode(),identity.fingerprint()).used(expected.getString("recoveryConsumedId")));
        JSONObject control=new DeviceLicense(target()).status().getJSONObject("control");assertEquals("Remote control generation/fence are not reset",ProtocolJson.canonical(expected.getJSONObject("control")),ProtocolJson.canonical(control));
    }

    @Test public void seedDesktop0130PreviousVersion() throws Exception {
        assertEquals("Warm only the original distributed APK39",39,ExistingLicenseAccess.installedVersion());offline();
        assertFalse("Never overwrite an emulator activation",new java.io.File(target().getNoBackupFilesDir(),"activation-v2.json").exists());
        super.seedPreviousVersion();JSONObject before=new JSONObject(read("upgrade-before.json"));loginOwner();
        action("open:deposit");fields("{account:S.accounts[0].id,amount:'13.5',note:'بيان النسخة الأصلية 39'}");action("post-cash");String movement=js("selected");
        action("source:"+movement);js("document.querySelector('#sheet-form [name=note]').remove();true");action("post-cash");
        assertEquals("Original39 omission preserves its literal statement","true",js("S.records.find(r=>r.id==="+movement+").note==='بيان النسخة الأصلية 39'"));
        action("source:"+movement);fields("{note:''}");action("post-cash");
        assertEquals("Original39 explicit clearing is already committed","true",js("S.records.find(r=>r.id==="+movement+").note===null"));
        action("open:expense");fields("{name:'مصروف أصلي 39',account:S.accounts[0].id,amount:'17.25',note:'وقت أصلي محفوظ'}");action("post-cash");
        action("open:expense");fields("{name:'مصروف غير مكتمل 39',account:S.accounts[0].id,amount:'12.75',note:'مسودة محفوظة'}");js("document.querySelector('#sheet-form [name=amount]').dispatchEvent(new Event('input',{bubbles:true}));true");action("close");
        action("new:sale");action("pos:add:"+js("S.products[0].id"));action("pos:note");fields("{note:'مسودة محفوظة من النسخة الأصلية 39'}");action("pos:save-note");action("site:logout");until("!!document.querySelector('[data-action=\"site:login\"]')");
        js("document.querySelector('[data-owner-recovery]').click();true");until("!!document.querySelector('.owner-recovery-overlay select')");
        js("document.querySelector('.owner-recovery-panel header button').click();true");until("!document.querySelector('.owner-recovery-overlay')");
        before.put("database",databaseSnapshot()).put("localStorage",preferences());
        assertEquals("Actual original39 business schema remains4",4,shop(new JSONObject(before.getString("database"))).getJSONObject("state").getInt("featureSchema"));
        activity.close();activity=null;before.put("parity0130Native",seedIndependentNativeState(before));before.put("remainingSeconds",new DeviceLicense(target()).status().getJSONObject("license").get("remainingSeconds"));write("upgrade-before.json",before.toString());
        System.out.println("UPGRADE DESKTOP0130 SEED PASS: exact original39 invoice/movement/user records and cleared notes, two drafts, recovery modal, encrypted backup/control/private identity and consumed owner/lifecycle authorizations.");
    }
    @Test public void verifyDesktop0130AfterInPlaceUpdate() throws Exception {
        assertEquals("Candidate is exactly40",40,ExistingLicenseAccess.installedVersion());offline();JSONObject before=new JSONObject(read("upgrade-before.json"));assertNativeSurvived(before,true);
        super.verifyAfterInPlaceUpdate();
        String database=databaseSnapshot(),prefs=preferences();
        js("document.querySelector('[data-owner-recovery]').click();true");until("!!document.querySelector('.owner-recovery-overlay select')");
        js("document.querySelector('.owner-recovery-panel header button').click();true");until("!document.querySelector('.owner-recovery-overlay')");
        assertEquals("Opening recovery without approval cannot change any business store",database,databaseSnapshot());assertEquals("Opening recovery preserves all preferences and drafts",prefs,preferences());
        String untouchedDatabase=databaseSnapshot(),untouchedPreferences=preferences();
        js("window.__parity0130Output=null;window.__parity0130Task=(async()=>{const{invoicePdfModel}=await import('./report-output.js'),{recordExportData}=await import('./record-export.js'),{resolveCurrentProductCost}=await import('./cost-provenance.js');const record=S.records.find(row=>row.kind==='expense'&&row.note==='وقت أصلي محفوظ');if(!record)throw Error('Original saved-note expense missing');const model=invoicePdfModel(S,record,documentLabels,{language:'fr'}),sheets=recordExportData(S,[record],documentLabels,{language:'fr'}),purchase=S.records.find(row=>row.kind==='purchase'),line=purchase.lines[0],product=S.products.find(row=>row.id===line.product);window.__parity0130Output=JSON.stringify({pdfNote:model.blocks.flatMap(block=>block.rows||[]).flat().filter(value=>value===record.note).length,excelNote:sheets[0].rows[1].filter(value=>value===record.note).length,latestCost:resolveCurrentProductCost(S,product).cost,sourceCost:line.price});})();true");
        until("window.__parity0130Output!==null");JSONObject output=new JSONObject(text("window.__parity0130Output"));
        assertEquals("Saved literal note appears once in the French PDF",1,output.getInt("pdfNote"));
        assertEquals("Saved literal note appears once in Excel",1,output.getInt("excelNote"));
        assertEquals("Current cost follows the recorded purchase, not a new card value",output.getDouble("sourceCost"),output.getDouble("latestCost"),0);
        assertEquals("Rendering source-backed notes/cost changes no stored row",untouchedDatabase,databaseSnapshot());
        assertEquals("Rendering preserves all credentials/preferences/drafts",untouchedPreferences,preferences());
        assertNativeSurvived(before,false);write("upgrade-after.json",checkpoint(before,new DeviceLicense(target())).toString());
        System.out.println("UPGRADE DESKTOP0130 PASS: exact original39 ->40 preserves every business row/credential/preference/draft, activation countdown, private identity, backup and consumed authorizations; recovery stays approval-gated.");
    }
    @Override @Test public void verifyAfterOfflineColdRestart() throws Exception {super.verifyAfterOfflineColdRestart();assertNativeSurvived(new JSONObject(read("upgrade-after.json")),false);}
    @Override @Test public void verifyAfterRepeatedInPlaceUpdate() throws Exception {super.verifyAfterRepeatedInPlaceUpdate();assertNativeSurvived(new JSONObject(read("upgrade-after.json")),false);}
}
