package mr.alkarna.mobile.approved;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.provider.Settings;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import javax.crypto.*;
import javax.crypto.SecretKey;

/** Activation never lives in the business database or its import/export files. */
final class DeviceLicense {
    // AtomicFile protects a single write, not stale writers from separate Activities.
    private static final Object STORE_LOCK=new Object();
    private static final String KEY_ALIAS="alkarna.activation.state.v2";
    private final AtomicFile file;
    private final SharedPreferences preferences;
    private final String device;
    private final LicenseClock clock=new LicenseClock();
    private final KeyStore keyStore;
    private JSONObject state,document;
    private long lastPersist;
    private String loadFailure;
    private String documentFailure;
    private String observedDisk,observedPreferences;
    DeviceLicense(Context context) throws Exception {
        String id=Settings.Secure.getString(context.getContentResolver(),Settings.Secure.ANDROID_ID);
        if(id==null||id.trim().isEmpty())throw new Exception("تعذّر استخراج كود الهاتف");
        device=LicenseVerifier.deviceCode("android|"+id);
        file=new AtomicFile(new File(context.getNoBackupFilesDir(),"activation-v2.json"));
        preferences=context.getSharedPreferences("activation-v2",Context.MODE_PRIVATE);
        keyStore=KeyStore.getInstance("AndroidKeyStore");keyStore.load(null);
        synchronized(STORE_LOCK){load(true);}
    }
    String deviceCode(){return device;}
    synchronized JSONObject registrationSnapshot() throws Exception {synchronized(STORE_LOCK){
        refresh();
        // Read the original verified document; never install it again or restart its clock.
        if(document==null||loadFailure!=null||documentFailure!=null)throw new IOException("Original activation unavailable for registration");
        JSONObject current=status(),p=document.getJSONObject("payload");Object remaining=JSONObject.NULL;
        if("temporary".equals(p.getString("type"))){JSONObject active=state.optJSONObject("activeLicense");remaining=current.optBoolean("valid")?(long)current.getJSONObject("license").getDouble("remainingSeconds"):active==null?0L:Math.max(0L,(long)Math.ceil(active.optDouble("remainingMs",0)/1000));}
        return new JSONObject().put("licenseDocument",document.toString()).put("activation",new JSONObject().put("valid",current.optBoolean("valid")).put("remainingSeconds",remaining).put("status",current.optBoolean("valid")?"valid":current.optString("code","unavailable")));
    }
    }
    private SecretKey stateKey(boolean create) throws Exception {
        if(keyStore.containsAlias(KEY_ALIAS))return (SecretKey)keyStore.getKey(KEY_ALIAS,null);
        if(!create)throw new Exception("Missing activation key");
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,KeyProperties.PURPOSE_SIGN|KeyProperties.PURPOSE_VERIFY).setDigests(KeyProperties.DIGEST_SHA256).build());return generator.generateKey();
    }
    private byte[] mac(String payload,boolean create) throws Exception {Mac mac=Mac.getInstance("HmacSHA256");mac.init(stateKey(create));return mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));}
    private JSONObject decode(String encoded){
        if(encoded==null)return null;
        try{JSONObject envelope=new JSONObject(encoded);String payload=envelope.getString("payload");if(!MessageDigest.isEqual(Base64.getUrlDecoder().decode(envelope.getString("mac")),mac(payload,false)))return null;JSONObject data=new JSONObject(new String(Base64.getUrlDecoder().decode(payload),StandardCharsets.UTF_8));if(data.getInt("stateVersion")!=2||!device.equals(data.getString("deviceId"))||!(data.opt("consumedLicenseIds") instanceof JSONArray))return null;return data;}catch(Exception e){return null;}
    }
    private void load(boolean repairCopies) throws Exception {
        String disk=null,second=preferences.getString("state",null);try{disk=new String(file.readFully(),StandardCharsets.UTF_8);}catch(FileNotFoundException ignored){}catch(IOException e){loadFailure="LICENSE_STATE_INVALID";}
        observedDisk=disk;observedPreferences=second;
        state=null;document=null;documentFailure=null;
        JSONObject a=decode(disk),b=decode(second);
        if(a==null&&b==null){
            if(disk!=null||second!=null||keyStore.containsAlias(KEY_ALIAS)||loadFailure!=null){loadFailure="LICENSE_STATE_INVALID";return;}
            state=new JSONObject().put("stateVersion",2).put("deviceId",device).put("consumedLicenseIds",new JSONArray()).put("document",JSONObject.NULL).put("activeLicense",JSONObject.NULL);return;
        }
        state=a!=null?a:b;
        if(a!=null&&b!=null){
            // A newer revision is a completed replacement; equal revisions merge toward the stricter clock state.
            if(b.optLong("revision")>a.optLong("revision"))state=b;
            Set<String> consumed=new LinkedHashSet<>();for(JSONObject copy:new JSONObject[]{a,b}){JSONArray ids=copy.getJSONArray("consumedLicenseIds");for(int i=0;i<ids.length();i++)consumed.add(ids.getString(i));}state.put("consumedLicenseIds",new JSONArray(consumed));
            JSONObject control=StandaloneControl.merge(a.optJSONObject("standaloneControl"),b.optJSONObject("standaloneControl"));if(control!=null)state.put("standaloneControl",control);
            JSONObject x=a.optJSONObject("activeLicense"),y=b.optJSONObject("activeLicense");
            if(x!=null&&y!=null&&x.getString("licenseId").equals(y.getString("licenseId"))){JSONObject active=state.getJSONObject("activeLicense");if("temporary".equals(active.optString("type")))active.put("remainingMs",Math.min(x.getDouble("remainingMs"),y.getDouble("remainingMs")));active.put("lastWallClockMs",Math.max(x.getLong("lastWallClockMs"),y.getLong("lastWallClockMs")));active.put("expired",x.optBoolean("expired")||y.optBoolean("expired"));active.put("clockRollbackDetected",x.optBoolean("clockRollbackDetected")||y.optBoolean("clockRollbackDetected"));}
        }
        try{JSONObject doc=state.optJSONObject("document");if(doc!=null)document=LicenseVerifier.verify(doc.toString(),device);}catch(LicenseVerifier.Rejected e){documentFailure=e.code;}
        if(repairCopies)persist();
    }
    /** Refresh another Activity's authenticated write without turning every status into a disk write. */
    private void refresh() throws Exception {
        String disk=null;try{disk=new String(file.readFully(),StandardCharsets.UTF_8);}catch(FileNotFoundException absent){}
        String second=preferences.getString("state",null);
        if(Objects.equals(disk,observedDisk)&&Objects.equals(second,observedPreferences))return;
        JSONObject previous=state;JSONObject previousDocument=document;String previousDocumentFailure=documentFailure;
        JSONObject oldActive=previous==null?null:previous.optJSONObject("activeLicense");
        if(oldActive!=null&&"temporary".equals(oldActive.optString("type")))try{clock.evaluate(oldActive,System.currentTimeMillis(),SystemClock.elapsedRealtime());}catch(LicenseVerifier.Rejected strictState){/* Keep the expired/rollback flag for the same license below. */}
        load(false);
        if(loadFailure!=null||state==null)return;
        if(previous!=null&&previous.optLong("revision")>state.optLong("revision")){state=previous;document=previousDocument;documentFailure=previousDocumentFailure;}
        if(previous!=null){
            Set<String> consumed=new LinkedHashSet<>();for(JSONObject copy:new JSONObject[]{previous,state}){JSONArray ids=copy.getJSONArray("consumedLicenseIds");for(int i=0;i<ids.length();i++)consumed.add(ids.getString(i));}state.put("consumedLicenseIds",new JSONArray(consumed));
            JSONObject control=StandaloneControl.merge(previous.optJSONObject("standaloneControl"),state.optJSONObject("standaloneControl"));if(control!=null)state.put("standaloneControl",control);
            JSONObject active=state.optJSONObject("activeLicense");
            if(oldActive!=null&&active!=null&&oldActive.optString("licenseId").equals(active.optString("licenseId"))){
                if("temporary".equals(active.optString("type")))active.put("remainingMs",Math.min(oldActive.getDouble("remainingMs"),active.getDouble("remainingMs")));
                active.put("lastWallClockMs",Math.max(oldActive.getLong("lastWallClockMs"),active.getLong("lastWallClockMs")));
                active.put("expired",oldActive.optBoolean("expired")||active.optBoolean("expired"));active.put("clockRollbackDetected",oldActive.optBoolean("clockRollbackDetected")||active.optBoolean("clockRollbackDetected"));
            }
        }
        clock.reset();lastPersist=SystemClock.elapsedRealtime();
    }
    private void persist() throws Exception {
        String payload=Base64.getUrlEncoder().withoutPadding().encodeToString(LicenseVerifier.json(state).getBytes(StandardCharsets.UTF_8));
        String encoded=new JSONObject().put("payload",payload).put("mac",Base64.getUrlEncoder().withoutPadding().encodeToString(mac(payload,true))).toString();
        FileOutputStream stream=null;try{stream=file.startWrite();stream.write(encoded.getBytes(StandardCharsets.UTF_8));file.finishWrite(stream);}catch(Exception e){if(stream!=null)file.failWrite(stream);throw e;}
        observedDisk=encoded;
        if(!preferences.edit().putString("state",encoded).commit())throw new IOException("Activation persistence failed");observedPreferences=encoded;lastPersist=SystemClock.elapsedRealtime();
    }
    synchronized JSONObject status(){synchronized(STORE_LOCK){return statusLocked();}}
    synchronized String documentHash() throws Exception {synchronized(STORE_LOCK){refresh();return document==null?"":ProtocolJson.hash(document);}}
    /** Only a fresh, verified service decision enters the authenticated licence replicas. */
    synchronized JSONObject control(JSONObject envelope,JSONObject issuers,String installation,String fingerprint,String nonce,String hash) throws Exception {synchronized(STORE_LOCK){
        refresh();if(loadFailure!=null||state==null)throw new IOException("LICENSE_STATE_INVALID");
        JSONObject decision=StandaloneControl.verify(envelope,issuers,BuildConfig.APPLICATION_ID,installation,fingerprint,device,nonce,hash);
        JSONObject next=new JSONObject(state.toString());next.put("standaloneControl",StandaloneControl.record(state.optJSONObject("standaloneControl"),decision,document==null?"":ProtocolJson.hash(document))).put("revision",state.optLong("revision")+1);
        state=next;try{persist();return ProtocolJson.copy(decision);}catch(Exception failed){loadFailure="LICENSE_STORAGE_ERROR";throw failed;}
    }}
    private void controlAllows(JSONObject verified) throws Exception {
        if(loadFailure!=null||state==null)throw new IOException("LICENSE_STATE_INVALID");
        String denial=StandaloneControl.denial(state.optJSONObject("standaloneControl"),ProtocolJson.hash(verified));
        if(!denial.isEmpty())throw new LicenseVerifier.Rejected(denial,"DEVICE_BANNED".equals(denial)?"حُظر تفعيل هذا الهاتف. بيانات المحل محفوظة":"أُبطل هذا التفعيل. بيانات المحل محفوظة");
    }
    private void checkpointDeniedClock() throws Exception {
        JSONObject active=state.optJSONObject("activeLicense");
        if(document!=null&&active!=null&&"temporary".equals(active.optString("type")))try{clock.evaluate(active,System.currentTimeMillis(),SystemClock.elapsedRealtime());}catch(LicenseVerifier.Rejected expiredOrRollback){/* Preserve the original stricter flags while administrative denial remains visible. */}
        JSONObject entitlement=state.optJSONObject("phoneEntitlement");if(entitlement!=null)try{EntitlementClock.remaining(entitlement.getJSONObject("payload"),entitlement.getJSONObject("clock"),System.currentTimeMillis(),SystemClock.elapsedRealtime());}catch(Exception strictClock){/* Never replace or restart this existing fixed deadline. */}
        if(SystemClock.elapsedRealtime()-lastPersist>=7000)persist();
    }
    /** Verify the server decision before persisting it. Active adoption requires the exact installed document. */
    synchronized boolean entitlement(JSONObject envelope,JSONObject issuers,String installation,String fingerprint) throws Exception {return entitlement(envelope,issuers,installation,fingerprint,0);}
    synchronized boolean entitlement(JSONObject envelope,JSONObject issuers,String installation,String fingerprint,long observedElapsed) throws Exception {synchronized(STORE_LOCK){
        refresh();if(loadFailure!=null||state==null)throw new IOException("LICENSE_STATE_INVALID");
        JSONObject p=PhoneEntitlement.snapshot(envelope,issuers,installation,fingerprint,device),old=state.optJSONObject("phoneEntitlement");
        PhoneEntitlement.monotonic(old==null?null:old.getJSONObject("payload"),p);
        if("active".equals(p.getString("status"))&&(document==null||!p.getString("licenseDocumentHash").equals(ProtocolJson.hash(document))))return false;
        JSONObject next=new JSONObject(state.toString());
        next.put("phoneEntitlement",new JSONObject().put("payload",p).put("envelope",ProtocolJson.copy(envelope)).put("clock",EntitlementClock.begin(p,old==null||!"active".equals(p.getString("status"))?null:old.getJSONObject("clock"),System.currentTimeMillis(),SystemClock.elapsedRealtime(),observedElapsed)));
        next.put("revision",next.optLong("revision")+1);state=next;try{persist();return true;}catch(Exception failed){loadFailure="LICENSE_STORAGE_ERROR";throw failed;}
    }}
    /** Licence plus fixed deadline are one authenticated durable write, never two windows. */
    synchronized JSONObject installEntitlement(String content,JSONObject envelope,JSONObject issuers,String installation,String fingerprint) throws Exception {return installEntitlement(content,envelope,issuers,installation,fingerprint,0);}
    synchronized JSONObject installEntitlement(String content,JSONObject envelope,JSONObject issuers,String installation,String fingerprint,long observedElapsed) throws Exception {synchronized(STORE_LOCK){
        refresh();if(loadFailure!=null||state==null)throw new IOException("LICENSE_STATE_INVALID");
        JSONObject verified=LicenseVerifier.verify(content,device),p=PhoneEntitlement.snapshot(envelope,issuers,installation,fingerprint,device),old=state.optJSONObject("phoneEntitlement");
        controlAllows(verified);
        PhoneEntitlement.monotonic(old==null?null:old.getJSONObject("payload"),p);
        if(document!=null&&"perpetual".equals(document.getJSONObject("payload").getString("type"))&&"temporary".equals(verified.getJSONObject("payload").getString("type")))throw new IOException("PERPETUAL_DOWNGRADE_REFUSED");
        if(!"active".equals(p.getString("status"))||!p.getString("licenseDocumentHash").equals(ProtocolJson.hash(verified))||!p.getString("licenseId").equals(verified.getJSONObject("payload").getString("licenseId"))||!p.getString("type").equals(verified.getJSONObject("payload").getString("type")))throw new IOException("ENTITLEMENT_LICENSE_MISMATCH");
        if(document!=null&&ProtocolJson.hash(document).equals(ProtocolJson.hash(verified))){entitlement(envelope,issuers,installation,fingerprint,observedElapsed);return statusLocked();}
        JSONObject clock=EntitlementClock.begin(p,null,System.currentTimeMillis(),SystemClock.elapsedRealtime(),observedElapsed);
        if(EntitlementClock.remaining(p,clock,System.currentTimeMillis(),SystemClock.elapsedRealtime())==0)throw new IOException("ENTITLEMENT_EXPIRED");
        JSONObject next=new JSONObject(state.toString()),licensePayload=verified.getJSONObject("payload");
        JSONArray consumed=next.getJSONArray("consumedLicenseIds");for(int i=0;i<consumed.length();i++)if(licensePayload.getString("licenseId").equals(consumed.getString(i)))throw new IOException("LICENSE_ALREADY_USED");
        consumed.put(licensePayload.getString("licenseId"));boolean temporary="temporary".equals(licensePayload.getString("type"));
        next.put("activeLicense",new JSONObject().put("licenseId",licensePayload.getString("licenseId")).put("type",licensePayload.getString("type")).put("remainingMs",temporary?licensePayload.getDouble("durationSeconds")*1000:JSONObject.NULL).put("lastWallClockMs",System.currentTimeMillis()).put("expired",false).put("clockRollbackDetected",false));
        next.put("phoneEntitlement",new JSONObject().put("payload",p).put("envelope",ProtocolJson.copy(envelope)).put("clock",clock));
        next.put("document",verified).put("revision",next.optLong("revision")+1);state=next;
        try{persist();document=verified;documentFailure=null;this.clock.reset();return statusLocked();}catch(Exception failed){loadFailure="LICENSE_STORAGE_ERROR";throw failed;}
    }}
    private JSONObject statusLocked(){
        JSONObject result=new JSONObject();try {
            refresh();
            result.put("deviceId",device).put("valid",false);
            if(loadFailure!=null)throw new LicenseVerifier.Rejected(loadFailure,"تعذّر التحقق من بيانات التفعيل المحفوظة. تواصل مع مسؤول التفعيل");
            JSONObject control=state.optJSONObject("standaloneControl");if(control!=null){JSONObject p=control.getJSONObject("snapshot");result.put("control",new JSONObject().put("controlGeneration",p.getLong("controlGeneration")).put("activationFence",p.getLong("activationFence")).put("banned",p.getBoolean("banned")));String denial=StandaloneControl.denial(control,document==null?"":ProtocolJson.hash(document));if(!denial.isEmpty()){checkpointDeniedClock();return result.put("code",denial).put("reason","DEVICE_BANNED".equals(denial)?"حُظر تفعيل هذا الهاتف. بيانات المحل محفوظة":"أُبطل هذا التفعيل. بيانات المحل محفوظة");}}
            JSONObject entitlement=state.optJSONObject("phoneEntitlement");long termRemaining=Long.MAX_VALUE;
            if(entitlement!=null){JSONObject p=entitlement.getJSONObject("payload");result.put("entitlement",ProtocolJson.copy(p));
                if("suspended".equals(p.getString("status")))return result.put("code","ENTITLEMENT_SUSPENDED").put("reason","أوقفت الإدارة تفعيل هذا الهاتف. بيانات المحل محفوظة");
                if(!"active".equals(p.getString("status")))return result.put("code","pending".equals(p.getString("status"))?"ENTITLEMENT_PENDING":"ENTITLEMENT_REPLACED").put("reason","pending".equals(p.getString("status"))?"بانتظار موافقة استبدال الهاتف":"استُبدل هذا الهاتف. بيانات المحل محفوظة على الجهاز");
                if(document==null||!p.getString("licenseDocumentHash").equals(ProtocolJson.hash(document)))throw new IOException("ENTITLEMENT_LICENSE_MISMATCH");
                termRemaining=EntitlementClock.remaining(p,entitlement.getJSONObject("clock"),System.currentTimeMillis(),SystemClock.elapsedRealtime());
                if(termRemaining==0)return result.put("code","ENTITLEMENT_EXPIRED").put("reason","انتهت مدة التفعيل. اطلب التجديد من الإدارة");
            }
            if(document==null)return result.put("code",documentFailure==null?"LICENSE_REQUIRED":documentFailure).put("reason",documentFailure==null?"فعّل هذا الهاتف للبدء":"ملف الترخيص المحفوظ غير صالح. أضف ملف تفعيل جديدًا");
            JSONObject payload=document.getJSONObject("payload");Object remaining=JSONObject.NULL;
            if(document.getInt("version")==2){JSONObject active=state.optJSONObject("activeLicense");if(active==null||!payload.getString("licenseId").equals(active.optString("licenseId")))throw new LicenseVerifier.Rejected("LICENSE_REQUIRED","أضف ملف تفعيل هذا الهاتف");
                if("temporary".equals(active.getString("type"))){try{remaining=Math.ceil(clock.evaluate(active,System.currentTimeMillis(),SystemClock.elapsedRealtime())/1000);}catch(LicenseVerifier.Rejected e){persist();throw e;}if(SystemClock.elapsedRealtime()-lastPersist>=7000)persist();}}
            if(termRemaining!=Long.MAX_VALUE)remaining=remaining==JSONObject.NULL?Math.ceil(termRemaining/1000d):Math.min(((Number)remaining).doubleValue(),Math.ceil(termRemaining/1000d));
            if(entitlement!=null&&SystemClock.elapsedRealtime()-lastPersist>=7000)persist();
            return result.put("valid",true).put("license",new JSONObject().put("licenseId",payload.getString("licenseId")).put("customerName",payload.getString("customerName")).put("storeName",payload.getString("storeName")).put("type",payload.getString("type")).put("remainingSeconds",remaining));
        }catch(Exception e){try{result.put("valid",false).put("code",e instanceof LicenseVerifier.Rejected?((LicenseVerifier.Rejected)e).code:"LICENSE_STORAGE_ERROR").put("reason",e instanceof LicenseVerifier.Rejected?e.getMessage():"تعذّر حفظ التفعيل. تحقّق من مساحة التخزين وأعد فتح التطبيق");}catch(Exception ignored){}return result;}
    }
    synchronized void checkpoint(){synchronized(STORE_LOCK){try{refresh();if(state==null||document==null)return;statusLocked();persist();}catch(Exception e){loadFailure="LICENSE_STORAGE_ERROR";}}}
    synchronized JSONObject install(String content) throws Exception {synchronized(STORE_LOCK){return installLocked(content);}}
    /** Delivery retry acknowledges the same document without restarting its clock. */
    synchronized JSONObject installOnline(String content) throws Exception {
    synchronized (STORE_LOCK) {
      JSONObject verified = LicenseVerifier.verify(content, device);
      refresh();
      controlAllows(verified);
      if (document != null
          && document
              .getJSONObject("payload")
              .getString("licenseId")
              .equals(verified.getJSONObject("payload").getString("licenseId"))) {
        if (!ProtocolJson.hash(document).equals(ProtocolJson.hash(verified)))
          throw new IOException("LICENSE_REPLAY_MISMATCH");
        return statusLocked();
      }
      return installLocked(content, true);
    }
  }
    private JSONObject installLocked(String content) throws Exception {
        return installLocked(content,false);
    }
    private JSONObject installLocked(String content,boolean onlineDelivery) throws Exception {
        refresh();
        JSONObject verified=LicenseVerifier.verify(content,device);
        controlAllows(verified);
        if(verified.optString("keyId").startsWith("contatools-online-v2:")&&!onlineDelivery)throw new LicenseVerifier.Rejected("ONLINE_APPROVAL_REQUIRED","هذا الترخيص يحتاج موافقة التفعيل المباشر داخل التطبيق");
        if(loadFailure!=null||state==null)throw new LicenseVerifier.Rejected("LICENSE_STATE_INVALID","تعذّر التحقق من سجل التفعيل. تواصل مع مسؤول التفعيل");
        if(state.optJSONObject("phoneEntitlement")!=null)throw new LicenseVerifier.Rejected("ENTITLEMENT_APPROVAL_REQUIRED","هذا الهاتف مرتبط بتفعيل موثّق. استلم التفعيل من كونتا تولز");
        JSONObject next=new JSONObject(state.toString()),p=verified.getJSONObject("payload");String id=p.getString("licenseId");
        if(verified.getInt("version")==2){JSONArray consumed=next.getJSONArray("consumedLicenseIds");for(int i=0;i<consumed.length();i++)if(id.equals(consumed.getString(i)))throw new LicenseVerifier.Rejected("LICENSE_ALREADY_USED","ملف التفعيل مستخدم من قبل. اطلب ملفًا جديدًا للتجديد");consumed.put(id);
            boolean temporary="temporary".equals(p.getString("type"));next.put("activeLicense",new JSONObject().put("licenseId",id).put("type",p.getString("type")).put("remainingMs",temporary?p.getDouble("durationSeconds")*1000:JSONObject.NULL).put("lastWallClockMs",System.currentTimeMillis()).put("expired",false).put("clockRollbackDetected",false));
        }else next.put("activeLicense",JSONObject.NULL);
        next.put("document",verified).put("revision",next.optLong("revision")+1);
        state=next;try{persist();document=verified;documentFailure=null;clock.reset();return status();}catch(Exception e){loadFailure="LICENSE_STORAGE_ERROR";throw new LicenseVerifier.Rejected(loadFailure,"لم يكتمل حفظ التفعيل. أعد فتح التطبيق قبل المحاولة مجددًا");}
    }
}
