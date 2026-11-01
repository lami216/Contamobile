package mr.alkarna.mobile.approved;

import android.app.job.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

/** OS-managed network-constrained job survives process death and device restart. */
public final class CloudBackupJobService extends JobService {
 private final ConcurrentHashMap<JobParameters,AtomicBoolean> jobs=new ConcurrentHashMap<>();
 @Override public boolean onStartJob(JobParameters params){AtomicBoolean stop=new AtomicBoolean(false);jobs.put(params,stop);new Thread(()->{CloudBackupManager manager=null;try{manager=CloudBackupManager.get(this);manager.process(stop,true);}catch(Exception ignored){}finally{jobs.remove(params);if(!stop.get()){jobFinished(params,false);if(manager!=null)manager.resume();}}},"AlKarnaBackupJob").start();return true;}
 @Override public boolean onStopJob(JobParameters params){AtomicBoolean stop=jobs.remove(params);if(stop!=null)stop.set(true);return true;}
}
