package mr.alkarna.mobile.approved;

import org.json.JSONObject;

/** Countdown starts at installation. Closed time counts; backward clock changes lock persistently. */
final class LicenseClock {
    private String licenseId;
    private double checkpointRemaining;
    private long checkpointWall,checkpointMono;
    void reset(){licenseId=null;}
    double evaluate(JSONObject active,long wall,long mono) throws Exception {
        if(active.optBoolean("expired"))throw new LicenseVerifier.Rejected("LICENSE_EXPIRED","انتهت مدة الترخيص. أضف ملف تفعيل جديدًا");
        if(active.optBoolean("clockRollbackDetected"))throw new LicenseVerifier.Rejected("LICENSE_CLOCK_ROLLBACK","تم اكتشاف إرجاع ساعة الجهاز. تواصل مع مسؤول التفعيل");
        long last=active.getLong("lastWallClockMs");
        if(wall+120000L<last||(licenseId!=null&&wall+120000L<checkpointWall)){
            active.put("clockRollbackDetected",true);return evaluate(active,wall,mono);
        }
        String id=active.getString("licenseId");double remaining;
        if(!id.equals(licenseId)){
            remaining=Math.max(0,active.getDouble("remainingMs")-Math.max(0,wall-last));
            licenseId=id;checkpointRemaining=remaining;checkpointWall=wall;checkpointMono=mono;
        }else remaining=Math.max(0,checkpointRemaining-Math.max(Math.max(0,mono-checkpointMono),Math.max(0,wall-checkpointWall)));
        active.put("remainingMs",remaining);active.put("lastWallClockMs",Math.max(last,wall));
        if(remaining<=0){active.put("expired",true);return evaluate(active,wall,mono);}return remaining;
    }
}
