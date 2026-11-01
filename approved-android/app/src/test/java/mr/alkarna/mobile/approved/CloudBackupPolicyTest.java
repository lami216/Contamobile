package mr.alkarna.mobile.approved;

import org.junit.Test;
import static org.junit.Assert.*;
import org.json.JSONObject;
import java.time.*;
import java.nio.charset.StandardCharsets;

public class CloudBackupPolicyTest {
 @Test public void validatesCadenceAndKeepsOptInOffByDefault() throws Exception {
  JSONObject defaults=CloudBackupPolicy.settings(new JSONObject());assertFalse(defaults.getBoolean("consent"));assertEquals("connected",defaults.getString("schedule"));
  for(JSONObject invalid:new JSONObject[]{new JSONObject().put("schedule","poll"),new JSONObject().put("time","24:00"),new JSONObject().put("time","9:5"),new JSONObject().put("weekday",0)})try{CloudBackupPolicy.settings(invalid);fail("Invalid settings accepted");}catch(Exception expected){}
 }
 @Test public void dailyPreferredTimeIsLocalAndNotAnExactAlarm() throws Exception {
  JSONObject daily=CloudBackupPolicy.settings(new JSONObject().put("schedule","daily").put("time","21:00"));ZoneId utc=ZoneOffset.UTC;
  assertEquals(Instant.parse("2026-11-01T21:00:00Z").toEpochMilli(),CloudBackupPolicy.nextPreferred(daily,Instant.parse("2026-11-01T20:00:00Z").toEpochMilli(),utc));
  assertEquals(Instant.parse("2026-11-02T21:00:00Z").toEpochMilli(),CloudBackupPolicy.nextPreferred(daily,Instant.parse("2026-11-01T21:00:00Z").toEpochMilli(),utc));
 }
 @Test public void weeklyAndDstRemainCalendarBased() throws Exception {
  JSONObject weekly=CloudBackupPolicy.settings(new JSONObject().put("schedule","weekly").put("weekday",1).put("time","09:00"));
  assertEquals(Instant.parse("2026-11-02T09:00:00Z").toEpochMilli(),CloudBackupPolicy.nextPreferred(weekly,Instant.parse("2026-11-01T20:00:00Z").toEpochMilli(),ZoneOffset.UTC));
  JSONObject daily=CloudBackupPolicy.settings(new JSONObject().put("schedule","daily").put("time","02:30"));
  assertEquals(Instant.parse("2026-03-29T01:30:00Z").toEpochMilli(),CloudBackupPolicy.nextPreferred(daily,Instant.parse("2026-03-28T23:00:00Z").toEpochMilli(),ZoneId.of("Europe/Paris")));
 }
 @Test public void backoffIsBoundedAndRevisionsCannotMoveBackward(){assertEquals(15000,CloudBackupPolicy.backoff(1,0));assertEquals(30000,CloudBackupPolicy.backoff(1,1));assertEquals(6*3600000L,CloudBackupPolicy.backoff(20,1));assertTrue(CloudBackupPolicy.older("12","13"));assertFalse(CloudBackupPolicy.older("14","13"));}
 @Test public void exportBoundaryRejectsKeysSessionsAndWrongOrigin() throws Exception {
  JSONObject password=new JSONObject().put("algorithm","PBKDF2-SHA256").put("iterations",210000),user=new JSONObject().put("password",password);
  JSONObject value=new JSONObject().put("format","alkarna-web-backup").put("schemaVersion",1).put("createdAt","2026-11-01T00:00:00Z").put("state",new JSONObject().put("originId","shop")).put("users",new org.json.JSONArray().put(user));
  CloudBackupStore.validateSnapshot(value.toString().getBytes(StandardCharsets.UTF_8),"shop");
  CloudBackupStore.validateSnapshot(value.toString().getBytes(StandardCharsets.UTF_8),null); // Authorized transfer: preview preserves original identity.
  try{CloudBackupStore.validateSnapshot(value.toString().getBytes(StandardCharsets.UTF_8),"other");fail();}catch(Exception expected){}
  value.put("session","forbidden");try{CloudBackupStore.validateSnapshot(value.toString().getBytes(StandardCharsets.UTF_8),"shop");fail();}catch(Exception expected){}
  value.remove("session");user.put("password","plaintext");try{CloudBackupStore.validateSnapshot(value.toString().getBytes(StandardCharsets.UTF_8),"shop");fail();}catch(Exception expected){}
 }
 @Test public void acceptsActualDatabaseCloudSnapshotFixture() throws Exception {
  byte[] bytes;try(java.io.InputStream in=getClass().getResourceAsStream("/cloud-snapshot.json")){assertNotNull("Actual ShopDatabase.cloudSnapshot fixture",in);bytes=in.readAllBytes();}
  JSONObject fixture=new JSONObject(new String(bytes,StandardCharsets.UTF_8));assertEquals(5,fixture.length());assertFalse(fixture.has("originId"));assertEquals("cloud-cross-layer-shop",fixture.getJSONObject("state").getString("originId"));
  CloudBackupStore.validateSnapshot(bytes,"cloud-cross-layer-shop");
  fixture.put("originId","cloud-cross-layer-shop");try{CloudBackupStore.validateSnapshot(fixture.toString().getBytes(StandardCharsets.UTF_8),"cloud-cross-layer-shop");fail("Noncanonical extra root accepted");}catch(Exception expected){}
 }
}
