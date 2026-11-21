package mr.alkarna.mobile.approved;

import java.io.IOException;
import java.util.*;
import org.json.*;

/** Signed customer term and current-installation decision, separate from accounting. */
final class PhoneEntitlement {
  static final String PURPOSE="contatools-android-entitlement";
  static final String OFFER_PURPOSE="contatools-android-entitlement-offer";
  private static final String[] SNAPSHOT_FIELDS={"schemaVersion","decisionId","entitlementId","clientId","installationId","keyFingerprint","deviceCode","licenseId","licenseDocumentHash","sequence","bindingGeneration","type","endsAt","status","issuedAt","currentDeviceCode","currentInstallationId","reasonCode","intentId"};
  private static final String[] OFFER_FIELDS={"schemaVersion","offerId","entitlementId","clientId","installationId","keyFingerprint","deviceCode","expectedGeneration","kind","issuedAt","expiresAt"};
  private static boolean oneOf(String value,String... allowed){return Arrays.asList(allowed).contains(value);}

  static void exact(JSONObject p,String... fields) throws Exception {
    Set<String> allowed=new HashSet<>(Arrays.asList(fields));
    if(p.length()!=allowed.size())throw new IOException("INVALID_ENTITLEMENT_FIELDS");
    Iterator<String> names=p.keys();while(names.hasNext())if(!allowed.contains(names.next()))throw new IOException("INVALID_ENTITLEMENT_FIELDS");
  }
  static long number(JSONObject p,String name) throws Exception {
    Object value=p.get(name);
    if(!(value instanceof Number))throw new IOException("INVALID_ENTITLEMENT_NUMBER");
    double n=((Number)value).doubleValue();
    if(!Double.isFinite(n)||n<0||n!=Math.floor(n)||n>9007199254740991d)throw new IOException("INVALID_ENTITLEMENT_NUMBER");
    return ((Number)value).longValue();
  }
  private static String text(JSONObject p,String name,boolean empty) throws Exception {
    Object value=p.get(name);
    if(!(value instanceof String)||((String)value).length()>240||!empty&&((String)value).isEmpty())throw new IOException("INVALID_ENTITLEMENT_SCOPE");
    return (String)value;
  }
  private static void binding(JSONObject p,String installation,String fingerprint,String device) throws Exception {
    if(number(p,"schemaVersion")!=1||!installation.equals(text(p,"installationId",false))||!fingerprint.equals(text(p,"keyFingerprint",false))||!device.equals(text(p,"deviceCode",false)))throw new IOException("ENTITLEMENT_SCOPE_MISMATCH");
    text(p,"entitlementId",false);text(p,"clientId",false);
  }
  static JSONObject snapshot(JSONObject envelope,JSONObject issuers,String installation,String fingerprint,String device) throws Exception {
    JSONObject p=ProtocolJson.verifyEnvelope(envelope,issuers,PURPOSE);
    exact(p,SNAPSHOT_FIELDS);binding(p,installation,fingerprint,device);
    text(p,"decisionId",false);text(p,"intentId",true);
    String license=text(p,"licenseId",true),hash=text(p,"licenseDocumentHash",true),status=text(p,"status",false),reason=text(p,"reasonCode",false),type=text(p,"type",false);
    if(license.isEmpty()!=hash.isEmpty()||!hash.isEmpty()&&!hash.matches("[a-f0-9]{64}"))throw new IOException("INVALID_ENTITLEMENT_LICENSE");
    number(p,"sequence");number(p,"bindingGeneration");number(p,"issuedAt");
    String currentCode=text(p,"currentDeviceCode",false),currentInstallation=text(p,"currentInstallationId",false);
    if(!oneOf(status,"active","pending","replaced","suspended"))throw new IOException("INVALID_ENTITLEMENT_STATUS");
    if("active".equals(status)){
      if(license.isEmpty()||!"ACTIVE_PHONE".equals(reason)||!device.equals(currentCode)||!installation.equals(currentInstallation))throw new IOException("INVALID_ACTIVE_ENTITLEMENT");
    }else if("suspended".equals(status)){
      if(license.isEmpty()||!"OWNER_SUSPENDED".equals(reason)||!device.equals(currentCode)||!installation.equals(currentInstallation))throw new IOException("INVALID_SUSPENDED_ENTITLEMENT");
    }else if("pending".equals(status)){
      if(!"PENDING_REPLACEMENT".equals(reason))throw new IOException("INVALID_ENTITLEMENT_REASON");
    }else if(!oneOf(reason,"REPLACED_PHONE","REPLACED_INSTALLATION"))throw new IOException("INVALID_ENTITLEMENT_REASON");
    if("perpetual".equals(type)){if(!p.isNull("endsAt"))throw new IOException("INVALID_ENTITLEMENT_TERM");}
    else if(!"temporary".equals(type)||p.isNull("endsAt")||number(p,"endsAt")==0)throw new IOException("INVALID_ENTITLEMENT_TERM");
    return ProtocolJson.copy(p);
  }
  static JSONObject offer(JSONObject envelope,JSONObject issuers,String installation,String fingerprint,String device,boolean current,long now) throws Exception {
    JSONObject p=ProtocolJson.verifyEnvelope(envelope,issuers,OFFER_PURPOSE);
    exact(p,OFFER_FIELDS);binding(p,installation,fingerprint,device);text(p,"offerId",false);
    if(!oneOf(text(p,"kind",false),"reinstall","replacement","renew","reactivate"))throw new IOException("INVALID_ENTITLEMENT_OFFER");
    number(p,"expectedGeneration");long issued=number(p,"issuedAt"),expires=number(p,"expiresAt");
    if(expires<=issued||expires-issued>86400000L||current&&expires<=now)throw new IOException("ENTITLEMENT_OFFER_EXPIRED");
    return ProtocolJson.copy(p);
  }
  /** A fresh signed time sample may refresh the same decision, never change it. */
  static void monotonic(JSONObject previous,JSONObject next) throws Exception {
    if(previous==null)return;
    for(String scope:new String[]{"entitlementId","clientId","installationId","keyFingerprint","deviceCode"})if(!previous.getString(scope).equals(next.getString(scope)))throw new IOException("ENTITLEMENT_SCOPE_CHANGED");
    long seq=number(next,"sequence"),oldSeq=number(previous,"sequence"),generation=number(next,"bindingGeneration"),oldGeneration=number(previous,"bindingGeneration");
    if(seq<oldSeq||generation<oldGeneration)throw new IOException("ENTITLEMENT_REPLAY");
    if(seq==oldSeq&&oneOf(previous.getString("status"),"active","suspended")&&oneOf(next.getString("status"),"active","suspended")
        &&previous.getString("currentInstallationId").equals(next.getString("currentInstallationId"))&&previous.getString("currentDeviceCode").equals(next.getString("currentDeviceCode"))){
      for(String name:new String[]{"licenseId","licenseDocumentHash","type","endsAt"})if(!ProtocolJson.canonical(previous.get(name)).equals(ProtocolJson.canonical(next.get(name))))throw new IOException("ENTITLEMENT_TERM_CHANGED_WITHOUT_RENEWAL");
    }
    if(seq==oldSeq&&generation==oldGeneration){
      // Reviewing, replacing or withdrawing an offer does not change the
      // assignment generation. Signed inactive messages may change their offer
      // diagnostics, but cannot alter any scope, licence, term or current phone.
      boolean inactiveRefresh=oneOf(previous.getString("status"),"pending","replaced")&&oneOf(next.getString("status"),"pending","replaced");
      for(String name:SNAPSHOT_FIELDS)if(!"issuedAt".equals(name)&&!(inactiveRefresh&&oneOf(name,"decisionId","status","reasonCode","intentId"))&&!Objects.equals(ProtocolJson.canonical(previous.get(name)),ProtocolJson.canonical(next.get(name))))throw new IOException("ENTITLEMENT_DECISION_CONFLICT");
      if(number(next,"issuedAt")<number(previous,"issuedAt"))throw new IOException("ENTITLEMENT_REPLAY");
    }
  }
  static void claimed(JSONObject offer,JSONObject snapshot,String intent,String documentHash) throws Exception {
    if(!"active".equals(snapshot.getString("status"))||!offer.getString("offerId").equals(snapshot.getString("decisionId"))||!intent.equals(snapshot.getString("intentId"))||!documentHash.equals(snapshot.getString("licenseDocumentHash"))||!offer.getString("entitlementId").equals(snapshot.getString("entitlementId"))||!offer.getString("clientId").equals(snapshot.getString("clientId"))||number(snapshot,"bindingGeneration")<number(offer,"expectedGeneration"))throw new IOException("ENTITLEMENT_CLAIM_MISMATCH");
  }
}
