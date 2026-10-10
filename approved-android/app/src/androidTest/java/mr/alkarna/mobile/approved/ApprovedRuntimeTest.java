package mr.alkarna.mobile.approved;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import android.graphics.Bitmap;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiSelector;
import static org.junit.Assert.*;
import java.util.concurrent.*;
import java.io.*;

@RunWith(AndroidJUnit4.class)
public class ApprovedRuntimeTest {
    private ActivityScenario<MainActivity> activity;
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
    @Test public void approvedSellerWorkflowAndColdPersistence() throws Exception {
        activity=ActivityScenario.launch(MainActivity.class);
        until("!!document.querySelector('[data-action=\"site:setup\"]')");
        js("(()=>{const values={name:'QA owner',shop:'QA store',username:'qa',password:'1234',seed:'empty'};for(const [key,value] of Object.entries(values))document.querySelector('#site-auth-form [name='+key+']').value=value;act('site:setup');return true})()");
        until("!!document.querySelector('.nav')&&!document.querySelector('.busy')");
        js("act('go:inventory');act('open:product');true");
        until("!!document.querySelector('.product-editor-sheet')");capture("product-editor");
        assertEquals("false",js("document.querySelector('.sheet').innerText.includes('\u0633\u0639\u0631 \u0627\u0644\u062c\u0645\u0644\u0629')"));
        js("(()=>{const values={name:'\u0634\u0627\u064a',price:'100',cost:'40',qty:'10',openingWarehouse:S.warehouse};for(const [key,value] of Object.entries(values))document.querySelector('#sheet-form [name='+key+']').value=value;act('save-product');return true})()");
        until("S.products.length===1&&modal===null&&!document.querySelector('.busy')");
        assertEquals("10",js("S.products[0].qty"));assertEquals("0",js("S.records[0].total"));
        js("act('new:sale');act('pos:add:'+S.products[0].id);true");
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
        assertEquals("true",js("reportMetrics31('overview').period.every(m=>!!document.querySelector('[data-action=\"explain:audit:'+m.key+'\"]'))"));
        action("explain:audit:netprofit");
        assertEquals("true",js("!!document.querySelector('.report-trace [data-action=\"explain:audit:cost\"]')"));capture("report-profit-sources");
        action("explain:audit:cost");assertEquals("true",js("document.querySelector('.report-trace').innerText.includes(String(reportCost31(S.records.find(r=>r.kind==='sale'))))"));action("close");
        js("reportType='sales';true");action("go:reports");action("explain:audit:due:sale");
        assertEquals("true",js("document.querySelector('.report-trace').innerText.includes('\u0627\u0633\u062a\u0644\u0627\u0645 \u0627\u0644\u0639\u0645\u0644\u0627\u0621')&&Math.abs(reportReceiptReconciliation31().residual)<.005"));capture("report-credit-reconciliation");action("close");
        action("go:operations");capture("invoice-register");
        assertEquals("0",js("document.querySelectorAll('main .list-actions [data-action=\"open:actions\"]').length"));
        UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        js("(()=>{const save=NativeFiles.saveBlob;NativeFiles.saveBlob=async(...args)=>{window.__qaFileSaved=false;const result=await save(...args);window.__qaFileSaved=result.saved===true;return result};return true})()");
        for(String format:new String[]{"excel","pdf"}){
            until("!document.querySelector('[data-busy-disabled]')");js("window.__qaExportDone=false;act('site:export-"+format+"').finally(()=>window.__qaExportDone=true);true");
            var save=device.findObject(new UiSelector().resourceId("android:id/button1"));
            assertTrue("Native save picker for "+format,save.waitForExists(20000));
            save.click();until("window.__qaExportDone===true");assertEquals("Native file saved: "+format,"true",js("window.__qaFileSaved"));
        }
        js("act('site:export-print');true");until("!!document.querySelector('#print-root .export-report')");device.waitForIdle();Thread.sleep(2000);capture("android-print-dialog");device.pressBack();
        activity.close();activity=ActivityScenario.launch(MainActivity.class);
        until("!!document.querySelector('[data-action=\"site:login\"]')");
        js("document.querySelector('[name=username]').value='qa';document.querySelector('[name=password]').value='1234';act('site:login');true");
        until("!!document.querySelector('.nav')&&!document.querySelector('.busy')");
        assertEquals("10",js("S.products[0].qty"));assertEquals("5",js("S.records.length"));capture("cold-relaunch");
        activity.close();
    }
}

