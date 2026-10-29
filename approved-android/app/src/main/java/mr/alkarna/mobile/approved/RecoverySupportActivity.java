package mr.alkarna.mobile.approved;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.widget.FrameLayout;

/** Explicit support-only startup. It never starts MainActivity or initializes Chromium. */
public final class RecoverySupportActivity extends Activity {
 private RecoveryPreflight rescue;
 @Override public void onCreate(Bundle state){
  super.onCreate(state);
  Intent request=getIntent();if(request==null||!RecoverySupportEntry.accepts(request.getAction(),request.getDataString())){finish();return;}
  FrameLayout root=new FrameLayout(this);root.setBackgroundColor(Color.rgb(8,14,25));setContentView(root);
  if(Build.VERSION.SDK_INT>=30){getWindow().setDecorFitsSystemWindows(false);getWindow().getDecorView().setOnApplyWindowInsetsListener((v,insets)->{android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.ime());root.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;});}
  DeviceLicense license=null;try{license=new DeviceLicense(this);}catch(Exception unavailable){/* The support UI reports unavailable identity without touching accounting. */}
  rescue=new RecoveryPreflight(this,root,license,this::finish);rescue.supportStart();
 }
 @Override protected void onActivityResult(int request,int code,Intent intent){super.onActivityResult(request,code,intent);if(rescue!=null)rescue.onActivityResult(request,code,intent);}
 @Override public void onBackPressed(){if(rescue==null||!rescue.back())super.onBackPressed();}
 @Override protected void onDestroy(){if(rescue!=null)rescue.destroy();super.onDestroy();}
}
