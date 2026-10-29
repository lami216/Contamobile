package mr.alkarna.mobile.approved;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.io.File;
import java.nio.file.Files;
import java.security.PublicKey;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Synthetic native state only. Detects independent Activity instances losing a newer activation. */
@RunWith(AndroidJUnit4.class)
public final class ActivationConcurrencyTest {
 private Map<String,PublicKey> original;
 private Context target(){return ApplicationProvider.getApplicationContext();}
 @Before public void rememberIssuers() throws Exception {original=new HashMap<>(LicenseCompatibilityTest.keys());}
 @After public void restoreIssuers() throws Exception {LicenseCompatibilityTest.keys().clear();LicenseCompatibilityTest.keys().putAll(original);}
 private String issue(DeviceLicense license,String type,long seconds)throws Exception{return TestLicenseIssuer.issue(license.deviceCode(),type,seconds);}
 private void consumed(DeviceLicense license,String document)throws Exception{try{license.install(document);fail("A consumed document became reusable after another Activity wrote state");}catch(LicenseVerifier.Rejected expected){assertEquals("LICENSE_ALREADY_USED",expected.code);}}
 @Test public void staleCheckpointCannotRevertRenewalOrForgetItsConsumedId()throws Exception{
  DeviceLicense writer=new DeviceLicense(target());writer.install(issue(writer,"temporary",10800));DeviceLicense stale=new DeviceLicense(target());
  String renewal=issue(writer,"temporary",21600),id=new JSONObject(renewal).getJSONObject("payload").getString("licenseId");assertTrue(writer.install(renewal).getBoolean("valid"));
  stale.checkpoint();DeviceLicense reopened=new DeviceLicense(target());
  assertEquals("Stale Activity checkpoint replaced the newly installed document",id,reopened.status().getJSONObject("license").getString("licenseId"));
  assertEquals(id,new JSONObject(stale.registrationSnapshot().getString("licenseDocument")).getJSONObject("payload").getString("licenseId"));
  consumed(stale,renewal);consumed(reopened,renewal);
 }
 @Test public void staleInstallRetainsDocumentsConsumedByAnotherInstance()throws Exception{
  DeviceLicense writer=new DeviceLicense(target());String first=issue(writer,"perpetual",0);writer.install(first);DeviceLicense stale=new DeviceLicense(target());
  String second=issue(writer,"perpetual",0);writer.install(second);String third=issue(stale,"perpetual",0);stale.install(third);
  DeviceLicense reopened=new DeviceLicense(target());consumed(reopened,first);consumed(reopened,second);consumed(reopened,third);
 }
 @Test public void concurrentSameDocumentCanOnlyBeInstalledOnce()throws Exception{
  DeviceLicense first=new DeviceLicense(target());first.install(issue(first,"perpetual",0));DeviceLicense second=new DeviceLicense(target());String shared=issue(first,"temporary",10800);
  ExecutorService pool=Executors.newFixedThreadPool(2);CountDownLatch ready=new CountDownLatch(2),start=new CountDownLatch(1);AtomicInteger installed=new AtomicInteger(),rejected=new AtomicInteger();AtomicReference<Throwable> unexpected=new AtomicReference<>();
  try{
   for(DeviceLicense copy:new DeviceLicense[]{first,second})pool.submit(()->{ready.countDown();try{assertTrue(start.await(10,TimeUnit.SECONDS));copy.install(shared);installed.incrementAndGet();}catch(LicenseVerifier.Rejected e){if("LICENSE_ALREADY_USED".equals(e.code))rejected.incrementAndGet();else unexpected.set(e);}catch(Throwable e){unexpected.set(e);}});
   assertTrue(ready.await(10,TimeUnit.SECONDS));start.countDown();pool.shutdown();assertTrue(pool.awaitTermination(20,TimeUnit.SECONDS));assertNull(unexpected.get());assertEquals(1,installed.get());assertEquals(1,rejected.get());consumed(new DeviceLicense(target()),shared);
  }finally{start.countDown();pool.shutdownNow();}
 }
 @Test public void permanentStatusReadsDoNotRewriteActivationCopies()throws Exception{
  DeviceLicense first=new DeviceLicense(target());first.install(issue(first,"perpetual",0));DeviceLicense second=new DeviceLicense(target());File disk=new File(target().getNoBackupFilesDir(),"activation-v2.json");byte[] before=Files.readAllBytes(disk.toPath());
  for(int i=0;i<10;i++){assertTrue(first.status().getBoolean("valid"));assertTrue(second.status().getBoolean("valid"));first.registrationSnapshot();second.registrationSnapshot();}
  assertArrayEquals("Status refresh must not write activation on every call",before,Files.readAllBytes(disk.toPath()));
 }
 @Test public void alternatingTemporaryReadersDoNotIncreaseRemainingTime()throws Exception{
  DeviceLicense first=new DeviceLicense(target());first.install(issue(first,"temporary",10800));DeviceLicense second=new DeviceLicense(target());double remaining=first.status().getJSONObject("license").getDouble("remainingSeconds");
  for(int i=0;i<4;i++){Thread.sleep(20);second.checkpoint();double current=first.status().getJSONObject("license").getDouble("remainingSeconds");assertTrue("Another instance extended the active countdown",current<=remaining);remaining=current;}
 }
}
