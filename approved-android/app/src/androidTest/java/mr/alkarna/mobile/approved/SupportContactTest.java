package mr.alkarna.mobile.approved;

import android.content.Intent;
import android.net.Uri;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class SupportContactTest {
    @Test public void onlyExplicitSupportDestinationsAreAccepted() {
        assertEquals(Intent.ACTION_DIAL,SupportContact.intentFor(Uri.parse("tel:49823328")).getAction());
        assertEquals(Intent.ACTION_VIEW,SupportContact.intentFor(Uri.parse("https://wa.me/22249823328")).getAction());
        String code="AKD-1234-5678-9012-3456-7890";
        Uri draft=Uri.parse("https://wa.me/22249823328").buildUpon().appendQueryParameter("text","أريد تفعيل الكرنه. "+code).build();
        assertTrue(SupportContact.intentFor(draft).getData().getQueryParameter("text").contains(code));
        for(String blocked:new String[]{"https://example.com/22249823328","http://wa.me/22249823328","https://wa.me/22249823329","https://wa.me/22249823328/","https://wa.me:443/22249823328","https://evil@wa.me/22249823328","https://wa.me/22249823328?phone=123","https://wa.me/22249823328?text=a&text=b","https://wa.me/22249823328#x","tel:1234","tel:49823328,123","javascript:alert(1)"})assertNull(blocked,SupportContact.intentFor(Uri.parse(blocked)));
    }
}
