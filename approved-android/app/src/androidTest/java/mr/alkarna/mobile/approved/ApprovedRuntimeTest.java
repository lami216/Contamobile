package mr.alkarna.mobile.approved;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import android.graphics.Bitmap;
import org.junit.Test;
import org.junit.Before;
import org.junit.After;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject;
import androidx.test.uiautomator.UiSelector;
import static org.junit.Assert.*;
import java.util.concurrent.*;
import java.io.*;

@RunWith(AndroidJUnit4.class)
public class ApprovedRuntimeTest {
    private ActivityScenario<MainActivity> activity;
    private java.util.Map<String,java.security.PublicKey> originalLicenseKeys;
    @Before public void preserveVerificationKeys() throws Exception {originalLicenseKeys=new java.util.HashMap<>(LicenseCompatibilityTest.keys());}
    @After public void restoreVerificationKeys() throws Exception {if(activity!=null)activity.close();LicenseCompatibilityTest.keys().clear();LicenseCompatibilityTest.keys().putAll(originalLicenseKeys);}
    private String js(String script) throws Exception {
        var answer=new ArrayBlockingQueue<String>(1);
        activity.onActivity(a->a.getWebView().evaluateJavascript(script,v->answer.offer(v==null?"null":v)));
        String value=answer.poll(15,TimeUnit.SECONDS);assertNotNull("JavaScript callback",value);return value;
    }
    private void until(String condition) throws Exception {
        long end=System.currentTimeMillis()+20000;
        while(System.currentTimeMillis()<end){if("true".equals(js(condition)))return;Thread.sleep(150);}
        fail("Timed out: "+condition+"; DOM="+js("document.body.innerText"));
    }
    private void action(String name) throws Exception {
        js("window.__qaActionDone=false;act("+JSONObject.quote(name)+").finally(()=>window.__qaActionDone=true);true");
        until("window.__qaActionDone===true");
    }
    private void capture(String name) throws Exception {
        if(!name.equals("android-print-dialog")){
            until("!document.querySelector('[data-busy-disabled]')");
            js("window.__qaFrameReady=false;requestAnimationFrame(()=>requestAnimationFrame(()=>window.__qaFrameReady=true));true");
            until("window.__qaFrameReady===true");
        }
        Thread.sleep(400);
        var ctx=InstrumentationRegistry.getInstrumentation().getTargetContext();
        Bitmap image=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        try(var output=new FileOutputStream(new File(ctx.getExternalFilesDir(null),name+".png"))){image.compress(Bitmap.CompressFormat.PNG,100,output);}
    }
    private void observeNativeSave() throws Exception {
        js("(()=>{const save=NativeFiles.saveBlob;NativeFiles.saveBlob=async function(...args){window.__qaFileSaved=false;const d=window.__qaExportDiagnostic;if(d){d.saveBlobCalled=true;d.stage='native-save-start';d.name=String(args[0]);d.bytes=args[1]?.size;d.mime=args[1]?.type}try{const result=await Reflect.apply(save,this,args);window.__qaFileSaved=result.saved===true;if(d){d.stage='native-save-resolved';d.saved=result.saved===true}return result}catch(error){if(d){d.stage='native-save-rejected';d.error=String(error?.stack||error)}throw error}};return true})()");
    }
    private void captureNativeExportFailure(UiDevice device,String format) {
        var ctx=InstrumentationRegistry.getInstrumentation().getTargetContext();
        File directory=ctx.getExternalFilesDir(null);JSONObject diagnostic=new JSONObject();
        try{diagnostic.put("format",format).put("currentPackage",device.getCurrentPackageName());}catch(Exception ignored){}
        try{diagnostic.put("web",new JSONObject(new org.json.JSONTokener(js("JSON.stringify({diagnostic:window.__qaExportDiagnostic,exportDone:window.__qaExportDone,fileSaved:window.__qaFileSaved,busy:typeof karnaPersistenceBusy==='function'?karnaPersistenceBusy():null,view,modal,runtimeState:document.documentElement.dataset.runtimeState,body:document.body.innerText.slice(0,16000),errors:[...document.querySelectorAll('#form-error,.auth-error,.toast')].map(e=>e.innerText)})")).nextValue().toString()));}catch(Exception failure){try{diagnostic.put("webCaptureError",failure.toString());}catch(Exception ignored){}}
        try{activity.onActivity(a->{try{JSONObject nativeState=new JSONObject();var pending=MainActivity.class.getDeclaredField("pendingExport");pending.setAccessible(true);Object item=pending.get(a);nativeState.put("pendingExport",item!=null);if(item!=null)for(String name:new String[]{"name","mime","size"}){var field=item.getClass().getDeclaredField(name);field.setAccessible(true);nativeState.put(name,field.get(item));}var exports=MainActivity.class.getDeclaredField("exports");exports.setAccessible(true);nativeState.put("exportTransfers",((java.util.Map<?,?>)exports.get(a)).size());diagnostic.put("native",nativeState);}catch(Exception failure){try{diagnostic.put("nativeCaptureError",failure.toString());}catch(Exception ignored){}}});}catch(Exception failure){try{diagnostic.put("activityCaptureError",failure.toString());}catch(Exception ignored){}}
        try{device.dumpWindowHierarchy(new File(directory,"qa-failure-ui.xml"));}catch(Exception failure){try{diagnostic.put("hierarchyCaptureError",failure.toString());}catch(Exception ignored){}}
        try{Bitmap image=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();try(var out=new FileOutputStream(new File(directory,"qa-failure-screen.png"))){if(image==null)throw new IOException("Screenshot unavailable");image.compress(Bitmap.CompressFormat.PNG,100,out);}}catch(Exception failure){try{diagnostic.put("screenshotCaptureError",failure.toString());}catch(Exception ignored){}}
        try(var out=new FileOutputStream(new File(directory,"qa-failure-export.json"))){out.write(diagnostic.toString(2).getBytes(java.nio.charset.StandardCharsets.UTF_8));}catch(Exception failure){System.err.println("Native export diagnostic capture failed: "+failure.getClass().getSimpleName());}
    }
    private UiObject nativeSaveControl(UiDevice device,String format,String message) throws Exception {
        // ACTION_CREATE_DOCUMENT belongs to the system DocumentsUI provider,
        // never to an application button with a coincidentally matching label.
        long deadline=android.os.SystemClock.elapsedRealtime()+20000;
        while(android.os.SystemClock.elapsedRealtime()<deadline){
            String provider=device.getCurrentPackageName();
            if("com.android.documentsui".equals(provider)||"com.google.android.documentsui".equals(provider)){
                UiSelector scope=new UiSelector().packageName(provider).enabled(true).clickable(true);
                try{UiObject container=device.findObject(new UiSelector().packageName(provider).resourceId(provider+":id/container_save"));if(container.exists()){UiObject save=container.getChild(new UiSelector().resourceId("android:id/button1").enabled(true).clickable(true));if(save.exists())return save;}}catch(androidx.test.uiautomator.UiObjectNotFoundException ignored){}
                for(String id:new String[]{"android:id/button1",provider+":id/button1",provider+":id/action_menu_save"}){UiObject save=device.findObject(scope.resourceId(id));if(save.exists())return save;}
                for(UiSelector selector:new UiSelector[]{scope.textMatches("(?iu)^(save|enregistrer|حفظ)$"),scope.descriptionMatches("(?iu)^(save|enregistrer|حفظ)$")}){UiObject save=device.findObject(selector);if(save.exists())return save;}
            }
            Thread.sleep(150);
        }
        fail(message+"; see qa-failure-export.json / qa-failure-ui.xml / qa-failure-screen.png");return null;
    }
    @Test public void approvedSellerWorkflowAndColdPersistence() throws Exception {
        activity=ActivityScenario.launch(MainActivity.class);
        until("!!document.querySelector('#device-code')&&document.querySelector('#device-code').textContent.startsWith('AKD-')");
        capture("activation-required");
        until("!!document.querySelector('#online-connect')&&!!document.querySelector('#remote-consent')");
        assertEquals("false",js("!!document.querySelector('#contact-whatsapp')"));
        String activationDevice=new org.json.JSONTokener(js("document.querySelector('#device-code').textContent")).nextValue().toString();
        assertTrue(activationDevice.matches("AKD-(?:[A-F0-9]{4}-){4}[A-F0-9]{4}"));
        assertEquals("false",js("NativeHost.licenseAllowed()"));
        String license=TestLicenseIssuer.issue(activationDevice,"perpetual",0);
        // Only the independent test APK injects a signed disposable service.
        var fixtureContext=InstrumentationRegistry.getInstrumentation().getTargetContext();
        var fixtureService=new DeviceCloudLifecycleTest.FakeService(activationDevice);
        var fixtureClient=new DeviceLifecycleClient(fixtureContext,new DeviceLicense(fixtureContext),fixtureService.issuers,fixtureService);
        activity.onActivity(a->{try{var field=MainActivity.class.getDeclaredField("deviceLifecycle");field.setAccessible(true);field.set(a,fixtureClient);}catch(Exception failure){throw new AssertionError(failure);}});
        js("document.querySelector('#manual-activation').open=true;document.querySelector('#remote-consent').checked=true;document.querySelector('#license-text').value="+JSONObject.quote(license)+";document.querySelector('#install-text').click();true");
        until("!document.querySelector('#continue').hidden");assertEquals("true",js("!document.querySelector('#contact-whatsapp')&&document.querySelector('#status').classList.contains('success')"));capture("activation-valid");
        js("document.querySelector('#continue').click();true");
        until("!!document.querySelector('[data-action=\"site:setup\"]')");
        assertEquals("2",js("document.querySelectorAll('#site-auth-form input').length"));
        assertEquals("true",js("document.querySelector('.licensed-identity').innerText.includes('متجر الفحص')"));capture("licensed-first-setup");
        js("(()=>{const values={username:'qa',password:'1234'};for(const [key,value] of Object.entries(values))document.querySelector('#site-auth-form [name='+key+']').value=value;act('site:setup');return true})()");
        until("!!document.querySelector('.nav')&&!document.querySelector('.busy')");
        until("document.querySelector('.brand-logo').naturalWidth>0");
        action("site:account-menu");until("!!document.querySelector('.account-sheet')");
        assertEquals("true",js("document.querySelector('.account-sheet').getBoundingClientRect().height<Math.min(innerHeight-10,640)"));
        assertEquals("true",js("document.querySelector('[data-action=\"appearance:dark\"]').getAttribute('aria-pressed')==='true'"));capture("account-menu-dark");
        action("appearance:light");assertEquals("true",js("document.querySelector('[data-action=\"appearance:light\"]').getAttribute('aria-pressed')==='true'"));capture("account-menu-light");
        action("site:support");until("document.querySelector('.support-image').naturalWidth>0");capture("support-contact-light");
        assertEquals("true",js("document.querySelector('.support-whatsapp').href==='https://wa.me/22249823328'"));
        action("close");action("appearance:dark");action("go:settings");
        assertEquals("true",js("!!document.querySelector('#content [data-action=\"site:support\"]')"));
        action("site:support");capture("support-contact-dark");action("close");action("go:home");
        action("go:inventory");action("open:product");
        until("!!document.querySelector('.product-editor-sheet')");capture("product-editor");
        assertEquals("false",js("document.querySelector('.sheet').innerText.includes('\u0633\u0639\u0631 \u0627\u0644\u062c\u0645\u0644\u0629')"));
        js("(()=>{const values={name:'\u0634\u0627\u064a',price:'100',cost:'40',qty:'10',openingWarehouse:S.warehouse};for(const [key,value] of Object.entries(values))document.querySelector('#sheet-form [name='+key+']').value=value;act('save-product');return true})()");
        until("S.products.length===1&&modal===null&&!document.querySelector('.busy')");
        assertEquals("10",js("S.products[0].qty"));assertEquals("0",js("S.records[0].total"));
        action("new:sale");action("pos:add:"+js("S.products[0].id"));
        until("!!document.querySelector('.pos-cart-table')");capture("sale-cart");
        assertEquals("false",js("document.body.innerText.includes('\u0633\u0639\u0631 \u0627\u0644\u062c\u0645\u0644\u0629')"));
        js("act('pos:checkout');true");until("modal==='payment'");
        capture("payment-review");
        String paidTop=js("document.querySelector('.sheet').getBoundingClientRect().top");
        action("pos:settlement:note");assertEquals(paidTop,js("document.querySelector('.sheet').getBoundingClientRect().top"));
        action("pos:settlement:paid");assertEquals(paidTop,js("document.querySelector('.sheet').getBoundingClientRect().top"));
        js("act('post-sale');true");until("view==='invoice'&&S.records.some(r=>r.kind==='sale')&&!document.querySelector('.busy')");
        capture("seller-invoice");assertEquals("9",js("S.products[0].qty"));
        assertEquals("100",js("S.records.find(r=>r.kind==='sale').total"));
        assertEquals("false",js("document.querySelector('.invoice-document').innerText.includes('\u0634\u0643\u0631\u064b\u0627')"));
        action("go:parties");action("partytype:supplier");action("open:party");
        js("document.querySelector('#sheet-form [name=name]').value='\u0645\u0648\u0631\u062f \u0627\u062e\u062a\u0628\u0627\u0631';true");action("save-party");
        String supplierId=js("S.parties.find(p=>p.name==='\u0645\u0648\u0631\u062f \u0627\u062e\u062a\u0628\u0627\u0631').id");
        action("new:purchase");action("pos:add:"+js("S.products[0].id"));action("pos:party");action("pos:party-pick:"+supplierId);
        action("pos:checkout");action("post-sale");
        String purchaseId=js("S.records.find(r=>r.kind==='purchase').id");
        String recordCount=js("S.records.length");
        action("source-location:"+purchaseId);
        assertEquals("true",js("view==='purchase-source'&&selected===0&&modal===null&&editingId===null&&cart.length===0"));
        until("!!document.querySelector('tr.source-record-focus')");capture("purchase-source-highlight");
        assertEquals(recordCount,js("S.records.length"));
        action("invoice:"+purchaseId);
        assertEquals("true",js("view==='invoice'&&modal===null&&editingId===null&&!!document.querySelector('[data-action=\"source:"+purchaseId+"\"]')&&!document.querySelector('[data-action=\"source-location:"+purchaseId+"\"]')"));
        capture("invoice-at-source");
        action("source:"+purchaseId);assertEquals(purchaseId,js("editingId"));
        action("pos:clear");action("pos:confirm-clear");
        action("open:pay");
        assertEquals("true",js("view==='cash'"));
        js("(()=>{const values={direction:'pay',partyType:'supplier',party:"+supplierId+",account:S.accounts[0].id,amount:'5',note:'payment'};for(const [key,value] of Object.entries(values))document.querySelector('#sheet-form [name='+key+']').value=value;return true})()");
        action("post-party");String paymentId=js("S.records.find(r=>r.kind==='pay').id");
        action("go:parties");action("partytype:supplier");
        assertEquals("6",js("document.querySelectorAll('.party-stat').length"));
        assertEquals("40",js("Number(document.querySelector('[data-metric=trade]').dataset.value)"));
        assertEquals("45",js("Number(document.querySelector('[data-metric=cashOut]').dataset.value)"));
        assertEquals("1",js("Number(document.querySelector('[data-metric=invoiceCount]').dataset.value)"));capture("supplier-directory-summary");
        action("ledger:"+supplierId);
        assertEquals("5",js("Number(document.querySelector('[data-metric=receivable]').dataset.value)"));
        assertEquals("0",js("Number(document.querySelector('[data-metric=payable]').dataset.value)"));capture("supplier-account-summary");
        action("site:party-metric:supplier:"+supplierId+":cashOut");
        assertEquals("true",js("!!document.querySelector('.party-metric-source')&&document.querySelectorAll('.party-metric-source tbody tr').length===2"));capture("supplier-cash-sources");action("close");
        action("source-location:"+paymentId);
        assertEquals("true",js("view==='cash'&&selected===0&&modal===null&&editingId===null&&cart.length===0"));
        until("!!document.querySelector('tr.source-record-focus')");capture("payment-source-highlight");
        action("invoice:"+paymentId);assertEquals("true",js("!!document.querySelector('[data-action=\"source:"+paymentId+"\"]')&&!document.querySelector('[data-action=\"source-location:"+paymentId+"\"]')"));
        action("source:"+paymentId);assertEquals("true",js("view==='cash'&&modal==='partyCash'&&editingId==="+paymentId));action("close");
        action("account:"+js("S.accounts[0].id"));
        assertEquals("false",js("!!document.querySelector('[data-action=\"open:deposit\"]')"));
        action("go:accounts");action("accounts-tab:adjustments");action("open:deposit");
        assertEquals("true",js("view==='accounts'&&accountsTab==='adjustments'&&selected===0&&document.querySelector('#sheet-form [name=account]').value===''"));
        capture("deposit-account-choice");
        js("document.querySelector('#sheet-form [name=account]').value=S.accounts[0].id;document.querySelector('#sheet-form [name=amount]').value='10';true");action("post-cash");String depositId=js("S.records.find(r=>r.kind==='deposit').id");
        action("go:operations");action("invoice:"+depositId);action("source-location:"+depositId);
        assertEquals("true",js("view==='accounts'&&accountsTab==='adjustments'&&selected===0&&modal===null&&editingId===null"));
        until("!!document.querySelector('tr.source-record-focus')");capture("deposit-source-highlight");
        action("invoice:"+depositId);action("source:"+depositId);
        assertEquals("true",js("view==='accounts'&&accountsTab==='adjustments'&&modal==='deposit'&&editingId==="+depositId+"&&document.querySelector('#sheet-form [name=account]').value===String(S.accounts[0].id)"));action("close");
        js("reportType='overview';period='all';true");action("go:reports");
        // Read the same desktop862 dataset used by the visible report, then open its real controls.
        js("window.__qaReportModule=null;window.__qaReportImportError=null;window.__qaReportImportDone=false;import(new URL('./report-data.js',location.href).href).then(m=>window.__qaReportModule=m).catch(e=>window.__qaReportImportError=String(e)).finally(()=>window.__qaReportImportDone=true);true");until("window.__qaReportImportDone===true");assertEquals("null",js("window.__qaReportImportError"));
        assertEquals("true",js("(()=>{const d=__qaReportModule.reportDataset(S,{type:'overview',allTime:true});return d.metrics.length===document.querySelectorAll('#content [data-action^=\"site:feature:report-metric:\"]').length&&d.metrics.every((m,i)=>document.querySelector('[data-action=\"site:feature:report-metric:'+i+'\"]').innerText.includes(m.label))})()"));
        js("(()=>{const d=__qaReportModule.reportDataset(S,{type:'overview',allTime:true}),i=d.metrics.findIndex(m=>m.key==='netProfit');document.querySelector('[data-action=\"site:feature:report-metric:'+i+'\"]').click();return true})()");until("modal==='feature-report-metric'");
        assertEquals("true",js("(()=>{const d=__qaReportModule.reportDataset(S,{type:'overview',allTime:true}),sale=d.rows.find(r=>r.kind==='sale'),sheet=document.querySelector('.sheet');return sale.total===100&&sale.cost===40&&sale.profit===60&&d.metrics.find(m=>m.key==='expenses').value===0&&d.metrics.find(m=>m.key==='netProfit').value===60&&sheet.querySelector('.report-context-note').innerText.includes('المبيعات − تكلفة البيع − المصاريف')&&sheet.querySelector('.report-trace-total .amount>span').textContent==='60'&&!!sheet.querySelector('[data-action=\"site:feature:report-document:'+sale.id+'\"]')})()"));capture("report-profit-sources");action("close");
        js("reportType='overview';true");action("go:reports");
        assertEquals("The visible report is overview","true",js("reportType==='overview'&&document.querySelector('#content .browse-toolbar').innerText.includes(browseReports.overview)"));
        assertEquals("The clicked overview metric is net profit","true",js("(()=>{const d=__qaReportModule.reportDataset(S,{type:'overview',allTime:true}),i=d.metrics.findIndex(m=>m.key==='netProfit'),metric=d.metrics[i],button=document.querySelector('[data-action=\"site:feature:report-metric:'+i+'\"]');if(reportType!=='overview'||metric?.key!=='netProfit'||!button||!button.innerText.includes(metric.label))return false;button.click();return true})()"));until("modal==='feature-report-metric'");
        assertEquals("The clicked profit component is cost","true",js("(()=>{const button=document.querySelector('[data-action=\"site:feature:report-component:cost\"]');if(button?.dataset.reportComponent!=='cost'||Number(button.dataset.value)!==-40)return false;button.click();return true})()"));until("!!document.querySelector('[data-component-source=\"cost\"]')");
        assertEquals("true",js("(()=>{const d=__qaReportModule.reportDataset(S,{type:'overview',allTime:true}),sale=d.rows.find(r=>r.kind==='sale'),sheet=document.querySelector('.sheet');return d.rows.filter(r=>r.kind==='sale'||r.kind==='return').reduce((sum,r)=>sum+r.cost,0)===40&&sheet.querySelector('.report-trace-total .amount>span').textContent==='40'&&sheet.querySelector('[data-action=\"site:feature:report-document:'+sale.id+'\"] .amount>span').textContent==='40'})()"));action("close");
        assertEquals("The clicked overview metric is expenses","true",js("(()=>{const d=__qaReportModule.reportDataset(S,{type:'overview',allTime:true}),i=d.metrics.findIndex(m=>m.key==='expenses'),metric=d.metrics[i],button=document.querySelector('[data-action=\"site:feature:report-metric:'+i+'\"]');if(reportType!=='overview'||metric?.key!=='expenses'||!button||!button.innerText.includes(metric.label))return false;button.click();return true})()"));until("modal==='feature-report-metric'");
        assertEquals("true",js("document.querySelector('.sheet .report-trace-total .amount>span').textContent==='0'&&!document.querySelector('.sheet .feature-report-table')"));action("close");
        js("reportType='sales';true");action("go:reports");
        js("(()=>{const d=__qaReportModule.reportDataset(S,{type:'sales',allTime:true}),i=d.metrics.findIndex(m=>m.key==='customerNet');document.querySelector('[data-action=\"site:feature:report-metric:'+i+'\"]').click();return true})()");until("modal==='sourceinfo'&&!!document.querySelector('.report-trace')");
        assertEquals("true",js("document.querySelector('.report-trace').innerText.includes('\u0627\u0633\u062a\u0644\u0627\u0645 \u0627\u0644\u0639\u0645\u0644\u0627\u0621')&&Math.abs(reportReceiptReconciliation31().residual)<.005"));capture("report-credit-reconciliation");action("close");
        action("go:operations");capture("invoice-register");
        assertEquals("0",js("document.querySelectorAll('main .list-actions [data-action=\"open:actions\"]').length"));
        action("site:language:fr");assertEquals("true",js("document.querySelector('#phone').dir==='ltr'&&document.documentElement.lang==='fr'"));capture("french-register");
        action("go:settings");assertEquals("false",js("!!document.querySelector('[data-action=\"site:seed-demo\"]')"));
        action("site:support");
        assertEquals("true",js("document.querySelector('.support-hint').innerText.includes('problème technique')"));
        assertEquals("false",js("/activation|renouvellement/i.test(document.querySelector('.support-hint').innerText)"));
        assertEquals("true",js("document.querySelector('.support-whatsapp').href==='https://wa.me/22249823328'&&!!document.querySelector('.support-methods a[href=\"tel:49823328\"]')"));
        capture("french-support");action("close");
        action("go:operations");
        UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        observeNativeSave();
        for(String format:new String[]{"excel","pdf"}){
            try{
                until("!karnaPersistenceBusy()&&!document.querySelector('[data-busy-disabled]')");js("window.__qaExportDone=false;window.__qaFileSaved=null;window.__qaExportDiagnostic={format:'"+format+"',stage:'requested',saveBlobCalled:false};act('site:export-"+format+"').finally(()=>window.__qaExportDone=true);true");
                var save=nativeSaveControl(device,format,"Native save picker for "+format);
                save.click();until("window.__qaExportDone===true");assertEquals("Native file saved: "+format,"true",js("window.__qaFileSaved"));
            }catch(Exception|AssertionError failure){captureNativeExportFailure(device,format);throw failure;}
        }
        assertEquals("false",js("(()=>{modal='site-export';render();return !!document.querySelector('[data-action=\"site:export-print\"]')})()"));action("close");
        activity.close();activity=ActivityScenario.launch(MainActivity.class);
        until("!!document.querySelector('[data-action=\"site:login\"]')");
        js("document.querySelector('[name=username]').value='qa';document.querySelector('[name=password]').value='1234';act('site:login');true");
        until("!!document.querySelector('.nav')&&!document.querySelector('.busy')");
        assertEquals("10",js("S.products[0].qty"));assertEquals("5",js("S.records.length"));assertEquals("true",js("document.querySelector('#phone').dir==='ltr'"));capture("cold-relaunch");
        String balances=js("JSON.stringify({accounts:S.accounts.map(a=>a.balance),parties:S.parties.map(p=>p.balance),stocks:S.products.map(p=>p.stocks)})");
        action("site:feature:currency");js("document.querySelector('[name=newCode]').value='EUR';true");action("site:feature:currency-save");
        assertEquals("\"EUR\"",js("S.currency.code"));assertEquals(balances,js("JSON.stringify({accounts:S.accounts.map(a=>a.balance),parties:S.parties.map(p=>p.balance),stocks:S.products.map(p=>p.stocks)})"));
        action("site:feature:categories");js("document.querySelector('[name=categoryName]').value='Épicerie';true");action("site:feature:category-save");action("close");
        action("product:"+js("S.products[0].id"));action("open:productedit");js("document.querySelector('[name=categoryId]').value=S.categories[0].id;true");action("save-product");
        assertEquals("true",js("S.products[0].categoryId===S.categories[0].id"));
        action("site:feature:opening:"+js("S.products[0].id"));assertEquals("true",js("modal==='feature-opening'&&document.querySelector('.feature-opening-metrics').innerText.includes('10')"));capture("french-opening-history");action("close");
        action("ledger:"+supplierId);action("site:feature:party-statement:"+supplierId);assertEquals("true",js("reportType==='party-ledger'&&!!document.querySelector('.feature-report-table')&&document.querySelector('#content').innerText.includes('Solde final')"));capture("french-party-statement");
        observeNativeSave();
        try{
            until("!karnaPersistenceBusy()&&!document.querySelector('[data-busy-disabled]')");js("window.__qaExportDone=false;window.__qaFileSaved=null;window.__qaExportDiagnostic={format:'statement-pdf',stage:'requested',saveBlobCalled:false};act('site:export-pdf').finally(()=>window.__qaExportDone=true);true");
            var statementSave=nativeSaveControl(device,"statement-pdf","Statement PDF saved directly");statementSave.click();until("window.__qaExportDone===true");assertEquals("true",js("window.__qaFileSaved"));
        }catch(Exception|AssertionError failure){captureNativeExportFailure(device,"statement-pdf");throw failure;}
        action("go:users");action("site:new-user");js("(()=>{for(const [k,v]of Object.entries({name:'Vendeur',username:'seller',password:'1234'}))document.querySelector('#sheet-form [name='+k+']').value=v;return true})()");action("site:feature:permission-toggle:pos.edit:true");capture("french-granular-permissions");action("site:feature:user-save");
        js("window.__qaSql=false;initSqlJs().then(SQL=>{const db=new SQL.Database();db.run('CREATE TABLE offline_test(value INTEGER)');db.run('INSERT INTO offline_test VALUES (7)');window.__qaSql=db.exec('SELECT value FROM offline_test')[0].values[0][0]===7;db.close()});true");until("window.__qaSql===true");
        activity.close();activity=ActivityScenario.launch(MainActivity.class);until("!!document.querySelector('[data-action=\"site:login\"]')");js("document.querySelector('[name=username]').value='qa';document.querySelector('[name=password]').value='1234';true");action("site:login");
        assertEquals("true",js("S.currency.code==='EUR'&&S.categories[0].name==='Épicerie'&&S.products[0].categoryId===S.categories[0].id&&S.users.some(u=>u.username==='seller'&&u.capabilities.includes('pos.edit'))"));
        System.out.println("FEATURES PASS: native direct PDF, statement, display-only currency, categories, granular permissions, offline SQLite and cold persistence.");
        activity.close();
    }
}

