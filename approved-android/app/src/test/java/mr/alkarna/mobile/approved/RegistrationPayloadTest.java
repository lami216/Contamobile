package mr.alkarna.mobile.approved;
import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;

public class RegistrationPayloadTest {
 @Test public void clockAndOwnerOrderDoNotRetriggerButRealChangesDo() throws Exception {
  JSONObject a=new JSONObject().put("licenseDocument",new JSONObject().put("schema","synthetic").put("payload",new JSONObject().put("type","temporary")).toString()).put("owners",new JSONArray().put(new JSONObject().put("id","B").put("name","Owner B")).put(new JSONObject().put("id","A").put("name","Owner A"))).put("versionCode",14).put("activation",new JSONObject().put("remainingSeconds",100));
  JSONObject keys=new JSONObject(),b=ProtocolJson.copy(a);b.getJSONObject("activation").put("remainingSeconds",1);b.put("owners",new JSONArray().put(a.getJSONArray("owners").get(1)).put(a.getJSONArray("owners").get(0)));
  String original=RegistrationPayload.fingerprint(a,keys,"https://service.test");assertEquals(original,RegistrationPayload.fingerprint(b,keys,"https://service.test"));
  b.put("versionCode",15);assertNotEquals(original,RegistrationPayload.fingerprint(b,keys,"https://service.test"));b.put("versionCode",14);b.getJSONArray("owners").getJSONObject(0).put("name","Changed owner");assertNotEquals(original,RegistrationPayload.fingerprint(b,keys,"https://service.test"));
 }
}
