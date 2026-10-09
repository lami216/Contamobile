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
        assertEquals("false",js("document.querySelector('.sheet').innerText.includes('سعر الجملة')"));
        js("(()=>{const values={name:'شاي',price:'100',cost:'40',qty:'10',openingWarehouse:S.warehouse};for(const [key,value] of Object.entries(values))document.querySelector('#sheet-form [name='+key+']').value=value;act('save-product');return true})()");
        until("S.products.length===1&&modal===null&&!document.querySelector('.busy')");
        assertEquals("10",js("S.products[0].qty"));assertEquals("0",js("S.records[0].total"));
        js("act('new:sale');act('pos:add:'+S.products[0].id);true");
        until("!!document.querySelector('.pos-cart-table')");capture("sale-cart");
        assertEquals("false",js("document.body.innerText.includes('سعر الجملة')"));
        js("act('pos:checkout');true");until("modal==='payment'");
        capture("payment-review");
        String paidTop=js("document.querySelector('.sheet').getBoundingClientRect().top");
        action("pos:settlement:note");assertEquals(paidTop,js("document.querySelector('.sheet').getBoundingClientRect().top"));
        action("pos:settlement:paid");assertEquals(paidTop,js("document.querySelector('.sheet').getBoundingClientRect().top"));
        js("act('post-sale');true");until("view==='invoice'&&S.records.some(r=>r.kind==='sale')&&!document.querySelector('.busy')");
        capture("seller-invoice");assertEquals("9",js("S.products[0].qty"));
        assertEquals("100",js("S.records.find(r=>r.kind==='sale').total"));
        assertEquals("false",js("document.querySelector('.invoice-document').innerText.includes('شكرًا')"));
        action("go:parties");action("partytype:supplier");action("open:party");
        js("document.querySelector('#sheet-form [name=name]').value='مورد اختبار';true");action("save-party");
        String supplierId=js("S.parties.find(p=>p.name==='مورد اختبار').id");
        action("new:purchase");action("pos:add:"+js("S.products[0].id"));action("pos:party");action("pos:party-pick:"+supplierId);
        action("pos:checkout");action("post-sale");
        String purchaseId=js("S.records.find(r=>r.kind==='purchase').id");
        action("source-location:"+purchaseId);
        assertEquals("true",js("view==='purchase'&&modal===null&&editingId==="+purchaseId+"&&cart.length===1"));
        capture("purchase-source");
        action("pos:clear");action("pos:confirm-clear");
        action("go:operations");action("invoice:"+purchaseId);
        assertEquals("true",js("!!document.querySelector('[data-action=\"source-location:"+purchaseId+"\"]')&&!document.querySelector('[data-action=\"source:"+purchaseId+"\"]')"));
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
        assertEquals("10",js("S.products[0].qty"));assertEquals("3",js("S.records.length"));capture("cold-relaunch");
        activity.close();
    }
}

