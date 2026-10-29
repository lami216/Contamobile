package mr.alkarna.mobile.approved;

import java.io.*;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.*;
import java.util.zip.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.json.*;

/** A portable, authenticated archive. The AES key is wrapped only to the approved rescue key. */
final class RecoveryPackage {
 static final byte[] MAGIC="CTRESC1\n".getBytes(StandardCharsets.US_ASCII);
 static JSONObject manifest(JSONObject grant,RecoverySnapshot.Result result,long capturedAt) throws Exception {
  JSONArray files=new JSONArray();
  for(RecoverySnapshot.Entry e:result.entries)files.put(new JSONObject().put("path",e.path).put("size",e.size).put("modifiedAt",e.modifiedAt).put("sha256",e.sha256).put("status",e.status).put("error",e.error));
  return new JSONObject().put("schema","contatools-rescue-manifest").put("version",1)
   .put("caseId",grant.getString("caseId")).put("installationId",grant.getString("installationId"))
   .put("capturedAt",capturedAt).put("complete",result.complete).put("files",files);
 }
 static void write(JSONObject grant,RecoverySnapshot.Result result,File destination,long capturedAt) throws Exception {
  if(destination.exists())throw new IOException("RESCUE_PACKAGE_EXISTS");
  KeyGenerator generator=KeyGenerator.getInstance("AES");generator.init(256);SecretKey aes=generator.generateKey();
  JSONObject rsa=grant.getJSONObject("encryptionKey");
  PublicKey publicKey=KeyFactory.getInstance("RSA").generatePublic(new RSAPublicKeySpec(new BigInteger(1,ProtocolJson.decode(rsa.getString("n"))),new BigInteger(1,ProtocolJson.decode(rsa.getString("e")))));
  Cipher wrap=Cipher.getInstance("RSA/ECB/OAEPPadding");wrap.init(Cipher.ENCRYPT_MODE,publicKey,new OAEPParameterSpec("SHA-256","MGF1",MGF1ParameterSpec.SHA256,PSource.PSpecified.DEFAULT));
  byte[] iv=new byte[12];new SecureRandom().nextBytes(iv);
  JSONObject header=new JSONObject().put("schema","contatools-rescue-package").put("version",1)
   .put("caseId",grant.getString("caseId")).put("installationId",grant.getString("installationId"))
   .put("encryptionKeyId",grant.getString("encryptionKeyId")).put("iv",ProtocolJson.base64(iv))
   .put("wrappedKey",ProtocolJson.base64(wrap.doFinal(aes.getEncoded())));
  byte[] aad=ProtocolJson.canonical(header).getBytes(StandardCharsets.UTF_8);
  Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,aes,new GCMParameterSpec(128,iv));cipher.updateAAD(aad);
  File partial=new File(destination.getParentFile(),destination.getName()+".partial");
  try{
   try(FileOutputStream output=new FileOutputStream(partial)){
    DataOutputStream framing=new DataOutputStream(output);framing.write(MAGIC);framing.writeInt(aad.length);framing.write(aad);framing.flush();
    // Closing Zip also finalizes the authenticated GCM tag. No plaintext archive is persisted.
    try(ZipOutputStream zip=new ZipOutputStream(new CipherOutputStream(output,cipher))){
     zip.putNextEntry(new ZipEntry("manifest.json"));zip.write(ProtocolJson.canonical(manifest(grant,result,capturedAt)).getBytes(StandardCharsets.UTF_8));zip.closeEntry();
     byte[] buffer=new byte[65536];
     for(RecoverySnapshot.Entry entry:result.entries)if("copied".equals(entry.status)){
      File source=new File(result.directory,entry.path);MessageDigest digest=MessageDigest.getInstance("SHA-256");long size=0;
      zip.putNextEntry(new ZipEntry("files/"+entry.path));
      try(InputStream input=new FileInputStream(source)){int count;while((count=input.read(buffer))!=-1){zip.write(buffer,0,count);digest.update(buffer,0,count);size+=count;}}
      zip.closeEntry();if(size!=entry.size||!hex(digest.digest()).equals(entry.sha256))throw new IOException("RESCUE_COPY_CHANGED");
     }
    }
   }
   try(RandomAccessFile fsync=new RandomAccessFile(partial,"rw")){fsync.getFD().sync();}
   if(!partial.renameTo(destination))throw new IOException("RESCUE_COMMIT_FAILED");
  }finally{if(partial.exists()&&!partial.delete())partial.deleteOnExit();}
 }
 static String hash(File file) throws Exception {
  MessageDigest digest=MessageDigest.getInstance("SHA-256");byte[] buffer=new byte[65536];
  try(InputStream input=new FileInputStream(file)){int count;while((count=input.read(buffer))!=-1)digest.update(buffer,0,count);}
  return hex(digest.digest());
 }
 private static String hex(byte[] bytes){StringBuilder out=new StringBuilder();for(byte b:bytes)out.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return out.toString();}
 private RecoveryPackage(){}
}
