package mr.alkarna.mobile.approved;
import org.junit.Test;
import static org.junit.Assert.*;

public class RecoveryFailureTest {
 @Test public void rejectedChallengeIsVerificationFailureRatherThanNetworkOutage(){
  ContatoolsClient.ServiceFailure failure=new ContatoolsClient.ServiceFailure(0,true,0,"RECOVERY_INVALID_RESPONSE","");assertEquals("RECOVERY_INVALID_RESPONSE",failure.code);assertTrue(failure.permanent);assertEquals(0,failure.status);
 }
 @Test public void non200EnvelopeKeepsOnlyClosedDiagnostics(){
  String id="12345678-1234-5678-9012-123456789abc";
  ContatoolsClient.ServiceFailure failure=ContatoolsClient.responseFailure(409,1234,"{\"code\":\"RECOVERY_PHONE_NOT_CURRENT\",\"requestId\":\""+id+"\",\"message\":\"private-customer-token\"}");
  assertEquals(409,failure.status);assertEquals(1234,failure.retryAt);assertTrue(failure.permanent);assertEquals("RECOVERY_PHONE_NOT_CURRENT",failure.code);assertEquals(id,failure.requestId);assertFalse(failure.toString().contains("private"));
 }
 @Test public void oldInvalidAndOversizedResponsesUseStatusFallback(){
  for(String body:new String[]{"<html>not JSON</html>","{\"message\":\"private-error\"}","{\"code\":\"untrusted-code\",\"requestId\":\"private-secret\"}","{\"code\":{},\"requestId\":[]}"," ".repeat(17000)}){
   ContatoolsClient.ServiceFailure failure=ContatoolsClient.responseFailure(403,0,body);assertEquals("RECOVERY_DEVICE_REVIEW_REQUIRED",failure.code);assertEquals("",failure.requestId);assertFalse(failure.toString().contains("private"));
  }
  ContatoolsClient.ServiceFailure retry=ContatoolsClient.responseFailure(429,60000,"{}");assertFalse(retry.permanent);assertEquals(60000,retry.retryAt);assertEquals("RECOVERY_RATE_LIMITED",retry.code);
 }
}
