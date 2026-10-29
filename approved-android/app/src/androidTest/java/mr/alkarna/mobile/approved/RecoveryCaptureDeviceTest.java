package mr.alkarna.mobile.approved;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import java.io.*;
import java.nio.file.*;
import java.security.*;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.MGF1ParameterSpec;
import java.util.*;
import java.util.zip.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import static org.junit.Assert.*;

/** Real Android filesystem and crypto, synthetic bytes only, never opens accounting. */
@RunWith(AndroidJUnit4.class)
public final class RecoveryCaptureDeviceTest {
 @Test public void captureEncryptDecryptAndPreserveOriginalOnAndroid() throws Exception {
  Context context=ApplicationProvider.getApplicationContext();
  assertFalse(MainActivity.hasCreatedWebView());
  File data=context.getDataDir(),source=new File(data,"app_webview_rescuetest/Default/IndexedDB");
  assertFalse(source.exists());Files.createDirectories(source.toPath());
  String caseId=UUID.randomUUID().toString();File caseDir=new File(context.getNoBackupFilesDir(),"data-rescue/"+caseId);assertTrue(caseDir.mkdirs());
  File snapshot=new File(caseDir,"snapshot-"+UUID.randomUUID()),bundle=new File(caseDir,"evidence.ctrescue");
  byte[] expected="Synthetic known accounting evidence: preserved invoices 100,200".getBytes("UTF-8");
  Path original=source.toPath().resolve("000003.log");Files.write(original,expected);
  String stage="snapshot";
  try {
   RecoverySnapshot.Result result=RecoverySnapshot.capture(data,Collections.singletonMap("fixture",source),snapshot,RecoverySnapshot.Limits.defaults(),null);
   assertTrue(result.complete);assertEquals(expected.length,result.copiedBytes);
   stage="package";KeyPairGenerator generator=KeyPairGenerator.getInstance("RSA");generator.initialize(2048);KeyPair pair=generator.generateKeyPair();RSAPublicKey key=(RSAPublicKey)pair.getPublic();
   JSONObject grant=new JSONObject().put("caseId",caseId).put("installationId",UUID.randomUUID().toString()).put("encryptionKeyId","synthetic-only").put("encryptionKey",new JSONObject().put("n",ProtocolJson.base64(unsigned(key.getModulus().toByteArray()))).put("e",ProtocolJson.base64(unsigned(key.getPublicExponent().toByteArray()))));
   RecoveryPackage.write(grant,result,bundle,System.currentTimeMillis());
   stage="decrypt";try(DataInputStream input=new DataInputStream(new FileInputStream(bundle))){
    byte[] magic=new byte[8];input.readFully(magic);assertArrayEquals(RecoveryPackage.MAGIC,magic);int length=input.readInt();assertTrue(length>0&&length<16384);byte[] aad=new byte[length];input.readFully(aad);JSONObject header=new JSONObject(new String(aad,"UTF-8"));
    Cipher rsa=Cipher.getInstance("RSA/ECB/OAEPPadding");rsa.init(Cipher.DECRYPT_MODE,pair.getPrivate(),new OAEPParameterSpec("SHA-256","MGF1",MGF1ParameterSpec.SHA256,PSource.PSpecified.DEFAULT));
    byte[] aes=rsa.doFinal(ProtocolJson.decode(header.getString("wrappedKey")));Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(aes,"AES"),new GCMParameterSpec(128,ProtocolJson.decode(header.getString("iv"))));cipher.updateAAD(aad);
    // Read through doFinal so an invalid authentication tag always fails the test.
    byte[] clear=cipher.doFinal(readAll(input));boolean found=false;
    try(ZipInputStream zip=new ZipInputStream(new ByteArrayInputStream(clear))){ZipEntry e;while((e=zip.getNextEntry())!=null){byte[] bytes=readAll(zip);if(e.getName().equals("files/fixture/000003.log")){assertArrayEquals(expected,bytes);found=true;}}}assertTrue(found);
   }
   stage="preservation";assertArrayEquals(expected,Files.readAllBytes(original));assertFalse(MainActivity.hasCreatedWebView());
  }catch(Exception e){throw new AssertionError("ANDROID_CAPTURE_STAGE="+stage+" "+e.getClass().getSimpleName()+": "+e.getMessage(),e);}
  finally {if(snapshot.exists())RecoverySnapshot.cleanup(data,snapshot);Files.deleteIfExists(bundle.toPath());Files.deleteIfExists(new File(caseDir,"evidence.ctrescue.partial").toPath());caseDir.delete();Files.deleteIfExists(original);source.delete();source.getParentFile().delete();source.getParentFile().getParentFile().delete();}
 }
 private static byte[] unsigned(byte[] b){return b.length>1&&b[0]==0?Arrays.copyOfRange(b,1,b.length):b;}
 private static byte[] readAll(InputStream input)throws IOException{ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[4096];int n;while((n=input.read(b))!=-1)out.write(b,0,n);return out.toByteArray();}
}
