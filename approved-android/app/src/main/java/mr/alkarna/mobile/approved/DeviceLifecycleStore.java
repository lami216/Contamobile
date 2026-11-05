package mr.alkarna.mobile.approved;

import android.content.Context;
import android.security.keystore.*;
import android.util.AtomicFile;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import org.json.*;

/** Independent authenticated intent/receipt storage. Never clears accounting or activation. */
final class DeviceLifecycleStore {
  static final String ALIAS = "alkarna.device.lifecycle.v1", DIRECTORY = "device-lifecycle-v1";
  private final File directory;
  private final String binding;
  private final KeyStore keys;
  JSONObject state;

  DeviceLifecycleStore(Context context, String binding) throws Exception {
    this.binding = binding;
    keys = KeyStore.getInstance("AndroidKeyStore");
    keys.load(null);
    directory = new File(context.getNoBackupFilesDir(), DIRECTORY);
    if (!directory.exists() && !directory.mkdir())
      throw new IOException("LIFECYCLE_STORAGE_UNAVAILABLE");
    byte[] saved = null;
    try {
      saved = new AtomicFile(new File(directory, "state.bin")).readFully();
    } catch (FileNotFoundException ignored) {
    }
    if (saved == null) {
      if (keys.containsAlias(ALIAS)) throw new IOException("LIFECYCLE_STATE_MISSING");
      state = new JSONObject().put("version", 1).put("used", new JSONArray());
      save();
    } else {
      state = new JSONObject(new String(decrypt(saved, "state"), StandardCharsets.UTF_8));
      if (state.optInt("version") != 1 || !(state.opt("used") instanceof JSONArray))
        throw new IOException("INVALID_LIFECYCLE_STATE");
    }
  }

  private SecretKey key(boolean create) throws Exception {
    if (keys.containsAlias(ALIAS)) return (SecretKey) keys.getKey(ALIAS, null);
    if (!create) throw new IOException("LIFECYCLE_KEY_MISSING");
    KeyGenerator generator = KeyGenerator.getInstance("AES", "AndroidKeyStore");
    generator.init(
        new KeyGenParameterSpec.Builder(
                ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setKeySize(256)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .build());
    return generator.generateKey();
  }

  private byte[] aad(String purpose) {
    return ("alkarna-device-lifecycle-v1|" + binding + "|" + purpose)
        .getBytes(StandardCharsets.UTF_8);
  }

  private byte[] encrypt(byte[] plain, String purpose) throws Exception {
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, key(true));
    cipher.updateAAD(aad(purpose));
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    out.write(cipher.getIV());
    out.write(cipher.doFinal(plain));
    return out.toByteArray();
  }

  private byte[] decrypt(byte[] encoded, String purpose) throws Exception {
    if (encoded.length < 28 || encoded.length > CloudBackupPolicy.MAX_BYTES + 262144)
      throw new IOException("INVALID_LIFECYCLE_STATE");
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, encoded, 0, 12));
    cipher.updateAAD(aad(purpose));
    return cipher.doFinal(encoded, 12, encoded.length - 12);
  }

  private void write(String name, byte[] bytes) throws Exception {
    AtomicFile file = new AtomicFile(new File(directory, name));
    FileOutputStream out = null;
    try {
      out = file.startWrite();
      out.write(bytes);
      file.finishWrite(out);
    } catch (Exception error) {
      if (out != null) file.failWrite(out);
      throw error;
    }
  }

  void save() throws Exception {
    byte[] bytes = state.toString().getBytes(StandardCharsets.UTF_8);
    if (bytes.length > 262144) throw new IOException("LIFECYCLE_STATE_TOO_LARGE");
    write("state.bin", encrypt(bytes, "state"));
  }

  boolean used(String grant) throws Exception {
    JSONArray ids = state.getJSONArray("used");
    for (int i = 0; i < ids.length(); i++) if (grant.equals(ids.getString(i))) return true;
    return false;
  }

  void consume(String grant) throws Exception {
    if (!used(grant)) state.getJSONArray("used").put(grant);
    save();
  }

  void snapshot(byte[] bytes) throws Exception {
    if (bytes.length > CloudBackupPolicy.MAX_BYTES) throw new IOException("SNAPSHOT_TOO_LARGE");
    write("bootstrap.bin", encrypt(bytes, "bootstrap"));
  }

  byte[] snapshot() throws Exception {
    return decrypt(new AtomicFile(new File(directory, "bootstrap.bin")).readFully(), "bootstrap");
  }

  void clearSnapshot() {
    new AtomicFile(new File(directory, "bootstrap.bin")).delete();
  }
}
