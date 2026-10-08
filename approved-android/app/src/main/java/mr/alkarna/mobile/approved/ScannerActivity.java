package mr.alkarna.mobile.approved;

import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.*;
import androidx.fragment.app.FragmentActivity;
import androidx.camera.core.*;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import com.google.mlkit.vision.barcode.*;
import com.google.mlkit.vision.common.InputImage;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Bundled ML Kit decoder works without internet or browser BarcodeDetector support. */
public final class ScannerActivity extends FragmentActivity {
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private BarcodeScanner scanner;
    private boolean finished=false;
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Color.rgb(8,14,25));root.setPadding(12,40,12,30);
        TextView title=new TextView(this);title.setText("وجّه الكاميرا نحو الباركود");title.setTextColor(Color.WHITE);title.setTextSize(20);title.setGravity(Gravity.CENTER);root.addView(title,new LinearLayout.LayoutParams(-1,70));
        PreviewView preview=new PreviewView(this);root.addView(preview,new LinearLayout.LayoutParams(-1,0,1));
        Button close=new Button(this);close.setText("إغلاق الكاميرا");close.setOnClickListener(v->finish());root.addView(close,new LinearLayout.LayoutParams(-1,70));setContentView(root);
        scanner=BarcodeScanning.getClient();
        var provider=ProcessCameraProvider.getInstance(this);
        provider.addListener(()->{
            try{
                ProcessCameraProvider camera=provider.get();Preview stream=new Preview.Builder().build();stream.setSurfaceProvider(preview.getSurfaceProvider());
                ImageAnalysis analysis=new ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build();
                analysis.setAnalyzer(worker,image->{
                    if(finished||image.getImage()==null){image.close();return;}
                    scanner.process(InputImage.fromMediaImage(image.getImage(),image.getImageInfo().getRotationDegrees())).addOnSuccessListener(codes->{
                        if(finished)return;for(var code:codes){String value=code.getRawValue();if(value!=null&&!value.trim().isEmpty()&&value.length()<=128){finished=true;setResult(RESULT_OK,new Intent().putExtra("barcode",value.trim()));finish();break;}}
                    }).addOnCompleteListener(task->image.close());
                });
                camera.bindToLifecycle(this,CameraSelector.DEFAULT_BACK_CAMERA,stream,analysis);
            }catch(Exception e){Toast.makeText(this,"الكاميرا غير متاحة. أدخل الباركود يدويًا.",Toast.LENGTH_LONG).show();finish();}
        },ContextCompat.getMainExecutor(this));
    }
    @Override protected void onDestroy(){finished=true;worker.shutdown();if(scanner!=null)scanner.close();super.onDestroy();}
}
