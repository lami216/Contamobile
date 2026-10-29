package mr.alkarna.mobile.approved;

import java.io.IOException;
import org.json.JSONArray;
import org.json.JSONObject;

/** Only a pinned issuer can authorize the fixed snapshot policy. No file path is accepted. */
final class RecoveryGrant {
 static JSONObject verify(JSONObject envelope, JSONObject issuers, String installationId,
   String fingerprint, String deviceCode, JSONObject license, long now) throws Exception {
  JSONObject p=ProtocolJson.verifyEnvelope(envelope,issuers,"contatools-data-rescue");
  JSONObject document=new JSONObject(license.getString("licenseDocument"));
  String[][] expected={{"installationId",installationId},{"keyFingerprint",fingerprint},
   {"deviceCode",deviceCode},{"licenseDocumentHash",ProtocolJson.hash(document)},
   {"licenseId",document.getJSONObject("payload").getString("licenseId")}};
  for(String[] pair:expected)if(!pair[1].equals(p.optString(pair[0])))throw new IOException("RESCUE_SCOPE");
  long issued=p.getLong("issuedAt"),expires=p.getLong("expiresAt");
  if(p.length()!=14||!p.optString("caseId").matches("[a-f0-9-]{36}")||issued>now+60000||expires<=now||expires<=issued||expires-issued>86400000L)throw new IOException("RESCUE_EXPIRED");
  JSONArray scope=p.getJSONArray("scope");
  if(scope.length()!=3||!"snapshot".equals(scope.getString(0))||!"export".equals(scope.getString(1))||!"upload".equals(scope.getString(2)))throw new IOException("RESCUE_SCOPE");
  if(p.getLong("maxBytes")!=268435456L||p.getInt("maxFiles")!=4096||p.getInt("chunkSize")!=196608)throw new IOException("RESCUE_LIMITS");
  JSONObject key=p.getJSONObject("encryptionKey");
  if(key.length()!=3||!"RSA".equals(key.getString("kty"))||!p.getString("encryptionKeyId").matches("[A-Za-z0-9_.:-]{1,80}")||ProtocolJson.decode(key.getString("n")).length<256||ProtocolJson.decode(key.getString("n")).length>512||!"AQAB".equals(key.getString("e")))throw new IOException("RESCUE_KEY");
  return p;
 }
 private RecoveryGrant(){}
}
