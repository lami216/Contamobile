package mr.alkarna.mobile.approved;

import java.io.IOException;
import java.util.*;
import org.json.*;

/** Signed device admission. This authority contains no accounting data or licence clock. */
final class StandaloneControl {
  static final String SCHEMA = "contatools-android-standalone-control";
  private static final String[] FIELDS = {"schemaVersion","purpose","applicationId","installationId","keyFingerprint","deviceCode","requestNonce","queryDocumentHash","controlGeneration","activationFence","banned","documentStatus","authorizationId","sequence","issuedAt"};

  static boolean uuid(String value) {
    return value != null && value.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}");
  }
  static void freshness(long started,long observation,long now) throws Exception {
    if(started<0 || observation<started || observation>now || started>now || now-started>30000)
      throw new IOException("CONTROL_RESPONSE_STALE");
  }
  private static String text(JSONObject p, String name) throws Exception {
    Object value = p.get(name);
    if (!(value instanceof String)) throw new IOException("CONTROL_FIELDS");
    return (String) value;
  }
  private static void shape(JSONObject p) throws Exception {
    PhoneEntitlement.exact(p, FIELDS);
    if (PhoneEntitlement.number(p,"schemaVersion") != 1
        || !"standalone-device-control".equals(text(p,"purpose"))
        || !uuid(text(p,"installationId")) || !uuid(text(p,"requestNonce"))
        || !text(p,"keyFingerprint").matches("[A-Za-z0-9_-]{43}")
        || !text(p,"deviceCode").matches("AKD(?:-[A-F0-9]{4}){5}")
        || !(p.get("banned") instanceof Boolean)) throw new IOException("CONTROL_FIELDS");
    String hash=text(p,"queryDocumentHash"), status=text(p,"documentStatus"), authorization=text(p,"authorizationId");
    if (!hash.isEmpty() && !hash.matches("[a-f0-9]{64}")) throw new IOException("CONTROL_DOCUMENT");
    if (!("none".equals(status) || "allowed".equals(status) || "revoked".equals(status))
        || hash.isEmpty() != "none".equals(status)
        || !authorization.isEmpty() && !uuid(authorization)) throw new IOException("CONTROL_DOCUMENT");
    long generation=PhoneEntitlement.number(p,"controlGeneration"), fence=PhoneEntitlement.number(p,"activationFence"), sequence=PhoneEntitlement.number(p,"sequence");
    PhoneEntitlement.number(p,"issuedAt");
    if (fence>generation || "allowed".equals(status) && fence>0 && (authorization.isEmpty() || sequence<1)) throw new IOException("CONTROL_FENCE");
  }
  static JSONObject verify(JSONObject envelope, JSONObject issuers, String application,
      String installation, String fingerprint, String device, String nonce, String hash) throws Exception {
    JSONObject p=ProtocolJson.verifyEnvelope(envelope,issuers,SCHEMA);
    shape(p);
    String[][] scope={{"applicationId",application},{"installationId",installation},{"keyFingerprint",fingerprint},{"deviceCode",device},{"requestNonce",nonce},{"queryDocumentHash",hash}};
    for(String[] value:scope) if(!value[1].equals(text(p,value[0]))) throw new IOException("CONTROL_SCOPE");
    return ProtocolJson.copy(p);
  }
  static void monotonic(JSONObject previous, JSONObject next) throws Exception {
    shape(next); if(previous==null)return; shape(previous);
    for(String scope:new String[]{"applicationId","deviceCode"}) if(!previous.getString(scope).equals(next.getString(scope))) throw new IOException("CONTROL_SCOPE");
    long oldGeneration=PhoneEntitlement.number(previous,"controlGeneration"), generation=PhoneEntitlement.number(next,"controlGeneration");
    if(generation<oldGeneration || PhoneEntitlement.number(next,"activationFence")<PhoneEntitlement.number(previous,"activationFence")) throw new IOException("CONTROL_REPLAY");
    if(generation==oldGeneration && (previous.getBoolean("banned")!=next.getBoolean("banned")
        || PhoneEntitlement.number(previous,"activationFence")!=PhoneEntitlement.number(next,"activationFence"))) throw new IOException("CONTROL_CONFLICT");
  }
  private static JSONObject empty() throws Exception {
    return new JSONObject().put("revokedDocumentHashes",new JSONArray()).put("authorizations",new JSONObject());
  }
  private static Set<String> revoked(JSONObject cache) throws Exception {
    Set<String> values=new TreeSet<>();if(cache==null)return values;
    JSONArray array=cache.getJSONArray("revokedDocumentHashes");
    for(int i=0;i<array.length();i++){Object value=array.get(i);if(!(value instanceof String)||!((String)value).matches("[a-f0-9]{64}"))throw new IOException("CONTROL_CACHE");values.add((String)value);}
    return values;
  }
  static JSONObject record(JSONObject previous, JSONObject decision, String currentDocumentHash) throws Exception {
    JSONObject old=previous==null?null:previous.getJSONObject("snapshot");monotonic(old,decision);
    JSONObject next=previous==null?empty():ProtocolJson.copy(previous);
    Set<String> deny=revoked(next);String hash=decision.getString("queryDocumentHash");
    if(!hash.isEmpty() && (decision.getBoolean("banned") || "revoked".equals(decision.getString("documentStatus"))))deny.add(hash);
    if(decision.getBoolean("banned") && currentDocumentHash!=null && !currentDocumentHash.isEmpty())deny.add(currentDocumentHash);
    next.put("snapshot",ProtocolJson.copy(decision)).put("revokedDocumentHashes",new JSONArray(deny));
    if("allowed".equals(decision.getString("documentStatus")) && !decision.getBoolean("banned")) {
      JSONObject authorizations=next.getJSONObject("authorizations");
      authorizations.put(hash,new JSONObject().put("activationFence",decision.getLong("activationFence")).put("authorizationId",decision.getString("authorizationId")).put("sequence",decision.getLong("sequence")));
    }
    return next;
  }
  /** Replica repair never drops an old revocation or lets an older allow override a ban. */
  static JSONObject merge(JSONObject a, JSONObject b) throws Exception {
    if(a==null)return b==null?null:ProtocolJson.copy(b);if(b==null)return ProtocolJson.copy(a);
    JSONObject x=a.getJSONObject("snapshot"),y=b.getJSONObject("snapshot"),older=x,newer=y;
    long gx=PhoneEntitlement.number(x,"controlGeneration"),gy=PhoneEntitlement.number(y,"controlGeneration");
    if(gx>gy || gx==gy && PhoneEntitlement.number(x,"issuedAt")>PhoneEntitlement.number(y,"issuedAt")){older=y;newer=x;}
    monotonic(older,newer);
    JSONObject result=ProtocolJson.copy(newer==x?a:b);Set<String> denied=revoked(a);denied.addAll(revoked(b));result.put("revokedDocumentHashes",new JSONArray(denied));
    JSONObject merged=new JSONObject();
    for(JSONObject cache:new JSONObject[]{a,b}){JSONObject values=cache.getJSONObject("authorizations");Iterator<String> names=values.keys();while(names.hasNext()){
      String hash=names.next();if(!hash.matches("[a-f0-9]{64}"))throw new IOException("CONTROL_CACHE");JSONObject value=values.getJSONObject(hash),existing=merged.optJSONObject(hash);
      PhoneEntitlement.exact(value,"activationFence","authorizationId","sequence");long fence=PhoneEntitlement.number(value,"activationFence");PhoneEntitlement.number(value,"sequence");
      if(!(value.get("authorizationId") instanceof String)||!value.getString("authorizationId").isEmpty()&&!uuid(value.getString("authorizationId")))throw new IOException("CONTROL_CACHE");
      if(existing==null || fence>existing.getLong("activationFence"))merged.put(hash,ProtocolJson.copy(value));
      else if(fence==existing.getLong("activationFence")&&!ProtocolJson.canonical(existing).equals(ProtocolJson.canonical(value)))throw new IOException("CONTROL_CONFLICT");
    }}
    return result.put("authorizations",merged);
  }
  static String denial(JSONObject cache,String hash) throws Exception {
    if(cache==null)return "";JSONObject p=cache.getJSONObject("snapshot");shape(p);
    if(p.getBoolean("banned"))return "DEVICE_BANNED";
    if(hash==null||hash.isEmpty())return "";
    if(revoked(cache).contains(hash))return "ACTIVATION_REVOKED";
    long fence=PhoneEntitlement.number(p,"activationFence");JSONObject allowed=cache.getJSONObject("authorizations").optJSONObject(hash);
    if(fence>0 && (allowed==null || allowed.getLong("activationFence")<fence || allowed.optString("authorizationId").isEmpty() || allowed.optLong("sequence")<1))return "ACTIVATION_REVOKED";
    return "";
  }
}
