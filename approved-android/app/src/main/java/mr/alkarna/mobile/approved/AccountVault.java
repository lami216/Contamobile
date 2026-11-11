package mr.alkarna.mobile.approved;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Device-private account bindings and unresolved command receipts, never a shop backup. */
final class AccountVault {
    private static final Object LOCK = new Object();
    private static final String ALIAS = "alkarna.account.access.v1";
    private static final int MAX_BYTES = 4 * 1024 * 1024;
    private final AtomicFile file;
    private final KeyStore keys;
    private final byte[] associatedData;

    AccountVault(Context context, String installationId) throws Exception {
        file = new AtomicFile(new File(context.getNoBackupFilesDir(), "account-access-v1.json"));
        keys = KeyStore.getInstance("AndroidKeyStore");
        keys.load(null);
        associatedData = ("alkarna-account-access-v1|" + installationId).getBytes(StandardCharsets.UTF_8);
    }

    private SecretKey key(boolean create) throws Exception {
        if (keys.containsAlias(ALIAS)) return (SecretKey) keys.getKey(ALIAS, null);
        if (!create) throw new IOException("ACCOUNT_KEY_MISSING");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }

    JSONObject read() throws Exception {
        synchronized (LOCK) {
            byte[] bytes;
            try { bytes = file.readFully(); }
            catch (FileNotFoundException absent) { return new JSONObject().put("version", 1); }
            if (bytes.length > MAX_BYTES) throw new IOException("ACCOUNT_STORAGE_TOO_LARGE");
            JSONObject envelope = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            if (envelope.length() != 3 || envelope.optInt("version") != 1) throw new IOException("ACCOUNT_STORAGE_INVALID");
            byte[] iv = ProtocolJson.decode(envelope.getString("iv"));
            if (iv.length != 12) throw new IOException("ACCOUNT_STORAGE_INVALID");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, iv));
            cipher.updateAAD(associatedData);
            JSONObject data = new JSONObject(new String(cipher.doFinal(ProtocolJson.decode(envelope.getString("ciphertext"))), StandardCharsets.UTF_8));
            if (data.optInt("version") != 1) throw new IOException("ACCOUNT_STORAGE_INVALID");
            return data;
        }
    }

    void write(JSONObject value) throws Exception {
        synchronized (LOCK) {
            if (value.optInt("version") != 1) throw new IOException("ACCOUNT_STORAGE_INVALID");
            byte[] plaintext = ProtocolJson.canonical(value).getBytes(StandardCharsets.UTF_8);
            if (plaintext.length > MAX_BYTES - 1024) throw new IOException("ACCOUNT_STORAGE_TOO_LARGE");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key(true));
            cipher.updateAAD(associatedData);
            byte[] ciphertext;
            try { ciphertext = cipher.doFinal(plaintext); }
            finally { java.util.Arrays.fill(plaintext, (byte) 0); }
            byte[] encoded = new JSONObject().put("version", 1).put("iv", ProtocolJson.base64(cipher.getIV()))
                    .put("ciphertext", ProtocolJson.base64(ciphertext)).toString().getBytes(StandardCharsets.UTF_8);
            FileOutputStream output = null;
            try { output = file.startWrite(); output.write(encoded); file.finishWrite(output); }
            catch (Exception failure) { if (output != null) file.failWrite(output); throw failure; }
        }
    }
}
