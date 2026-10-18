package mr.alkarna.mobile.approved;

import org.json.JSONObject;
import android.util.JsonReader;
import android.util.JsonToken;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.*;
import java.math.BigInteger;
import java.time.OffsetDateTime;
import java.util.*;

/** Wire-compatible with offline-conta/lib/license.ts. Contains verification keys only. */
final class LicenseVerifier {
    static final int MAX_BYTES=64*1024;
    private static final Map<String,PublicKey> PUBLIC_KEYS=new HashMap<>();
    static {
        try {
            PUBLIC_KEYS.put("alkarna-license-v1",key("VafWOl9h-bF8auIQTUvS5AATeR8yyxJu49p-QSzk7-s","Pz7QrSsgtgcKhvc_eSblH0BPcBwEo9lCo-0zkXwIDzM"));
            PUBLIC_KEYS.put("alkarna-license-v2",key("-kAStxv0yNuJ9GyzSNaiywfrZ5BziSWL5kJVMFOnRUY","AburlAjGDOBSzFeNa2sxyd4XgLM5CWKuDR4Hpe57GYU"));
        } catch(Exception e){throw new ExceptionInInitializerError(e);}
    }
    static final class Rejected extends Exception {
        final String code;
        Rejected(String code,String message){super(message);this.code=code;}
    }
    private static Rejected invalid(){return new Rejected("LICENSE_INVALID","ملف الترخيص غير صالح أو تم تغييره");}
    static PublicKey key(String x,String y) throws Exception {
        AlgorithmParameters params=AlgorithmParameters.getInstance("EC");params.init(new ECGenParameterSpec("secp256r1"));
        ECPoint point=new ECPoint(new BigInteger(1,Base64.getUrlDecoder().decode(x)),new BigInteger(1,Base64.getUrlDecoder().decode(y)));
        return KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(point,params.getParameterSpec(ECParameterSpec.class)));
    }
    static String deviceCode(String identity) throws Exception {
        String normalized=identity.trim().toLowerCase(Locale.ROOT).replace("{","").replace("}","");
        if(normalized.isEmpty())throw new Rejected("DEVICE_UNAVAILABLE","تعذّر استخراج كود الجهاز");
        byte[] bytes=MessageDigest.getInstance("SHA-256").digest(("mr.alkarna.desktop|device-v1|"+normalized).getBytes(StandardCharsets.UTF_8));
        StringBuilder out=new StringBuilder("AKD");for(int i=0;i<10;i++){if(i%2==0)out.append('-');out.append(String.format(Locale.ROOT,"%02X",bytes[i]&255));}return out.toString();
    }
    static boolean required(JSONObject p,String field){return p.opt(field) instanceof String&&!p.optString(field).trim().isEmpty();}
    // JSON.stringify-compatible escaping; JSONObject.quote also escapes some slashes and differs from the issuer.
    static String quote(String text){StringBuilder out=new StringBuilder("\"");for(int i=0;i<text.length();i++){char c=text.charAt(i);switch(c){case '"':out.append("\\\"");break;case '\\':out.append("\\\\");break;case '\b':out.append("\\b");break;case '\f':out.append("\\f");break;case '\n':out.append("\\n");break;case '\r':out.append("\\r");break;case '\t':out.append("\\t");break;default:if(c<32||(Character.isSurrogate(c)&&!(Character.isHighSurrogate(c)&&i+1<text.length()&&Character.isLowSurrogate(text.charAt(i+1)))&&!(Character.isLowSurrogate(c)&&i>0&&Character.isHighSurrogate(text.charAt(i-1)))))out.append(String.format(Locale.ROOT,"\\u%04x",(int)c));else out.append(c);}}return out.append('"').toString();}
    static String json(Object value) throws Exception {
        if(value==null||value==JSONObject.NULL)return "null";if(value instanceof String)return quote((String)value);
        StringBuilder out=new StringBuilder();if(value instanceof JSONObject){out.append('{');Iterator<String> fields=((JSONObject)value).keys();while(fields.hasNext()){String field=fields.next();if(out.length()>1)out.append(',');out.append(quote(field)).append(':').append(json(((JSONObject)value).get(field)));}return out.append('}').toString();}
        if(value instanceof org.json.JSONArray){out.append('[');org.json.JSONArray a=(org.json.JSONArray)value;for(int i=0;i<a.length();i++){if(i>0)out.append(',');out.append(json(a.get(i)));}return out.append(']').toString();}
        return value.toString();
    }
    static String canonical(JSONObject p,int version) throws Exception {
        String[] fields=version==1?new String[]{"licenseId","storeId","customerName","storeName","deviceId","edition","type","issuedAt","notes"}:new String[]{"licenseId","storeId","customerName","storeName","deviceId","edition","type","durationSeconds","activationMode","notes"};
        StringBuilder out=new StringBuilder("{");for(String field:fields){if(out.length()>1)out.append(',');out.append(quote(field)).append(':');Object value=p.get(field);out.append(value==JSONObject.NULL?"null":value instanceof Number?Long.toString(((Number)value).longValue()):quote((String)value));}return out.append('}').toString();
    }
    static byte[] der(byte[] raw){byte[][] parts=new byte[2][];int length=0;for(int n=0;n<2;n++){int start=n*32,end=start+32;while(start<end-1&&raw[start]==0)start++;boolean pad=(raw[start]&128)!=0;byte[] value=new byte[end-start+(pad?1:0)];System.arraycopy(raw,start,value,pad?1:0,end-start);parts[n]=value;length+=2+value.length;}byte[] result=new byte[length+2];result[0]=0x30;result[1]=(byte)length;int offset=2;for(byte[] part:parts){result[offset++]=2;result[offset++]=(byte)part.length;System.arraycopy(part,0,result,offset,part.length);offset+=part.length;}return result;}
    private static Object readJson(JsonReader reader,int depth) throws Exception {
        if(depth>32)throw invalid();JsonToken token=reader.peek();
        switch(token){
            case BEGIN_OBJECT:JSONObject object=new JSONObject();reader.beginObject();while(reader.hasNext())object.put(reader.nextName(),readJson(reader,depth+1));reader.endObject();return object;
            case BEGIN_ARRAY:org.json.JSONArray array=new org.json.JSONArray();reader.beginArray();while(reader.hasNext())array.put(readJson(reader,depth+1));reader.endArray();return array;
            case STRING:return reader.nextString();
            case NUMBER:String raw=reader.nextString();try{if(!raw.contains(".")&&!raw.contains("e")&&!raw.contains("E"))return Long.parseLong(raw);}catch(NumberFormatException ignored){}double number=Double.parseDouble(raw);if(!Double.isFinite(number))throw invalid();return number;
            case BOOLEAN:return reader.nextBoolean();
            case NULL:reader.nextNull();return JSONObject.NULL;
            default:throw invalid();
        }
    }
    static JSONObject verify(String content,String device) throws Exception {
        if(content==null||content.getBytes(StandardCharsets.UTF_8).length>MAX_BYTES)throw new Rejected("LICENSE_TOO_LARGE","ملف الترخيص أكبر من 64 كيلوبايت");
        try {
            JSONObject doc;try(JsonReader reader=new JsonReader(new StringReader(content))){reader.setLenient(false);Object parsed=readJson(reader,0);if(!(parsed instanceof JSONObject)||reader.peek()!=JsonToken.END_DOCUMENT)throw invalid();doc=(JSONObject)parsed;}Object versionValue=doc.get("version");int version=doc.getInt("version");
            if(!(versionValue instanceof Number)||((Number)versionValue).doubleValue()!=version||!(version==1||version==2)||!"alkarna-license".equals(doc.opt("schema"))||!"ECDSA_P256_SHA256".equals(doc.opt("algorithm")))throw invalid();
            String keyId=doc.getString("keyId");if(!keyId.equals("alkarna-license-v"+version)||!PUBLIC_KEYS.containsKey(keyId))throw invalid();
            JSONObject p=doc.getJSONObject("payload");
            for(String field:new String[]{"licenseId","storeId","customerName","storeName","deviceId"})if(!required(p,field))throw invalid();
            if(!"desktop".equals(p.opt("edition"))||!(p.opt("notes") instanceof String))throw invalid();
            if(version==1){String issued=p.optString("issuedAt");if(!"perpetual".equals(p.opt("type"))||!issued.matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?(?:Z|[+-]\\d{2}:\\d{2})"))throw invalid();OffsetDateTime.parse(issued);}
            else {
                if(p.length()!=10||!"single-install".equals(p.opt("activationMode")))throw invalid();
                if("perpetual".equals(p.opt("type"))){if(!p.has("durationSeconds")||!p.isNull("durationSeconds"))throw invalid();}
                else if("temporary".equals(p.opt("type"))){Object duration=p.opt("durationSeconds");if(!(duration instanceof Number)||((Number)duration).doubleValue()!=((Number)duration).longValue()||((Number)duration).longValue()<=0||((Number)duration).longValue()>9007199254740991L)throw invalid();}
                else throw invalid();
            }
            Object sig=doc.get("signature");if(!(sig instanceof String)||!((String)sig).matches("[A-Za-z0-9_-]+")||((String)sig).length()%4==1)throw invalid();
            byte[] raw=Base64.getUrlDecoder().decode((String)sig);if(raw.length!=64||!Base64.getUrlEncoder().withoutPadding().encodeToString(raw).equals(sig))throw invalid();
            Signature check=Signature.getInstance("SHA256withECDSA");check.initVerify(PUBLIC_KEYS.get(keyId));check.update(canonical(p,version).getBytes(StandardCharsets.UTF_8));if(!check.verify(der(raw)))throw invalid();
            if(!device.equals(p.getString("deviceId")))throw new Rejected("LICENSE_DEVICE_MISMATCH","هذا الترخيص مخصص لجهاز آخر");
            return doc;
        }catch(Rejected e){throw e;}catch(Exception e){throw invalid();}
    }
}
