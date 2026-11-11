package mr.alkarna.mobile.approved;

import static org.junit.Assert.*;

import android.content.Context;
import android.os.Build;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;
import org.junit.*;
import org.junit.rules.TestWatcher;
import org.junit.runner.Description;
import org.junit.runner.RunWith;

/**
 * Isolated emulator only: signed final decisions, real Keystore/journal and actual IndexedDB
 * commits.
 */
@RunWith(AndroidJUnit4.class)
public class BootstrapSupportOutcomeTest {
  private Context context;
  private DeviceLicense license;
  private DeviceLifecycleClient client;
  private DeviceCloudLifecycleTest.FakeService service;
  private ActivityScenario<MainActivity> activity;
  private Map<String, PublicKey> originalKeys;
  private boolean ownsFixture;
  private String licenseId, deviceCode, fingerprint;
  private double initialRemaining;

  @Rule
  public final TestWatcher executed =
      new TestWatcher() {
        @Override
        protected void succeeded(Description description) {
          android.os.Bundle proof = new android.os.Bundle();
          proof.putString(
              "stream",
              "\nBOOTSTRAP SUPPORT OUTCOME CASE PASS " + description.getMethodName() + "\n");
          InstrumentationRegistry.getInstrumentation().sendStatus(0, proof);
        }
      };

  private interface Checked {
    void run() throws Exception;
  }

  private static void rejected(Checked work) throws Exception {
    try {
      work.run();
      fail("Operation required rejection");
    } catch (Exception expected) {
    }
  }

  private static JSONObject copy(JSONObject value) throws Exception {
    return new JSONObject(value.toString());
  }

  private DeviceLifecycleStore disk() throws Exception {
    return new DeviceLifecycleStore(context, deviceCode + "|" + fingerprint);
  }

  private void recreate() throws Exception {
    license = new DeviceLicense(context);
    client = new DeviceLifecycleClient(context, license, service.issuers, service);
  }

  @Before
  public void setup() throws Exception {
    assertEquals(
        "true",
        InstrumentationRegistry.getArguments().getString("bootstrapSupportOutcomeIsolation"));
    assertTrue(
        Build.HARDWARE.equals("ranchu")
            || Build.HARDWARE.equals("goldfish")
            || Build.FINGERPRINT.startsWith("generic")
            || Build.FINGERPRINT.contains("emulator")
            || Build.MODEL.contains("sdk_gphone"));
    context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    for (String name :
        new String[] {
          "activation-v2.json",
          "contatools-v1.json",
          AccountingResetStore.FILE,
          DeviceLifecycleStore.DIRECTORY,
          "cloud-backup-v1"
        })
      assertFalse(
          "Never replace customer state", new File(context.getNoBackupFilesDir(), name).exists());
    assertFalse(
        context.getSharedPreferences("activation-v2", Context.MODE_PRIVATE).contains("state"));
    assertNull(backupSingleton().get(null));
    originalKeys = new HashMap<>(LicenseCompatibilityTest.keys());
    ownsFixture = true;
    license = new DeviceLicense(context);
    license.install(TestLicenseIssuer.issue(license.deviceCode(), "temporary", 600));
    licenseId = license.status().getJSONObject("license").getString("licenseId");
    initialRemaining = license.status().getJSONObject("license").getDouble("remainingSeconds");
    deviceCode = license.deviceCode();
    service = new DeviceCloudLifecycleTest.FakeService(deviceCode);
    recreate();
    fingerprint = new InstallationIdentity().fingerprint();
    client.enroll(new JSONObject());
  }

