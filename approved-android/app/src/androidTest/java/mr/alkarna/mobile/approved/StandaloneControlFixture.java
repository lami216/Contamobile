package mr.alkarna.mobile.approved;

import org.json.JSONObject;

/** Independent test APK only: signed pre-fence admission for historical protocol fixtures. */
final class StandaloneControlFixture {
  interface Signer { JSONObject sign(String purpose,JSONObject payload)throws Exception; }
  static JSONObject allow(JSONObject request,String code,String fingerprint,Signer signer)throws Exception {
    String hash=request.getString("queryDocumentHash");
    JSONObject payload=new JSONObject().put("schemaVersion",1).put("purpose","standalone-device-control")
        .put("applicationId",BuildConfig.APPLICATION_ID).put("installationId",request.getString("installationId"))
        .put("keyFingerprint",fingerprint).put("deviceCode",code).put("requestNonce",request.getString("requestNonce"))
        .put("queryDocumentHash",hash).put("controlGeneration",0).put("activationFence",0).put("banned",false)
        .put("documentStatus",hash.isEmpty()?"none":"allowed").put("authorizationId","").put("sequence",0).put("issuedAt",System.currentTimeMillis());
    return new JSONObject().put("controlProtocol",1).put("control",signer.sign(StandaloneControl.SCHEMA,payload));
  }
}
