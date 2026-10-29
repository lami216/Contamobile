package mr.alkarna.mobile.approved;

/** The support entry is a fixed user action, never a transport for paths or commands. */
final class RecoverySupportEntry {
 static final String LINK="contamobile://data-rescue";
 static boolean accepts(String action,String uri){return "android.intent.action.VIEW".equals(action)&&LINK.equals(uri);}
 private RecoverySupportEntry(){}
}
