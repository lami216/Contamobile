package mr.alkarna.mobile.approved;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import static org.junit.Assert.*;

/** Device test: opening the explicit native support link does not initialize accounting. */
@RunWith(AndroidJUnit4.class)
public final class RecoverySupportEntryTest {
 @Test public void supportLinkNeverStartsAWebViewOrCopiesEvidence() throws Exception {
  Context context=ApplicationProvider.getApplicationContext();
  boolean webViewBefore=MainActivity.hasCreatedWebView();
  boolean requireCold="true".equals(InstrumentationRegistry.getArguments().getString("rescueRequireColdEntry"));
  if(requireCold)assertFalse("The cold support-entry test requires a fresh process",webViewBefore);
  File indexed=new File(context.getDataDir(),"app_webview/Default/IndexedDB");
  boolean indexedExisted=indexed.exists();
  File defaultProfile=indexed.getParentFile(),webProfile=defaultProfile.getParentFile();boolean defaultExisted=defaultProfile.exists(),webProfileExisted=webProfile.exists();
  Path sentinel=null;
  if(!webViewBefore){
   // A disposable synthetic raw file proves preservation of existing bytes on the cold path.
   Files.createDirectories(indexed.toPath());sentinel=indexed.toPath().resolve("rescue-entry-test-"+UUID.randomUUID()+".ldb");
   Files.write(sentinel,new byte[]{0,1,2,3,4,5,-1,0,42,10,13});
  }
  File rescue=new File(context.getNoBackupFilesDir(),"data-rescue");int copiesBefore=captureCount(rescue);
  Map<String,String> evidenceBefore=hashes(rescue,true),sourceBefore=!webViewBefore?hashes(indexed,false):null;
  android.content.pm.ShortcutManager shortcuts=context.getSystemService(android.content.pm.ShortcutManager.class);
  android.content.pm.ShortcutInfo shortcut=shortcuts.getManifestShortcuts().stream().filter(item->"data_rescue".equals(item.getId())).findFirst().orElse(null);
  assertNotNull("The installed customer APK must expose a launcher rescue shortcut",shortcut);
  assertTrue(shortcut.isEnabled());assertEquals(1,shortcut.getIntents().length);
  Intent intent=shortcut.getIntent();assertNotNull(intent);assertEquals(Intent.ACTION_VIEW,intent.getAction());assertEquals(Uri.parse(RecoverySupportEntry.LINK),intent.getData());assertNotNull(intent.getComponent());assertEquals(RecoverySupportActivity.class.getName(),intent.getComponent().getClassName());
  try{
  try(ActivityScenario<RecoverySupportActivity> scenario=ActivityScenario.launch(intent)){
   scenario.onActivity(activity->{assertFalse(containsWebView(activity.getWindow().getDecorView()));assertEquals(webViewBefore,MainActivity.hasCreatedWebView());});
  }
  assertEquals(copiesBefore,captureCount(rescue));
  assertEquals(evidenceBefore,hashes(rescue,true));
  if(sourceBefore!=null)assertEquals("Native support changed the synthetic IndexedDB fixture",sourceBefore,hashes(indexed,false));
  }finally{
   if(sentinel!=null)Files.deleteIfExists(sentinel);
   if(!indexedExisted&&indexed.exists())assertTrue("Unexpected IndexedDB entries appeared",indexed.delete());
   if(!defaultExisted&&defaultProfile.exists())assertTrue("Unexpected WebView profile entries appeared",defaultProfile.delete());
   if(!webProfileExisted&&webProfile.exists())assertTrue("Support initialized Chromium profile files",webProfile.delete());
  }
 }
 private static boolean containsWebView(View view){if(view instanceof WebView)return true;if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++)if(containsWebView(group.getChildAt(i)))return true;}return false;}
 private static int captureCount(File rescue){int count=0;File[] cases=rescue.listFiles();if(cases==null)return count;for(File item:cases){if(!item.getName().matches("[a-f0-9-]{36}"))continue;File[] children=item.listFiles();if(children!=null)for(File child:children)if(child.getName().startsWith("snapshot-"))count++;}return count;}
 private static Map<String,String> hashes(File root,boolean evidenceOnly) throws Exception {
  Map<String,String> hashes=new TreeMap<>();if(!root.exists())return hashes;
  try(java.util.stream.Stream<Path> paths=Files.walk(root.toPath())){for(Path path:(Iterable<Path>)paths.filter(p->Files.isRegularFile(p,LinkOption.NOFOLLOW_LINKS))::iterator){String relative=root.toPath().relativize(path).toString();if(evidenceOnly&&!relative.contains("evidence.ctrescue")&&!relative.contains("snapshot-"))continue;byte[] digest=MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(path));hashes.put(relative,Arrays.toString(digest));}}
  return hashes;
 }
}
