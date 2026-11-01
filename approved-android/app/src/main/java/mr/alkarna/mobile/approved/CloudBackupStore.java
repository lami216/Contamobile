package mr.alkarna.mobile.approved;

import android.content.Context;
import android.security.keystore.*;
import android.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

/** Independent encrypted no-backup state. Neither this key nor activation state is exported. */
final class CloudBackupStore {
 private static final String ALIAS="alkarna.cloud.backup.v1";
 private final KeyStore keys;
 private final AtomicFile stateFile;
 private final File directory;
 private final String binding;
 JSONObject state;
 CloudBackupStore(Context context,String fingerprint) throws Exception {
  keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);binding=fingerprint;directory=new File(context.getNoBackupFilesDir(),"cloud-backup-v1");
  if(!directory.exists()&&!directory.mkdir())throw new IOException("BACKUP_STORAGE_UNAVAILABLE");
  stateFile=new AtomicFile(new File(directory,"state.bin"));byte[] saved=null;try{saved=stateFile.readFully();}catch(FileNotFoundException ignored){}
  if(saved==null){state=new JSONObject().put("version",1).put("epoch",0).put("settings",CloudBackupPolicy.settings(new JSONObject())).put("stage","disabled");save();}
  else {state=new JSONObject(new String(decrypt(saved,"state"),StandardCharsets.UTF_8));if(state.optInt("version")!=1)throw new IOException("INVALID_BACKUP_STATE");}
  java.util.Set<String> retained=new java.util.HashSet<>();for(String slot:new String[]{"latest","pending"}){JSONObject item=state.optJSONObject(slot);if(item!=null)retained.add(item.optString("id"));}
  File[] files=directory.listFiles();if(files!=null)for(File entry:files){String name=entry.getName();if(name.matches("snapshot-[a-f0-9-]{36}\\.bin(?:\\.bak|\\.new)?")){String id=name.substring(9,45);if(!retained.contains(id))deleteSnapshot(id);}}
 }
 private SecretKey key(boolean create) throws Exception {
  if(keys.containsAlias(ALIAS))return (SecretKey)keys.getKey(ALIAS,null);if(!create)throw new IOException("BACKUP_KEY_UNAVAILABLE");
  KeyGenerator g=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");g.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());return g.generateKey();
 }
 private byte[] aad(String purpose){return ("alkarna-cloud-backup-v1|"+binding+"|"+purpose).getBytes(StandardCharsets.UTF_8);}
 private byte[] encrypt(byte[] bytes,String purpose) throws Exception {Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key(true));c.updateAAD(aad(purpose));ByteArrayOutputStream b=new ByteArrayOutputStream();b.write(c.getIV());b.write(c.doFinal(bytes));return b.toByteArray();}
 private byte[] decrypt(byte[] bytes,String purpose) throws Exception {if(bytes.length<28||bytes.length>CloudBackupPolicy.MAX_BYTES+1024)throw new IOException("INVALID_BACKUP_STORAGE");Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(false),new GCMParameterSpec(128,bytes,0,12));c.updateAAD(aad(purpose));return c.doFinal(bytes,12,bytes.length-12);}
 private void write(AtomicFile file,byte[] bytes) throws Exception {FileOutputStream out=null;try{out=file.startWrite();out.write(bytes);file.finishWrite(out);}catch(Exception error){if(out!=null)file.failWrite(out);throw error;}}
 void save() throws Exception {byte[] bytes=state.toString().getBytes(StandardCharsets.UTF_8);if(bytes.length>131072)throw new IOException("INVALID_BACKUP_STATE");write(stateFile,encrypt(bytes,"state"));}
 void writeSnapshot(String id,byte[] bytes) throws Exception {write(new AtomicFile(blob(id)),encrypt(bytes,"snapshot:"+id));}
 byte[] snapshot(String id) throws Exception {return decrypt(new AtomicFile(blob(id)).readFully(),"snapshot:"+id);}
 private File blob(String id) throws Exception {if(!id.matches("[a-f0-9-]{36}"))throw new IOException("INVALID_BACKUP_ID");return new File(directory,"snapshot-"+id+".bin");}
 void deleteSnapshot(String id){try{new AtomicFile(blob(id)).delete();}catch(Exception ignored){}}
 static String hash(byte[] bytes) throws Exception {StringBuilder b=new StringBuilder();for(byte x:MessageDigest.getInstance("SHA-256").digest(bytes))b.append(String.format(java.util.Locale.ROOT,"%02x",x&255));return b.toString();}
 static void validateSnapshot(byte[] bytes,String shop) throws Exception {
  if(bytes.length<2||bytes.length>CloudBackupPolicy.MAX_BYTES)throw new IOException("SNAPSHOT_TOO_LARGE");JSONObject value=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
  java.util.Set<String> allowed=new java.util.HashSet<>(java.util.Arrays.asList("format","schemaVersion","createdAt","state","users"));
  java.util.Iterator<String> names=value.keys();while(names.hasNext())if(!allowed.contains(names.next()))throw new IOException("INVALID_SNAPSHOT");
  JSONObject business=value.optJSONObject("state");
  if(value.length()!=5||!"alkarna-web-backup".equals(value.optString("format"))||value.optInt("schemaVersion")!=1||!value.has("createdAt")||business==null||!business.optString("originId").matches("[A-Za-z0-9_.:-]{1,160}")||(shop!=null&&!shop.equals(business.optString("originId")))||!(value.opt("users") instanceof JSONArray))throw new IOException("INVALID_SNAPSHOT");
  JSONArray users=value.getJSONArray("users");if(users.length()<1||users.length()>1000)throw new IOException("INVALID_SNAPSHOT");
  for(int i=0;i<users.length();i++){JSONObject user=users.getJSONObject(i);if(!(user.opt("password") instanceof JSONObject))throw new IOException("INVALID_SNAPSHOT");JSONObject digest=user.getJSONObject("password");if(!"PBKDF2-SHA256".equals(digest.optString("algorithm"))||digest.optInt("iterations")<210000)throw new IOException("INVALID_SNAPSHOT");}
 }
}
