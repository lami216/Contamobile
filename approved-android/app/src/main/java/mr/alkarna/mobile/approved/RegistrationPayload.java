package mr.alkarna.mobile.approved;
import org.json.*;
import java.util.*;

final class RegistrationPayload {
 static String fingerprint(JSONObject payload,JSONObject issuers,String origin) throws Exception {
  JSONObject stable=ProtocolJson.copy(payload);JSONArray owners=stable.getJSONArray("owners");ArrayList<JSONObject> ordered=new ArrayList<>();
  for(int i=0;i<owners.length();i++)ordered.add(owners.getJSONObject(i));ordered.sort(Comparator.comparing(owner->owner.optString("id")));
  stable.put("owners",new JSONArray(ordered));stable.put("licenseDocument",ProtocolJson.hash(new JSONObject(payload.getString("licenseDocument"))));
  stable.remove("activation"); // A running clock or status sample is not a change to registration identity.
  stable.put("protocol",RegistrationPolicy.VERSION).put("issuers",issuers).put("serviceOrigin",origin);return ProtocolJson.hash(stable);
 }
}
