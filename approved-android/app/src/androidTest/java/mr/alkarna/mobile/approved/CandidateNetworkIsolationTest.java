package mr.alkarna.mobile.approved;
import android.net.*;
import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import static org.junit.Assert.*;
/** Ensure synthetic license fixtures cannot reach the configured production service. */
public class CandidateNetworkIsolationTest {
 @Test public void syntheticFixturesHaveNoValidatedExternalNetwork(){
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  ConnectivityManager manager=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);
  NetworkCapabilities caps=manager.getNetworkCapabilities(manager.getActiveNetwork());
  assertTrue("Production transport must remain offline in synthetic device tests",caps==null||!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED));
 }
}
