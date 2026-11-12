package mr.alkarna.mobile.approved;

import java.util.Arrays;

/** Exact native account frames. A normal local login may also request remote admission. */
final class AccountEntryPages {
    private AccountEntryPages() {}
    private static boolean page(String origin, String url, String name) {
        return origin != null && url != null && url.split("\\?", 2)[0].equals(origin + "/assets/approved/" + name);
    }
    static boolean index(String origin, String url) { return page(origin, url, "index.html"); }
    static boolean entry(String origin, String url) { return page(origin, url, "access.html"); }
    static boolean mayContinue(String origin, String url) { return index(origin, url) || entry(origin, url); }
    static boolean allows(String origin, String url, String command) {
        if (command == null || !mayContinue(origin, url)) return false;
        // Reading or writing central accounting stays on the admitted application frame.
        return index(origin, url) || !Arrays.asList("bootstrap", "bootstrap-complete", "online-call", "online-status", "online-pending", "online-ack").contains(command);
    }
}
