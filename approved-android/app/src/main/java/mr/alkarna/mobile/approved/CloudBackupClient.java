package mr.alkarna.mobile.approved;

import org.json.*;
import java.io.IOException;

/** Separate protocol and identity proof. No recovery grant, permit or activation mutation. */
final class CloudBackupClient {
 private final InstallationIdentity identity;
 private final ContatoolsClient.Transport transport;
 CloudBackupClient(InstallationIdentity identity,ContatoolsClient.Transport transport){this.identity=identity;this.transport=transport;}
 JSONObject call(String operation,JSONObject payload) throws Exception {
  JSONObject wire=ProtocolJson.copy(payload).put("installationId",identity.id());
  JSONObject challenge=transport.post("/api/android/backup/challenge",new JSONObject().put("operation",operation).put("payload",wire));
  String message=challenge.getString("message");if(message.length()>4096)throw new IOException("INVALID_BACKUP_PROOF");JSONObject proof=new JSONObject(message);
  if(!"contatools-backup-proof".equals(proof.optString("schema"))||proof.optInt("version")!=1||!operation.equals(proof.optString("operation"))||!identity.id().equals(proof.optString("installationId"))||!ProtocolJson.hash(wire).equals(proof.optString("payloadHash"))||!challenge.getString("id").equals(proof.optString("id")))throw new IOException("INVALID_BACKUP_PROOF");
  return transport.post("/api/android/backup/dispatch",new JSONObject().put("operation",operation).put("payload",wire).put("challengeId",challenge.getString("id")).put("signature",identity.sign(message)));
 }
}
