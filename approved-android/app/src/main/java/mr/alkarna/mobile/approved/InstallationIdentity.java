package mr.alkarna.mobile.approved;

import android.security.keystore.*;
import org.json.JSONObject;
import java.security.*;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.nio.*;
import java.nio.charset.StandardCharsets;
import java.math.BigInteger;
import java.util.UUID;

/** Keystore private key never enters JavaScript, an export, the service or a backup. */
final class InstallationIdentity {
 static final String ALIAS="alkarna.contatools.installation.v1";
 private final KeyStore keys;
 final JSONObject publicJwk;
 final String fingerprint,id;
 InstallationIdentity() throws Exception {
  keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);
  if(!keys.containsAlias(ALIAS)){KeyPairGenerator generator=KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC,"AndroidKeyStore");generator.initialize(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_SIGN|KeyProperties.PURPOSE_VERIFY).setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1")).setDigests(KeyProperties.DIGEST_SHA256).build());generator.generateKeyPair();}
  ECPublicKey key=(ECPublicKey)keys.getCertificate(ALIAS).getPublicKey();
  publicJwk=new JSONObject().put("kty","EC").put("crv","P-256").put("x",ProtocolJson.base64(coordinate(key.getW().getAffineX()))).put("y",ProtocolJson.base64(coordinate(key.getW().getAffineY())));
  fingerprint=ProtocolJson.fingerprint(publicJwk);byte[] hash=ProtocolJson.sha256(ProtocolJson.canonical(publicJwk));ByteBuffer bytes=ByteBuffer.wrap(hash);long most=bytes.getLong(),least=bytes.getLong();most=(most&0xffffffffffff0fffL)|0x5000L;least=(least&0x3fffffffffffffffL)|0x8000000000000000L;id=new UUID(most,least).toString();
 }
 private static byte[] coordinate(BigInteger number){byte[] value=number.toByteArray(),out=new byte[32];int count=Math.min(value.length,32);System.arraycopy(value,value.length-count,out,32-count,count);return out;}
 String sign(String message) throws Exception {Signature s=Signature.getInstance("SHA256withECDSA");s.initSign((PrivateKey)keys.getKey(ALIAS,null));s.update(message.getBytes(StandardCharsets.UTF_8));return ProtocolJson.base64(ProtocolJson.rawSignature(s.sign()));}
 String id(){return id;}
 String fingerprint(){return fingerprint;}
 JSONObject publicJwk() throws Exception {return ProtocolJson.copy(publicJwk);}
}
