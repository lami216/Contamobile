package mr.alkarna.mobile.approved;

import java.io.IOException;

/** Rescue authorization clock only. It cannot restart or modify the activation clock. */
final class RecoveryClock {
 static long now(int boot,int savedBoot,long observedTime,long observedElapsed,long elapsed,long wall,long last) throws IOException {
  if(boot<0||boot!=savedBoot||observedTime<=0||observedElapsed<0||elapsed<observedElapsed)throw new IOException("RESCUE_CLOCK_REFRESH_REQUIRED");
  try{return Math.max(Math.max(last,wall),Math.addExact(observedTime,elapsed-observedElapsed));}
  catch(ArithmeticException overflow){throw new IOException("RESCUE_CLOCK_REFRESH_REQUIRED");}
 }
 private RecoveryClock(){}
}
