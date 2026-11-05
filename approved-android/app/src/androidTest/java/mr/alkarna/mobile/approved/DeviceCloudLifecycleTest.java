package mr.alkarna.mobile.approved;

import static org.junit.Assert.*;

import android.content.Context;
import android.os.Build;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.*;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.*;
import org.junit.*;
import org.junit.rules.TestWatcher;
import org.junit.runner.Description;
import org.junit.runner.RunWith;

/**
 * Real Keystore, encrypted intents, original activation clock and signed in-process service only.
 */
@RunWith(AndroidJUnit4.class)
public class DeviceCloudLifecycleTest {
  private Context context;
  private DeviceLicense license;
  private DeviceLifecycleClient client;
  private FakeService service;
  private Map<String, PublicKey> oldKeys, oldOnline;
  private boolean ownsFixture;

  @Rule
  public final TestWatcher executed =
      new TestWatcher() {
        @Override
        protected void succeeded(Description description) {
          android.os.Bundle proof = new android.os.Bundle();
          proof.putString(
              "stream", "\nDEVICE CLOUD LIFECYCLE CASE PASS " + description.getMethodName() + "\n");
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

  @SuppressWarnings("unchecked")
  private static Map<String, PublicKey> onlineKeys() throws Exception {
    var field = LicenseVerifier.class.getDeclaredField("ONLINE_KEYS");
    field.setAccessible(true);
    return (Map<String, PublicKey>) field.get(null);
  }

  private static java.lang.reflect.Field singleton() throws Exception {
    var field = CloudBackupManager.class.getDeclaredField("singleton");
    field.setAccessible(true);
    return field;
  }

  private void recreate() throws Exception {
    license = new DeviceLicense(context);
    client = new DeviceLifecycleClient(context, license, service.issuers, service);
  }

  @Before
  public void setup() throws Exception {
    assertEquals(
        "true", InstrumentationRegistry.getArguments().getString("deviceCloudLifecycleIsolation"));
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
    assertNull(singleton().get(null));
    oldKeys = new HashMap<>(LicenseCompatibilityTest.keys());
    oldOnline = new HashMap<>(onlineKeys());
    ownsFixture = true;
    license = new DeviceLicense(context);
    service = new FakeService(license.deviceCode());
    onlineKeys().put("contatools-online-v2:fixture-online", service.pair.getPublic());
    recreate();
  }

  @After
  public void cleanup() throws Exception {
    if (!ownsFixture) return;
    ((android.app.job.JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE))
        .cancel(CloudBackupPolicy.JOB_ID);
    Object manager = singleton().get(null);
    if (manager != null) {
      var field = CloudBackupManager.class.getDeclaredField("running");
      field.setAccessible(true);
      long end = System.currentTimeMillis() + 5000;
      while (field.getBoolean(manager) && System.currentTimeMillis() < end) Thread.sleep(20);
      assertFalse(field.getBoolean(manager));
    }
    singleton().set(null, null);
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
    LicenseCompatibilityTest.keys().putAll(oldKeys);
    onlineKeys().clear();
    onlineKeys().putAll(oldOnline);
  }

  private JSONObject enroll() throws Exception {
    return client.enroll(
        new JSONObject().put("customerName", "صاحب المحل").put("storeName", "متجر الفحص"));
  }

  private void activate() throws Exception {
    enroll();
    service.issue(1, "temporary", 600);
    assertTrue(client.status().getBoolean("activationAvailable"));
    assertEquals("activated", client.activate().getString("stage"));
    assertTrue(license.status().getBoolean("valid"));
  }

  private JSONObject grant() throws Exception {
    service.restore();
    JSONObject state = client.status();
    assertTrue(state.getBoolean("bootstrapAvailable"));
    return state.getJSONObject("bootstrapMeta");
  }

  private JSONObject select(JSONObject grant) throws Exception {
    return new JSONObject().put("grantId", grant.getString("grantId"));
  }

  @Test
  public void enrollmentAndStatusNeverActivateBeforeExplicitAcceptance() throws Exception {
    assertFalse(license.status().getBoolean("valid"));
    assertEquals("pending", client.enroll(new JSONObject()).getString("status"));
    assertEquals("", service.enrollment.getString("customerName"));
    assertEquals("", service.enrollment.getString("storeName"));
    assertFalse(client.status().getBoolean("activationAvailable"));
    assertFalse(license.status().getBoolean("valid"));
    service.issue(1, "temporary", 600);
    assertTrue(client.status().getBoolean("activationAvailable"));
    assertFalse("Polling must never start a license term", license.status().getBoolean("valid"));
    rejected(() -> license.install(service.activation.getJSONObject("licenseDocument").toString()));
    assertFalse(license.status().getBoolean("valid"));
    assertEquals("activated", client.activate().getString("stage"));
    assertTrue(license.status().getBoolean("valid"));
    assertEquals(1, service.accepts);
  }

  @Test
  public void lostActivationAckAndRenewalKeepClockIdentityAndMonotonicSequence() throws Exception {
    enroll();
    service.issue(1, "temporary", 600);
    service.dropAccept = true;
    JSONObject first = client.activate();
    assertTrue(first.getBoolean("ackPending"));
    String id = license.status().getJSONObject("license").getString("licenseId");
    double remaining = license.status().getJSONObject("license").getDouble("remainingSeconds");
    recreate();
    service.dropAccept = false;
    assertFalse(client.activate().getBoolean("ackPending"));
    assertEquals(id, license.status().getJSONObject("license").getString("licenseId"));
    assertTrue(
        license.status().getJSONObject("license").getDouble("remainingSeconds") <= remaining);
    assertEquals(1, service.accepts);
    service.issue(2, "temporary", 900);
    client.activate();
    assertNotEquals(id, license.status().getJSONObject("license").getString("licenseId"));
    assertEquals(service.device, license.deviceCode());
    assertTrue(license.status().getJSONObject("license").getDouble("remainingSeconds") <= 900);
    service.issue(1, "temporary", 600);
    rejected(() -> client.activate());
    assertEquals(2, service.accepts);
  }

  @Test
  public void legacyPhoneAutoEnrollsAndInvalidOnlineScopeCannotDowngradePerpetualActivation()
      throws Exception {
    license.install(TestLicenseIssuer.issue(license.deviceCode(), "perpetual", 0));
    String original = license.status().getJSONObject("license").getString("licenseId");
    client.status();
    assertTrue(service.enrollment.has("licenseDocument"));
    assertEquals(
        original,
        new JSONObject(service.enrollment.getString("licenseDocument"))
            .getJSONObject("payload")
            .getString("licenseId"));
    service.issue(1, "temporary", 600);
    rejected(() -> client.activate());
    assertEquals(original, license.status().getJSONObject("license").getString("licenseId"));
    assertTrue(license.status().getJSONObject("license").isNull("remainingSeconds"));
    JSONObject wrong = service.activation.getJSONObject("grant").getJSONObject("payload");
    wrong.put("keyFingerprint", "wrong-key");
    service.activation.put("grant", service.sign("contatools-android-activation", wrong));
    rejected(() -> client.status());
    assertEquals(original, license.status().getJSONObject("license").getString("licenseId"));
  }

  @Test
  public void previewDoesNotClaimAndLostClaimResumesIdenticalIntentBeforeOneShotFinish()
      throws Exception {
    activate();
    JSONObject grant = grant(), input = select(grant);
    client.list(input);
    JSONObject preview = client.preview(input);
    assertEquals("preview", preview.getString("stage"));
    assertEquals(0, service.claims);
    assertFalse(service.transferred);
    rejected(() -> client.prepare(copy(input).put("accepted", false)));
    assertEquals(0, service.claims);
    service.dropClaim = true;
    rejected(() -> client.prepare(copy(input).put("accepted", true)));
    assertEquals(1, service.claims);
    String intent = service.claim.getJSONObject("payload").getString("intentId");
    recreate();
    assertEquals("awaiting-network", client.resumeLocal().getString("stage"));
    service.dropClaim = false;
    JSONObject prepared = client.resume();
    assertEquals(intent, prepared.getString("intentId"));
    assertEquals(preview.getString("text"), prepared.getString("text"));
    assertFalse(service.transferred);
    service.dropFinish = true;
    JSONObject finish =
        client.finish(
            new JSONObject().put("grantId", grant.getString("grantId")).put("intentId", intent));
    assertTrue(finish.getBoolean("ackPending"));
    assertTrue(service.transferred);
    recreate();
    JSONObject local = client.resumeLocal();
    assertEquals("complete", local.getString("stage"));
    assertEquals(intent, local.getString("intentId"));
    service.dropFinish = false;
    assertFalse(client.resume().getBoolean("ackPending"));
    assertEquals(1, service.finishes);
    assertEquals("idle", client.resumeLocal().getString("stage"));
    rejected(() -> client.list(input));
    assertTrue(license.status().getBoolean("valid"));
  }

  @Test
  public void tamperedBootstrapAndWrongOwnerNeverPrepareOrTransferAnything() throws Exception {
    activate();
    JSONObject grant = grant(), input = select(grant);
    client.list(input);
    service.corrupt = true;
    rejected(() -> client.preview(input));
    assertEquals(0, service.claims);
    assertFalse(service.transferred);
    rejected(() -> client.prepare(copy(input).put("accepted", true)));
    service.corrupt = false;
    JSONObject payload = service.bootstrap.getJSONObject("grant").getJSONObject("payload");
    payload.put("ownerId", "not-in-snapshot");
    service.bootstrap.put("grant", service.sign("contatools-cloud-bootstrap", payload));
    client.status();
    client.list(input);
    rejected(() -> client.preview(input));
    assertEquals(0, service.claims);
    assertFalse(service.transferred);
    assertTrue(license.status().getBoolean("valid"));
    service.restore();
    JSONObject expired = grant(), expiredInput = select(expired);
    client.list(expiredInput);
    client.preview(expiredInput);
    service.rejectUnclaimed = true;
    assertEquals("expired", client.prepare(copy(expiredInput).put("accepted", true)).getString("stage"));
    assertEquals("idle", client.resumeLocal().getString("stage"));
    assertEquals(0, service.claims);
    service.rejectUnclaimed = false;
    JSONObject renewed = grant(), renewedInput = select(renewed);
    assertNotEquals(expired.getString("grantId"), renewed.getString("grantId"));
    client.list(renewedInput);
    client.preview(renewedInput);
    assertEquals("prepared", client.prepare(copy(renewedInput).put("accepted", true)).getString("stage"));
    assertEquals(1, service.claims);
    assertFalse(service.transferred);
  }

  @Test
  public void manualBackupWithoutAutomaticConsentRetriesOneImmutableCopyAndKeepsScheduleOff()
      throws Exception {
    CloudBackupManager manager = new CloudBackupManager(context, service, true);
    singleton().set(null, manager);
    JSONObject target =
        new JSONObject().put("shopId", "lifecycle-shop").put("ownerId", "lifecycle-owner");
    JSONObject approved = manager.manualConsent(target);
    assertTrue(approved.getBoolean("manualConsentGranted"));
    assertFalse(approved.getJSONObject("settings").getBoolean("consent"));
    assertFalse(service.autoConsent);
    var field = CloudBackupManager.class.getDeclaredField("disk");
    field.setAccessible(true);
    CloudBackupStore saved = (CloudBackupStore) field.get(manager);
    saved.state.put("dueAt", System.currentTimeMillis() + 3600000);
    saved.save();
    byte[] bytes = service.snapshot;
    String transfer = UUID.randomUUID().toString();
    JSONObject stage =
        copy(target)
            .put("manual", true)
            .put("sizeBytes", bytes.length)
            .put("localRevision", "1")
            .put("snapshotAt", 1);
    manager.begin(transfer, stage);
    manager.append(transfer, Base64.getEncoder().encodeToString(bytes));
    manager.finish(transfer);
    ((android.app.job.JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE))
        .cancel(CloudBackupPolicy.JOB_ID);
    saved.state.put("dueAt", 0);
    saved.save();
    service.dropCommit = true;
    manager.process(new AtomicBoolean(false), true);
    assertEquals(1, service.versions.size());
    assertEquals(0, manager.status(target, false).getLong("lastSuccessAt"));
    manager = new CloudBackupManager(context, service, true);
    singleton().set(null, manager);
    saved = (CloudBackupStore) field.get(manager);
    saved.state.put("dueAt", 0).remove("retryAt");
    saved.save();
    service.dropCommit = false;
    manager.process(new AtomicBoolean(false), true);
    JSONObject status = manager.status(target, false);
    assertTrue(status.getLong("lastSuccessAt") > 0);
    assertFalse(status.getBoolean("manualPending"));
    assertTrue(status.getBoolean("manualConsentGranted"));
    assertFalse(status.getJSONObject("settings").getBoolean("consent"));
    assertFalse(service.autoConsent);
    assertEquals(1, service.versions.size());
    manager.manualConsent(target);
    assertEquals("up-to-date", manager.run(copy(target).put("manual", true)).getString("stage"));
    assertEquals(1, service.versions.size());
    manager.manualConsent(target);
    String oldRequest = service.manualId;
    byte[] changed = new JSONObject(new String(bytes, StandardCharsets.UTF_8))
        .put("createdAt", "2026-11-05T01:00:00.000Z").toString().getBytes(StandardCharsets.UTF_8);
    saved.state.put("dueAt", System.currentTimeMillis() + 3600000);
    saved.save();
    String second = UUID.randomUUID().toString();
    manager.begin(second, copy(target).put("manual", true).put("sizeBytes", changed.length)
        .put("localRevision", "2").put("snapshotAt", 2));
    manager.append(second, Base64.getEncoder().encodeToString(changed));
    manager.finish(second);
    ((android.app.job.JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE))
        .cancel(CloudBackupPolicy.JOB_ID);
    saved.state.put("dueAt", 0);
    saved.save();
    service.generation++;
    manager.process(new AtomicBoolean(false));
    assertEquals(1, service.versions.size());
    assertFalse(manager.status(target, false).getBoolean("manualPending"));
    assertFalse(manager.status(target, false).getBoolean("manualConsentGranted"));
    assertNotNull(saved.state.optJSONObject("latest"));
    assertNull(((android.app.job.JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE))
        .getPendingJob(CloudBackupPolicy.JOB_ID));
    manager.manualConsent(target);
    assertNotEquals(oldRequest, service.manualId);
    saved.state.put("dueAt", 0).remove("retryAt");
    saved.save();
    manager.process(new AtomicBoolean(false));
    assertEquals(2, service.versions.size());
    assertFalse(manager.status(target, false).getJSONObject("settings").getBoolean("consent"));
    service.generation++;
    assertFalse(manager.status(target, true).getBoolean("manualConsentGranted"));
    manager.pause(target, true);
    assertFalse(manager.status(target, false).getBoolean("manualConsentGranted"));
    final CloudBackupManager retained = manager;
    service.duringManual = () -> retained.pause(target, true);
    rejected(() -> retained.manualConsent(target));
    assertFalse(retained.status(target, false).getBoolean("manualConsentGranted"));
    assertFalse(retained.status(target, false).getBoolean("manualPending"));
  }

  private static String coordinate(BigInteger value) {
    byte[] raw = value.toByteArray(), out = new byte[32];
    int count = Math.min(raw.length, 32);
    System.arraycopy(raw, raw.length - count, out, 32 - count, count);
    return ProtocolJson.base64(out);
  }

  private static final class FakeService implements ContatoolsClient.Transport {
    final KeyPair pair;
    final JSONObject issuers;
    final String device;
    final byte[] snapshot;
    final Map<String, JSONObject> challenges = new HashMap<>(), uploads = new HashMap<>();
    final Map<String, byte[]> versions = new HashMap<>();
    JSONObject enrollment, activation, bootstrap, claim;
    boolean dropAccept, dropClaim, dropFinish, corrupt, transferred, autoConsent, dropCommit, rejectUnclaimed;
    int accepts, claims, finishes, generation = 1, manualGeneration;
    final Set<String> accepted = new HashSet<>();
    String manualId;
    Checked duringManual;

    FakeService(String device) throws Exception {
      this.device = device;
      KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
      generator.initialize(new ECGenParameterSpec("secp256r1"));
      pair = generator.generateKeyPair();
      ECPublicKey key = (ECPublicKey) pair.getPublic();
      issuers =
          new JSONObject()
              .put(
                  "fixture-online",
                  new JSONObject()
                      .put("kty", "EC")
                      .put("crv", "P-256")
                      .put("x", coordinate(key.getW().getAffineX()))
                      .put("y", coordinate(key.getW().getAffineY())));
      JSONObject password =
          new JSONObject()
              .put("algorithm", "PBKDF2-SHA256")
              .put("iterations", 210000)
              .put("salt", "b".repeat(32))
              .put("hash", "c".repeat(64));
      snapshot =
          new JSONObject()
              .put("format", "alkarna-web-backup")
              .put("schemaVersion", 1)
              .put("createdAt", "2026-11-05T00:00:00.000Z")
              .put("state", new JSONObject().put("originId", "lifecycle-shop"))
              .put(
                  "users",
                  new JSONArray()
                      .put(
                          new JSONObject()
                              .put("id", "lifecycle-owner")
                              .put("name", "صاحب المحل")
                              .put("username", "restored-owner")
                              .put("role", "owner")
                              .put("active", true)
                              .put("password", password)))
              .toString()
              .getBytes(StandardCharsets.UTF_8);
    }

    JSONObject sign(String purpose, JSONObject payload) throws Exception {
      JSONObject envelope =
          new JSONObject()
              .put("schema", purpose)
              .put("version", 1)
              .put("kid", "fixture-online")
              .put("payload", copy(payload));
      Signature signer = Signature.getInstance("SHA256withECDSA");
      signer.initSign(pair.getPrivate());
      signer.update(ProtocolJson.canonical(envelope).getBytes(StandardCharsets.UTF_8));
      return envelope.put(
          "signature", ProtocolJson.base64(ProtocolJson.rawSignature(signer.sign())));
    }

    void issue(int sequence, String type, long seconds) throws Exception {
      JSONObject payload =
          new JSONObject()
              .put("licenseId", UUID.randomUUID().toString())
              .put("storeId", "fixture-client")
              .put("customerName", "صاحب المحل")
              .put("storeName", "متجر الفحص")
              .put("deviceId", device)
              .put("edition", "desktop")
              .put("type", type)
              .put("durationSeconds", type.equals("perpetual") ? JSONObject.NULL : seconds)
              .put("activationMode", "single-install")
              .put("notes", "");
      Signature signer = Signature.getInstance("SHA256withECDSA");
      signer.initSign(pair.getPrivate());
      signer.update(LicenseVerifier.canonical(payload, 2).getBytes(StandardCharsets.UTF_8));
      JSONObject document =
          new JSONObject()
              .put("schema", "alkarna-license")
              .put("version", 2)
              .put("keyId", "contatools-online-v2:fixture-online")
              .put("algorithm", "ECDSA_P256_SHA256")
              .put("payload", payload)
              .put("signature", ProtocolJson.base64(ProtocolJson.rawSignature(signer.sign())));
      long now = System.currentTimeMillis();
      JSONObject grant =
          new JSONObject()
              .put("issuanceId", UUID.randomUUID().toString())
              .put("clientId", "fixture-client")
              .put("installationId", enrollment.getString("installationId"))
              .put(
                  "keyFingerprint", ProtocolJson.fingerprint(enrollment.getJSONObject("publicJwk")))
              .put("deviceCode", device)
              .put("licenseDocumentHash", ProtocolJson.hash(document))
              .put("licenseId", payload.getString("licenseId"))
              .put("sequence", sequence)
              .put("issuedAt", now)
              .put("expiresAt", now + 86400000);
      activation =
          new JSONObject()
              .put("grant", sign("contatools-android-activation", grant))
              .put("licenseDocument", document);
    }

    void restore() throws Exception {
      long now = System.currentTimeMillis();
      JSONObject p =
          new JSONObject()
              .put("grantId", UUID.randomUUID().toString())
              .put("clientId", "fixture-client")
              .put("installationId", enrollment.getString("installationId"))
              .put(
                  "keyFingerprint", ProtocolJson.fingerprint(enrollment.getJSONObject("publicJwk")))
              .put("deviceCode", device)
              .put("sourceInstallationId", UUID.randomUUID().toString())
              .put("subscriptionId", UUID.randomUUID().toString())
              .put("backupId", UUID.randomUUID().toString())
              .put("shopId", "lifecycle-shop")
              .put("ownerId", "lifecycle-owner")
              .put("sha256", CloudBackupStore.hash(snapshot))
              .put("sizeBytes", snapshot.length)
              .put("snapshotAt", now)
              .put("localRevision", "1")
              .put("issuedAt", now)
              .put("expiresAt", now + 900000);
      bootstrap =
          new JSONObject()
              .put("grant", sign("contatools-cloud-bootstrap", p))
              .put("version", version(p));
    }

    JSONObject version(JSONObject p) throws Exception {
      return new JSONObject()
          .put("id", p.getString("backupId"))
          .put("sizeBytes", snapshot.length)
          .put("sha256", CloudBackupStore.hash(snapshot))
          .put("snapshotAt", p.getLong("snapshotAt"))
          .put("createdAt", p.getLong("snapshotAt"))
          .put("localRevision", "1");
    }

    JSONObject status() throws Exception {
      return new JSONObject()
          .put("status", activation == null ? "pending" : "active")
          .put("clientId", activation == null ? JSONObject.NULL : "fixture-client")
          .put(
              "activation",
              activation == null
                      || accepted.contains(
                          activation
                              .getJSONObject("grant")
                              .getJSONObject("payload")
                              .getString("issuanceId"))
                  ? JSONObject.NULL
                  : activation)
          .put("bootstrap", bootstrap == null ? JSONObject.NULL : bootstrap)
          .put("serverTime", System.currentTimeMillis());
    }

    JSONObject cloudStatus() throws Exception {
      return new JSONObject()
          .put("enabled", true)
          .put("subscribed", true)
          .put("writer", true)
          .put("consent", autoConsent)
          .put("generation", generation);
    }

    public synchronized JSONObject post(String path, JSONObject body) throws Exception {
      String operation = body.getString("operation");
      JSONObject p = body.getJSONObject("payload");
      boolean cloud = path.contains("/backup/");
      if (path.endsWith("/challenge")) {
        String id = UUID.randomUUID().toString();
        JSONObject proof =
            new JSONObject()
                .put("schema", cloud ? "contatools-backup-proof" : "contatools-lifecycle-proof")
                .put("version", 1)
                .put("id", id)
                .put("nonce", UUID.randomUUID().toString())
                .put("installationId", p.getString("installationId"))
                .put("operation", operation)
                .put("payloadHash", ProtocolJson.hash(p))
                .put("expiresAt", System.currentTimeMillis() + 60000);
        challenges.put(id, proof);
        return new JSONObject().put("id", id).put("message", ProtocolJson.canonical(proof));
      }
      JSONObject proof = challenges.remove(body.getString("challengeId"));
      assertNotNull(proof);
      assertEquals(operation, proof.getString("operation"));
      assertEquals(ProtocolJson.hash(p), proof.getString("payloadHash"));
      KeyStore keys = KeyStore.getInstance("AndroidKeyStore");
      keys.load(null);
      Signature verifier = Signature.getInstance("SHA256withECDSA");
      verifier.initVerify(keys.getCertificate(InstallationIdentity.ALIAS).getPublicKey());
      verifier.update(ProtocolJson.canonical(proof).getBytes(StandardCharsets.UTF_8));
      assertTrue(
          verifier.verify(LicenseVerifier.der(ProtocolJson.decode(body.getString("signature")))));
      if (cloud) {
        if (operation.equals("status")) return cloudStatus();
        if (operation.equals("consent")) {
          autoConsent = p.getBoolean("enabled");
          return cloudStatus();
        }
        if (operation.equals("manual.authorize")) {
          manualId = p.getString("requestId");
          manualGeneration = generation;
          if (duringManual != null) duringManual.run();
          return cloudStatus()
              .put("manualRequestId", manualId)
              .put("expiresAt", System.currentTimeMillis() + 900000);
        }
        assertEquals(manualId, p.getString("manualRequestId"));
        if (manualGeneration != generation) throw new ContatoolsClient.ServiceFailure(403, true, 0);
        String id = p.getString("backupId");
        if (operation.equals("upload.begin")) {
          JSONObject upload = uploads.get(id);
          if (upload == null) {
            upload = copy(p).put("chunks", new JSONObject());
            uploads.put(id, upload);
          }
          JSONArray received = new JSONArray();
          Iterator<String> names = upload.getJSONObject("chunks").keys();
          while (names.hasNext()) received.put(Integer.parseInt(names.next()));
          return new JSONObject()
              .put("backupId", id)
              .put("status", versions.containsKey(id) ? "ready" : "uploading")
              .put("receivedChunks", received)
              .put("chunkCount", 1)
              .put("chunkBytes", CloudBackupPolicy.CHUNK_BYTES);
        }
        if (operation.equals("upload.chunk")) {
          uploads
              .get(id)
              .getJSONObject("chunks")
              .put(Integer.toString(p.getInt("index")), p.getString("data"));
          return new JSONObject().put("received", true);
        }
        if (operation.equals("upload.commit")) {
          byte[] bytes =
              Base64.getDecoder().decode(uploads.get(id).getJSONObject("chunks").getString("0"));
          versions.put(id, bytes);
          if (dropCommit) throw new IOException("Lost successful upload response");
          return new JSONObject()
              .put("backupId", id)
              .put("status", "ready")
              .put("sha256", CloudBackupStore.hash(bytes))
              .put("sizeBytes", bytes.length);
        }
      }
      if (operation.equals("enroll")) {
        enrollment = copy(p);
        return status();
      }
      if (operation.equals("status")) return status();
      if (operation.equals("license.accept")) {
        String id = p.getString("issuanceId");
        if (accepted.add(id)) accepts++;
        if (dropAccept) throw new IOException("Lost activation acknowledgement");
        return new JSONObject().put("status", "applied").put("issuanceId", id);
      }
      JSONObject grant = bootstrap.getJSONObject("grant"), g = grant.getJSONObject("payload");
      assertEquals(g.getString("grantId"), p.getString("grantId"));
      if (operation.equals("bootstrap.list"))
        return new JSONObject()
            .put("grant", grant)
            .put("versions", new JSONArray().put(version(g)));
      if (operation.equals("bootstrap.download")) {
        if (claim != null)
          assertEquals(
              claim.getJSONObject("payload").getString("intentId"), p.getString("intentId"));
        byte[] bytes = snapshot.clone();
        if (corrupt) bytes[0] ^= 1;
        return new JSONObject()
            .put("backupId", g.getString("backupId"))
            .put("index", 0)
            .put("chunkCount", 1)
            .put("sizeBytes", snapshot.length)
            .put("sha256", CloudBackupStore.hash(snapshot))
            .put("data", Base64.getEncoder().encodeToString(bytes));
      }
      if (operation.equals("bootstrap.prepare")) {
        assertTrue(p.getBoolean("accepted"));
        if (rejectUnclaimed && claim == null) {
          throw new ContatoolsClient.ServiceFailure(403, true, 0);
        }
        if (claim == null) {
          claim =
              sign(
                  "contatools-cloud-bootstrap-claim",
                  copy(g)
                      .put("intentId", p.getString("intentId"))
                      .put("claimedAt", System.currentTimeMillis()));
          claims++;
        } else
          assertEquals(
              claim.getJSONObject("payload").getString("intentId"), p.getString("intentId"));
        if (dropClaim) throw new IOException("Lost signed claim response");
        return new JSONObject()
            .put("stage", "prepared")
            .put("grant", grant)
            .put("claim", claim)
            .put("version", version(g));
      }
      if (operation.equals("bootstrap.finish")) {
        assertEquals(claim.getJSONObject("payload").getString("intentId"), p.getString("intentId"));
        if (!transferred) {
          finishes++;
          transferred = true;
        }
        if (dropFinish) throw new IOException("Lost restore acknowledgement");
        return new JSONObject()
            .put("stage", "complete")
            .put("grantId", g.getString("grantId"))
            .put("intentId", p.getString("intentId"))
            .put("shopId", g.getString("shopId"))
            .put("ownerId", g.getString("ownerId"));
      }
      throw new IOException("Unexpected fixture protocol " + operation);
    }
  }
}
