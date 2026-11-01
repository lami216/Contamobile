package mr.alkarna.mobile.approved;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import org.json.*;

/** Authenticated reset receipts survive app restarts independently of the accounting database. */
final class AccountingResetStore {
 static final String ALIAS="alkarna.accounting.reset.v1";
 static final String FILE="accounting-reset-v1.json";
 private final KeyStore keys;
 private final AtomicFile file;
 private final String binding;
 JSONObject state;
 /** Absence is authoritative only when neither atomic file nor its Keystore key ever existed. */
 static boolean noLocalState(Context context) throws Exception {
  File directory=context.getNoBackupFilesDir();
  for(String suffix:new String[]{"",".bak",".new"})if(new File(directory,FILE+suffix).exists())return false;
  KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);return !keys.containsAlias(ALIAS);
 }
 AccountingResetStore(Context context,String device,String fingerprint) throws Exception {
  binding=device+"|"+fingerprint;keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);
  file=new AtomicFile(new File(context.getNoBackupFilesDir(),FILE));byte[] bytes=null;
  try{bytes=file.readFully();}catch(FileNotFoundException ignored){}
  if(bytes==null){
   if(keys.containsAlias(ALIAS))throw new IOException("RESET_JOURNAL_MISSING");
   state=new JSONObject().put("version",1).put("binding",binding).put("usedGrants",new JSONArray());save();
  }else{
   if(bytes.length>2097152||!keys.containsAlias(ALIAS))throw new IOException("RESET_JOURNAL_INVALID");
   JSONObject envelope=new JSONObject(new String(bytes,StandardCharsets.UTF_8));Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
   cipher.init(Cipher.DECRYPT_MODE,key(false),new GCMParameterSpec(128,ProtocolJson.decode(envelope.getString("iv"))));cipher.updateAAD(binding.getBytes(StandardCharsets.UTF_8));
   state=new JSONObject(new String(cipher.doFinal(ProtocolJson.decode(envelope.getString("ciphertext"))),StandardCharsets.UTF_8));
   if(state.optInt("version")!=1||!binding.equals(state.optString("binding"))||!(state.opt("usedGrants") instanceof JSONArray))throw new IOException("RESET_JOURNAL_SCOPE");
  }
 }
 private SecretKey key(boolean create) throws Exception {
  if(keys.containsAlias(ALIAS))return (SecretKey)keys.getKey(ALIAS,null);if(!create)throw new IOException("RESET_KEY_MISSING");
  KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
  generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());return generator.generateKey();
 }
 synchronized void save() throws Exception {
  Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key(true));cipher.updateAAD(binding.getBytes(StandardCharsets.UTF_8));
  byte[] bytes=new JSONObject().put("iv",ProtocolJson.base64(cipher.getIV())).put("ciphertext",ProtocolJson.base64(cipher.doFinal(ProtocolJson.canonical(state).getBytes(StandardCharsets.UTF_8)))).toString().getBytes(StandardCharsets.UTF_8);
  if(bytes.length>2097152)throw new IOException("RESET_JOURNAL_FULL");FileOutputStream stream=null;
  try{stream=file.startWrite();stream.write(bytes);file.finishWrite(stream);}catch(Exception error){if(stream!=null)file.failWrite(stream);throw error;}
 }
 boolean used(String grantId) throws Exception {JSONArray used=state.getJSONArray("usedGrants");for(int i=0;i<used.length();i++)if(grantId.equals(used.getString(i)))return true;return false;}
 void consume(String grantId) throws Exception {if(!used(grantId))state.getJSONArray("usedGrants").put(grantId);save();}
}
