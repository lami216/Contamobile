import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Architecture assertions complement actual Java compilation/device tests; they are not a device test.
const base='approved-android/app/src/main/',java=base+'java/mr/alkarna/mobile/approved/';
const entry=readFileSync(java+'RecoverySupportActivity.java','utf8'),gate=readFileSync(java+'RecoveryPreflight.java','utf8'),manifest=readFileSync(base+'AndroidManifest.xml','utf8');
assert.match(entry,/RecoverySupportEntry\.accepts\(request\.getAction\(\),request\.getDataString\(\)\)/);
assert.doesNotMatch(entry,/new\s+WebView\b|WebViewAssetLoader|\.loadUrl\(|startActivity\(|initializeWebView\(/);
assert.match(entry,/new RecoveryPreflight\(this,root,license,this::finish\)/);
assert.match(entry,/rescue\.supportStart\(\)/);
assert.match(entry,/rescue\.onActivityResult\(request,code,intent\)/);
assert.match(entry,/rescue\.destroy\(\)/);
const supportStart=gate.slice(gate.indexOf('void supportStart()'),gate.indexOf('private void showSupport('));
assert.match(supportStart,/MainActivity\.hasCreatedWebView\(\)/);
assert.match(supportStart,/rescue_support_cold/);
assert.doesNotMatch(supportStart,/RecoverySnapshot\.capture|\.listFiles\(|new WebView/);
assert.match(gate,/synchronized\(MainActivity\.class\)\{if\(busy\|\|MainActivity\.hasCreatedWebView\(\)/);
assert.match(manifest,/android:name="\.RecoverySupportActivity"[^>]*android:exported="true"/);
assert.match(manifest,/<data android:scheme="contamobile" android:host="data-rescue"\/>/);
for(const locale of ['values','values-fr']){
 const strings=readFileSync(base+'res/'+locale+'/rescue.xml','utf8');
 for(const key of ['rescue_support_intro','rescue_support_refresh','rescue_support_cold','rescue_refuse_close'])assert(strings.includes(`name="${key}"`));
}
console.log('PASS explicit native support entry, fixed intent policy, no WebView/accounting initialization, shared live-WebView guard, lifecycle delegation, Arabic/French copy');
