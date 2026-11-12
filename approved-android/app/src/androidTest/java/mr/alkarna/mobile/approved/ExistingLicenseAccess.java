package mr.alkarna.mobile.approved;

import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;

/** Selects the real access-page controls; never manufactures admission or modifies stored data. */
final class ExistingLicenseAccess {
 private ExistingLicenseAccess() {}
 static long installedVersion() throws Exception {
  var context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  var info=context.getPackageManager().getPackageInfo(context.getPackageName(),0);
  return android.os.Build.VERSION.SDK_INT>=28?info.getLongVersionCode():info.versionCode;
 }
 private static boolean hasAccessPage() throws Exception {
  return installedVersion()>=28;
 }
 private static String js(ActivityScenario<MainActivity> activity,String source) throws Exception {
  var result=new ArrayBlockingQueue<String>(1);
  activity.onActivity(a->a.getWebView().evaluateJavascript(source,value->result.offer(value==null?"null":value)));
  String value=result.poll(20,TimeUnit.SECONDS);assertNotNull("Access-page JavaScript callback",value);return value;
 }
 private static void until(ActivityScenario<MainActivity> activity,String condition) throws Exception {
  long deadline=System.currentTimeMillis()+25000;
  while(System.currentTimeMillis()<deadline){if("true".equals(js(activity,condition)))return;Thread.sleep(100);}
  fail("Access-page condition not reached: "+condition+"; "+js(activity,"document.body.innerText"));
 }
 static void enter(ActivityScenario<MainActivity> activity) throws Exception {
  if(!hasAccessPage())return; // Original signed v13-v27 binaries have no access selector.
  var context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  assertTrue("The legacy entry must have a valid existing fixture license",new DeviceLicense(context).status().getBoolean("valid"));
  if(installedVersion()>=29){
   until(activity,"location.pathname.endsWith('/index.html')&&document.documentElement.dataset.runtimeState==='ready'");
   assertEquals("Existing customers enter their usual local login directly", "false",js(activity,"!!document.querySelector('#legacy')"));
   return;
  }
  until(activity,"!!document.querySelector('#legacy:not(:disabled)')");
  js(activity,"document.querySelector('#legacy').click();true");
  until(activity,"location.pathname.endsWith('/index.html')&&document.documentElement.dataset.runtimeState==='ready'");
 }
 static void openManualActivation(ActivityScenario<MainActivity> activity) throws Exception {
  assertTrue("The new customer APK has no manual activation entry",installedVersion()<=30);
  if(!hasAccessPage())return;
  until(activity,"!!document.querySelector('#manual:not(:disabled)')");
  js(activity,"document.querySelector('#manual').click();true");
  until(activity,"!!document.querySelector('#device-code')");
 }
}
