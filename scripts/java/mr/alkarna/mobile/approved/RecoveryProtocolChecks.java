package mr.alkarna.mobile.approved;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.security.interfaces.*;
import java.security.spec.*;
import java.util.*;
import java.util.zip.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.json.*;

/** Synthetic-only executable contract checks; no Android, customer keys or customer files. */
public final class RecoveryProtocolChecks {
 private static int passed;
 interface Check {void run() throws Exception;}
 private static void check(boolean okay,String message){if(!okay)throw new AssertionError(message);passed++;}
 private static void rejects(Check action,String message) throws Exception {try{action.run();throw new AssertionError(message);}catch(AssertionError failure){throw failure;}catch(Exception expected){passed++;}}
 private static byte[] coordinate(java.math.BigInteger value){byte[] a=value.toByteArray(),out=new byte[32];int length=Math.min(a.length,32);System.arraycopy(a,a.length-length,out,32-length,length);return out;}
 private static byte[] unsigned(java.math.BigInteger value){byte[] a=value.toByteArray();return a[0]==0?Arrays.copyOfRange(a,1,a.length):a;}
 private static JSONObject sign(JSONObject payload,KeyPair pair) throws Exception {
  JSONObject envelope=new JSONObject().put("schema","contatools-data-rescue").put("version",1).put("kid","synthetic-rescue").put("payload",payload);
  Signature signature=Signature.getInstance("SHA256withECDSA");signature.initSign(pair.getPrivate());signature.update(ProtocolJson.canonical(envelope).getBytes(StandardCharsets.UTF_8));
  return envelope.put("signature",ProtocolJson.base64(ProtocolJson.rawSignature(signature.sign())));
 }
 private static byte[] decrypt(byte[] bytes,PrivateKey privateKey) throws Exception {
  DataInputStream input=new DataInputStream(new ByteArrayInputStream(bytes));byte[] magic=new byte[8];input.readFully(magic);if(!Arrays.equals(magic,RecoveryPackage.MAGIC))throw new IOException("magic");
  int length=input.readInt();if(length<1||length>16384)throw new IOException("header");byte[] header=new byte[length];input.readFully(header);JSONObject p=new JSONObject(new String(header,StandardCharsets.UTF_8));
  Cipher wrap=Cipher.getInstance("RSA/ECB/OAEPPadding");wrap.init(Cipher.DECRYPT_MODE,privateKey,new OAEPParameterSpec("SHA-256","MGF1",MGF1ParameterSpec.SHA256,PSource.PSpecified.DEFAULT));
  Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(wrap.doFinal(ProtocolJson.decode(p.getString("wrappedKey"))),"AES"),new GCMParameterSpec(128,ProtocolJson.decode(p.getString("iv"))));cipher.updateAAD(header);return cipher.doFinal(input.readAllBytes());
 }
 public static void main(String[] args) throws Exception {
  long now=System.currentTimeMillis();String caseId="98765432-1234-4567-8123-123456789012";
  KeyPairGenerator rsa=KeyPairGenerator.getInstance("RSA");rsa.initialize(2048);KeyPair encryption=rsa.generateKeyPair();RSAPublicKey publicRsa=(RSAPublicKey)encryption.getPublic();
  KeyPairGenerator ec=KeyPairGenerator.getInstance("EC");ec.initialize(new ECGenParameterSpec("secp256r1"));KeyPair issuer=ec.generateKeyPair();ECPublicKey ecKey=(ECPublicKey)issuer.getPublic();
  JSONObject issuers=new JSONObject().put("synthetic-rescue",new JSONObject().put("kty","EC").put("crv","P-256").put("x",ProtocolJson.base64(coordinate(ecKey.getW().getAffineX()))).put("y",ProtocolJson.base64(coordinate(ecKey.getW().getAffineY()))));
  JSONObject document=new JSONObject().put("payload",new JSONObject().put("licenseId","synthetic-license"));JSONObject license=new JSONObject().put("licenseDocument",document.toString());
  JSONObject grant=new JSONObject().put("caseId",caseId).put("installationId","synthetic-installation").put("keyFingerprint","synthetic-fingerprint").put("deviceCode","synthetic-device").put("licenseDocumentHash",ProtocolJson.hash(document)).put("licenseId","synthetic-license").put("issuedAt",now-1000).put("expiresAt",now+60000).put("scope",new JSONArray().put("snapshot").put("export").put("upload")).put("encryptionKey",new JSONObject().put("kty","RSA").put("n",ProtocolJson.base64(unsigned(publicRsa.getModulus()))).put("e","AQAB")).put("encryptionKeyId","synthetic-package-key").put("maxBytes",268435456).put("maxFiles",4096).put("chunkSize",196608);
  JSONObject envelope=sign(grant,issuer);
  check(RecoverySupportEntry.accepts("android.intent.action.VIEW","contamobile://data-rescue"),"explicit support entry rejected");
  check(!RecoverySupportEntry.accepts("android.intent.action.MAIN","contamobile://data-rescue"),"ordinary launch entered support");
  for(String uri:new String[]{null,"","https://data-rescue","contamobile://data-rescue/scan","contamobile://data-rescue?path=/data","contamobile://data-rescue#grant","contamobile://other","contamobile://user@data-rescue","contamobile://data-rescue:9"})check(!RecoverySupportEntry.accepts("android.intent.action.VIEW",uri),"unsafe support entry accepted");
  check(RecoveryClock.now(7,7,now,1000,61000,now-999999,now)==now+60000,"wall rollback extended the grant");
  rejects(()->RecoveryClock.now(8,7,now,1000,61000,now,now),"reboot reused an offline grant");
  rejects(()->RecoveryClock.now(-1,-1,now,1000,61000,now,now),"unknown boot reused a grant");
  rejects(()->RecoveryClock.now(7,7,now,1000,999,now,now),"elapsed rollback accepted");
  rejects(()->RecoveryClock.now(7,7,Long.MAX_VALUE,0,1,now,now),"clock overflow accepted");
  check(RecoveryGrant.verify(envelope,issuers,"synthetic-installation","synthetic-fingerprint","synthetic-device",license,now).getString("caseId").equals(caseId),"valid grant");
  rejects(()->RecoveryGrant.verify(envelope,issuers,"other-installation","synthetic-fingerprint","synthetic-device",license,now),"wrong device accepted");
  rejects(()->RecoveryGrant.verify(envelope,issuers,"synthetic-installation","wrong-key","synthetic-device",license,now),"wrong key accepted");
  rejects(()->RecoveryGrant.verify(envelope,issuers,"synthetic-installation","synthetic-fingerprint","wrong-device",license,now),"wrong code accepted");
  rejects(()->RecoveryGrant.verify(envelope,issuers,"synthetic-installation","synthetic-fingerprint","synthetic-device",new JSONObject().put("licenseDocument","{}"),now),"wrong license accepted");
  rejects(()->RecoveryGrant.verify(envelope,new JSONObject(),"synthetic-installation","synthetic-fingerprint","synthetic-device",license,now),"untrusted issuer accepted");
  rejects(()->RecoveryGrant.verify(envelope,issuers,"synthetic-installation","synthetic-fingerprint","synthetic-device",license,now+60000),"expired accepted");
  JSONObject altered=ProtocolJson.copy(envelope);altered.getJSONObject("payload").put("maxFiles",9999);
  rejects(()->RecoveryGrant.verify(altered,issuers,"synthetic-installation","synthetic-fingerprint","synthetic-device",license,now),"tampered grant accepted");
  JSONObject overbroad=ProtocolJson.copy(grant);overbroad.put("path","/data/other-app");
  rejects(()->RecoveryGrant.verify(sign(overbroad,issuer),issuers,"synthetic-installation","synthetic-fingerprint","synthetic-device",license,now),"server path accepted");
  Path temp=Files.createTempDirectory("rescue-protocol-");
  try{
   Path source=temp.resolve("app_webview/Default/IndexedDB/origin.leveldb/000001.ldb");Files.createDirectories(source.getParent());byte[] raw=new byte[]{0,1,2,3,127,-1,10,13,0,42};Files.write(source,raw);
   File snapshot=temp.resolve("no_backup/data-rescue/"+caseId+"/snapshot-12345678-1234-4567-8123-123456789012").toFile();Map<String,File> roots=new HashMap<>();roots.put("profile",temp.resolve("app_webview/Default/IndexedDB").toFile());
   RecoverySnapshot.Result result=RecoverySnapshot.capture(temp.toFile(),roots,snapshot,RecoverySnapshot.Limits.defaults(),(done,total,bytes)->{});
   File bundle=new File(snapshot.getParentFile(),"evidence.ctrescue");RecoveryPackage.write(grant,result,bundle,now);byte[] encoded=Files.readAllBytes(bundle.toPath());
   check(encoded.length>raw.length,"encrypted package generated");byte[] plaintext=decrypt(encoded,encryption.getPrivate());Map<String,byte[]> zipFiles=new HashMap<>();
   try(ZipInputStream zip=new ZipInputStream(new ByteArrayInputStream(plaintext))){ZipEntry entry;while((entry=zip.getNextEntry())!=null)zipFiles.put(entry.getName(),zip.readAllBytes());}
   check(Arrays.equals(raw,zipFiles.get("files/profile/origin.leveldb/000001.ldb")),"byte-identical archive evidence");
   JSONObject manifest=new JSONObject(new String(zipFiles.get("manifest.json"),StandardCharsets.UTF_8));check(manifest.getBoolean("complete")&&manifest.getJSONArray("files").length()==1,"manifest matches files");
   check(Arrays.equals(raw,Files.readAllBytes(source)),"source unchanged");
   byte[] damaged=encoded.clone();damaged[damaged.length-1]^=1;rejects(()->decrypt(damaged,encryption.getPrivate()),"tamper accepted");
   byte[] headerTamper=encoded.clone();String full=new String(encoded,StandardCharsets.ISO_8859_1);int caseAt=full.indexOf(caseId);headerTamper[caseAt]='8';rejects(()->decrypt(headerTamper,encryption.getPrivate()),"header tamper accepted");
   rejects(()->RecoveryPackage.write(grant,result,bundle,now),"overwrote an existing package");
   RecoverySnapshot.cleanup(temp.toFile(),snapshot);check(!snapshot.exists()&&Files.exists(source),"cleanup preserves original");
   if(args.length==1){Path out=Path.of(args[0]);Files.createDirectories(out);Files.copy(bundle.toPath(),out.resolve("synthetic.ctrescue"),StandardCopyOption.REPLACE_EXISTING);Files.write(out.resolve("synthetic-rescue-key.pk8"),encryption.getPrivate().getEncoded());Files.writeString(out.resolve("synthetic-grant.json"),grant.toString());}
  }finally{try(java.util.stream.Stream<Path> stream=Files.walk(temp)){for(Path path:stream.sorted(Comparator.reverseOrder()).toArray(Path[]::new))Files.deleteIfExists(path);}}
  System.out.println("Recovery protocol/package checks passed: "+passed);
 }
}
