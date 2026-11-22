package mr.alkarna.mobile.approved;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/** Closed, non-sensitive diagnostics. Never expose response text or native exceptions. */
final class RecoveryFailure {
 private static final Set<String> SERVICE=new HashSet<>(Arrays.asList("RECOVERY_REGISTRATION_REQUIRED","RECOVERY_OWNER_UNREGISTERED","RECOVERY_DEVICE_REVIEW_REQUIRED","RECOVERY_PHONE_NOT_CURRENT","RECOVERY_RESET_IN_PROGRESS","RECOVERY_PERMISSION_EXPIRED","RECOVERY_INVALID_PROOF","RECOVERY_RATE_LIMITED"));
 private static final Set<String> NATIVE=new HashSet<>(Arrays.asList("RECOVERY_NETWORK","RECOVERY_OFFLINE","RECOVERY_SECURE_CONNECTION","RECOVERY_INVALID_RESPONSE"));
 static String http(int status,String supplied){
  if(supplied!=null&&(SERVICE.contains(supplied)||NATIVE.contains(supplied)))return supplied;
  if(status==429)return "RECOVERY_RATE_LIMITED";
  if(status==403)return "RECOVERY_DEVICE_REVIEW_REQUIRED";
  if(status==409)return "RECOVERY_REQUEST_CONFLICT";
  if(status==400||status==401)return "RECOVERY_INVALID_PROOF";
  if(status==404)return "RECOVERY_SERVICE_UNAVAILABLE";
  return status==0?"RECOVERY_NETWORK":"RECOVERY_SERVICE_UNAVAILABLE";
 }
 static String requestId(String value){return value!=null&&value.matches("[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}")?value:"";}
 static String phase(String value){return Arrays.asList("register","register-now","request","poll","prepare","resume","resume-local","ack","finish").contains(value)?value:"recovery";}
 static boolean refreshRegistration(String code){return "RECOVERY_REGISTRATION_REQUIRED".equals(code)||"RECOVERY_OWNER_UNREGISTERED".equals(code);}
 static String local(Exception error){
  if(error instanceof javax.net.ssl.SSLException)return "RECOVERY_SECURE_CONNECTION";
  if(error instanceof java.net.SocketTimeoutException||error instanceof java.net.ConnectException||error instanceof java.net.UnknownHostException||error instanceof java.net.NoRouteToHostException)return "RECOVERY_NETWORK";
  String message=error.getMessage();
  if("Accounting reset is awaiting its final receipt".equals(message))return "RECOVERY_RESET_IN_PROGRESS";
  if("Original activation unavailable for registration".equals(message))return "RECOVERY_LOCAL_ACTIVATION";
  if(Arrays.asList("Invalid local recovery context","Invalid owner target","Only the local owner is eligible","Local owner unavailable","Invalid recovery input","Unknown administration operation").contains(message))return "RECOVERY_LOCAL_INPUT";
  if(message!=null&&(message.startsWith("Recovery scope")||message.startsWith("Recovery authorization")||message.startsWith("Claim scope")||message.equals("Claim was not authorized before expiration")))return "RECOVERY_INVALID_PROOF";
  if("JSONException".equals(error.getClass().getSimpleName()))return "RECOVERY_INVALID_RESPONSE";
  return "RECOVERY_LOCAL_STATE";
 }
}
