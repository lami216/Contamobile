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

/** Two real APK phases. The original signed v37 creates every business row;
 * install-r replaces only its APK, without uninstall/clear/backup restoration.
 * Fixture signing material exists solely in the instrumentation APK/emulator. */
@RunWith(AndroidJUnit4.class)
public class Desktop882UpgradeTest extends UpgradePersistenceTest {
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
        String consumed=UUID.randomUUID().toString();DeviceLifecycleStore lifecycle=new DeviceLifecycleStore(target(),license.deviceCode()+"|"+identity.fingerprint());lifecycle.consume(consumed);
        JSONObject control=fixtureControl(license,identity,baseline.getString("document"));license.checkpoint();
        return new JSONObject().put("backupId",id).put("backupHash",hash).put("backupSettings",settings).put("backupContext",backup.state.getJSONObject("context"))
            .put("lifecycleConsumedId",consumed).put("identityJwk",identity.publicJwk()).put("control",control);
    }
    private void assertNativeSurvived(JSONObject baseline,boolean requireOldBlob) throws Exception {
        JSONObject expected=baseline.getJSONObject("desktop882Native");InstallationIdentity identity=new InstallationIdentity(false);
        JSONObject jwk=expected.getJSONObject("identityJwk");assertEquals(ProtocolJson.canonical(jwk),ProtocolJson.canonical(identity.publicJwk()));
        String message="desktop882-upgrade-private-key-proof:"+UUID.randomUUID();byte[] raw=ProtocolJson.decode(identity.sign(message));
        Signature verifier=Signature.getInstance("SHA256withECDSA");verifier.initVerify(LicenseVerifier.key(jwk.getString("x"),jwk.getString("y")));verifier.update(message.getBytes(StandardCharsets.UTF_8));assertTrue("The original Keystore private identity still signs",verifier.verify(LicenseVerifier.der(raw)));
        CloudBackupStore backup=new CloudBackupStore(target(),identity.fingerprint());
        assertEquals("Backup schedule/consent survive",ProtocolJson.canonical(expected.getJSONObject("backupSettings")),ProtocolJson.canonical(backup.state.getJSONObject("settings")));
        assertEquals("Backup stays attached to the original owner/shop",ProtocolJson.canonical(expected.getJSONObject("backupContext")),ProtocolJson.canonical(backup.state.getJSONObject("context")));
        if(requireOldBlob){byte[] bytes=backup.snapshot(expected.getString("backupId"));assertEquals("Original encrypted backup decrypts after APK replacement",expected.getString("backupHash"),CloudBackupStore.hash(bytes));CloudBackupStore.validateSnapshot(bytes,backup.state.getJSONObject("context").getString("shopId"));}
        assertTrue("A consumed lifecycle authorization remains consumed",new DeviceLifecycleStore(target(),new DeviceLicense(target()).deviceCode()+"|"+identity.fingerprint()).used(expected.getString("lifecycleConsumedId")));
        JSONObject control=new DeviceLicense(target()).status().getJSONObject("control");assertEquals("Remote control generation/fence are not reset",ProtocolJson.canonical(expected.getJSONObject("control")),ProtocolJson.canonical(control));
    }
    private void check(String message,String condition) throws Exception {assertEquals(message,"true",js(condition));}
    private void utilityFields(String values) throws Exception {
        check("All actual stock form fields exist","(()=>{for(const[key,value]of Object.entries("+values+")){const input=document.querySelector('#utility-form [name='+key+']');if(!input)throw Error('Missing stock field '+key);input.value=value}return true})()");
    }
    private void stockOperation(String kind,String product,String quantity) throws Exception {
        action("go:"+kind);until("!!document.querySelector('#utility-form [name=product]')");
        utilityFields("{product:"+product+"}");action("site:feature:stock-add");fields("{quantity:"+JSONObject.quote(quantity)+"}");action("site:feature:stock-line-save");
        utilityFields("transfer".equals(kind)?"{from:S.warehouse,to:'مخزن 870',note:'تسوية محفوظة عبر تحديث 870'}":"{note:'تسوية محفوظة عبر تحديث 870'}");action("review-utility");check("Stock review opens before posting","modal==='feature-stock-review'");
        if(ExistingLicenseAccess.installedVersion()==38){JSONObject drafts=testFile("882-completed-drafts.json").exists()?new JSONObject(read("882-completed-drafts.json")):new JSONObject();String cacheKey=text("'alkarna-workflow-draft:'+karnaCurrentActor().id+':"+kind+"'");String raw=text("localStorage.getItem("+JSONObject.quote(cacheKey)+")");assertTrue("Actual pre-post draft exists",raw.startsWith("{"));drafts.put(cacheKey,raw);write("882-completed-drafts.json",drafts.toString());}
        action("site:feature:stock-confirm");
        check("Actual stock transaction is committed","view==='invoice'&&modal===null&&S.records.some(r=>r.id===selected)");
    }
    private void assertConsumedWorkflowDrafts(JSONObject baseline) throws Exception {
        String owner=baseline.getJSONObject("desktop882Native").getJSONObject("backupContext").getString("ownerId"),prefix="alkarna-workflow-draft:"+owner+":";
        check("Both completed stock workflows have durable owner-scoped epochs","S.workflowDraftEpochs["+JSONObject.quote(owner)+"].adjustment===2&&S.workflowDraftEpochs["+JSONObject.quote(owner)+"].transfer===1");
        check("No completed stock draft survives into the next opening","localStorage.getItem("+JSONObject.quote(prefix+"adjustment")+")===null&&localStorage.getItem("+JSONObject.quote(prefix+"transfer")+")===null");
        JSONObject original=new JSONObject(baseline.getString("localStorage"));assertEquals("An unrelated original37 expense draft is retained exactly",original.getString(prefix+"expense"),text("localStorage.getItem("+JSONObject.quote(prefix+"expense")+")"));
    }
    private void payrollFacts(String condition) throws Exception {
        js("window.__882FactsDone=false;window.__882FactsError=null;window.__882Facts=null;import(new URL('./payroll-domain.js',location.href).href).then(({payrollFacts})=>{window.__882Facts=payrollFacts(S)}).catch(e=>window.__882FactsError=String(e)).finally(()=>window.__882FactsDone=true);true");until("window.__882FactsDone===true");assertEquals("Actual payroll module loads in Android WebView","null",js("window.__882FactsError"));check("Desktop870 payroll expense/reserve facts",condition);
    }
    private void businessSmokeOnCandidate(JSONObject before) throws Exception {
        String worker=before.getString("desktop882EmployeeId"),product=Long.toString(before.getLong("desktop882ProductId"));
        check("Schema4 preserves actual old employee and payment","S.featureSchema===4&&S.employees.some(e=>e.id==="+JSONObject.quote(worker)+"&&e.balance===80)&&S.records.some(r=>r.id==="+before.getLong("desktop882PaymentId")+"&&r.total===20)&&S.payrollFinancialMovements.length===1");
        String cash=js("JSON.stringify(S.accounts)"),movements=js("JSON.stringify(S.payrollFinancialMovements)");
        String paymentFinancial=js("JSON.stringify(S.records.find(r=>r.id==="+before.getLong("desktop882PaymentId")+").financial??null)");
        action("site:feature:employees-open:"+worker);action("site:feature:employees-edit");
        check("Full profile has salary/date inputs and numeric keyboard","!!document.querySelector('#sheet-form [name=startDate]')&&document.querySelector('#sheet-form [name=amount]').inputMode==='decimal'");
        fields("{name:'عامل مصحح 870',phone:'22001123',amount:'200'}");action("site:feature:employees-save");
        check("Recompute salary without changing cash or financial movements","S.employees.find(e=>e.id==="+JSONObject.quote(worker)+").balance===180&&JSON.stringify(S.accounts)==="+cash+"&&JSON.stringify(S.payrollFinancialMovements)==="+movements+"&&JSON.stringify(S.records.find(r=>r.id==="+before.getLong("desktop882PaymentId")+" ).financial??null)==="+paymentFinancial);
        check("Old payment becomes independent with unchanged amount and identity","S.records.find(r=>r.id==="+before.getLong("desktop882PaymentId")+").employeePaymentVersion===2&&S.records.find(r=>r.id==="+before.getLong("desktop882PaymentId")+").total===20");
        action("site:feature:employees-archive");action("site:feature:employees-archive-confirm");action("site:feature:employees-delete");
        check("Deleting requires explicit noncash closure confirmation","modal==='payroll-delete'");action("site:feature:employees-delete-confirm");
        check("Deleting archived worker closes liability and retains cash/history","S.employees.find(e=>e.id==="+JSONObject.quote(worker)+").isDeleted===true&&S.employees.find(e=>e.id==="+JSONObject.quote(worker)+").balance===0&&S.records.some(r=>r.kind==='employee-closure'&&r.employeeId==="+JSONObject.quote(worker)+"&&r.total===180&&r.salaryReserveReleased===180&&r.cashAmount===0&&r.account===null)&&JSON.stringify(S.accounts)==="+cash+"&&JSON.stringify(S.payrollFinancialMovements)==="+movements);
        check("Deleted employee is absent from ordinary selectors","!document.querySelector('[data-action=\"site:feature:employees-open:"+worker+"\"]')");
        action("site:feature:employees-open:"+worker);check("Deleted history readable with no mutation buttons","view==='employee-ledger'&&!document.querySelector('[data-action=\"site:feature:employees-edit\"],[data-action=\"site:feature:employees-payment-new\"],[data-action=\"site:feature:employees-resume\"]')");
        payrollFacts("window.__882Facts.workersExpense===20&&window.__882Facts.workersReserveChange===0&&window.__882Facts.currentOwed===0");
        action("site:feature:employees-list");action("site:feature:employees-new");String day=text("document.querySelector('#sheet-form [name=startDate]').value");
        fields("{name:'عامل حساب فقط',startDate:"+JSONObject.quote(day)+",amount:'0',intervalMonths:'1',entitlement:'beginning'}");action("site:feature:employees-save");
        check("Zero salary permits an account without synthetic zero accruals","S.employees.some(e=>e.name==='عامل حساب فقط'&&e.balance===0)&&!S.records.some(r=>r.kind==='employee-accrual'&&r.total===0)");
        // The ORIGINAL37 UI created this ordinary adjustment. Schema4 adds only
        // a display sequence: its raw document number/ID/provenance stays intact.
        long oldAdjustment=before.getLong("desktop882AdjustmentId");String raw=before.getString("desktop882AdjustmentRawNumber");
        check("Legacy adjustment receives display-only sequence1","S.records.find(r=>r.id==="+oldAdjustment+").settlementSequence===1&&JSON.stringify(S.records.find(r=>r.id==="+oldAdjustment+").number??null)==="+raw+"&&Object.hasOwn(S.records.find(r=>r.id==="+oldAdjustment+"),'number')==="+before.getBoolean("desktop882AdjustmentHadNumber")+"&&S.sequences['stock-settlement']===1");
        action("warehouse-create");fields("{name:'مخزن 870'}");action("save-warehouse");
        check("Second actual warehouse exists","S.warehouses.includes('مخزن 870')");stockOperation("transfer",product,"2");
        String stocks=js("JSON.stringify(S.products.find(p=>p.id==="+product+").stocks)");
        check("Actual transfer gives two holdings for archive group","S.products.find(p=>p.id==="+product+").stocks[S.warehouse]===2&&S.products.find(p=>p.id==="+product+").stocks['مخزن 870']===2");
        action("product:"+product);action("site:feature:stock-archive:"+product);check("Archive requires reviewed explicit confirmation","modal==='feature-product-clearance-confirm'");action("site:feature:stock-clearance-confirm");
        check("Archive produces one linked clearance group and leaves all cash intact","S.products.find(p=>p.id==="+product+").archived===true&&S.products.find(p=>p.id==="+product+").qty===0&&S.records.filter(r=>r.productArchiveStockClearance===true&&!r.voided).length===2&&new Set(S.records.filter(r=>r.productArchiveStockClearance===true&&!r.voided).map(r=>r.productArchiveStockClearanceGroupId)).size===1&&S.records.filter(r=>r.productArchiveStockClearance===true).every(r=>r.settlementSequence===undefined)&&JSON.stringify(S.accounts)==="+cash);
        action("site:feature:stock-restore:"+product);action("site:feature:stock-clearance-confirm");
        check("Restore reverses every linked holding once without cash movement","!S.products.find(p=>p.id==="+product+").archived&&JSON.stringify(S.products.find(p=>p.id==="+product+").stocks)==="+stocks+"&&S.records.filter(r=>r.productArchiveStockClearance===true).every(r=>r.voided)&&JSON.stringify(S.accounts)==="+cash+"&&S.sequences['stock-settlement']===1");
        stockOperation("adjustment",product,"3");
        check("New ordinary adjustment uses sequence2 without rekeying legacy records","S.records.find(r=>r.id===selected).settlementSequence===2&&S.sequences['stock-settlement']===2&&S.counters.find(c=>c._id==='documentSequence:stock-settlement').value===2&&JSON.stringify(S.records.find(r=>r.id==="+oldAdjustment+").number??null)==="+raw+"&&Object.hasOwn(S.records.find(r=>r.id==="+oldAdjustment+"),'number')==="+before.getBoolean("desktop882AdjustmentHadNumber")+"&&JSON.stringify(S.accounts)==="+cash);
        System.out.println("UPGRADE 882 BUSINESS PASS: original37 payment preserved; profile correction, noncash employee closure, zero agreement, grouped stock archive/restore and shared settlement numbering work in actual Android WebView.");
    }
    private void main882SmokeOnCandidate(JSONObject before) throws Exception {
        // Edit the genuine original37 posted expense, without consuming the
        // separate original37 unfinished expense draft or changing recordedAt.
        long expenseId=before.getLong("desktop882ExpenseId");JSONObject expense=new JSONObject(new JSONTokener(before.getString("desktop882ExpenseSnapshot")).nextValue().toString());
        String balances=js("JSON.stringify(S.accounts)");action("source:"+expenseId);
        fields("{note:'توضيح المصروف دون تغيير وقته'}");action("post-cash");
        check("Original37 expense keeps its actual stored time and cash on an ordinary edit","(()=>{const r=S.records.find(r=>r.id==="+expenseId+");return r.revision===1&&r.occurredAt==="+JSONObject.quote(expense.getString("occurredAt"))+"&&r.createdAt==="+JSONObject.quote(expense.getString("createdAt"))+"&&r.recordedAt==="+JSONObject.quote(expense.getString("recordedAt"))+"&&JSON.stringify(S.accounts)==="+balances+"})()");
        action("site:feature:employees-list");action("site:feature:employees-new");String day=text("document.querySelector('#sheet-form [name=startDate]').value");
        String future=text("new Date(Date.parse("+JSONObject.quote(day)+"+'T12:00:00Z')+86400000).toISOString().slice(0,10)");
        fields("{name:'عامل رصيد بداية882',startDate:"+JSONObject.quote(future)+",amount:'0',intervalMonths:'1',entitlement:'beginning'}");action("site:feature:employees-save");String worker=text("S.employees.find(e=>e.name==='عامل رصيد بداية882').id");
        action("open:account");fields("{name:'مصرف882',balance:'0'}");action("save-account");String bank=js("S.accounts.find(a=>a.name==='مصرف882').id");action("site:feature:employees-open:"+worker);
        String finance=js("JSON.stringify({accounts:S.accounts,movements:S.payrollFinancialMovements})");
        action("site:feature:employees-opening-new");fields("{direction:'payable',amount:'75',occurredAt:"+JSONObject.quote(day)+",note:'رصيد افتتاحي غير نقدي'}");action("site:feature:employees-opening-save");
        String opening=js("S.records.find(r=>r.kind==='employee-opening'&&r.employeeId==="+JSONObject.quote(worker)+"&&!r.voided).id");
        check("Main882 payable opening is noncash and changes liability only","S.employees.find(e=>e.id==="+JSONObject.quote(worker)+").balance===75&&JSON.stringify({accounts:S.accounts,movements:S.payrollFinancialMovements})==="+finance+"&&S.records.find(r=>r.id==="+opening+").cashAmount===0");
        action("source-location:"+opening);check("Opening source locates the employee ledger without editing","view==='employee-ledger'&&editingId===null");action("invoice:"+opening);action("source:"+opening);
        fields("{amount:'100',reason:'تصحيح الرصيد الافتتاحي'}");action("site:feature:employees-opening-save");
        check("Opening edit retains noncash provenance and original record identity","S.records.find(r=>r.id==="+opening+").revision===1&&S.employees.find(e=>e.id==="+JSONObject.quote(worker)+").balance===100&&JSON.stringify({accounts:S.accounts,movements:S.payrollFinancialMovements})==="+finance);
        action("site:feature:employees-payment-new");fields("{direction:'withdraw',amount:'150',paymentMethod:"+bank+",occurredAt:"+JSONObject.quote(day)+",note:'سحب وفق سياسة الحسابات العادية'}");action("site:feature:employees-payment-save");
        String withdrawal=js("S.records.find(r=>r.kind==='employee-payment'&&r.employeeId==="+JSONObject.quote(worker)+"&&!r.voided).id");
        check("Main882 permits negative bank/worker and derives the audited historical opening anchor","S.accounts.find(a=>a.id==="+bank+").balance===-150&&S.employees.find(e=>e.id==="+JSONObject.quote(worker)+").balance===-50&&S.records.find(r=>r.id==="+withdrawal+").employeeOpeningAnchor.openingDocumentId===S.records.find(r=>r.id==="+opening+").payrollDocumentId");
        action("void:"+withdrawal);fields("{reason:'عكس السحب الأصلي'}");action("site:feature:employees-record-void-confirm");
        check("Withdrawal inverse restores the exact signed cash and liability","S.accounts.find(a=>a.id==="+bank+").balance===0&&S.employees.find(e=>e.id==="+JSONObject.quote(worker)+").balance===100&&S.records.find(r=>r.id==="+withdrawal+").voided===true");
        action("void:"+opening);fields("{reason:'إلغاء رصيد البداية مع حفظ تاريخه'}");action("site:feature:employees-record-void-confirm");
        check("Opening cancellation is noncash and keeps the audited historical document","S.records.find(r=>r.id==="+opening+").voided===true&&S.employees.find(e=>e.id==="+JSONObject.quote(worker)+").balance===0&&S.accounts.find(a=>a.id==="+bank+").balance===0");
        action("site:feature:employees-opening-new");fields("{direction:'receivable',amount:'50',occurredAt:"+JSONObject.quote(day)+",note:'دين افتتاحي على العامل'}");action("site:feature:employees-opening-save");
        action("site:feature:employees-payment-new");action("site:feature:employees-payment-direction:deposit");fields("{amount:'50',paymentMethod:"+bank+",occurredAt:"+JSONObject.quote(day)+",note:'استلام دين العامل'}");action("site:feature:employees-payment-save");String deposit=js("S.records.find(r=>r.kind==='employee-payment'&&r.employeeId==="+JSONObject.quote(worker)+"&&!r.voided).id");
        check("Worker deposit settles the opening debt without invented revenue","S.accounts.find(a=>a.id==="+bank+").balance===50&&S.employees.find(e=>e.id==="+JSONObject.quote(worker)+").balance===0");
        action("open:withdraw");fields("{account:"+bank+",amount:'100',note:'صرف فعلي من الحساب'}");action("post-cash");check("Ordinary cash movement can spend past the deposited balance","S.accounts.find(a=>a.id==="+bank+").balance===-50");
        action("void:"+deposit);fields("{reason:'عكس الإيداع بعد استخدامه وفق سياسة الجهاز'}");action("site:feature:employees-record-void-confirm");
        check("Spent worker deposit reversal follows ordinary signed-bank policy","S.accounts.find(a=>a.id==="+bank+").balance===-100&&S.employees.find(e=>e.id==="+JSONObject.quote(worker)+").balance===-50&&S.records.find(r=>r.id==="+deposit+").voided===true");
        System.out.println("UPGRADE 882 BUSINESS PASS: noncash opening/direction/edit/void, audited early cash, negative bank/worker, spent-deposit inverse and genuine original37 expense time/draft preservation.");
    }
    private void reviseStatementWithoutCash(long documentId,boolean party,String expected) throws Exception {
        String id=Long.toString(documentId),cash=js("JSON.stringify({accounts:S.accounts,parties:S.parties,stocks:S.products.map(p=>p.stocks)})");
        action("source:"+id);
        check("Editing shows the original stored statement","document.querySelector('#sheet-form [name=note]').value==="+JSONObject.quote(expected));
        check("Omitted statement is an absent field, not a cleared string","(()=>{document.querySelector('#sheet-form [name=note]').remove();return !document.querySelector('#sheet-form [name=note]')})()");
        action(party?"post-party":"post-cash");
        check("An omitted statement preserves original37 literal text without financial drift","S.records.find(r=>r.id==="+id+").note==="+JSONObject.quote(expected)+"&&JSON.stringify({accounts:S.accounts,parties:S.parties,stocks:S.products.map(p=>p.stocks)})==="+cash);
        action("source:"+id);fields("{note:''}");action(party?"post-party":"post-cash");
        check("An explicit empty statement clears only metadata","S.records.find(r=>r.id==="+id+").note===null&&JSON.stringify({accounts:S.accounts,parties:S.parties,stocks:S.products.map(p=>p.stocks)})==="+cash);
        action("source:"+id);check("Cleared statement reopens as an empty field","document.querySelector('#sheet-form [name=note]').value===''");
        js("document.querySelector('#sheet-form [name=note]').remove();true");action(party?"post-party":"post-cash");
        check("Omitting after a clear cannot revive an older journal statement","S.records.find(r=>r.id==="+id+").note===null&&JSON.stringify({accounts:S.accounts,parties:S.parties,stocks:S.products.map(p=>p.stocks)})==="+cash);
    }
    private void main882NotesOnCandidate(JSONObject before) throws Exception {
        long transfer=before.getLong("desktop882TransferId"),deposit=before.getLong("desktop882BankDepositId");
        long pay=Long.parseLong(js("S.records.find(r=>r.kind==='pay').id")),receive=Long.parseLong(js("S.records.find(r=>r.kind==='receive').id"));
        check("Actual37 statements are preserved before new edits","S.records.find(r=>r.id==="+transfer+").note==='إيداع'&&S.records.find(r=>r.id==="+pay+").note==='دفع محفوظ عبر التحديث'&&S.records.find(r=>r.id==="+receive+").note==='إيصال محفوظ عبر التحديث'");
        action("source-location:"+transfer);until("!!document.querySelector('tr.source-record-focus [data-movement-statement]')");
        check("French bank ledger renders the literal Arabic statement as user data","document.documentElement.lang==='fr'&&[...document.querySelectorAll('[data-movement-statement][data-user-content]')].some(n=>n.textContent==='إيداع'&&n.getAttribute('dir')==='auto')");
        js("window.__882ReportsReady=false;window.__882ReportsError=null;import(new URL('./report-data.js',location.href).href).then(m=>window.__882ReportModule=m).catch(e=>window.__882ReportsError=String(e)).finally(()=>window.__882ReportsReady=true);true");until("window.__882ReportsReady===true");check("Actual report source module loads", "window.__882ReportsError===null");
        check("Both transfer legs use the same literal statement without changing balances","(()=>{const d=window.__882ReportModule.reportDataset(S,{type:'financial',allTime:true});const rows=d.rows.filter(r=>r.action==='invoice:"+transfer+"');return rows.length===2&&rows.every(r=>r.note==='إيداع'&&r.description==='إيداع')})()");
        reviseStatementWithoutCash(pay,true,"دفع محفوظ عبر التحديث");
        reviseStatementWithoutCash(receive,true,"إيصال محفوظ عبر التحديث");
        reviseStatementWithoutCash(deposit,false,"رصيد فحص الترقية من النسخة 37");
        reviseStatementWithoutCash(transfer,false,"إيداع");
        action("source-location:"+transfer);until("!!document.querySelector('tr.source-record-focus')");
        check("A cleared bank statement does not revive in its highlighted ledger row","!document.querySelector('tr.source-record-focus [data-movement-statement]')");
        check("Cleared transfer statements remain blank in both financial report legs","(()=>{const d=window.__882ReportModule.reportDataset(S,{type:'financial',allTime:true});const rows=d.rows.filter(r=>r.action==='invoice:"+transfer+"');return rows.length===2&&rows.every(r=>r.note===''&&r.description==='')})()");
        System.out.println("UPGRADE 882 NOTES PASS: genuine original37 receive/pay/deposit/transfer notes preserve omitted values, explicit clears stay cleared, both report legs and French literal ledger rendering retain source semantics without cash drift.");
    }
    @Test public void seedDesktop882PreviousVersion() throws Exception {
        assertFalse("Never overwrite an existing emulator activation",new java.io.File(target().getNoBackupFilesDir(),"activation-v2.json").exists());
        assertFalse("Never overwrite existing activation preferences",target().getSharedPreferences("activation-v2",Context.MODE_PRIVATE).contains("state"));
        assertEquals("This seed must use ORIGINAL distributed APK37",37,ExistingLicenseAccess.installedVersion());offline();
        super.seedPreviousVersion();JSONObject before=new JSONObject(read("upgrade-before.json"));loginOwner();
        // Fund the actual original app through its UI; salary withdrawals must
        // not depend on inherited purchase defaults leaving a particular balance.
        action("open:deposit");fields("{account:S.accounts[0].id,amount:'1000',note:'رصيد فحص الترقية من النسخة 37'}");action("post-cash");
        action("site:feature:employees-list");action("site:feature:employees-new");String day=text("document.querySelector('#sheet-form [name=startDate]').value");
        fields("{name:'عامل النسخة 37',phone:'22001122',startDate:"+JSONObject.quote(day)+",amount:'100',intervalMonths:'1',entitlement:'beginning'}");action("site:feature:employees-save");
        String worker=text("S.employees.find(e=>e.name==='عامل النسخة 37').id");action("site:feature:employees-payment-new");fields("{amount:'20',direction:'withdraw',paymentMethod:String(S.accounts[0].id),note:'دفعة أصلية من النسخة 37'}");action("site:feature:employees-payment-save");
        check("Actual37 creates salary100/payment20/balance80","S.employees[0].balance===80&&S.payrollFinancialMovements.length===1");long payment=Long.parseLong(js("S.records.find(r=>r.kind==='employee-payment').id"));
        action("go:inventory");action("open:product");fields("{name:'سكر',price:'20',cost:'5',qty:'3',openingWarehouse:S.warehouse}");action("save-product");until("S.products.length===2&&modal===null");String product=js("S.products.find(p=>p.name==='سكر').id");
        stockOperation("adjustment",product,"4");long adjustment=Long.parseLong(js("selected"));String raw=js("JSON.stringify(S.records.find(r=>r.id===selected).number??null)");boolean hadNumber="true".equals(js("Object.hasOwn(S.records.find(r=>r.id===selected),'number')"));
        check("Original37 ordinary adjustment retains its committed settlement metadata","S.records.find(r=>r.id===selected).settlementSequence===1&&S.products.find(p=>p.id==="+product+").qty===4");
        long bankDeposit=Long.parseLong(js("S.records.find(r=>r.kind==='deposit'&&r.note==='رصيد فحص الترقية من النسخة 37').id"));
        action("open:account");fields("{name:'مصرف البيان882',balance:'0'}");action("save-account");String noteBank=js("S.accounts.find(a=>a.name==='مصرف البيان882').id");
        action("open:cashtransfer");fields("{account:S.accounts[0].id,to:"+noteBank+",amount:'13.5',note:'إيداع'}");action("post-cash");long transfer=Long.parseLong(js("selected"));
        check("Actual37 transfer stores a literal translation-key-like statement","S.records.find(r=>r.id==="+transfer+").kind==='transfer'&&S.records.find(r=>r.id==="+transfer+").note==='إيداع'");
        action("open:expense");fields("{name:'مصروف أصلي 37',account:S.accounts[0].id,amount:'17.25',note:'وقت أصلي محفوظ'}");action("post-cash");
        long expense=Long.parseLong(js("selected"));String expenseSnapshot=js("JSON.stringify(S.records.find(r=>r.id===selected))");
        action("open:expense");fields("{name:'مصروف غير مكتمل',account:S.accounts[0].id,amount:'12.75',note:'مسودة محفوظة'}");js("document.querySelector('#sheet-form [name=amount]').dispatchEvent(new Event('input',{bubbles:true}));true");action("close");
        action("new:sale");action("pos:add:"+js("S.products[0].id"));action("pos:note");fields("{note:'مسودة فاتورة محفوظة عبر تحديث 870'}");action("pos:save-note");action("site:logout");until("!!document.querySelector('[data-action=\"site:login\"]')");
        check("Both actual original37 drafts are retained","Object.keys(localStorage).some(k=>k.startsWith('alkarna-pos-draft:'))&&Object.keys(localStorage).some(k=>k.startsWith('alkarna-workflow-draft:')&&k.endsWith(':expense'))");
        before.put("database",databaseSnapshot()).put("localStorage",preferences()).put("desktop882EmployeeId",worker).put("desktop882PaymentId",payment).put("desktop882ProductId",Long.parseLong(product)).put("desktop882AdjustmentId",adjustment).put("desktop882AdjustmentRawNumber",raw).put("desktop882AdjustmentHadNumber",hadNumber).put("desktop882ExpenseId",expense).put("desktop882ExpenseSnapshot",expenseSnapshot).put("desktop882BankDepositId",bankDeposit).put("desktop882TransferId",transfer);
        assertEquals("Baseline schema is actual37 schema4",4,shop(new JSONObject(before.getString("database"))).getJSONObject("state").getInt("featureSchema"));
        activity.close();activity=null;before.put("desktop882Native",seedIndependentNativeState(before));before.put("remainingSeconds",new DeviceLicense(target()).status().getJSONObject("license").get("remainingSeconds"));write("upgrade-before.json",before.toString());
        System.out.println("UPGRADE 882 SEED PASS: original37 UI salary/payment/ordinary stock adjustment/drafts; actual password hashes, native private identity, encrypted backup and control/consumed authorization checkpointed.");
    }
    @Test public void verifyDesktop882AfterInPlaceUpdate() throws Exception {
        assertEquals("Candidate is exactly38",38,ExistingLicenseAccess.installedVersion());offline();JSONObject before=new JSONObject(read("upgrade-before.json"));assertNativeSurvived(before,true);
        super.verifyAfterInPlaceUpdate();loginOwner();
        check("Original37 unposted cart/note survive","cart.length===1&&cart[0].qty===1&&posNote==='مسودة فاتورة محفوظة عبر تحديث 870'");
        businessSmokeOnCandidate(before);main882SmokeOnCandidate(before);main882NotesOnCandidate(before);assertConsumedWorkflowDrafts(before);action("site:logout");until("!!document.querySelector('[data-action=\"site:login\"]')");assertNativeSurvived(before,false);write("upgrade-after.json",checkpoint(before,new DeviceLicense(target())).toString());
        // Reproduce WebView replaying an older localStorage disk image. The exact
        // post-commit checkpoint above stays unchanged; cold boot must fence the
        // actual obsolete drafts using epochs in the accounting transaction.
        JSONObject obsolete=new JSONObject(read("882-completed-drafts.json"));assertEquals("Both completed workflow cache images were captured",2,obsolete.length());
        check("Synthetic stale-disk cache replay is installed","(()=>{for(const[key,value]of Object.entries("+obsolete+"))localStorage.setItem(key,value);return true})()");
        // Reload this WebView while its injected cache image is definitely in
        // memory. This proves pruning without depending on disk flush timing.
        js("window.__882BeforeReplayReload=true;true");activity.onActivity(a->a.getWebView().reload());
        until("typeof window.__882BeforeReplayReload==='undefined'&&document.documentElement.dataset.runtimeState==='ready'&&!!document.querySelector('[data-action=\"site:login\"]')");
        JSONObject stable=new JSONObject(read("upgrade-after.json")),expectedDatabase=new JSONObject(stable.getString("database")),reloadedDatabase=new JSONObject(databaseSnapshot());
        preserved(expectedDatabase,reloadedDatabase,"native stale-cache reload database");preserved(reloadedDatabase,expectedDatabase,"native stale-cache reload has no new writes");assertEquals("Native stale-cache reload retains exact preferences",stable.getString("localStorage"),preferences());assertConsumedWorkflowDrafts(stable);
        check("Reinstall stale cache before actual force-stopped cold boot","(()=>{for(const[key,value]of Object.entries("+obsolete+"))localStorage.setItem(key,value);return true})()");
        System.out.println("UPGRADE 882 PASS: original37 ->38 install-r preserved all durable data, credentials/preferences, activation countdown, device/private identity, backup consent/schedule/encrypted content and signed control/consumed authorization.");
    }
    @Override @Test public void verifyAfterOfflineColdRestart() throws Exception {super.verifyAfterOfflineColdRestart();JSONObject baseline=new JSONObject(read("upgrade-after.json"));assertNativeSurvived(baseline,false);assertConsumedWorkflowDrafts(baseline);}
    @Override @Test public void verifyAfterRepeatedInPlaceUpdate() throws Exception {super.verifyAfterRepeatedInPlaceUpdate();JSONObject baseline=new JSONObject(read("upgrade-after.json"));assertNativeSurvived(baseline,false);assertConsumedWorkflowDrafts(baseline);}
}
