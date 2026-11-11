package mr.alkarna.mobile.approved;

import android.os.Build;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.security.PublicKey;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Assume;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Disposable emulator only: the delivered signed APK, actual WebView dispatch and durable storage. */
@RunWith(AndroidJUnit4.class)
public class AccountingParityTest {
 private ActivityScenario<MainActivity> activity;
 private Map<String,PublicKey> originalKeys;
 private DeviceLicense license;
 @Before public void isolatedSetup() throws Exception {
  Assume.assumeTrue("Explicit isolated accounting fixture only","true".equals(InstrumentationRegistry.getArguments().getString("accountingParityIsolation")));
  assertTrue("An emulator is required",Build.HARDWARE.equals("ranchu")||Build.HARDWARE.equals("goldfish")||Build.FINGERPRINT.contains("emulator")||Build.MODEL.contains("sdk_gphone"));
  var context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  assertFalse("Never replace an existing customer's activation",new File(context.getNoBackupFilesDir(),"activation-v2.json").exists());
  assertFalse("Never replace an existing customer's activation preferences",context.getSharedPreferences("activation-v2",0).contains("state"));
  originalKeys=new HashMap<>(LicenseCompatibilityTest.keys());
  license=new DeviceLicense(context);license.install(TestLicenseIssuer.issue(license.deviceCode(),"perpetual",0));
  activity=ActivityScenario.launch(MainActivity.class);ExistingLicenseAccess.enter(activity);
  until("!!document.querySelector('[data-action=\"site:setup\"]')");
  js("document.querySelector('[name=username]').value='parity-owner';document.querySelector('[name=password]').value='1234';true");action("site:setup");
  until("!!document.querySelector('.nav')");
 }
 @After public void cleanup() throws Exception {if(activity!=null)activity.close();if(originalKeys!=null){LicenseCompatibilityTest.keys().clear();LicenseCompatibilityTest.keys().putAll(originalKeys);}}
 private String js(String script) throws Exception {
  var values=new ArrayBlockingQueue<String>(1);activity.onActivity(a->a.getWebView().evaluateJavascript(script,v->values.offer(v==null?"null":v)));
  String value=values.poll(20,TimeUnit.SECONDS);assertNotNull("WebView callback",value);return value;
 }
 private void until(String condition) throws Exception {
  long deadline=System.currentTimeMillis()+25000;
  while(System.currentTimeMillis()<deadline){if("true".equals(js(condition)))return;Thread.sleep(100);}
  fail("Timed out: "+condition+"; "+js("document.body.innerText"));
 }
 private void action(String name) throws Exception {
  js("window.__parityActionDone=false;act("+JSONObject.quote(name)+").finally(()=>window.__parityActionDone=true);true");
  until("window.__parityActionDone===true&&!document.querySelector('.busy')");
 }
 private void commit(String expression) throws Exception {
  js("pendingRecord="+expression+";window.__parityExpectedId=pendingRecord.id;true");action("commit-pending");
  assertEquals("Record durably dispatched","true",js("S.records.some(r=>r.id===window.__parityExpectedId&&!r.voided)&&modal===null"));
 }
 private void voidRecord(String id) throws Exception {action("void:"+id);action("confirm-void");assertEquals("true",js("S.records.find(r=>r.id==="+id+").voided===true"));}
 private void check(String message,String condition) throws Exception {assertEquals(message,"true",js(condition));}
 @Test public void signedAccountsHistoricalStockAndRestoredArchivesSurviveColdStart() throws Exception {
  action("go:inventory");action("open:product");
  js("for(const [key,value]of Object.entries({name:'شاي',price:'100',cost:'40',qty:'10',openingWarehouse:S.warehouse}))document.querySelector('#sheet-form [name='+key+']').value=value;true");action("save-product");
  check("Opening stock","S.products.length===1&&S.products[0].qty===10&&S.accounts[0].balance===0");
  action("go:parties");action("partytype:supplier");action("open:party");js("document.querySelector('#sheet-form [name=name]').value='مورد الفحص';true");action("save-party");
  js("window.__parityProduct=S.products[0].id;window.__paritySupplier=S.parties[0].id;true");
  commit("({...newRecord('purchase'),total:40,paid:40,due:0,party:__paritySupplier,account:1,warehouse:S.warehouse,title:'شراء',lines:[{product:__parityProduct,name:'شاي',qty:1,price:40}]})");
  js("window.__parityPurchase=selected;true");check("Zero balance paid purchase","S.accounts[0].balance===-40&&S.products[0].qty===11");
  commit("({...S.records.find(r=>r.id===__parityPurchase),total:60,paid:60,lines:[{product:__parityProduct,name:'شاي',qty:2,price:30}]})");
  check("Edit preserves signed account","S.accounts[0].balance===-60&&S.products[0].qty===12");voidRecord(js("__parityPurchase"));
  check("Void reverses purchase","S.accounts[0].balance===0&&S.products[0].qty===10");
  commit("({...newRecord('purchase'),total:100,paid:0,due:100,party:__paritySupplier,account:null,warehouse:S.warehouse,title:'شراء آجل',lines:[{product:__parityProduct,name:'شاي',qty:1,price:100}]})");
  commit("({...newRecord('pay'),total:100,paid:100,party:__paritySupplier,account:1,title:'دفع',lines:[]})");
  js("window.__parityPayment=selected;true");check("Payment can be negative","S.accounts[0].balance===-100&&S.parties[0].balance===0");
  action("site:feature:party-archive:"+js("__paritySupplier"));action("site:feature:confirm");check("Settled supplier archived","S.parties[0].archived===true");voidRecord(js("__parityPayment"));
  check("Debt restores supplier visibility","S.parties[0].balance===100&&!S.parties[0].archived&&S.accounts[0].balance===0");
  action("open:account");js("document.querySelector('#sheet-form [name=name]').value='مصرف الفحص';document.querySelector('#sheet-form [name=balance]').value='100';true");action("save-account");
  js("window.__parityBank=S.accounts.find(a=>a.name==='مصرف الفحص').id;true");
  commit("({...newRecord('purchase'),total:100,paid:100,due:0,party:__paritySupplier,account:__parityBank,warehouse:S.warehouse,title:'شراء مصرفي',lines:[{product:__parityProduct,name:'شاي',qty:1,price:100}]})");
  js("window.__parityBankPurchase=selected;true");action("site:archive-account:"+js("__parityBank"));check("Empty bank archived","S.accounts.find(a=>a.id===__parityBank).archived===true");voidRecord(js("__parityBankPurchase"));
  check("Reversal restores bank visibility","S.accounts.find(a=>a.id===__parityBank).balance===100&&!S.accounts.find(a=>a.id===__parityBank).archived");
  js("window.__parityStockReady=false;import('https://appassets.androidplatform.net/assets/approved/stock-domain.js').then(m=>{window.__parityStockRecord=m.stockOperationRecord;window.__parityStockReady=true});true");until("__parityStockReady");
  commit("__parityStockRecord(S,'adjustment',{from:S.warehouse,note:'جرد',lines:[{product:__parityProduct,quantity:12}]},null,newRecord('adjustment').id,'2026-11-03','12:00')");
  js("window.__parityCorrection=selected;true");
  commit("({...newRecord('sale'),total:30,paid:30,due:0,account:1,warehouse:S.warehouse,title:'بيع لاحق',lines:[{product:__parityProduct,name:'شاي',qty:3,price:10,costAtSale:100}]})");
  check("Later sale consumes corrected stock","S.products[0].qty===9");
  commit("__parityStockRecord(S,'adjustment',{from:S.warehouse,note:'ملاحظة فقط',lines:[{product:__parityProduct,quantity:12}]},S.records.find(r=>r.id===__parityCorrection),__parityCorrection,'2026-11-03','12:00')");
  check("Note-only historical edit keeps later sales","S.products[0].qty===9");
  commit("__parityStockRecord(S,'adjustment',{from:S.warehouse,note:'تصحيح العدد',lines:[{product:__parityProduct,quantity:13}]},S.records.find(r=>r.id===__parityCorrection),__parityCorrection,'2026-11-03','12:00')");
  check("Historical actual delta applied once","S.products[0].qty===10");
  commit("__parityStockRecord(S,'adjustment',{from:S.warehouse,note:'جرد كسري',lines:[{product:__parityProduct,quantity:1.234}]},null,newRecord('adjustment').id,'2026-11-03','12:01')");
  check("Fractional stock precision","Math.abs(S.products[0].qty-1.234)<1e-9");voidRecord(js("selected"));check("Fractional void restores stock","Math.abs(S.products[0].qty-10)<1e-9");
  commit("({...newRecord('purchase'),total:500,paid:500,due:0,account:1,party:__paritySupplier,warehouse:S.warehouse,title:'شراء أخير',lines:[{product:__parityProduct,name:'شاي',qty:1,price:500}]})");
  check("Final negative account persisted","S.accounts[0].balance===-470&&S.products[0].qty===11");
  String before=js("JSON.stringify({accounts:S.accounts,parties:S.parties,stocks:S.products.map(p=>p.stocks),records:S.records})");
  String licenseId=license.status().getJSONObject("license").getString("licenseId");
  activity.close();activity=ActivityScenario.launch(MainActivity.class);ExistingLicenseAccess.enter(activity);until("!!document.querySelector('[data-action=\"site:login\"]')");
  js("document.querySelector('[name=username]').value='parity-owner';document.querySelector('[name=password]').value='1234';true");action("site:login");until("!!document.querySelector('.nav')");
  assertEquals("Every accounting field survives cold start",before,js("JSON.stringify({accounts:S.accounts,parties:S.parties,stocks:S.products.map(p=>p.stocks),records:S.records})"));
  assertTrue("Activation stays valid",license.status().getBoolean("valid"));assertEquals("Activation identity unchanged",licenseId,license.status().getJSONObject("license").getString("licenseId"));
  android.os.Bundle proof=new android.os.Bundle();proof.putString("stream","\nACCOUNTING PARITY CASE PASS signedAccountsHistoricalStockAndRestoredArchivesSurviveColdStart\n");InstrumentationRegistry.getInstrumentation().sendStatus(0,proof);
 }
}
