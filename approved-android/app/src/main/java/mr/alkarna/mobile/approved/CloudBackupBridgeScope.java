package mr.alkarna.mobile.approved;

import java.util.HashMap;
import java.util.Map;

/** A canceled/departed page cannot create staging later from the bounded bridge queue. */
final class CloudBackupBridgeScope {
 static final class Ticket {final String id;final long page;boolean canceled;Ticket(String id,long page){this.id=id;this.page=page;}}
 private long page;
 private final Map<String,Ticket> queued=new HashMap<>();
 synchronized long page(){return page;}
 synchronized boolean current(long value){return page==value;}
 synchronized Ticket reserve(String id){Ticket old=queued.remove(id);if(old!=null)old.canceled=true;Ticket ticket=new Ticket(id,page);queued.put(id,ticket);return ticket;}
 synchronized boolean allowed(Ticket ticket){return !ticket.canceled&&ticket.page==page;}
 synchronized void release(Ticket ticket){if(queued.get(ticket.id)==ticket)queued.remove(ticket.id);}
 synchronized void cancel(String id){Ticket ticket=queued.remove(id);if(ticket!=null)ticket.canceled=true;}
 synchronized void changed(){page++;for(Ticket ticket:queued.values())ticket.canceled=true;queued.clear();}
}
