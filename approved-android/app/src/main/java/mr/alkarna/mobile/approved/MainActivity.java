package mr.alkarna.mobile.approved;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.*;
import android.widget.FrameLayout;
import android.widget.Toast;
import androidx.webkit.WebViewAssetLoader;
import org.json.JSONObject;
import java.io.*;
import java.util.concurrent.ConcurrentHashMap;

/** Offline host for the seller-approved runtime. No HTTP server. Only explicit support taps can open an external app. */
public final class MainActivity extends Activity {
    public static final String ORIGIN = "https://appassets.androidplatform.net";
    private WebView web;
    private FrameLayout root;
    private ValueCallback<Uri[]> chooser;
    private String scannerRequest;
    private Export pendingExport;
    private DeviceLicense licensing;
    private AccountAccessClient accounts;
    private boolean accessPage;
    private ContatoolsClient administration;
    private AccountingResetClient accountingReset;
    private DeviceLifecycleClient deviceLifecycle;
    private RecoveryPreflight dataRescue;
    // An Activity recreation must never capture live Chromium storage in this process.
    private static volatile boolean webViewWasCreated;
    static boolean hasCreatedWebView(){return webViewWasCreated;}
    private static final java.util.concurrent.ThreadPoolExecutor administrationQueue=createAdministrationQueue();
    private static final java.util.concurrent.ThreadPoolExecutor accountQueue=createAdministrationQueue();
    private static final java.util.concurrent.ThreadPoolExecutor backupQueue=createAdministrationQueue();
    private android.net.ConnectivityManager.NetworkCallback networkCallback;
    private static java.util.concurrent.ThreadPoolExecutor createAdministrationQueue(){java.util.concurrent.ThreadPoolExecutor queue=new java.util.concurrent.ThreadPoolExecutor(1,1,30,java.util.concurrent.TimeUnit.SECONDS,new java.util.concurrent.ArrayBlockingQueue<>(8));queue.allowCoreThreadTimeOut(true);return queue;}
    private boolean activationPage,activationTransitionPending,transitionToAccess;
    private volatile boolean activityResumed;
    private final Handler licenseTimer=new Handler(Looper.getMainLooper());
    private final Runnable licensePulse=new Runnable(){public void run(){if(!activationPage&&!onlineMode()&&!appAllowed())showAccountAccess();licenseTimer.postDelayed(this,1000);}};
    private final ConcurrentHashMap<String,Export> exports = new ConcurrentHashMap<>();
    private final java.util.Set<String> backupTransfers=ConcurrentHashMap.newKeySet();
    private final CloudBackupBridgeScope backupScope=new CloudBackupBridgeScope();
    private static final int PICK_FILE=21, SAVE_FILE=22, SCAN=23, CAMERA=24;
    private static final long MAX_FILE=64L*1024*1024;
    private static final class Export {
        String id,name,mime; File file; FileOutputStream output; long size;
        Export(String id,String name,String mime,File file) throws IOException {
            this.id=id;this.name=name;this.mime=mime;this.file=file;output=new FileOutputStream(file);
        }
        void cleanup(){try{output.close();}catch(Exception ignored){}file.delete();}
    }
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        try{licensing=new DeviceLicense(this);}catch(Exception e){Log.e("AlKarna","Activation storage unavailable");}
        try{if(licensing!=null)accounts=new AccountAccessClient(this,licensing);}catch(Exception e){Log.e("AlKarna","Account storage unavailable");}
        root=new FrameLayout(this);root.setBackgroundColor(Color.rgb(8,14,25));
        setContentView(root);
        if(Build.VERSION.SDK_INT>=30){
            getWindow().setDecorFitsSystemWindows(false);
            getWindow().getDecorView().setOnApplyWindowInsetsListener((v,insets)->{
                android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.ime());
                root.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;
            });
        }
        dataRescue=new RecoveryPreflight(this,root,licensing,this::initializeWebView);
        if(!dataRescue.intercept(webViewWasCreated))initializeWebView();
    }
    private void initializeWebView(){
        if(web!=null||isFinishing()||isDestroyed())return;
        synchronized(MainActivity.class){
            if(RecoveryPreflight.capturing()){licenseTimer.postDelayed(this::initializeWebView,250);return;}
            webViewWasCreated=true;
        }
        web=new WebView(this);web.setId(View.generateViewId());root.addView(web,new FrameLayout.LayoutParams(-1,-1));
        WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);s.setAllowContentAccess(true);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setJavaScriptCanOpenWindowsAutomatically(false);s.setSupportMultipleWindows(false);s.setTextZoom(100);
        WebView.setWebContentsDebuggingEnabled(false);
        final WebViewAssetLoader assets=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient(){
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap favicon){cancelBackupTransfers();}
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                String path=request.getUrl().getPath();
                boolean activationAsset=path!=null&&(path.matches("/assets/approved/(activation|access|privacy)\\.(html|css|js)")||path.equals("/assets/approved/platform/shared/android-access.mjs")||path.equals("/assets/approved/native-adapter.js")||path.equals("/assets/approved/native.css")||path.startsWith("/assets/approved/assets/"));
                if(!activationAsset&&!appAllowed())return new WebResourceResponse("text/plain","UTF-8",403,"Activation required",java.util.Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
                WebResourceResponse response=assets.shouldInterceptRequest(request.getUrl());
                if(response!=null&&path!=null&&path.endsWith(".mjs"))response.setMimeType("text/javascript");
                return response!=null?response:new WebResourceResponse("text/plain","UTF-8",403,"Blocked",java.util.Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                if(request.isForMainFrame()&&request.hasGesture()&&trusted()){
                    Intent support=SupportContact.intentFor(request.getUrl());
                    if(support!=null)try{startActivity(support);}catch(android.content.ActivityNotFoundException e){Toast.makeText(MainActivity.this,NativeUi.text(MainActivity.this,"تعذّر فتح وسيلة التواصل. الرقم: 49823328"),Toast.LENGTH_LONG).show();}
                }
                return true;
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){Log.e("AlKarna",request.getUrl()+": "+error.getDescription());}
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(chooser!=null)chooser.onReceiveValue(null);chooser=callback;
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType(activationPage?"*/*":"application/json").addCategory(Intent.CATEGORY_OPENABLE);
                try{startActivityForResult(intent,PICK_FILE);}catch(Exception e){chooser.onReceiveValue(null);chooser=null;}
                return true;
            }
            @Override public boolean onConsoleMessage(ConsoleMessage message){
                if(message.messageLevel()==ConsoleMessage.MessageLevel.ERROR)Log.e("AlKarnaJS",message.message());return true;
            }
            @Override public void onPermissionRequest(PermissionRequest request){request.deny();}
        });
        web.addJavascriptInterface(new NativeHost(),"NativeHost");
        showAccountAccess();
        licenseTimer.postDelayed(licensePulse,1000);
    }
    public WebView getWebView(){return web;}
    private boolean licenseAllowed(){return licensing!=null&&licensing.status().optBoolean("valid");}
    private boolean onlineMode(){return accounts!=null&&accounts.onlineMode();}
    private boolean appAllowed(){return accounts!=null&&accounts.admitted();}
    private void showAccountAccess(){
        if(web==null||isFinishing()||isDestroyed())return;
        String current=web.getUrl();
        if(!activationPage&&current!=null&&current.startsWith(ORIGIN+"/assets/approved/index.html")){
            if(activationTransitionPending)return;
            transitionToAccess=true;activationTransitionPending=true;continueActivationTransition();return;
        }
        loadAccountAccess();
    }
    private void loadAccountAccess(){
        activationTransitionPending=false;activationPage=true;accessPage=true;
        web.loadUrl(ORIGIN+"/assets/approved/access.html");
    }
    private void showActivation(){
        if((activationPage&&!accessPage)||activationTransitionPending||web==null||isFinishing()||isDestroyed())return;
        transitionToAccess=false;activationTransitionPending=true;continueActivationTransition();
    }
    private void continueActivationTransition(){
        if(!activationTransitionPending||web==null||isFinishing()||isDestroyed()){activationTransitionPending=false;return;}
        String current=web.getUrl();if(current!=null&&!"about:blank".equals(current)&&!current.startsWith(ORIGIN+"/assets/approved/")){activationTransitionPending=false;return;}
        // A term expiry blocks new actions immediately, but an already accepted write may finish.
        web.evaluateJavascript("(()=>{if(typeof window.karnaPersistenceBusy==='function'&&window.karnaPersistenceBusy())return false;if(typeof window.karnaSavePosDraft==='function')window.karnaSavePosDraft();return true})()",ready->{
            if(!activationTransitionPending||isFinishing()||isDestroyed())return;
            if("false".equals(ready)){licenseTimer.postDelayed(this::continueActivationTransition,250);return;}
            if(transitionToAccess){loadAccountAccess();return;}
            activationTransitionPending=false;activationPage=true;accessPage=false;web.loadUrl(ORIGIN+"/assets/approved/activation.html");
        });
    }
    private void openApp(){if(!appAllowed())return;activationTransitionPending=false;activationPage=false;accessPage=false;web.loadUrl(ORIGIN+"/assets/approved/index.html");}
    private JSONObject licenseStatus(){return licensing==null?value("reason","تعذّر فتح بيانات التفعيل. أعد فتح التطبيق"):licensing.status();}
    private void result(String id,JSONObject value){runOnUiThread(()->{if(web!=null&&!isDestroyed())web.evaluateJavascript("window.__nativeResult&&window.__nativeResult("+JSONObject.quote(id)+","+value+")",null);});}
    private JSONObject value(String key,Object value){JSONObject object=new JSONObject();try{object.put(key,value);}catch(Exception ignored){}return object;}
    private void error(String id,String message){result(id,value("error",NativeUi.text(this,message)));}
    private boolean trusted(){return web!=null&&web.getUrl()!=null&&web.getUrl().startsWith(ORIGIN+"/assets/approved/");}
    private void administration(String id,String command,String content){runOnUiThread(()->{
        if(!trusted()||activationPage||onlineMode()||!licenseAllowed()){error(id,"تعذّر التحقق من التفعيل المحلي");return;}
        try{administrationQueue.execute(()->{
            try{
                if(!activityResumed&&(command.equals("register")||command.equals("poll")||command.equals("ack"))){result(id,value("stage","paused"));return;}
                if(administration==null){if(BuildConfig.CONTATOOLS_ORIGIN.isEmpty()){result(id,value("stage","unconfigured"));return;}administration=new ContatoolsClient(MainActivity.this,licensing,BuildConfig.CONTATOOLS_ORIGIN,new JSONObject(BuildConfig.CONTATOOLS_ISSUERS));}
                if(content.length()>16384)throw new IOException("Invalid recovery input");JSONObject response;
                switch(command){
                    case "register":response=administration.registerAutomatically(new JSONObject(content));break;
                    case "register-now":response=administration.register(new JSONObject(content));break;
                    case "request":response=administration.request(content);break;
                    case "poll":response=administration.poll();break;
                    case "prepare":response=administration.prepare(new JSONObject(content));break;
                    case "resume":response=administration.resume();break;
                    case "resume-local":response=administration.resumeLocal();break;
                    case "ack":response=administration.acknowledgePending();break;
                    case "finish":JSONObject receipt=new JSONObject(content);response=administration.finishLocally(receipt.getString("grantId"),receipt.getString("intentId"));break;
                    default:throw new IOException("Unknown administration operation");
                }result(id,response);
            }catch(ContatoolsClient.ServiceFailure e){JSONObject failure=value("error","تعذّر الاتصال بخدمة الاستعادة؛ أعد المحاولة لاحقًا.");try{failure.put("retryAt",e.retryAt).put("permanent",e.permanent).put("status",e.status);}catch(Exception ignored){}result(id,failure);
            }catch(Exception e){error(id,"تعذّر الاتصال بخدمة الاستعادة. لم يُغيّر التفعيل؛ أعد المحاولة أو تواصل مع الدعم.");}
        });}catch(java.util.concurrent.RejectedExecutionException full){JSONObject failure=value("error","هناك طلب جارٍ. أعد المحاولة بعد قليل.");try{failure.put("retryAt",System.currentTimeMillis()+5000);}catch(Exception ignored){}result(id,failure);}
    });}
    private void watchNetwork(){
        if(networkCallback!=null)return;android.net.ConnectivityManager manager=(android.net.ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);if(manager==null)return;
        networkCallback=new android.net.ConnectivityManager.NetworkCallback(){
            @Override public void onCapabilitiesChanged(android.net.Network network,android.net.NetworkCapabilities caps){
                if(caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_VALIDATED))accountNetworkEvent(true);else accountNetworkEvent(false);
            }
            @Override public void onLost(android.net.Network network){accountNetworkEvent(false);}
        };
        try{manager.registerDefaultNetworkCallback(networkCallback);}catch(Exception unavailable){networkCallback=null;}
    }
    private void accountNetworkEvent(boolean connected){
        if(!connected&&accounts!=null)accounts.disconnected();
        runOnUiThread(()->{if(trusted()&&!activationPage)web.evaluateJavascript("window.dispatchEvent(new Event('"+(connected?"alkarna-network-available":"alkarna-account-offline")+"'))",null);});
    }
    private void accountRequest(String id,String command,String content){long page=backupScope.page();runOnUiThread(()->{
        if(!trusted()||accounts==null||content==null||content.length()>1048576||command==null){accountFailure(id,"ACCOUNT_UNAVAILABLE",0);return;}
        String url=web.getUrl();boolean index=url!=null&&url.split("\\?",2)[0].equals(ORIGIN+"/assets/approved/index.html");
        boolean entry=url!=null&&url.split("\\?",2)[0].equals(ORIGIN+"/assets/approved/access.html");
        if(!(index||entry)||(!entry&&java.util.Arrays.asList("login","legacy","offline-status","offline-activate").contains(command))
            ||(!index&&java.util.Arrays.asList("bootstrap","bootstrap-complete","online-call","online-status","online-pending","online-ack").contains(command))){accountFailure(id,"ACCOUNT_PAGE_INVALID",0);return;}
        try{JSONObject payload=new JSONObject(content);
            if(!index&&"offline-request".equals(command)&&(payload.has("localOwnerId")||payload.has("localShopId"))){accountFailure(id,"OFFLINE_LOCAL_SCOPE_REQUIRED",0);return;}
            accountQueue.execute(()->{
                try{
                    if(!backupScope.current(page)||isDestroyed()||!activityResumed)throw new IOException("ACCOUNT_PAGE_CLOSED");
                    JSONObject response=accounts.command(command,payload);
                    if(backupScope.current(page)&&!isDestroyed())result(id,response);
                }catch(Exception failure){if(backupScope.current(page))accountFailure(id,failure instanceof AccountAccessClient.Failure?((AccountAccessClient.Failure)failure).code:failure.getMessage(),failure instanceof AccountAccessClient.Failure?((AccountAccessClient.Failure)failure).status:0);}
            });
        }catch(java.util.concurrent.RejectedExecutionException busy){accountFailure(id,"ACCOUNT_BUSY",0);}
        catch(Exception invalid){accountFailure(id,"ACCOUNT_REQUEST_INVALID",0);}
    });}
    private void accountFailure(String id,String code,int status){
        String safe=code!=null&&code.matches("[A-Z0-9_]{3,100}")?code:"ACCOUNT_UNAVAILABLE";
        JSONObject answer=value("error",NativeUi.french(this)?"Impossible de terminer la demande. Vérifiez la connexion et réessayez.":"تعذّر إكمال الطلب. تحقّق من الاتصال وأعد المحاولة.");
        try{answer.put("code",safe).put("status",status);}catch(Exception ignored){}result(id,answer);
    }
    private void stopWatchingNetwork(){if(networkCallback==null)return;android.net.ConnectivityManager manager=(android.net.ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);try{if(manager!=null)manager.unregisterNetworkCallback(networkCallback);}catch(Exception ignored){}networkCallback=null;}
    private void accountingResetRequest(String id,String command,String content){long page=backupScope.page();runOnUiThread(()->{
        if(!trusted()||activationPage||onlineMode()||!licenseAllowed()||!backupScope.current(page)){error(id,"تعذّر التحقق من التفعيل المحلي");return;}
        // No support queue, server response or ACK is needed to close after a
        // locally committed reset. Never expose a general remote close command.
        if("exit-after-reset".equals(command)){
            try{
                if(!activityResumed||accountingReset==null||content==null||content.length()>4096)throw new IOException("RESET_EXIT_UNAVAILABLE");
                boolean close=accountingReset.authorizeExit(new JSONObject(content));
                if(!close){result(id,value("stage","already-closed"));return;}
                WebView completedPage=web;
                String reply="window.__nativeResult&&window.__nativeResult("+JSONObject.quote(id)+",{stage:'closing'})";
                completedPage.evaluateJavascript(reply,ignored->{
                    if(!isDestroyed()&&!isFinishing()&&web==completedPage&&backupScope.current(page))finishAndRemoveTask();
                });
            }catch(Exception failure){
                JSONObject answer=value("error",NativeUi.text(MainActivity.this,"تم حفظ بداية المحاسبة الجديدة. أعد فتح التطبيق للمتابعة؛ التفعيل محفوظ."));
                try{answer.put("code","RESET_EXIT_UNAVAILABLE");}catch(Exception ignored){}
                result(id,answer);
            }
            return;
        }
        // Authenticate local reset state independently of the optional support channel,
        // its journal, endpoint or queue. Never manufacture an absent journal or key.
        if("resume-local".equals(command))try{
            if(content==null||content.length()>4096||new JSONObject(content).length()!=0)throw new IOException("RESET_REQUEST");
            JSONObject local=AccountingResetStore.localResume(MainActivity.this,licensing);if(local!=null){result(id,local);return;}
        }catch(Exception failure){JSONObject answer=value("error",NativeUi.text(MainActivity.this,"تعذّر إكمال طلب التهيئة. تحقّق من النتيجة قبل إعادة المحاولة؛ التفعيل لم يتغير."));try{answer.put("code","RESET_LOCAL_STATE_UNAVAILABLE");}catch(Exception ignored){}result(id,answer);return;}
        try{administrationQueue.execute(()->{
            try{
                if(isDestroyed()||activationPage||!backupScope.current(page))throw new IOException("RESET_PAGE_CLOSED");
                if(!activityResumed&&!(command.equals("resume-local")||command.equals("finish"))){result(id,value("stage","paused"));return;}
                if(content==null||content.length()>4096)throw new IOException("RESET_REQUEST_SIZE");
                if(administration==null){if(BuildConfig.CONTATOOLS_ORIGIN.isEmpty()){result(id,value("stage","unconfigured"));return;}administration=new ContatoolsClient(MainActivity.this,licensing,BuildConfig.CONTATOOLS_ORIGIN,new JSONObject(BuildConfig.CONTATOOLS_ISSUERS));}
                if(accountingReset==null)accountingReset=new AccountingResetClient(MainActivity.this,licensing,new JSONObject(BuildConfig.CONTATOOLS_ISSUERS),administration,target->CloudBackupManager.get(MainActivity.this).pauseForAccountingReset());
                JSONObject payload=new JSONObject(content),answer;
                switch(command){
                    case "poll":answer=accountingReset.poll(payload);break;
                    case "decline":answer=accountingReset.decline(payload);break;
                    case "prepare":answer=accountingReset.prepare(payload);break;
                    case "resume-local":if(payload.length()!=0)throw new IOException("RESET_REQUEST");answer=accountingReset.resumeLocal();break;
                    case "resume":if(payload.length()!=0)throw new IOException("RESET_REQUEST");answer=accountingReset.resume();break;
                    case "finish":answer=accountingReset.finish(payload);break;
                    case "ack":if(payload.length()!=0)throw new IOException("RESET_REQUEST");answer=accountingReset.acknowledge();break;
                    default:throw new IOException("RESET_OPERATION");
                }
                if(!isDestroyed()&&backupScope.current(page))result(id,answer);
            }catch(ContatoolsClient.ServiceFailure failure){JSONObject answer=value("error",NativeUi.text(MainActivity.this,"تعذّر الاتصال بالإدارة. لم تُمسح بيانات المحاسبة؛ أعد المحاولة بعد عودة الاتصال."));try{answer.put("status",failure.status).put("permanent",failure.permanent).put("retryAt",failure.retryAt).put("code","RESET_SERVICE");}catch(Exception ignored){}result(id,answer);}
            catch(Exception failure){JSONObject answer=value("error",NativeUi.text(MainActivity.this,"تعذّر إكمال طلب التهيئة. تحقّق من النتيجة قبل إعادة المحاولة؛ التفعيل لم يتغير."));try{answer.put("code",failure.getMessage()==null?"RESET_UNAVAILABLE":failure.getMessage());}catch(Exception ignored){}result(id,answer);}
        });}catch(java.util.concurrent.RejectedExecutionException full){error(id,"هناك طلب جارٍ. أعد المحاولة بعد قليل.");}
    });}
    private void lifecycleRequest(String id, String command, String content) {
    long page = backupScope.page();
    runOnUiThread(
        () -> {
          if (!trusted() || licensing == null || !backupScope.current(page)) {
            error(id, "تعذّر التحقق من الهاتف");
            return;
          }
          if (command == null || content == null) {
            error(id, "تعذّر التحقق من الطلب");
            return;
          }
          boolean beforeActivation =
              command.equals("enroll") || command.equals("status") || command.equals("activate");
          if (onlineMode() || (!beforeActivation && (activationPage || !licenseAllowed()))) {
            error(id, "يلزم تفعيل الهاتف أولًا");
            return;
          }
          try {
            administrationQueue.execute(
                () -> {
                  try {
                    if (isDestroyed()
                        || !backupScope.current(page)
                        || content == null
                        || content.length() > 16384) throw new IOException("LIFECYCLE_PAGE_CLOSED");
                    if (deviceLifecycle == null)
                      deviceLifecycle = accounts == null ? new DeviceLifecycleClient(this, licensing) : accounts.lifecycleClient();
                    JSONObject input = new JSONObject(content), answer;
                    switch (command) {
                      case "enroll":
                        answer = deviceLifecycle.enroll(input);
                        break;
                      case "status":
                        answer = deviceLifecycle.status();
                        break;
                      case "activate":
                        answer = deviceLifecycle.activate();
                        break;
                      case "bootstrap-list":
                        answer = deviceLifecycle.list(input);
                        break;
                      case "bootstrap-preview":
                        answer = deviceLifecycle.preview(input);
                        break;
                      case "bootstrap-prepare":
                        answer = deviceLifecycle.prepare(input);
                        break;
                      case "bootstrap-finish":
                        answer = deviceLifecycle.finish(input);
                        break;
                      case "resume-local":
                        answer = deviceLifecycle.resumeLocal();
                        break;
                      case "resume":
                        answer = deviceLifecycle.resume();
                        break;
                      default:
                        throw new IOException("INVALID_LIFECYCLE_INPUT");
                    }
                    if (!isDestroyed() && backupScope.current(page)) result(id, answer);
                  } catch (Exception failure) {
                    JSONObject answer =
                        value(
                            "error",
                            NativeUi.text(
                                this, "تعذّر إكمال الطلب الآن. البيانات والتفعيل محفوظان."));
                    try {
                      answer.put("code", CloudBackupManager.errorCode(failure));
                    } catch (Exception ignored) {
                    }
                    if (backupScope.current(page)) result(id, answer);
                  }
                });
          } catch (java.util.concurrent.RejectedExecutionException full) {
            error(id, "هناك طلب جارٍ. أعد المحاولة بعد قليل.");
          }
        });
  }
    private interface BackupAction { JSONObject run(CloudBackupManager manager) throws Exception; }
    private void backupRequest(String id,boolean immediate,BackupAction action){long page=backupScope.page();runOnUiThread(()->{
        if(!trusted()||activationPage||onlineMode()||!licenseAllowed()||!backupScope.current(page)){backupScope.cancel(id);error(id,"تعذّر التحقق من التفعيل المحلي");return;}
        Runnable work=()->{try{if(isDestroyed()||activationPage||!backupScope.current(page))throw new IOException("PAGE_CLOSED");CloudBackupManager manager=CloudBackupManager.get(this);JSONObject answer=action.run(manager);if(!backupScope.current(page)){manager.cancelStage(id);backupTransfers.remove(id);throw new IOException("PAGE_CLOSED");}result(id,answer);}catch(Exception failure){backupScope.cancel(id);JSONObject value=value("error",NativeUi.text(this,"تعذّر تجهيز النسخ الاحتياطي. بيانات المحل محفوظة على الجهاز."));try{value.put("code",CloudBackupManager.errorCode(failure));if(failure instanceof ContatoolsClient.ServiceFailure){ContatoolsClient.ServiceFailure service=(ContatoolsClient.ServiceFailure)failure;value.put("status",service.status).put("retryAt",service.retryAt).put("permanent",service.permanent);}}catch(Exception ignored){}result(id,value);}};
        try{if(immediate)new Thread(work,"AlKarnaBackupPause").start();else backupQueue.execute(work);}catch(java.util.concurrent.RejectedExecutionException full){backupScope.cancel(id);JSONObject value=value("error","هناك طلب نسخ احتياطي جارٍ. أعد المحاولة بعد قليل.");try{value.put("code","STAGE_BUSY");}catch(Exception ignored){}result(id,value);}
    });}
    private void cancelBackupTransfers(){backupScope.changed();for(String id:backupTransfers)try{CloudBackupManager.get(this).cancelStage(id);}catch(Exception ignored){}backupTransfers.clear();}
    public final class NativeHost {
        @JavascriptInterface public void accountAccess(String id,String command,String content){accountRequest(id,command,content);}
        @JavascriptInterface public void openAccountAccess(){runOnUiThread(()->{if(trusted())showAccountAccess();});}
        @JavascriptInterface public void accountContinue(){runOnUiThread(()->{if(trusted()&&accessPage&&appAllowed())openApp();});}
        @JavascriptInterface public void openPrivacy(){runOnUiThread(()->{if(trusted())startActivity(new Intent(MainActivity.this,PrivacyActivity.class));});}
        @JavascriptInterface public void ownerRecovery(String id,String command,String content){administration(id,command,content);}
        @JavascriptInterface public void deviceLifecycle(String id,String command,String content){lifecycleRequest(id,command,content);}
        @JavascriptInterface public void accountingReset(String id,String command,String content){accountingResetRequest(id,command,content);}
        @JavascriptInterface public void cloudBackup(String id,String command,String content){backupRequest(id,"pause".equals(command)||"invalidate".equals(command),manager->{
            if(content==null||content.length()>16384)throw new IOException("INVALID_BACKUP_REQUEST");JSONObject payload=new JSONObject(content);
            switch(command){
                case "status":return manager.status(payload,payload.optBoolean("refresh",false));
                case "configure":return manager.configure(payload);
                case "manual-consent":return manager.manualConsent(payload);
                case "run":return manager.run(payload);
                case "list":return manager.list(payload);
                case "download":return manager.download(payload);
                case "pause":return manager.pause(payload,true);
                case "invalidate":return manager.pause(payload,true);
                default:throw new IOException("INVALID_BACKUP_REQUEST");
            }
        });}
        @JavascriptInterface public void cloudBackupBegin(String id,String content){CloudBackupBridgeScope.Ticket ticket=backupScope.reserve(id);backupRequest(id,false,manager->{try{if(!backupScope.allowed(ticket))throw new IOException("PAGE_CLOSED");if(content==null||content.length()>2048)throw new IOException("INVALID_STAGE");JSONObject result=manager.begin(id,new JSONObject(content));backupTransfers.add(id);if(!backupScope.allowed(ticket)){manager.cancelStage(id);backupTransfers.remove(id);throw new IOException("PAGE_CLOSED");}return result;}finally{backupScope.release(ticket);}});}
        @JavascriptInterface public void cloudBackupAppend(String callbackId,String transferId,String chunk){backupRequest(callbackId,false,manager->{manager.append(transferId,chunk);return value("accepted",true);});}
        @JavascriptInterface public void cloudBackupFinish(String id){backupRequest(id,false,manager->{try{return manager.finish(id);}finally{backupTransfers.remove(id);}});}
        @JavascriptInterface public void cloudBackupCancel(String id){backupScope.cancel(id);runOnUiThread(()->{if(trusted())new Thread(()->{try{CloudBackupManager.get(MainActivity.this).cancelStage(id);}catch(Exception ignored){}backupTransfers.remove(id);},"AlKarnaBackupCancel").start();});}
        @JavascriptInterface public void language(String language){runOnUiThread(()->{if(trusted()&&("ar".equals(language)||"fr".equals(language)))getSharedPreferences("appearance",MODE_PRIVATE).edit().putString("language",language).apply();});}
        @JavascriptInterface public boolean licenseAllowed(){return MainActivity.this.appAllowed();}
        @JavascriptInterface public void openActivation(){runOnUiThread(()->{if(trusted())showActivation();});}
        @JavascriptInterface public void activationStatus(String id){result(id,licenseStatus());}
        @JavascriptInterface public void closeApp(){runOnUiThread(()->{if(trusted()&&appAllowed())finish();});}
        @JavascriptInterface public void activationContinue(){runOnUiThread(()->{if(!trusted()||!activationPage||accessPage||!MainActivity.this.licenseAllowed()||accounts==null)return;try{accounts.command("legacy",new JSONObject());openApp();}catch(Exception failure){showAccountAccess();}});}
        @JavascriptInterface public void copyDeviceCode(){runOnUiThread(()->{if(trusted()&&licensing!=null)((android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(android.content.ClipData.newPlainText("AlKarna device",licensing.deviceCode()));});}
        @JavascriptInterface public void installActivation(String id,String content){
            try{if(licensing==null)throw new IOException();JSONObject status=licensing.install(content);result(id,status);}
            catch(Exception e){error(id,e instanceof LicenseVerifier.Rejected?e.getMessage():"تعذّر حفظ ملف التفعيل");}
        }
        @JavascriptInterface public void theme(String appearance){runOnUiThread(()->{
            if(!trusted())return;boolean light="light".equals(appearance);getSharedPreferences("appearance",MODE_PRIVATE).edit().putString("theme",light?"light":"dark").apply();root.setBackgroundColor(Color.parseColor(light?"#f1f4f8":"#080e19"));
            getWindow().getDecorView().setSystemUiVisibility(light?View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR:0);
        });}
        @JavascriptInterface public void beginExport(String id,String name,String mime){
            try{
                if(!appAllowed())throw new IOException();
                if(!id.matches("[a-f0-9-]{36}")||exports.size()>2)throw new IOException();
                if(!name.matches("[A-Za-z0-9_.-]{1,140}")||!(name.endsWith(".json")||name.endsWith(".pdf")||name.endsWith(".xlsx")))throw new IOException();
                mime=name.endsWith(".json")?"application/json":name.endsWith(".pdf")?"application/pdf":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                Export item=new Export(id,name,mime,File.createTempFile("export-",".tmp",getCacheDir()));exports.put(id,item);result(id,value("ready",true));
            }catch(Exception e){error(id,"تعذّر تجهيز الملف");}
        }
        @JavascriptInterface public void appendExport(String id,String chunk){
            Export item=exports.get(id);if(item==null)return;
            try{if(!appAllowed())throw new IOException();byte[] bytes=Base64.decode(chunk,Base64.NO_WRAP);if(bytes.length>65536||item.size+bytes.length>MAX_FILE)throw new IOException();item.output.write(bytes);item.size+=bytes.length;}
            catch(Exception e){exports.remove(id);item.cleanup();error(id,"تعذّر كتابة الملف");}
        }
        @JavascriptInterface public void finishExport(String id){
            Export item=exports.get(id);if(item==null){error(id,"تعذّر تجهيز الملف");return;}
            try{item.output.getFD().sync();item.output.close();}catch(Exception e){exports.remove(id);item.cleanup();error(id,"تعذّر كتابة الملف");return;}
            runOnUiThread(()->{
                if(!trusted()||!appAllowed()||pendingExport!=null){exports.remove(id);item.cleanup();error(id,"انتظر اكتمال حفظ الملف الحالي");return;}
                pendingExport=item;
                try{startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(item.mime).putExtra(Intent.EXTRA_TITLE,item.name),SAVE_FILE);}
                catch(Exception e){pendingExport=null;exports.remove(id);item.cleanup();error(id,"لا توجد خدمة لحفظ الملفات على هذا الجهاز");}
            });
        }
        @JavascriptInterface public void printDocument(){runOnUiThread(()->{
            if(!trusted()||!appAllowed())return;
            try{((PrintManager)getSystemService(PRINT_SERVICE)).print(NativeUi.french(MainActivity.this)?"AlKarna":"الكرنه",web.createPrintDocumentAdapter(NativeUi.french(MainActivity.this)?"AlKarna":"الكرنه"),new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());}
            catch(Exception e){Toast.makeText(MainActivity.this,NativeUi.text(MainActivity.this,"تعذّر فتح الطباعة"),Toast.LENGTH_LONG).show();}
        });}
        @JavascriptInterface public void scanBarcode(String id){runOnUiThread(()->{
            if(!trusted()||!appAllowed())return;if(scannerRequest!=null){error(id,"قارئ الباركود مفتوح بالفعل");return;}
            scannerRequest=id;
            if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.CAMERA},CAMERA);else startScanner();
        });}
    }
    private void startScanner(){try{startActivityForResult(new Intent(this,ScannerActivity.class),SCAN);}catch(Exception e){error(scannerRequest,"تعذّر تشغيل الكاميرا");scannerRequest=null;}}
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);if(request==CAMERA&&scannerRequest!=null){if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)startScanner();else{error(scannerRequest,"لم يُسمح بالكاميرا. أدخل الباركود يدويًا.");scannerRequest=null;}}}
    @Override protected void onActivityResult(int request,int code,Intent intent){
        super.onActivityResult(request,code,intent);
        if(dataRescue!=null&&dataRescue.onActivityResult(request,code,intent))return;
        if(request==PICK_FILE&&chooser!=null){chooser.onReceiveValue(code==RESULT_OK&&intent!=null?new Uri[]{intent.getData()}:null);chooser=null;}
        if(request==SCAN&&scannerRequest!=null){String id=scannerRequest;scannerRequest=null;if(code==RESULT_OK&&intent!=null)result(id,value("value",intent.getStringExtra("barcode")));else result(id,value("cancelled",true));}
        if(request==SAVE_FILE&&pendingExport!=null){
            Export item=pendingExport;pendingExport=null;
            if(code!=RESULT_OK||intent==null||intent.getData()==null){exports.remove(item.id);item.cleanup();error(item.id,"لم يُحفظ الملف");return;}
            Uri destination=intent.getData();new Thread(()->{
                try(InputStream input=new FileInputStream(item.file);OutputStream output=getContentResolver().openOutputStream(destination,"wt")){
                    if(output==null)throw new IOException();byte[] bytes=new byte[65536];int n;while((n=input.read(bytes))>=0)output.write(bytes,0,n);output.flush();result(item.id,value("saved",true));
                }catch(Exception e){error(item.id,"لم يكتمل حفظ الملف؛ أعد المحاولة");}
                finally{exports.remove(item.id);item.cleanup();}
            }).start();
        }
    }
    @Override protected void onPause(){activityResumed=false;if(onlineMode())accountNetworkEvent(false);stopWatchingNetwork();if(licensing!=null)licensing.checkpoint();super.onPause();}
    @Override protected void onResume(){super.onResume();activityResumed=true;watchNetwork();if(dataRescue!=null&&!onlineMode())dataRescue.probe();if(web!=null&&!activationPage&&!onlineMode()&&!appAllowed())showAccountAccess();if(onlineMode())accountNetworkEvent(true);if(!onlineMode()&&new File(getNoBackupFilesDir(),"cloud-backup-v1/state.bin").exists())new Thread(()->{try{CloudBackupManager.get(this).resume();}catch(Exception ignored){}},"AlKarnaBackupResume").start();}
    @Override public void onBackPressed(){if(dataRescue!=null&&dataRescue.back())return;if(web==null){super.onBackPressed();return;}if(activationPage){if(accessPage)super.onBackPressed();else showAccountAccess();return;}web.evaluateJavascript("(()=>{if(typeof window.karnaPersistenceBusy==='function'&&window.karnaPersistenceBusy())return true;if(typeof modal!=='undefined'&&modal){act('close');return true}if(typeof view!=='undefined'&&view!=='home'){act('back');return true}if(window.karnaBeforeExit&&window.karnaBeforeExit())return true;return false})()",handled->{if(!"true".equals(handled))super.onBackPressed();});}
    @Override protected void onDestroy(){cancelBackupTransfers();if(dataRescue!=null)dataRescue.destroy();licenseTimer.removeCallbacksAndMessages(null);stopWatchingNetwork();if(licensing!=null)licensing.checkpoint();for(Export item:exports.values())item.cleanup();exports.clear();if(chooser!=null)chooser.onReceiveValue(null);if(web!=null){web.removeJavascriptInterface("NativeHost");web.destroy();}super.onDestroy();}
}
