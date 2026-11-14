import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const native=path.join(root,'approved-android/app/src/main/java/mr/alkarna/mobile/approved');
const files=new Map(await Promise.all((await readdir(native)).filter(p=>p.endsWith('.java')).map(async p=>[p,await readFile(path.join(native,p),'utf8')])));
const lifecycle=files.get('DeviceLifecycleClient.java'),host=files.get('MainActivity.java'),licence=files.get('DeviceLicense.java'),policy=files.get('StandaloneControl.java');
function body(source,name){const start=source.search(new RegExp('(?:synchronized |private |public |static |final |boolean |JSONObject |String |void )+'+name+'\\([^;]*?\\)\\s*(?:throws [^{]+)?\\{'));assert(start>=0,'Missing method '+name);const open=source.indexOf('{',start);let depth=1,i=open+1,quote=null,escape=false,line=false,block=false;for(;i<source.length;i++){const c=source[i],next=source[i+1];if(line){if(c==='\n')line=false;continue}if(block){if(c==='*'&&next==='/'){block=false;i++}continue}if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote=null;continue}if(c==='/'&&next==='/'){line=true;i++;continue}if(c==='/'&&next==='*'){block=true;i++;continue}if(c==='"'||c==="'"){quote=c;continue}if(c==='{')depth++;if(c==='}'&&!--depth)return source.slice(open+1,i)}throw Error('Unclosed method '+name);}

test('all real production native installation callers are the three freshly admitted lifecycle paths',()=>{
 const sites=[];for(const [file,source]of files)for(const match of source.matchAll(/\b\w+\.(install|installOnline|installEntitlement)\s*\(/g))sites.push({file,method:match[1]});
 assert.deepEqual(sites.map(x=>x.file),Array(3).fill('DeviceLifecycleClient.java'));
 assert.deepEqual(sites.map(x=>x.method),['install','installEntitlement','installOnline']);
 for(const [method,admit,install]of [['importManual','admit(document)','license.install(content)'],['activateEntitlement','admit(prepared.getJSONObject("document"))','license.installEntitlement('],['activate','admit(document)','license.installOnline(']]){const code=body(lifecycle,method);assert(code.indexOf(admit)>=0&&code.indexOf(admit)<code.indexOf(install),method+' must obtain admission before consuming a licence');}
 assert.match(body(lifecycle,'importManual'),/license\.install\(content\);[\s\S]*?enroll\(new JSONObject\(\)\)/);
});
test('the native JavaScript manual-import bridge has one bounded activation-page path and no legacy direct installation',()=>{
 const bridge=body(host,'installActivation');assert.match(bridge,/!trusted\(\)\|\|!activationPage\|\|!backupScope\.current\(page\)/);assert.match(bridge,/content\.length\(\)>65536/);assert.match(bridge,/deviceLifecycle\.importManual\(content\)/);assert.doesNotMatch(bridge,/licensing\.install\(/);
 assert.equal((host.match(/@JavascriptInterface public void installActivation\(/g)||[]).length,1);
 for(const [name,source]of files)assert.doesNotMatch(source,/standaloneControlIsolation|fixture-online|Synthetic standalone native fixture/,'Release class contains a test admission bypass: '+name);
});
test('fresh admission binds a native random nonce and exact verified document to signed durable policy before use',()=>{
 const control=body(lifecycle,'control');assert.match(control,/UUID\.randomUUID\(\)\.toString\(\)/);assert.match(control,/ProtocolJson\.hash\(document\)/);assert.match(control,/control\.admit/);assert.match(control,/license\.control\(/);
 assert.match(control,/StandaloneControl\.freshness/);
 const durable=body(licence,'control');assert(durable.indexOf('StandaloneControl.verify(')<durable.indexOf('StandaloneControl.record('));assert(durable.indexOf('persist()')<durable.indexOf('return ProtocolJson.copy(decision)'));
 assert.match(policy,/requestNonce/);assert.match(policy,/CONTROL_REPLAY/);assert.match(policy,/CONTROL_CONFLICT/);
});
test('all native install implementations check the cached fence before writing consumed IDs or resetting clocks',()=>{
 for(const method of ['installEntitlement','installOnline']){const code=licence.slice(licence.indexOf('synchronized JSONObject '+method+'('));assert(code.indexOf('controlAllows(verified)')>=0,method+' is missing the durable gate');}
 const locked=licence.slice(licence.indexOf('private JSONObject installLocked(String content,boolean onlineDelivery)'));assert(locked.indexOf('controlAllows(verified)')<locked.indexOf('consumed.put(id)'));
 assert.match(licence,/StandaloneControl\.merge\(a\.optJSONObject\("standaloneControl"\),b\.optJSONObject\("standaloneControl"\)\)/);
 assert.match(policy,/revokedDocumentHashes/);assert.match(policy,/activationFence/);
});
test('blocked screens reconcile in native code and accepted local writes finish before activation navigation',()=>{
 assert.match(host,/licensePulse[\s\S]*?reconcileControl\(false\)/);const reconcile=body(host,'reconcileControl');assert.doesNotMatch(reconcile,/if\s*\(activationPage\)/);assert.match(reconcile,/deviceLifecycle\.refresh\(\)/);
 const navigation=body(host,'continueActivationTransition');assert(navigation.indexOf('karnaPersistenceBusy')<navigation.indexOf('web.loadUrl('));assert.match(navigation,/postDelayed\(this::continueActivationTransition,250\)/);
 assert.doesNotMatch(reconcile,/clearData|deleteDatabase|finishAndRemoveTask/);
 const refresh=body(lifecycle,'refresh');assert(refresh.indexOf('control(false,null)')<refresh.indexOf('value=status()'));assert.match(refresh,/legacyStatusUnavailable/);
 const status=body(lifecycle,'status');assert.doesNotMatch(status,/\bactivate\(\)/);assert.match(status,/acknowledgeActivation\(pending\)/);
});
test('the standalone activation surface contains no purchase contact or institution sign-in flow',async()=>{
 const html=await readFile(path.join(root,'approved-runtime/activation.html'),'utf8'),js=await readFile(path.join(root,'approved-runtime/activation.js'),'utf8');assert.doesNotMatch(html+js,/wa\.me|contact-whatsapp|tel:|openAccountAccess|company-login|التفعيل يعمل دون إنترنت/);
 assert.match(js,/remote-consent/);assert.match(js,/consent:true/);assert.match(html,/استلام تفعيل جديد يحتاج الإنترنت/);assert.match(html,/id="manual-activation"/);assert.match(html,/id="privacy"/);
});
