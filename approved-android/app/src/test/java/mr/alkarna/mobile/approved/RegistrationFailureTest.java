package mr.alkarna.mobile.approved;
import org.junit.Test;
import static org.junit.Assert.*;

public class RegistrationFailureTest {
 @Test public void repairedTlsOrNetworkCanRecoverWithoutChangingInstallation() {
  for(Exception failure:new Exception[]{new javax.net.ssl.SSLHandshakeException("untrusted certificate"),new javax.net.ssl.SSLPeerUnverifiedException("hostname mismatch"),new java.net.SocketTimeoutException(),new ContatoolsClient.ServiceFailure(429,false,60000)}){
   assertFalse(ContatoolsClient.permanentRegistrationFailure(failure));
   RegistrationPolicy policy=new RegistrationPolicy();policy.decide("same-installation",1000,true,false,0);policy.started(31000);policy.failed(31000,ContatoolsClient.permanentRegistrationFailure(failure),60000,0);
   assertEquals("scheduled",policy.decide("same-installation",32000,true,false,0).stage);
   assertEquals("run",policy.decide("same-installation",60000,true,false,0).stage);
  }
  assertTrue(ContatoolsClient.permanentRegistrationFailure(new ContatoolsClient.ServiceFailure(403,true,0)));
 }
}
