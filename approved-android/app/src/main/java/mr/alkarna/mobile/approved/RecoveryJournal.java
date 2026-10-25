package mr.alkarna.mobile.approved;

import android.content.Context;
import android.security.keystore.*;
import android.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

/** Separate authenticated durable reset journal; it never modifies activation-v2 state. */
final class RecoveryJournal {
 private static final String ALIAS="alkarna.contatools.journal.v1";
 private final KeyStore keys;
 private final AtomicFile file;
 private final String device,fingerprint;
 JSONObject state;
 RecoveryJournal(Context context,String device,String fingerprint) throws Exception {
  this.device=device;this.fingerprint=fingerprint;keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);file=new AtomicFile(new File(context.getNoBackupFilesDir(),"contatools-v1.json"));
  byte[] disk=null;try{disk=file.readFully();}catch(FileNotFoundException ignored){}
  if(disk==null){if(keys.containsAlias(ALIAS))throw new IOException("Recovery journal missing; local license is unaffected");state=new JSONObject().put("version",1).put("deviceCode",device).put("fingerprint",fingerprint).put("usedGrants",new JSONArray());save();}
  else{
   if(disk.length>2097152||!keys.containsAlias(ALIAS))throw new IOException("Invalid recovery journal");JSONObject envelope=new JSONObject(new String(disk,StandardCharsets.UTF_8));Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(false),new GCMParameterSpec(128,ProtocolJson.decode(envelope.getString("iv"))));cipher.updateAAD((device+"|"+fingerprint).getBytes(StandardCharsets.UTF_8));state=new JSONObject(new String(cipher.doFinal(ProtocolJson.decode(envelope.getString("ciphertext"))),StandardCharsets.UTF_8));
   if(state.optInt("version")!=1||!device.equals(state.optString("deviceCode"))||!fingerprint.equals(state.optString("fingerprint"))||!(state.opt("usedGrants") instanceof JSONArray))throw new IOException("Recovery journal binding mismatch");
  }
 }
 private SecretKey key(boolean create) throws Exception {if(keys.containsAlias(ALIAS))return (SecretKey)keys.getKey(ALIAS,null);if(!create)throw new IOException("Recovery key unavailable");KeyGenerator g=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");g.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());return g.generateKey();}
 synchronized void save() throws Exception {
  Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key(true));cipher.updateAAD((device+"|"+fingerprint).getBytes(StandardCharsets.UTF_8));byte[] ciphertext=cipher.doFinal(ProtocolJson.canonical(state).getBytes(StandardCharsets.UTF_8));byte[] encoded=new JSONObject().put("iv",ProtocolJson.base64(cipher.getIV())).put("ciphertext",ProtocolJson.base64(ciphertext)).toString().getBytes(StandardCharsets.UTF_8);if(encoded.length>2097152)throw new IOException("Recovery journal capacity exceeded");FileOutputStream stream=null;try{stream=file.startWrite();stream.write(encoded);file.finishWrite(stream);}catch(Exception e){if(stream!=null)file.failWrite(stream);throw e;}
 }
 boolean used(String grantId) throws Exception {JSONArray used=state.getJSONArray("usedGrants");for(int i=0;i<used.length();i++)if(grantId.equals(used.getString(i)))return true;return false;}
 void consume(String grantId) throws Exception {if(!used(grantId))state.getJSONArray("usedGrants").put(grantId);save();}
}
