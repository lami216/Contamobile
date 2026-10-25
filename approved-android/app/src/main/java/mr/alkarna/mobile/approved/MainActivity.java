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
    private ContatoolsClient administration;
    private final java.util.concurrent.ExecutorService administrationQueue=java.util.concurrent.Executors.newSingleThreadExecutor();
    private boolean activationPage;
    private final Handler licenseTimer=new Handler(Looper.getMainLooper());
    private final Runnable licensePulse=new Runnable(){public void run(){if(!activationPage&&!licenseAllowed())showActivation();licenseTimer.postDelayed(this,1000);}};
    private final ConcurrentHashMap<String,Export> exports = new ConcurrentHashMap<>();
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
        root=new FrameLayout(this);root.setBackgroundColor(Color.rgb(8,14,25));
        web=new WebView(this);web.setId(View.generateViewId());root.addView(web,new FrameLayout.LayoutParams(-1,-1));setContentView(root);
        if(Build.VERSION.SDK_INT>=30){
            getWindow().setDecorFitsSystemWindows(false);
            getWindow().getDecorView().setOnApplyWindowInsetsListener((v,insets)->{
                android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.ime());
                root.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;
            });
        }
        WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);s.setAllowContentAccess(true);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setJavaScriptCanOpenWindowsAutomatically(false);s.setSupportMultipleWindows(false);s.setTextZoom(100);
        WebView.setWebContentsDebuggingEnabled(false);
        final WebViewAssetLoader assets=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                String path=request.getUrl().getPath();
                boolean activationAsset=path!=null&&(path.matches("/assets/approved/activation\\.(html|css|js)")||path.startsWith("/assets/approved/assets/"));
                if(!activationAsset&&!licenseAllowed())return new WebResourceResponse("text/plain","UTF-8",403,"Activation required",java.util.Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
                WebResourceResponse response=assets.shouldInterceptRequest(request.getUrl());
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
        if(licenseAllowed())openApp();else showActivation();
        licenseTimer.postDelayed(licensePulse,1000);
    }
    public WebView getWebView(){return web;}
    private boolean licenseAllowed(){return licensing!=null&&licensing.status().optBoolean("valid");}
    private void showActivation(){if(activationPage)return;activationPage=true;web.evaluateJavascript("typeof savePosDraft==='function'&&savePosDraft()",ignored->web.loadUrl(ORIGIN+"/assets/approved/activation.html"));}
    private void openApp(){if(!licenseAllowed())return;activationPage=false;web.loadUrl(ORIGIN+"/assets/approved/index.html");}
    private JSONObject licenseStatus(){return licensing==null?value("reason","تعذّر فتح بيانات التفعيل. أعد فتح التطبيق"):licensing.status();}
    private void result(String id,JSONObject value){runOnUiThread(()->web.evaluateJavascript("window.__nativeResult&&window.__nativeResult("+JSONObject.quote(id)+","+value+")",null));}
    private JSONObject value(String key,Object value){JSONObject object=new JSONObject();try{object.put(key,value);}catch(Exception ignored){}return object;}
    private void error(String id,String message){result(id,value("error",NativeUi.text(this,message)));}
    private boolean trusted(){return web!=null&&web.getUrl()!=null&&web.getUrl().startsWith(ORIGIN+"/assets/approved/");}
    private void administration(String id,String command,String content){runOnUiThread(()->{
        if(!trusted()||activationPage||!licenseAllowed()){error(id,"تعذّر التحقق من التفعيل المحلي");return;}
        administrationQueue.execute(()->{
            try{
                if(administration==null){if(BuildConfig.CONTATOOLS_ORIGIN.isEmpty()){result(id,value("stage","unconfigured"));return;}administration=new ContatoolsClient(MainActivity.this,licensing,BuildConfig.CONTATOOLS_ORIGIN,new JSONObject(BuildConfig.CONTATOOLS_ISSUERS));}
                if(content.length()>16384)throw new IOException("Invalid recovery input");JSONObject response;
                switch(command){
                    case "register":response=administration.register(new JSONObject(content));break;
                    case "request":response=administration.request(content);break;
                    case "poll":response=administration.poll();break;
                    case "prepare":response=administration.prepare(new JSONObject(content));break;
                    case "resume":response=administration.resume();break;
                    case "finish":JSONObject receipt=new JSONObject(content);response=administration.finish(receipt.getString("grantId"),receipt.getString("intentId"));break;
                    default:throw new IOException("Unknown administration operation");
                }result(id,response);
            }catch(Exception e){error(id,"تعذّر الاتصال بخدمة الاستعادة. لم يُغيّر التفعيل؛ أعد المحاولة أو تواصل مع الدعم.");}
        });
    });}
    public final class NativeHost {
        @JavascriptInterface public void ownerRecovery(String id,String command,String content){administration(id,command,content);}
        @JavascriptInterface public void language(String language){runOnUiThread(()->{if(trusted()&&("ar".equals(language)||"fr".equals(language)))getSharedPreferences("appearance",MODE_PRIVATE).edit().putString("language",language).apply();});}
        @JavascriptInterface public boolean licenseAllowed(){return MainActivity.this.licenseAllowed();}
        @JavascriptInterface public void openActivation(){runOnUiThread(()->{if(trusted())showActivation();});}
        @JavascriptInterface public void activationStatus(String id){result(id,licenseStatus());}
        @JavascriptInterface public void closeApp(){runOnUiThread(()->{if(trusted()&&licenseAllowed())finish();});}
        @JavascriptInterface public void activationContinue(){runOnUiThread(()->openApp());}
        @JavascriptInterface public void copyDeviceCode(){runOnUiThread(()->{if(trusted()&&licensing!=null)((android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(android.content.ClipData.newPlainText("AlKarna device",licensing.deviceCode()));});}
        @JavascriptInterface public void installActivation(String id,String content){
            try{if(licensing==null)throw new IOException();JSONObject status=licensing.install(content);result(id,status);}
            catch(Exception e){error(id,e instanceof LicenseVerifier.Rejected?e.getMessage():"تعذّر حفظ ملف التفعيل");}
        }
        @JavascriptInterface public void theme(String appearance){runOnUiThread(()->{
            if(!trusted())return;boolean light="light".equals(appearance);root.setBackgroundColor(Color.parseColor(light?"#f1f4f8":"#080e19"));
            getWindow().getDecorView().setSystemUiVisibility(light?View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR:0);
        });}
        @JavascriptInterface public void beginExport(String id,String name,String mime){
            try{
                if(!licenseAllowed())throw new IOException();
                if(!id.matches("[a-f0-9-]{36}")||exports.size()>2)throw new IOException();
                if(!name.matches("[A-Za-z0-9_.-]{1,140}")||!(name.endsWith(".json")||name.endsWith(".pdf")||name.endsWith(".xlsx")))throw new IOException();
                mime=name.endsWith(".json")?"application/json":name.endsWith(".pdf")?"application/pdf":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                Export item=new Export(id,name,mime,File.createTempFile("export-",".tmp",getCacheDir()));exports.put(id,item);result(id,value("ready",true));
            }catch(Exception e){error(id,"تعذّر تجهيز الملف");}
        }
        @JavascriptInterface public void appendExport(String id,String chunk){
            Export item=exports.get(id);if(item==null)return;
            try{if(!licenseAllowed())throw new IOException();byte[] bytes=Base64.decode(chunk,Base64.NO_WRAP);if(bytes.length>65536||item.size+bytes.length>MAX_FILE)throw new IOException();item.output.write(bytes);item.size+=bytes.length;}
            catch(Exception e){exports.remove(id);item.cleanup();error(id,"تعذّر كتابة الملف");}
        }
        @JavascriptInterface public void finishExport(String id){
            Export item=exports.get(id);if(item==null){error(id,"تعذّر تجهيز الملف");return;}
            try{item.output.getFD().sync();item.output.close();}catch(Exception e){exports.remove(id);item.cleanup();error(id,"تعذّر كتابة الملف");return;}
            runOnUiThread(()->{
                if(!trusted()||!licenseAllowed()||pendingExport!=null){exports.remove(id);item.cleanup();error(id,"انتظر اكتمال حفظ الملف الحالي");return;}
                pendingExport=item;
                try{startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(item.mime).putExtra(Intent.EXTRA_TITLE,item.name),SAVE_FILE);}
                catch(Exception e){pendingExport=null;exports.remove(id);item.cleanup();error(id,"لا توجد خدمة لحفظ الملفات على هذا الجهاز");}
            });
        }
        @JavascriptInterface public void printDocument(){runOnUiThread(()->{
            if(!trusted()||!licenseAllowed())return;
            try{((PrintManager)getSystemService(PRINT_SERVICE)).print(NativeUi.french(MainActivity.this)?"AlKarna":"الكرنه",web.createPrintDocumentAdapter(NativeUi.french(MainActivity.this)?"AlKarna":"الكرنه"),new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());}
            catch(Exception e){Toast.makeText(MainActivity.this,NativeUi.text(MainActivity.this,"تعذّر فتح الطباعة"),Toast.LENGTH_LONG).show();}
        });}
        @JavascriptInterface public void scanBarcode(String id){runOnUiThread(()->{
            if(!trusted()||!licenseAllowed())return;if(scannerRequest!=null){error(id,"قارئ الباركود مفتوح بالفعل");return;}
            scannerRequest=id;
            if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.CAMERA},CAMERA);else startScanner();
        });}
    }
    private void startScanner(){try{startActivityForResult(new Intent(this,ScannerActivity.class),SCAN);}catch(Exception e){error(scannerRequest,"تعذّر تشغيل الكاميرا");scannerRequest=null;}}
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);if(request==CAMERA&&scannerRequest!=null){if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)startScanner();else{error(scannerRequest,"لم يُسمح بالكاميرا. أدخل الباركود يدويًا.");scannerRequest=null;}}}
    @Override protected void onActivityResult(int request,int code,Intent intent){
        super.onActivityResult(request,code,intent);
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
    @Override protected void onPause(){if(licensing!=null)licensing.checkpoint();super.onPause();}
    @Override protected void onResume(){super.onResume();if(web!=null&&!activationPage&&!licenseAllowed())showActivation();}
    @Override public void onBackPressed(){if(activationPage){if(licenseAllowed())openApp();else super.onBackPressed();return;}web.evaluateJavascript("(()=>{if(typeof modal!=='undefined'&&modal){act('close');return true}if(typeof view!=='undefined'&&view!=='home'){act('back');return true}if(window.karnaBeforeExit&&window.karnaBeforeExit())return true;return false})()",handled->{if(!"true".equals(handled))super.onBackPressed();});}
    @Override protected void onDestroy(){licenseTimer.removeCallbacksAndMessages(null);administrationQueue.shutdown();if(licensing!=null)licensing.checkpoint();for(Export item:exports.values())item.cleanup();exports.clear();if(chooser!=null)chooser.onReceiveValue(null);if(web!=null){web.removeJavascriptInterface("NativeHost");web.destroy();}super.onDestroy();}
}
