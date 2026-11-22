package mr.alkarna.mobile.approved;

public class RecoveryFailureProbe {
 private static int assertions=0;
 private static void same(Object expected,Object actual){assertions++;if(!expected.equals(actual))throw new AssertionError(expected+" != "+actual);}
 public static void main(String[] args){
  for(String code:new String[]{"RECOVERY_REGISTRATION_REQUIRED","RECOVERY_OWNER_UNREGISTERED","RECOVERY_DEVICE_REVIEW_REQUIRED","RECOVERY_PHONE_NOT_CURRENT","RECOVERY_RESET_IN_PROGRESS","RECOVERY_PERMISSION_EXPIRED","RECOVERY_INVALID_PROOF","RECOVERY_RATE_LIMITED"})same(code,RecoveryFailure.http(409,code));
  same("RECOVERY_DEVICE_REVIEW_REQUIRED",RecoveryFailure.http(403,"raw-private-server-message"));
  same("RECOVERY_REQUEST_CONFLICT",RecoveryFailure.http(409,null));same("RECOVERY_RATE_LIMITED",RecoveryFailure.http(429,""));same("RECOVERY_SERVICE_UNAVAILABLE",RecoveryFailure.http(500,""));same("RECOVERY_NETWORK",RecoveryFailure.http(0,""));
  String id="12345678-1234-5678-9012-123456789abc";same(id,RecoveryFailure.requestId(id));for(String raw:new String[]{"token-secret",id+" password", "<script>"})same("",RecoveryFailure.requestId(raw));
  same("request",RecoveryFailure.phase("request"));same("recovery",RecoveryFailure.phase("untrusted-text"));same("recovery",RecoveryFailure.phase(null));
  same(true,RecoveryFailure.refreshRegistration("RECOVERY_REGISTRATION_REQUIRED"));same(true,RecoveryFailure.refreshRegistration("RECOVERY_OWNER_UNREGISTERED"));for(String code:new String[]{"RECOVERY_INVALID_PROOF","RECOVERY_PHONE_NOT_CURRENT","RECOVERY_RESET_IN_PROGRESS",""})same(false,RecoveryFailure.refreshRegistration(code));
  same("RECOVERY_SECURE_CONNECTION",RecoveryFailure.local(new javax.net.ssl.SSLHandshakeException("private")));
  same("RECOVERY_NETWORK",RecoveryFailure.local(new java.net.SocketTimeoutException("private")));
  same("RECOVERY_LOCAL_ACTIVATION",RecoveryFailure.local(new java.io.IOException("Original activation unavailable for registration")));
  same("RECOVERY_RESET_IN_PROGRESS",RecoveryFailure.local(new java.io.IOException("Accounting reset is awaiting its final receipt")));
  same("RECOVERY_INVALID_PROOF",RecoveryFailure.local(new java.io.IOException("Recovery scope mismatch")));
  same("RECOVERY_LOCAL_STATE",RecoveryFailure.local(new java.security.GeneralSecurityException("private")));
  same("RECOVERY_LOCAL_STATE",RecoveryFailure.local(new java.io.IOException("Recovery journal missing; local license is unaffected")));
  same("RECOVERY_LOCAL_STATE",RecoveryFailure.local(new Exception()));
  System.out.println("PASS native RecoveryFailure: "+assertions+" assertions, closed codes, safe references, local/network separation and no authorization bypass");
 }
}
