package mr.alkarna.mobile.approved;

import java.time.*;
import java.time.temporal.TemporalAdjusters;
import org.json.JSONObject;

/** Timing only. A preferred time is not an exact alarm or a promise during force-stop. */
final class CloudBackupPolicy {
 static final int MAX_BYTES=8*1024*1024,CHUNK_BYTES=49152,JOB_ID=0x434242;
 static JSONObject settings(JSONObject input) throws Exception {
  String mode=input.optString("schedule","connected"),time=input.optString("time","21:00");int day=input.optInt("weekday",1);
  if(!mode.matches("connected|daily|weekly")||!time.matches("(?:[01][0-9]|2[0-3]):[0-5][0-9]")||day<1||day>7)throw new Exception("INVALID_SETTINGS");
  long window=input.optLong("snapshotWindowMs",1500);
  if(window!=1500&&window!=15000&&window!=60000&&window!=300000)throw new Exception("INVALID_SETTINGS");
  long spread=input.optLong("startSpreadMs",0);if(spread!=0&&spread!=30000)throw new Exception("INVALID_SETTINGS");
  return new JSONObject().put("consent",input.optBoolean("consent",false)).put("schedule",mode).put("time",time).put("weekday",day).put("wifiOnly",input.optBoolean("wifiOnly",false)).put("snapshotWindowMs",window).put("startSpreadMs",spread);
 }
 static long nextPreferred(JSONObject settings,long now,ZoneId zone){
  if("connected".equals(settings.optString("schedule")))return now;
  LocalTime time=LocalTime.parse(settings.optString("time","21:00"));ZonedDateTime current=Instant.ofEpochMilli(now).atZone(zone),next=current.toLocalDate().atTime(time).atZone(zone);
  if("weekly".equals(settings.optString("schedule"))){next=next.with(TemporalAdjusters.nextOrSame(DayOfWeek.of(settings.optInt("weekday",1))));if(!next.isAfter(current))next=next.plusWeeks(1);}
  else if(!next.isAfter(current))next=next.plusDays(1);
  return next.toInstant().toEpochMilli();
 }
 static long backoff(int failures,double jitter){long ceiling=Math.min(6*3600000L,30000L*(1L<<Math.min(Math.max(0,failures-1),10)));return (long)(ceiling*(0.5+Math.max(0,Math.min(1,jitter))*0.5));}
 static long spreadAt(long due,long spread,double jitter){return due+(long)(Math.max(0,Math.min(30000,spread))*Math.max(0,Math.min(1,jitter)));}
 static boolean checkpointProgress(int completed,int total,long elapsed){return completed==1||completed==total||completed%8==0||elapsed>=1000;}
 static boolean older(String candidate,String current){try{return Long.parseLong(candidate)<Long.parseLong(current);}catch(NumberFormatException ignored){return false;}}
 private CloudBackupPolicy(){}
}
