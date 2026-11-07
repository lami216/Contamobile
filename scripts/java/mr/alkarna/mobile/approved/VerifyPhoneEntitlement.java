package mr.alkarna.mobile.approved;

import java.nio.file.Files;
import java.nio.file.Path;
import org.json.JSONObject;

/** Isolated protocol interoperability helper. Never reads a phone or production key. */
public final class VerifyPhoneEntitlement {
  public static void main(String[] args) throws Exception {
    if(args.length!=1)throw new IllegalArgumentException("synthetic-entitlement-vector.json");
    JSONObject input=new JSONObject(Files.readString(Path.of(args[0])));
    JSONObject issuers=input.getJSONObject("issuers");
    String installation=input.getString("installationId"),fingerprint=input.getString("keyFingerprint"),device=input.getString("deviceCode");
    JSONObject snapshot=PhoneEntitlement.snapshot(input.getJSONObject("entitlement"),issuers,installation,fingerprint,device);
    if(input.has("previous")){
      JSONObject previous=PhoneEntitlement.snapshot(input.getJSONObject("previous"),issuers,installation,fingerprint,device);
      PhoneEntitlement.monotonic(previous,snapshot);
    }
    if(input.has("offer")){
      JSONObject offer=PhoneEntitlement.offer(input.getJSONObject("offer"),issuers,installation,fingerprint,device,false,0);
      PhoneEntitlement.claimed(offer,snapshot,input.getString("intentId"),input.getString("documentHash"));
    }
    System.out.println(new JSONObject().put("verified",true).put("payload",snapshot));
  }
}
