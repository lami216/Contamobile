package mr.alkarna.mobile.approved;

import org.junit.Test;
import static org.junit.Assert.*;

public final class AccountEntryPagesTest {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    @Test public void unifiedLoginAndContinuationStayOnExactAccountFrames() {
        for (String page : new String[]{"index.html", "access.html", "index.html?lang=fr", "access.html?lang=ar"}) {
            String url = ORIGIN + "/assets/approved/" + page;
            assertTrue(AccountEntryPages.mayContinue(ORIGIN, url));
            for (String command : new String[]{"state", "login", "legacy", "offline-status", "offline-activate"}) assertTrue(command + " on " + page, AccountEntryPages.allows(ORIGIN, url, command));
        }
        for (String command : new String[]{"bootstrap", "bootstrap-complete", "online-call", "online-status", "online-pending", "online-ack"}) {
            assertTrue(AccountEntryPages.allows(ORIGIN, ORIGIN + "/assets/approved/index.html", command));
            assertFalse(AccountEntryPages.allows(ORIGIN, ORIGIN + "/assets/approved/access.html", command));
        }
    }
    @Test public void privacyAssetsForeignOriginsAndPrefixLookalikesCannotRequestOrContinueAccounts() {
        for (String url : new String[]{null, "", "about:blank", "file:///assets/approved/index.html", ORIGIN + "/assets/approved/privacy.html", ORIGIN + "/assets/approved/activation.html", ORIGIN + "/assets/approved/app.js", ORIGIN + "/assets/approved/index.html/other", ORIGIN + "/assets/approved/index.html#other", "https://appassets.androidplatform.net.evil.invalid/assets/approved/index.html", "https://evil.invalid/assets/approved/access.html"}) {
            assertFalse(String.valueOf(url), AccountEntryPages.mayContinue(ORIGIN, url));
            for (String command : new String[]{"state", "login", "legacy", "offline-activate", "online-call"}) assertFalse(command + " on " + url, AccountEntryPages.allows(ORIGIN, url, command));
        }
        assertFalse(AccountEntryPages.allows(ORIGIN, ORIGIN + "/assets/approved/index.html", null));
    }
}
