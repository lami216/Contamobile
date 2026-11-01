package mr.alkarna.mobile.approved;

import java.io.IOException;
import java.util.Iterator;
import org.json.JSONObject;

/** A separate signed purpose; a password-recovery or backup grant cannot clear accounting. */
final class AccountingResetGrant {
 static JSONObject verify(JSONObject envelope,JSONObject issuers,String installationId,String fingerprint,
   String deviceCode,JSONObject license,String shopId,String ownerId,long now,boolean claimed) throws Exception {
  JSONObject p=ProtocolJson.verifyEnvelope(envelope,issuers,"contatools-accounting-reset");
  JSONObject document=new JSONObject(license.getString("licenseDocument"));
  String[][] bindings={{"installationId",installationId},{"keyFingerprint",fingerprint},{"deviceCode",deviceCode},
   {"licenseDocumentHash",ProtocolJson.hash(document)},{"licenseId",document.getJSONObject("payload").getString("licenseId")},
   {"shopId",shopId},{"ownerId",ownerId}};
  for(String[] binding:bindings)if(!binding[1].equals(p.optString(binding[0])))throw new IOException("RESET_SCOPE");
  long issued=p.getLong("issuedAt"),expires=p.getLong("expiresAt");
  if(p.length()!=11||!uuid(p.optString("requestId"))||!uuid(p.optString("grantId"))||issued<0||expires<=issued||expires-issued>86400000L)
   throw new IOException("RESET_GRANT");
  // A saved, signed claim may resume after expiry; fresh consent cannot claim an expired request.
  if(!claimed&&(issued>now+60000||expires<=now))throw new IOException("RESET_EXPIRED");
  return p;
 }
 static void verifyClaim(JSONObject envelope,JSONObject issuers,JSONObject grant,String intentId) throws Exception {
  JSONObject p=ProtocolJson.verifyEnvelope(envelope,issuers,"contatools-accounting-reset-claim");
  if(p.length()!=13||!uuid(intentId)||!intentId.equals(p.optString("intentId")))throw new IOException("RESET_CLAIM");
  Iterator<String> names=grant.keys();while(names.hasNext()){String name=names.next();if(!ProtocolJson.canonical(grant.get(name)).equals(ProtocolJson.canonical(p.opt(name))))throw new IOException("RESET_CLAIM_SCOPE");}
  long claimed=p.getLong("claimedAt");if(claimed<grant.getLong("issuedAt")||claimed>=grant.getLong("expiresAt"))throw new IOException("RESET_CLAIM_EXPIRED");
 }
 static void verifyDenial(JSONObject envelope,JSONObject issuers,JSONObject grant,String intentId) throws Exception {
  JSONObject p=ProtocolJson.verifyEnvelope(envelope,issuers,"contatools-accounting-reset-denial");
  if(p.length()!=14||!uuid(intentId)||!intentId.equals(p.optString("intentId"))||!("expired".equals(p.optString("status"))||"cancelled".equals(p.optString("status"))||"declined".equals(p.optString("status"))))throw new IOException("RESET_DENIAL");
  Iterator<String> names=grant.keys();while(names.hasNext()){String name=names.next();if(!ProtocolJson.canonical(grant.get(name)).equals(ProtocolJson.canonical(p.opt(name))))throw new IOException("RESET_DENIAL_SCOPE");}
  if(p.getLong("deniedAt")<grant.getLong("issuedAt")||"expired".equals(p.getString("status"))&&p.getLong("deniedAt")<grant.getLong("expiresAt"))throw new IOException("RESET_DENIAL_TIME");
 }
 static boolean uuid(String value){return value!=null&&value.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}");}
 private AccountingResetGrant(){}
}
