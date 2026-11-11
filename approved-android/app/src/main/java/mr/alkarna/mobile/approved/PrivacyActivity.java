package mr.alkarna.mobile.approved;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayInputStream;

/** Public local policy surface. It cannot read accounts, call administration, or navigate the ledger. */
public final class PrivacyActivity extends Activity {
    private WebView policy;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(8, 14, 25));
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            getWindow().getDecorView().setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                root.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
        }
        policy = new WebView(this);
        root.addView(policy, new FrameLayout.LayoutParams(-1, -1));
        WebSettings settings = policy.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        WebView.setWebContentsDebuggingEnabled(false);
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        policy.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                String path = url.getPath();
                if (!"https".equals(url.getScheme()) || !"appassets.androidplatform.net".equals(url.getHost())
                        || path == null || !(path.matches("/assets/approved/privacy\\.(html|css|js)")
                        || path.startsWith("/assets/approved/assets/"))) return blocked();
                WebResourceResponse resource = assets.shouldInterceptRequest(url);
                return resource == null ? blocked() : resource;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (request.isForMainFrame() && "https".equals(url.getScheme())
                        && "appassets.androidplatform.net".equals(url.getHost())
                        && "/assets/approved/privacy.html".equals(url.getPath())) return false;
                if (request.isForMainFrame() && request.hasGesture()) {
                    Intent support = SupportContact.intentFor(url);
                    if (support != null) try { startActivity(support); }
                    catch (android.content.ActivityNotFoundException unavailable) { /* Keep the public contact text visible. */ }
                }
                return true;
            }
        });
        policy.addJavascriptInterface(new CloseBridge(), "NativeHost");
        policy.loadUrl(MainActivity.ORIGIN + "/assets/approved/privacy.html?lang=" + (NativeUi.french(this) ? "fr" : "ar"));
    }

    private static WebResourceResponse blocked() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    public final class CloseBridge {
        @JavascriptInterface public void closePrivacy() { runOnUiThread(PrivacyActivity.this::finish); }
    }

    @Override protected void onDestroy() {
        if (policy != null) { policy.removeJavascriptInterface("NativeHost"); policy.destroy(); policy = null; }
        super.onDestroy();
    }
}
