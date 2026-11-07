package mr.alkarna.mobile.approved;

import java.io.IOException;
import org.json.*;

/** A signed server sample advances with elapsed time; receiving it never changes endsAt. */
final class EntitlementClock {
  static JSONObject begin(JSONObject snapshot,JSONObject previous,long wall,long mono) throws Exception {
    return begin(snapshot,previous,wall,mono,0);
  }
  static JSONObject begin(JSONObject snapshot,JSONObject previous,long wall,long mono,long observedElapsed) throws Exception {
    if(observedElapsed<0)throw new IOException("INVALID_ENTITLEMENT_OBSERVATION");
    // Full native request elapsed time is an upper bound on the age of its
    // signed server sample. Delayed delivery cannot add time to the term.
    long server=Math.addExact(PhoneEntitlement.number(snapshot,"issuedAt"),observedElapsed);
    if(previous!=null)server=Math.max(server,effective(previous,wall,mono));
    return new JSONObject().put("serverAt",server).put("wallAt",wall).put("monoAt",mono).put("lastWall",wall);
  }
  static long effective(JSONObject clock,long wall,long mono) throws Exception {
    long last=clock.getLong("lastWall");
    if(wall+120000L<last)throw new IOException("ENTITLEMENT_CLOCK_ROLLBACK");
    long elapsed=Math.max(0,wall-clock.getLong("wallAt"));
    if(mono>=clock.getLong("monoAt"))elapsed=Math.max(elapsed,mono-clock.getLong("monoAt"));
    clock.put("lastWall",Math.max(last,wall));
    return Math.addExact(clock.getLong("serverAt"),elapsed);
  }
  static long remaining(JSONObject snapshot,JSONObject clock,long wall,long mono) throws Exception {
    if(!"active".equals(snapshot.getString("status")))throw new IOException("ENTITLEMENT_REPLACED");
    if(snapshot.isNull("endsAt"))return Long.MAX_VALUE;
    return Math.max(0,PhoneEntitlement.number(snapshot,"endsAt")-effective(clock,wall,mono));
  }
}