  @After
  public void cleanup() throws Exception {
    if (!ownsFixture) return;
    if (activity != null) {
      async(
          "if(window.__supportDb)__supportDb.db?.close();await new Promise((resolve,reject)=>{const"
              + " r=indexedDB.deleteDatabase('alkarna-site-v1');r.onsuccess=resolve;r.onerror=reject;r.onblocked=resolve});");
      activity.close();
    }
    ((android.app.job.JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE))
        .cancel(CloudBackupPolicy.JOB_ID);
    Object manager = backupSingleton().get(null);
    if (manager != null) {
      var running = CloudBackupManager.class.getDeclaredField("running");
      running.setAccessible(true);
      long deadline = System.currentTimeMillis() + 5000;
      while (running.getBoolean(manager) && System.currentTimeMillis() < deadline) Thread.sleep(20);
      assertFalse(running.getBoolean(manager));
    }
    backupSingleton().set(null, null);
    for (String name : new String[] {DeviceLifecycleStore.DIRECTORY, "cloud-backup-v1"}) {
      File directory = new File(context.getNoBackupFilesDir(), name);
      if (directory.exists()) {
        File[] files = directory.listFiles();
        assertNotNull(files);
        for (File file : files) {
          assertTrue(file.isFile());
          assertTrue(file.delete());
        }
        assertTrue(directory.delete());
      }
    }
    for (String name :
        new String[] {"activation-v2.json", "contatools-v1.json", AccountingResetStore.FILE})
      for (String suffix : new String[] {"", ".bak", ".new"}) {
        File file = new File(context.getNoBackupFilesDir(), name + suffix);
        if (file.exists()) assertTrue(file.delete());
      }
    assertTrue(
        context
            .getSharedPreferences("activation-v2", Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit());
    KeyStore keys = KeyStore.getInstance("AndroidKeyStore");
    keys.load(null);
    for (String alias :
        new String[] {
          DeviceLifecycleStore.ALIAS,
          "alkarna.activation.state.v2",
          "alkarna.contatools.journal.v1",
          "alkarna.cloud.backup.v1",
          InstallationIdentity.ALIAS,
          AccountingResetStore.ALIAS
        }) if (keys.containsAlias(alias)) keys.deleteEntry(alias);
    LicenseCompatibilityTest.keys().clear();
    LicenseCompatibilityTest.keys().putAll(originalKeys);
  }

  private void activationUnchanged() throws Exception {
    DeviceLicense current = new DeviceLicense(context);
    JSONObject status = current.status();
    assertTrue(status.getBoolean("valid"));
    assertEquals(deviceCode, current.deviceCode());
    assertEquals(fingerprint, new InstallationIdentity().fingerprint());
    assertEquals(licenseId, status.getJSONObject("license").getString("licenseId"));
    assertTrue(status.getJSONObject("license").getDouble("remainingSeconds") <= initialRemaining);
  }

  private JSONObject input(JSONObject scope) throws Exception {
    return new JSONObject().put("grantId", scope.getString("grantId"));
  }

  private JSONObject preview() throws Exception {
    service.restore();
    JSONObject status = client.status(), scope = status.getJSONObject("bootstrapMeta");
    client.list(input(scope));
    return client.preview(input(scope));
  }

  private JSONObject prepared() throws Exception {
    JSONObject preview = preview();
    return client.prepare(input(preview).put("accepted", true));
  }

  private JSONObject finishInput(JSONObject scope) throws Exception {
    return input(scope).put("intentId", scope.getString("intentId"));
  }

  private byte[] pendingBytes(DeviceLifecycleStore saved) throws Exception {
    JSONObject pending = saved.state.getJSONObject("pending");
    return pending.has("snapshotGrantId")
        ? saved.previewSnapshot(pending.getString("snapshotGrantId"))
        : saved.snapshot();
  }

  private void assertCached(JSONObject terminal) throws Exception {
    int calls = service.bootstrapCalls;
    recreate();
    assertEquals("terminal", client.resumeLocal().getString("stage"));
    assertEquals("terminal", client.resume().getString("stage"));
    assertEquals("terminal", client.list(input(terminal)).getString("stage"));
    assertEquals("terminal", client.preview(input(terminal)).getString("stage"));
    assertEquals(
        "terminal", client.prepare(input(terminal).put("accepted", true)).getString("stage"));
    if (!terminal.getString("intentId").isEmpty())
      assertEquals("terminal", client.finish(finishInput(terminal)).getString("stage"));
    assertEquals(calls, service.bootstrapCalls);
    activationUnchanged();
  }

  @Test
  public void legacyV25PreparedJournalResumesIdenticalIntentAndClockWithoutFormatReset()
      throws Exception {
    JSONObject first = prepared();
    DeviceLifecycleStore legacy = disk();
    legacy.snapshot(pendingBytes(legacy));
    legacy.state.getJSONObject("pending").remove("snapshotGrantId");
    legacy.clearPreviewSnapshot(first.getString("grantId"));
    legacy.save();
    String old = ProtocolJson.canonical(legacy.state.getJSONObject("pending"));
    recreate();
    JSONObject local = client.resumeLocal();
    assertEquals(first.getString("intentId"), local.getString("intentId"));
    assertEquals(first.getString("text"), local.getString("text"));
    assertEquals(old, ProtocolJson.canonical(disk().state.getJSONObject("pending")));
    assertEquals(first.getString("intentId"), client.resume().getString("intentId"));
    assertEquals(1, service.claims);
    activationUnchanged();
  }

  @Test
  public void unsigned403And426NeverEraseAwaitingIntentOrPretendToBeTerminal() throws Exception {
    JSONObject preview = preview();
    service.unsignedBootstrapStatus = 403;
    rejected(() -> client.prepare(input(preview).put("accepted", true)));
    DeviceLifecycleStore saved = disk();
    String before = ProtocolJson.canonical(saved.state.getJSONObject("pending"));
    byte[] bytes = pendingBytes(saved);
    assertEquals("awaiting-claim", saved.state.getJSONObject("pending").getString("stage"));
    for (int status : new int[] {403, 426, 503}) {
      service.unsignedBootstrapStatus = status;
      recreate();
      rejected(() -> client.resume());
      assertEquals(before, ProtocolJson.canonical(disk().state.getJSONObject("pending")));
      assertArrayEquals(bytes, pendingBytes(disk()));
      assertEquals("awaiting-network", client.resumeLocal().getString("stage"));
      assertFalse(disk().state.getJSONObject("pending").has("outcome"));
    }
    assertEquals(0, service.claims);
    activationUnchanged();
  }

  @Test
  public void signedDecisionBeforeLocalCommitKeepsClaimPhaseAndBytesAndStopsEveryOldOperation()
      throws Exception {
    JSONObject first = prepared();
    DeviceLifecycleStore before = disk();
    String claim =
        ProtocolJson.canonical(before.state.getJSONObject("pending").getJSONObject("claim"));
    byte[] bytes = pendingBytes(before);
    service.forcedOutcome = "superseded-unknown";
    JSONObject closed = client.prepare(input(first).put("accepted", true));
    assertEquals("terminal", closed.getString("stage"));
    assertEquals("prepared", closed.getString("localPhase"));
    assertFalse(closed.getBoolean("ackPending"));
    assertEquals("superseded-unknown", closed.getJSONObject("outcome").getString("status"));
    DeviceLifecycleStore after = disk();
    assertEquals("prepared", after.state.getJSONObject("pending").getString("stage"));
    assertEquals(
        claim, ProtocolJson.canonical(after.state.getJSONObject("pending").getJSONObject("claim")));
    assertArrayEquals(bytes, pendingBytes(after));
    assertFalse(after.used(first.getString("grantId")));
    assertFalse(service.transferred);
    assertCached(closed);
  }

  @Test
  public void wrongSignatureOrIntentDoesNotPersistDiagnosticOrMutateVerifiedClaim()
      throws Exception {
    prepared();
    String original = ProtocolJson.canonical(disk().state.getJSONObject("pending"));
    byte[] bytes = pendingBytes(disk());
    service.forcedOutcome = "superseded-unknown";
    service.corruptTerminal = true;
    rejected(() -> client.resume());
    assertEquals(original, ProtocolJson.canonical(disk().state.getJSONObject("pending")));
    service.corruptTerminal = false;
    service.wrongTerminalIntent = true;
    rejected(() -> client.resume());
    assertEquals(original, ProtocolJson.canonical(disk().state.getJSONObject("pending")));
    assertArrayEquals(bytes, pendingBytes(disk()));
    assertFalse(disk().state.getJSONObject("pending").has("outcome"));
    activationUnchanged();
  }

  @Test
  public void explicitNewGrantArchivesOriginalTerminalIntentAndBlobWithoutStatusMovingIt()
      throws Exception {
    JSONObject first = prepared();
    byte[] old = pendingBytes(disk());
    service.forcedOutcome = "superseded-unknown";
    JSONObject closed = client.resume();
    String original = ProtocolJson.canonical(disk().state.getJSONObject("pending"));
    service.forcedOutcome = null;
    service.snapshot =
        new JSONObject(new String(service.snapshot, StandardCharsets.UTF_8))
            .put("createdAt", "2026-11-05T02:00:00.000Z")
            .toString()
            .getBytes(StandardCharsets.UTF_8);
    JSONObject next = preview();
    assertNotEquals(first.getString("grantId"), next.getString("grantId"));
    assertEquals(original, ProtocolJson.canonical(disk().state.getJSONObject("pending")));
    assertArrayEquals(old, pendingBytes(disk()));
    assertFalse(disk().state.has("archives"));
    JSONObject second = client.prepare(input(next).put("accepted", true));
    assertEquals("prepared", second.getString("stage"));
    DeviceLifecycleStore saved = disk();
    JSONObject archive =
        saved.state.getJSONObject("archives").getJSONObject(first.getString("grantId"));
    assertEquals(first.getString("intentId"), archive.getString("intentId"));
    assertEquals("prepared", archive.getString("stage"));
    assertTrue(archive.has("claim") && archive.has("outcome"));
    assertArrayEquals(old, saved.archivedSnapshot(first.getString("grantId")));
    assertEquals(
        second.getString("intentId"), saved.state.getJSONObject("pending").getString("intentId"));
    int calls = service.bootstrapCalls;
    assertEquals("terminal", client.finish(finishInput(closed)).getString("stage"));
    assertEquals(calls, service.bootstrapCalls);
    activationUnchanged();
  }

  @Test
  public void committedIndexedDbAndReceiptSurviveTerminalBeforeNativeFinishAndColdReopen()
      throws Exception {
    openDatabase();
    JSONObject first = prepared();
    commit(first);
    String before = snapshot();
    service.forcedOutcome = "superseded-unknown";
    JSONObject closed = client.resume();
    assertEquals("prepared", closed.getString("localPhase"));
    assertEquals(before, snapshot());
    assertEquals(first.getString("intentId"), text("window.__supportReceipt.intentId"));
    closeAndReopen();
    assertEquals(before, snapshot());
    assertCached(closed);
  }

  @Test
  public void appliedLostAckRetainsConsumedGrantAndAccountingWhenOldFinishReturnsTerminal()
      throws Exception {
    openDatabase();
    JSONObject first = prepared();
    commit(first);
    String before = snapshot();
    service.unsignedBootstrapStatus = 503;
    assertTrue(client.finish(finishInput(first)).getBoolean("ackPending"));
    assertTrue(disk().used(first.getString("grantId")));
    assertEquals(0, service.finishes);
    service.unsignedBootstrapStatus = 0;
    service.forcedOutcome = "superseded-unknown";
    JSONObject closed = client.resume();
    assertEquals("applied", closed.getString("localPhase"));
    assertFalse(closed.getBoolean("ackPending"));
    assertEquals(before, snapshot());
    assertTrue(disk().used(first.getString("grantId")));
    closeAndReopen();
    assertEquals(before, snapshot());
    assertCached(closed);
    assertEquals(0, service.finishes);
  }

  private static java.lang.reflect.Field backupSingleton() throws Exception {
    var field = CloudBackupManager.class.getDeclaredField("singleton");
    field.setAccessible(true);
    return field;
  }

  private void inject() {
    activity.onActivity(
        a -> {
          try {
            var field = MainActivity.class.getDeclaredField("deviceLifecycle");
            field.setAccessible(true);
            field.set(a, client);
          } catch (Exception error) {
            throw new IllegalStateException(error);
          }
        });
  }

  private String js(String source) throws Exception {
    ArrayBlockingQueue<String> values = new ArrayBlockingQueue<>(1);
    activity.onActivity(
        a ->
            a.getWebView()
                .evaluateJavascript(source, value -> values.offer(value == null ? "null" : value)));
    String result = values.poll(20, TimeUnit.SECONDS);
    assertNotNull(result);
    return result;
  }

  private String text(String source) throws Exception {
    return new JSONTokener(js(source)).nextValue().toString();
  }

  private void until(String source) throws Exception {
    long deadline = System.currentTimeMillis() + 45000;
    while (System.currentTimeMillis() < deadline) {
      if ("true".equals(js(source))) return;
      Thread.sleep(50);
    }
    fail("Timed out: " + source + "; " + js("document.body.innerText"));
  }

  private void async(String source) throws Exception {
    js(
        "window.__supportDone=false;window.__supportError=null;(async()=>{"
            + source
            + "})().catch(error=>window.__supportError=error.message).finally(()=>window.__supportDone=true);true");
    until("window.__supportDone");
    assertEquals("null", js("window.__supportError"));
  }

  private void openDatabase() throws Exception {
    activity = ActivityScenario.launch(MainActivity.class);ExistingLicenseAccess.enter(activity);
    inject();
    until("!!document.querySelector('[data-action=\"site:setup\"]')");
    async(
        "const {ShopDatabase}=await"
            + " import('https://appassets.androidplatform.net/assets/approved/database.js');window.__supportDb=await"
            + " new ShopDatabase().open();window.__supportDump=async()=>JSON.stringify({shop:await"
            + " __supportDb.all('snapshots'),users:await __supportDb.all('users'),meta:await"
            + " __supportDb.all('meta')});const {prepareFeatureState}=await"
            + " import('https://appassets.androidplatform.net/assets/approved/features.js');window.__supportPayload="
            + new String(service.snapshot, StandardCharsets.UTF_8)
            + ";prepareFeatureState(__supportPayload.state);__supportPayload.state.compactProductNamesV1=true;");
    service.snapshot = text("JSON.stringify(__supportPayload)").getBytes(StandardCharsets.UTF_8);
  }

  private void commit(JSONObject prepared) throws Exception {
    async(
        "window.__supportCommit=await __supportDb.applyCloudBootstrap("
            + prepared
            + ");window.__supportReceipt=await __supportDb.get('meta','cloud-bootstrap:'+"
            + JSONObject.quote(prepared.getString("grantId"))
            + ");");
    assertEquals("false", js("__supportCommit.alreadyApplied"));
  }

  private String snapshot() throws Exception {
    async("window.__supportSnapshot=await __supportDump()");
    return text("__supportSnapshot");
  }

  private void closeAndReopen() throws Exception {
    async("__supportDb.db.close()");
    activity.close();
    activity = ActivityScenario.launch(MainActivity.class);ExistingLicenseAccess.enter(activity);
    inject();
    until("!!document.querySelector('[data-action=\"site:login\"]')");
    async(
        "const {ShopDatabase}=await"
            + " import('https://appassets.androidplatform.net/assets/approved/database.js');window.__supportDb=await"
            + " new ShopDatabase().open();window.__supportDump=async()=>JSON.stringify({shop:await"
            + " __supportDb.all('snapshots'),users:await __supportDb.all('users'),meta:await"
            + " __supportDb.all('meta')});");
  }
}
