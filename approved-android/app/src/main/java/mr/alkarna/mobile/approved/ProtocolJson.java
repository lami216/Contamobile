package mr.alkarna.mobile.approved;

import org.json.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;

/** Independent Contatools wire domain. Never substitutes a web permit for a local license. */
final class ProtocolJson {
 static String canonical(Object value) throws Exception {
  if(value==null||value==JSONObject.NULL)return "null";
  if(value instanceof String)return LicenseVerifier.quote((String)value);
  if(value instanceof Boolean)return value.toString();
  if(value instanceof Number)return canonicalNumber((Number)value);
  StringBuilder out=new StringBuilder();
  if(value instanceof JSONArray){out.append('[');JSONArray a=(JSONArray)value;for(int i=0;i<a.length();i++){if(i>0)out.append(',');out.append(canonical(a.get(i)));}return out.append(']').toString();}
  if(value instanceof JSONObject){out.append('{');JSONObject o=(JSONObject)value;TreeSet<String> names=new TreeSet<>();Iterator<String> it=o.keys();while(it.hasNext())names.add(it.next());for(String name:names){if(out.length()>1)out.append(',');out.append(LicenseVerifier.quote(name)).append(':').append(canonical(o.get(name)));}return out.append('}').toString();}
  throw new Exception("Unsupported protocol value");
 }
 /** JSON.stringify uses scientific notation below 1e-6. Integer bounds and
  * ordinary decimal formatting remain the same as the existing protocol. */
 static String canonicalNumber(Number value) throws Exception {
  double n=value.doubleValue();
  if(!Double.isFinite(n)||Math.abs(n)>9007199254740991d)throw new Exception("Unsupported protocol number");
  if(n==0)return "0";
  if(Math.abs(n)>=1e-6)return BigDecimal.valueOf(n).stripTrailingZeros().toPlainString();
  // Find the shortest nearest decimal that round-trips to this binary double.
  // Double.toString alone differs from ECMAScript for subnormals (MIN_VALUE
  // is 4.9E-324 in some JDKs, whereas JSON.stringify emits 5e-324).
  BigDecimal exact=new BigDecimal(n);
  int exponent=exact.precision()-exact.scale()-1;
  for(int precision=1;precision<=17;precision++){
   BigDecimal rounded=exact.round(new MathContext(precision,RoundingMode.HALF_EVEN));
   BigDecimal unit=BigDecimal.ONE.scaleByPowerOfTen(exponent-precision+1),best=null,distance=null;
   for(int offset=-1;offset<=1;offset++){
    BigDecimal candidate=rounded.add(unit.multiply(BigDecimal.valueOf(offset)));
    if(Double.doubleToLongBits(candidate.doubleValue())!=Double.doubleToLongBits(n))continue;
    BigDecimal gap=candidate.subtract(exact).abs();
    if(best==null||gap.compareTo(distance)<0||(gap.compareTo(distance)==0&&!candidate.unscaledValue().testBit(0))){best=candidate;distance=gap;}
   }
   if(best!=null)return best.stripTrailingZeros().toString().replace('E','e');
  }
  throw new Exception("Unsupported protocol number");
 }
 static String base64(byte[] value){return Base64.getUrlEncoder().withoutPadding().encodeToString(value);}
 static byte[] decode(String value) throws Exception {if(value==null||!value.matches("[A-Za-z0-9_-]+")||value.length()%4==1)throw new Exception("Invalid protocol encoding");byte[] bytes=Base64.getUrlDecoder().decode(value);if(!base64(bytes).equals(value))throw new Exception("Noncanonical protocol encoding");return bytes;}
 static byte[] sha256(String value) throws Exception {return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));}
 static String hash(Object value) throws Exception {byte[] bytes=sha256(value instanceof String?(String)value:canonical(value));StringBuilder out=new StringBuilder();for(byte b:bytes)out.append(String.format(Locale.ROOT,"%02x",b&255));return out.toString();}
 static String fingerprint(JSONObject jwk) throws Exception {return base64(sha256(canonical(new JSONObject().put("crv",jwk.getString("crv")).put("kty",jwk.getString("kty")).put("x",jwk.getString("x")).put("y",jwk.getString("y")))));}
 static JSONObject verifyEnvelope(JSONObject envelope,JSONObject keys,String schema) throws Exception {
  if(envelope.length()!=5||!schema.equals(envelope.optString("schema"))||envelope.optInt("version")!=1)throw new Exception("Invalid recovery authorization");
  JSONObject jwk=keys.optJSONObject(envelope.optString("kid"));if(jwk==null||jwk.has("d")||!"EC".equals(jwk.optString("kty"))||!"P-256".equals(jwk.optString("crv")))throw new Exception("Unknown recovery issuer");
  JSONObject unsigned=new JSONObject().put("schema",schema).put("version",1).put("kid",envelope.getString("kid")).put("payload",envelope.getJSONObject("payload"));
  byte[] raw=decode(envelope.getString("signature"));if(raw.length!=64)throw new Exception("Invalid recovery signature");
  Signature signature=Signature.getInstance("SHA256withECDSA");signature.initVerify(LicenseVerifier.key(jwk.getString("x"),jwk.getString("y")));signature.update(canonical(unsigned).getBytes(StandardCharsets.UTF_8));if(!signature.verify(LicenseVerifier.der(raw)))throw new Exception("Invalid recovery signature");return envelope.getJSONObject("payload");
 }
 static byte[] rawSignature(byte[] der) throws Exception {
  if(der.length<8||der[0]!=48||(der[1]&255)!=der.length-2)throw new Exception("Invalid EC signature");byte[] raw=new byte[64];int at=2;
  for(int part=0;part<2;part++){if(at+2>der.length||der[at++]!=2)throw new Exception("Invalid EC signature");int length=der[at++]&255;if(length<1||length>33||at+length>der.length)throw new Exception("Invalid EC integer");int start=at;at+=length;if(length==33){if(der[start++]!=0)throw new Exception("Oversize EC integer");length--;}System.arraycopy(der,start,raw,part*32+32-length,length);}
  if(at!=der.length)throw new Exception("Trailing EC signature bytes");return raw;
 }
 static JSONObject copy(JSONObject value) throws Exception {return new JSONObject(value.toString());}
}
