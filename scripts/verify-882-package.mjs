import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {FEATURE_SCHEMA} from '../approved-runtime/upgrade-state.js';
import {translations} from '../approved-runtime/language.js';
// Retain the complete approved package graph, native export and secret exclusion checks.
await import('./verify-862-package.mjs');
const root=new URL('../',import.meta.url),text=async name=>(await readFile(new URL(name,root),'utf8')).replaceAll('\r\n','\n');
const manifest=JSON.parse(await text('approved-runtime/reference-sha256.json'));
const modules=['stock-settlement.js','archive-stock-clearance.js','document-presentation.js','expense-date-time.js','movement-note-update.js','movement-statement.js','feature-movement-statements.js','legacy-bank-movement.js'];
const sw=await text('approved-runtime/sw.js');
for(const name of modules){
 assert(Object.hasOwn(manifest,name),'Missing frozen source: '+name);
 assert(sw.includes('"./'+name+'"'),'Offline browser cache omits '+name);
 assert.equal(await text('approved-android/app/src/main/assets/approved/'+name),await text('approved-runtime/'+name));
}
assert.equal(FEATURE_SCHEMA,4);
assert.match(sw,/alkarna-web-882-/);
assert((await text('approved-runtime/app.js')).includes('before-feature-upgrade-870'));
for(const name of ['إقفال حساب عامل محذوف','احتياطي الأجور المحرر','رقم تسوية المخزون','المرجع الأصلي','تصفير المخزون','استعادة المنتج','رصيد بداية عامل','مستحق للعامل','مستحق على العامل','وقت التسجيل الفعلي']){
 assert(translations[name]&&!/[\u0600-\u06ff]/.test(translations[name]),'Missing French translation: '+name);
}
// This port changes business rules and metadata while retaining the approved phone styling.
const styles={
 'theme.css':'52751cf7ba580769d13aedb4b274049f1762f04f0a0b7c8d32b7ee9c7caf00c3',
 'site.css':'ebaee5579c54d9311f0c862a79339a84cf25153c5bb07f2480cb5be1f2ef72ce',
 'pos.css':'f503e5e69fd21a37f010597c9a64f2019e4a746357f1e631f6b2622154144fe1'
};
for(const[name,hash]of Object.entries(styles))assert.equal(createHash('sha256').update(await text('approved-runtime/'+name)).digest('hex'),hash,'Approved style changed: '+name);
const result={...JSON.parse(await text('outputs/desktop862-qa/package-integrity.json')),desktopBuild:882,desktopSource:'f1cd62bf6fbd8cbaef49a479aff440027afba37b',featureSchema:FEATURE_SCHEMA,newModules:modules,approvedStylesUnchanged:true,sharedDatabaseOrSynchronizationImplemented:false};
await mkdir(new URL('outputs/desktop882-qa/',root),{recursive:true});
await writeFile(new URL('outputs/desktop882-qa/package-integrity.json',root),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
