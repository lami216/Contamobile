package mr.alkarna.mobile.approved;

import android.graphics.Bitmap;
import android.graphics.Color;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.BarcodeFormat;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.common.InputImage;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import java.util.concurrent.TimeUnit;

@RunWith(AndroidJUnit4.class)
public class BarcodeDecoderTest {
    @Test public void bundledDecoderReadsProductCodeWithoutNetwork() throws Exception {
        String expected="9900012345";
        var matrix=new MultiFormatWriter().encode(expected,BarcodeFormat.CODE_128,1000,320);
        Bitmap image=Bitmap.createBitmap(1000,320,Bitmap.Config.ARGB_8888);
        for(int y=0;y<320;y++)for(int x=0;x<1000;x++)image.setPixel(x,y,matrix.get(x,y)?Color.BLACK:Color.WHITE);
        var reader=BarcodeScanning.getClient();
        try{var codes=Tasks.await(reader.process(InputImage.fromBitmap(image,0)),20,TimeUnit.SECONDS);assertTrue(codes.stream().anyMatch(code->expected.equals(code.getRawValue())));}
        finally{reader.close();image.recycle();}
    }
}
