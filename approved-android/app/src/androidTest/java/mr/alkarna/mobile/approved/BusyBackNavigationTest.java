package mr.alkarna.mobile.approved;

import android.content.Context;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.security.PublicKey;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Hardware Back must not destroy the WebView while a durable accounting write is pending. */
@RunWith(AndroidJUnit4.class)
public final class BusyBackNavigationTest {
 private ActivityScenario<MainActivity> activity;
 private Map<String,PublicKey> original;
 @Before public void activateSyntheticDevice()throws Exception{original=new HashMap<>(LicenseCompatibilityTest.keys());Context context=ApplicationProvider.getApplicationContext();DeviceLicense license=new DeviceLicense(context);license.install(TestLicenseIssuer.issue(license.deviceCode(),"perpetual",0));}
 @After public void close()throws Exception{if(activity!=null)activity.close();LicenseCompatibilityTest.keys().clear();LicenseCompatibilityTest.keys().putAll(original);}
 private String js(String script)throws Exception{ArrayBlockingQueue<String> result=new ArrayBlockingQueue<>(1);activity.onActivity(a->a.getWebView().evaluateJavascript(script,v->result.offer(v==null?"null":v)));String value=result.poll(15,TimeUnit.SECONDS);assertNotNull("WebView callback missing",value);return value;}
 private void launchReady()throws Exception{activity=ActivityScenario.launch(MainActivity.class);long end=System.currentTimeMillis()+25000;while(!"true".equals(js("typeof window.karnaPersistenceBusy==='function'&&!!document.querySelector('[data-action=\"site:setup\"],[data-action=\"site:login\"],.nav')"))){assertTrue("App boot did not finish",System.currentTimeMillis()<end);Thread.sleep(100);}}
 private String url()throws Exception{ArrayBlockingQueue<String> result=new ArrayBlockingQueue<>(1);activity.onActivity(a->result.offer(a.getWebView().getUrl()));String value=result.poll(10,TimeUnit.SECONDS);assertNotNull(value);return value;}
 @Test public void nativeBackWaitsWhileSaveIsBusy()throws Exception{
  launchReady();
  assertEquals("true",js("window.__auditBusyHook=window.karnaPersistenceBusy;window.karnaPersistenceBusy=()=>true;true"));activity.onActivity(a->a.onBackPressed());Thread.sleep(500);activity.onActivity(a->assertFalse("Back destroyed the app during a pending save",a.isFinishing()));assertEquals("true",js("window.karnaPersistenceBusy=window.__auditBusyHook;delete window.__auditBusyHook;true"));
 }
 @Test public void activationNavigationWaitsForTheAcceptedSave()throws Exception{
  launchReady();assertEquals("true",js("window.__auditBusyHook=window.karnaPersistenceBusy;window.karnaPersistenceBusy=()=>true;true"));
  activity.onActivity(a->{try{var method=MainActivity.class.getDeclaredMethod("showActivation");method.setAccessible(true);method.invoke(a);}catch(Exception e){throw new AssertionError(e);}});
  Thread.sleep(600);assertTrue("Activation navigated away while a save was pending",url().endsWith("/assets/approved/index.html"));
  assertEquals("true",js("window.karnaPersistenceBusy=window.__auditBusyHook;delete window.__auditBusyHook;true"));long end=System.currentTimeMillis()+10000;while(!url().endsWith("/assets/approved/activation.html")){assertTrue("Activation did not open after the save completed",System.currentTimeMillis()<end);Thread.sleep(100);}
 }
}
