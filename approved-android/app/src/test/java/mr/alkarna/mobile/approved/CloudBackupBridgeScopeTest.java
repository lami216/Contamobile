package mr.alkarna.mobile.approved;

import org.junit.Test;
import static org.junit.Assert.*;

public class CloudBackupBridgeScopeTest {
 @Test public void expiredBeginCannotStartAfterItsCancelOvertakesTheQueue(){CloudBackupBridgeScope scope=new CloudBackupBridgeScope();CloudBackupBridgeScope.Ticket queued=scope.reserve("old");scope.cancel("old");assertFalse(scope.allowed(queued));CloudBackupBridgeScope.Ticket retry=scope.reserve("new");assertTrue(scope.allowed(retry));scope.release(queued);assertTrue(scope.allowed(retry));}
 @Test public void departedPageCannotStartOrFinishAnOldBegin(){CloudBackupBridgeScope scope=new CloudBackupBridgeScope();long oldPage=scope.page();CloudBackupBridgeScope.Ticket queued=scope.reserve("old");scope.changed();assertFalse(scope.current(oldPage));assertFalse(scope.allowed(queued));assertTrue(scope.allowed(scope.reserve("new")));}
 @Test public void lateCompletionDoesNotReleaseANewerTicket(){CloudBackupBridgeScope scope=new CloudBackupBridgeScope();CloudBackupBridgeScope.Ticket old=scope.reserve("same"),current=scope.reserve("same");assertFalse(scope.allowed(old));scope.release(old);scope.cancel("same");assertFalse(scope.allowed(current));}
}
