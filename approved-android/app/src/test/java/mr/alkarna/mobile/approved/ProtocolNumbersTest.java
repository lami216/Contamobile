package mr.alkarna.mobile.approved;

import static org.junit.Assert.*;
import java.nio.charset.StandardCharsets;
import org.json.*;
import org.junit.Test;

/** Node-generated wire expectations; no Android context, network or private data. */
public final class ProtocolNumbersTest {
    @Test public void finiteNumbersMatchNodeJsonAndPayloadHashes() throws Exception {
        JSONObject fixture;
        try(java.io.InputStream input=getClass().getResourceAsStream("/protocol-number-vectors.json")){
            assertNotNull("Node-produced numeric vectors must be packaged",input);
            fixture=new JSONObject(new String(input.readAllBytes(),StandardCharsets.UTF_8));
        }
        assertTrue(fixture.getBoolean("synthetic"));
        JSONArray cases=fixture.getJSONArray("cases");
        for(int index=0;index<cases.length();index++){
            JSONObject sample=cases.getJSONObject(index);
            double value=Double.parseDouble(sample.getString("input"));
            assertEquals(sample.getString("input"),sample.getString("json"),ProtocolJson.canonicalNumber(value));
            JSONObject payload=new JSONObject().put("value",value);
            assertEquals(sample.getString("input"),sample.getString("canonicalPayload"),ProtocolJson.canonical(payload));
            assertEquals(sample.getString("input"),sample.getString("payloadHash"),ProtocolJson.hash(payload));
        }
    }
    @Test public void nonfiniteAndUnsafeNumbersFailBeforeHashing() throws Exception {
        for(double value:new double[]{Double.NaN,Double.POSITIVE_INFINITY,Double.NEGATIVE_INFINITY,9007199254740992d,-9007199254740992d}){
            try{ProtocolJson.canonicalNumber(value);fail("Unsupported protocol number must be rejected");}
            catch(Exception expected){assertEquals("Unsupported protocol number",expected.getMessage());}
        }
        assertEquals("0",ProtocolJson.canonicalNumber(-0d));
    }
}
