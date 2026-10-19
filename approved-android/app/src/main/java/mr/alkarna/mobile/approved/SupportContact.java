package mr.alkarna.mobile.approved;

import android.content.Intent;
import android.net.Uri;

/** Fixed support destinations. No arbitrary URL or telephone dispatch from the offline host. */
final class SupportContact {
    private SupportContact() {}
    static Intent intentFor(Uri uri) {
        if(uri==null||uri.getFragment()!=null)return null;
        if("tel".equals(uri.getScheme())&&"49823328".equals(uri.getSchemeSpecificPart()))
            return new Intent(Intent.ACTION_DIAL,uri);
        if(!"https".equals(uri.getScheme())||!"wa.me".equals(uri.getHost())||uri.getPort()!=-1||uri.getUserInfo()!=null||!"/22249823328".equals(uri.getEncodedPath()))return null;
        for(String key:uri.getQueryParameterNames())if(!"text".equals(key))return null;
        if(uri.getQueryParameters("text").size()>1)return null;
        String text=uri.getQueryParameter("text");
        if(text!=null&&text.length()>1024)return null;
        return new Intent(Intent.ACTION_VIEW,uri).addCategory(Intent.CATEGORY_BROWSABLE);
    }
}
