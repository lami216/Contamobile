package mr.alkarna.mobile.approved;

import android.app.Activity;
import android.content.*;
import android.content.res.Configuration;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.view.*;
import android.widget.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

/** Native, fixed-policy consent gate. Never constructs a WebView or opens IndexedDB. */
final class RecoveryPreflight {
 private static final int SAVE_RESCUE=25;
 private static final ExecutorService WORK=Executors.newSingleThreadExecutor();
 private static final AtomicBoolean CAPTURING=new AtomicBoolean();
 private final Activity activity;
 private final FrameLayout root;
 private final Runnable continueApp;
 private final Context textContext;
 private final boolean french,light;
 private final int background,surface,text,muted,line,accent;
 private final Typeface font;
 private DataRescueClient client;
 private JSONObject grant;
 private LinearLayout card;
 private TextView status;
 private File bundle;
 private boolean active,busy,destroyed,supportMode;
 private final AtomicBoolean cancelUpload=new AtomicBoolean();
 RecoveryPreflight(Activity activity,FrameLayout root,DeviceLicense license,Runnable continueApp){
  this.activity=activity;this.root=root;this.continueApp=continueApp;
  french=NativeUi.french(activity);light="light".equals(activity.getSharedPreferences("appearance",Context.MODE_PRIVATE).getString("theme","dark"));
  Configuration config=new Configuration(activity.getResources().getConfiguration());config.setLocale(new Locale(french?"fr":"ar"));textContext=activity.createConfigurationContext(config);
  background=Color.parseColor(light?"#f1f4f8":"#080e19");surface=Color.parseColor(light?"#ffffff":"#121e2e");text=Color.parseColor(light?"#1b2e48":"#f2f4f7");muted=Color.parseColor(light?"#526781":"#a7b4c4");line=Color.parseColor(light?"#a7b8cb":"#43556b");accent=Color.parseColor(light?"#9b7f48":"#a68b56");
  Typeface selected;try{selected=Typeface.createFromAsset(activity.getAssets(),"approved/assets/StitchArabic.ttf");}catch(Exception unavailable){selected=Typeface.SANS_SERIF;}font=selected;
  try{if(license!=null)client=new DataRescueClient(activity,license);}catch(Exception unavailable){client=null;}
 }
 boolean intercept(boolean webViewAlreadyCreated){
  if(CAPTURING.get()){
   active=true;busy=true;layout();status.setText(t(R.string.rescue_copying));
   android.os.Handler handler=new android.os.Handler(android.os.Looper.getMainLooper());
   handler.postDelayed(new Runnable(){public void run(){if(destroyed)return;if(CAPTURING.get()){handler.postDelayed(this,250);return;}busy=false;active=false;if(!intercept(MainActivity.hasCreatedWebView()))leave();}},250);
   return true;
  }
  if(client==null||webViewAlreadyCreated||MainActivity.hasCreatedWebView())return false;
  try{grant=client.cachedGrant();if(grant==null)return false;bundle=client.packageFile(grant);active=true;if(bundle.isFile())showReady(false);else showConsent();return true;}
  catch(Exception invalid){return false;} // Optional feature failures never block accounting.
 }
 void probe(){
  if(client==null||active||destroyed)return;
  WORK.execute(()->{try{if(client.poll())ui(()->Toast.makeText(activity,t(R.string.rescue_restart),Toast.LENGTH_LONG).show());}catch(Exception unavailable){/* no accounting data was inspected */}});
 }
 boolean active(){return active;}
 static boolean capturing(){return CAPTURING.get();}
 void supportStart(){
  supportMode=true;
  if(MainActivity.hasCreatedWebView()){active=true;layout();status.setText(t(R.string.rescue_support_cold));button(R.string.rescue_close,false,activity::finish);return;}
  if(intercept(false))return;
  active=true;showSupport(false);
 }
 private void showSupport(boolean failed){
  layout();status.setText(t(failed?R.string.rescue_support_wait:R.string.rescue_support_intro));
  if(client!=null){try{JSONObject identity=client.publicIdentity();label(t(R.string.rescue_device)+"\n"+identity.getString("deviceCode"),13,muted,false).setTextIsSelectable(true);label(t(R.string.rescue_installation)+"\n"+identity.getString("installationId"),13,muted,false).setTextIsSelectable(true);button(R.string.rescue_support_copy,false,()->{try{String publicIds=identity.getString("deviceCode")+"\n"+identity.getString("installationId");((android.content.ClipboardManager)activity.getSystemService(Context.CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("Contatools support",publicIds));}catch(Exception unavailable){status.setText(t(R.string.rescue_support_wait));}});}catch(Exception unavailable){status.setText(t(R.string.rescue_support_wait));}
   button(R.string.rescue_support_refresh,true,this::refreshSupport);
  }else status.setText(t(R.string.rescue_support_wait));
  button(R.string.rescue_close,false,activity::finish);
 }
 private void refreshSupport(){
  if(busy||client==null)return;
  if(MainActivity.hasCreatedWebView()){supportStart();return;}
  busy=true;layout();status.setText(t(R.string.rescue_support_checking));button(R.string.rescue_close,false,activity::finish);
  WORK.execute(()->{boolean available=false;try{available=client.poll(true);}catch(Exception unavailable){}boolean ready=available;ui(()->{busy=false;if(MainActivity.hasCreatedWebView()||ready)supportStart();else showSupport(true);});});
 }
 private String t(int id){return textContext.getString(id);}
 private int dp(int value){return Math.round(value*activity.getResources().getDisplayMetrics().density);}
 private void ui(Runnable action){activity.runOnUiThread(()->{if(!destroyed&&!activity.isFinishing())action.run();});}
 private GradientDrawable shape(int fill,int stroke,int radius){GradientDrawable drawable=new GradientDrawable();drawable.setColor(fill);drawable.setCornerRadius(dp(radius));drawable.setStroke(dp(1),stroke);return drawable;}
 private void layout(){
  root.removeAllViews();root.setBackgroundColor(background);root.setLayoutDirection(french?View.LAYOUT_DIRECTION_LTR:View.LAYOUT_DIRECTION_RTL);
  ScrollView scroll=new ScrollView(activity);scroll.setFillViewport(true);root.addView(scroll,new FrameLayout.LayoutParams(-1,-1));
  LinearLayout outer=new LinearLayout(activity);outer.setOrientation(LinearLayout.VERTICAL);outer.setGravity(Gravity.CENTER_HORIZONTAL);outer.setPadding(dp(18),dp(24),dp(18),dp(32));scroll.addView(outer);
  card=new LinearLayout(activity);card.setOrientation(LinearLayout.VERTICAL);card.setPadding(dp(20),dp(20),dp(20),dp(20));card.setBackground(shape(surface,line,15));
  int width=Math.min(activity.getResources().getDisplayMetrics().widthPixels-dp(36),dp(500));outer.addView(card,new LinearLayout.LayoutParams(Math.max(dp(200),width),-2));
  label(t(R.string.rescue_title),25,text,true);status=label("",14,muted,false);
 }
 private TextView label(String value,int size,int color,boolean bold){TextView view=new TextView(activity);view.setText(value);view.setTextSize(size);view.setTextColor(color);view.setTypeface(font,bold?Typeface.BOLD:Typeface.NORMAL);view.setTextDirection(french?View.TEXT_DIRECTION_LTR:View.TEXT_DIRECTION_RTL);view.setPadding(0,dp(6),0,dp(8));view.setLineSpacing(dp(3),1);card.addView(view,new LinearLayout.LayoutParams(-1,-2));return view;}
 private void button(int title,boolean primary,Runnable action){Button button=new Button(activity);button.setText(t(title));button.setAllCaps(false);button.setTextSize(15);button.setTextColor(text);button.setTypeface(font,Typeface.BOLD);button.setPadding(dp(14),dp(10),dp(14),dp(10));button.setMinHeight(dp(48));button.setBackground(shape(light?0xffe9eff6:0xff18283c,primary?accent:line,10));LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(-1,-2);params.topMargin=dp(10);card.addView(button,params);button.setOnClickListener(v->action.run());}
 private void details(){
  try{label(t(R.string.rescue_case)+"\n"+grant.getString("caseId"),13,muted,false);label(t(R.string.rescue_device)+"\n"+grant.getString("deviceCode"),13,muted,false);label(t(R.string.rescue_expires)+" "+android.text.format.DateFormat.getDateFormat(activity).format(new Date(grant.getLong("expiresAt")))+" "+android.text.format.DateFormat.getTimeFormat(activity).format(new Date(grant.getLong("expiresAt"))),13,muted,false);}catch(Exception ignored){}
 }
 private void showConsent(){layout();status.setText(t(R.string.rescue_intro));details();label(t(R.string.rescue_sensitive),14,muted,false);label(t(R.string.rescue_offline),13,muted,false);button(R.string.rescue_accept,true,this::capture);button(supportMode?R.string.rescue_refuse_close:R.string.rescue_refuse,false,()->{try{client.decline(grant);WORK.execute(()->{try{client.sendConsent(grant,false,false);}catch(Exception ignored){}});}catch(Exception failure){return;}leave();});}
 private void capture(){
  synchronized(MainActivity.class){if(busy||MainActivity.hasCreatedWebView()||!CAPTURING.compareAndSet(false,true))return;}
  try{if(client.cachedGrant()==null){CAPTURING.set(false);showFailure("grant: REFRESH_REQUIRED");return;}client.consent(grant,true,false);}catch(Exception failure){CAPTURING.set(false);showFailure(failureCode("consent",failure));return;}
  busy=true;layout();status.setText(t(R.string.rescue_copying));
  WORK.execute(()->{
   File dataRoot=activity.getDataDir();File snapshot=null;boolean okay=false;String stage="grant",failureDetail="";
   try{
    // The worker may have been queued behind network work; authorize at the actual read boundary.
    JSONObject current=client.cachedGrant();if(MainActivity.hasCreatedWebView()||current==null||!grant.getString("caseId").equals(current.getString("caseId")))throw new IOException("RESCUE_EXPIRED");
    stage="server-consent";try{client.sendConsent(grant,true,false);}
    catch(ContatoolsClient.ServiceFailure denial){if(denial.permanent)throw denial;}
    catch(IOException offline){/* A previously received signed grant permits local offline capture. */}
    current=client.cachedGrant();if(MainActivity.hasCreatedWebView()||current==null||!grant.getString("caseId").equals(current.getString("caseId")))throw new IOException("RESCUE_EXPIRED");
    stage="storage";File caseDir=client.packageFile(grant).getParentFile();if(!caseDir.exists()&&!caseDir.mkdirs())throw new IOException("RESCUE_STORAGE");
    // Clear only interrupted private copies of this already-consented case, never WebView files.
    File[] stale=caseDir.listFiles();if(stale!=null)for(File file:stale)if(file.getName().startsWith("snapshot-"))RecoverySnapshot.cleanup(dataRoot,file);
    snapshot=new File(caseDir,"snapshot-"+UUID.randomUUID());Map<String,File> roots=new LinkedHashMap<>();
    // No server-controlled paths. Enumerate only WebView profile names inside this app's sandbox.
    File[] dirs=dataRoot.listFiles();int profile=0;if(dirs!=null)for(File directory:dirs)if(directory.getName().matches("app_webview(?:_[A-Za-z0-9_-]{1,80})?")){
     File currentRoot=new File(directory,"Default/IndexedDB"),legacyRoot=new File(directory,"IndexedDB");
     if(currentRoot.exists()||!legacyRoot.exists())roots.put("profile"+profile+"-default",currentRoot);
     if(legacyRoot.exists())roots.put("profile"+profile+"-legacy",legacyRoot);profile++;
    }
    if(roots.isEmpty())roots.put("app_webview-default",new File(dataRoot,"app_webview/Default/IndexedDB"));
    stage="snapshot";RecoverySnapshot.Result result=RecoverySnapshot.capture(dataRoot,roots,snapshot,RecoverySnapshot.Limits.defaults(),(done,total,bytes)->ui(()->status.setText(t(R.string.rescue_copying)+" "+done+" / "+total)));
    stage="encryption";RecoveryPackage.write(grant,result,bundle,System.currentTimeMillis());okay=true;
   }catch(Exception failed){failureDetail=failureCode(stage,failed);}
   finally{try{if(snapshot!=null&&snapshot.exists())RecoverySnapshot.cleanup(dataRoot,snapshot);}catch(Exception cleanupFailed){okay=false;failureDetail=failureCode("cleanup",cleanupFailed);}CAPTURING.set(false);busy=false;}
   boolean success=okay;String detail=failureDetail;ui(()->{if(success)showReady(false);else showFailure(detail);});
  });
 }
 private void showReady(boolean uploaded){layout();status.setText(t(uploaded?R.string.rescue_received:R.string.rescue_ready));details();button(R.string.rescue_save,true,this::export);if(!uploaded)button(R.string.rescue_send,false,this::confirmUpload);button(supportMode?R.string.rescue_close:R.string.rescue_finish,false,this::leave);}
 private void confirmUpload(){layout();status.setText(t(R.string.rescue_upload_intro));label(t(R.string.rescue_sensitive),14,muted,false);button(R.string.rescue_upload_accept,true,()->{try{client.consent(grant,true,true);}catch(Exception failure){showFailure();return;}upload();});button(R.string.rescue_cancel,false,()->showReady(false));}
 private void upload(){
  if(busy)return;busy=true;cancelUpload.set(false);layout();status.setText(t(R.string.rescue_uploading));button(R.string.rescue_stop,false,()->cancelUpload.set(true));
  WORK.execute(()->{boolean okay=false;try{client.upload(grant,bundle,cancelUpload,(done,total)->ui(()->status.setText(t(R.string.rescue_uploading)+" "+done+" / "+total)));okay=true;}catch(Exception unavailable){}finally{busy=false;}boolean success=okay;ui(()->{if(success)showReady(true);else{showReady(false);status.setText(t(R.string.rescue_upload_failed));}});});
 }
 private void export(){try{activity.startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/octet-stream").putExtra(Intent.EXTRA_TITLE,"Contatools-"+grant.getString("caseId")+".ctrescue"),SAVE_RESCUE);}catch(Exception unavailable){status.setText(t(R.string.rescue_export_failed));}}
 boolean onActivityResult(int request,int result,Intent intent){
  if(request!=SAVE_RESCUE)return false;if(result!=Activity.RESULT_OK||intent==null||intent.getData()==null)return true;
  Uri destination=intent.getData();WORK.execute(()->{boolean okay=false;try(InputStream input=new FileInputStream(bundle);OutputStream output=activity.getContentResolver().openOutputStream(destination,"wt")){if(output==null)throw new IOException();byte[] buffer=new byte[65536];int n;while((n=input.read(buffer))!=-1)output.write(buffer,0,n);output.flush();okay=true;}catch(Exception failed){}boolean success=okay;ui(()->status.setText(t(success?R.string.rescue_exported:R.string.rescue_export_failed)));});return true;
 }
 private static String failureCode(String stage,Exception error){String message=error.getMessage();String code=message!=null&&message.matches("[A-Za-z0-9_-]{1,100}")?message:"";return stage+": "+error.getClass().getSimpleName()+(code.isEmpty()?"":" / "+code);}
 private void showFailure(){showFailure("operation: FAILED");}
 private void showFailure(String code){layout();status.setText(t(R.string.rescue_failed)+"\n\n"+code);status.setTextIsSelectable(true);button(supportMode?R.string.rescue_close:R.string.rescue_finish,false,this::leave);}
 private void leave(){if(busy||CAPTURING.get())return;active=false;root.removeAllViews();continueApp.run();}
 boolean back(){if(!active)return false;if(!busy)activity.finish();return true;}
 void destroy(){destroyed=true;cancelUpload.set(true);}
}
