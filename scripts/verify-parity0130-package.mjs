import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FEATURE_SCHEMA} from '../approved-runtime/upgrade-state.js';
const root=new URL('../',import.meta.url),text=async name=>(await readFile(new URL(name,root),'utf8')).replaceAll('\r\n','\n'),hash=value=>createHash('sha256').update(value).digest('hex');
const planOnly=process.argv.includes('--plan-only'),desktopSource='2327ccc83b3f76f7a30d13c0ca8d356c4cd7483b',desktopConsumerSource='0076de06cd20b5f0dfd83918a264373aa3df0071',desktopConsumerTree='609d3ca450b94ad591a7747f718e80deb472afda';
const previous39={sourceHead:'098ea6a5aeea00ac6ccd3c60f5b53205d54fca01',runId:44972098486,artifactId:14734480899,sha256:'bca79ebb844ac18c65ea8ece27dc4cc3ee1aee8e5e60bae025143fb11bbe2b4d'};
const retainedReleaseFiles={
 ".github/workflows/desktop-882-android-upgrade.yml": "e42c0c13fe3521c4316d82e9d02fbe2215bacd45c171798e9bace79d0ccbf871",
 ".github/workflows/owner-recovery39-android-upgrade.yml": "c103692680c38efefe67508631712290969bf153daf33c0cf0cea08a14e48663",
 "scripts/test-882-android-upgrade.sh": "a6953ea289ef98f6320632a40e851e76c10d289e5677995b516cdb328ac597b7",
 "scripts/test-recovery39-android-upgrade.sh": "aa3a820892c8f3377d3507958d0a75e759555d197ee92d1765e50e5933be5566",
 "scripts/verify-882-package.mjs": "0daa1ff5c74426f04bf1b1bbe03be1218f14b489cb66e64702cb5bb77e86a63b",
 "scripts/verify-recovery39-package.mjs": "1d0ca5ac5bfefed3881d8ff479cf8013ab2fde21804b4cada53bb8776c59a50c",
 "scripts/original-v38-jvm-cases.json": "05e8e005c7ad739fb7a7a60fee4506debdd6301635fcc25b4c8aee108bd5db06",
 "approved-android/app/src/androidTest/java/mr/alkarna/mobile/approved/UpgradePersistenceTest.java": "b08a409d4c5df284bcf14188643406ae8c6e4c2b2283cd5ceabab540cdcfb2e0",
 "approved-android/app/src/androidTest/java/mr/alkarna/mobile/approved/Desktop882UpgradeTest.java": "8a84c8e3025c3828b5bbdcf21b1df6a7b6632666cd5377a787af89b1995fe909",
 "approved-android/app/src/androidTest/java/mr/alkarna/mobile/approved/Recovery39UpgradeTest.java": "6e7a107124b805144d0aa5f448e79c831e3b7e12558b2e28fd7a378fd4643872",
 "approved-android/signing-certificate.sha256": "2668794a925c5e083dd006d2a14af8e887750b366ebcf84c80bad5399d904c7a"
};
for(const[file,digest]of Object.entries(retainedReleaseFiles))assert.equal(hash(await text(file)),digest,'Earlier release proof changed: '+file);
const original=JSON.parse(await text('scripts/original-v39-jvm-cases.json')),current=new Set();
async function scan(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())await scan(file);else if(entry.name.endsWith('.java')){const source=await readFile(file,'utf8'),packageName=source.match(/^package\s+([\w.]+)\s*;/m)?.[1];for(const test of source.matchAll(/@Test\b(?:\([^)]*\))?\s+public\s+void\s+(\w+)\s*\(/g))current.add(packageName+'.'+entry.name.slice(0,-5)+'#'+test[1]);}}}
await scan(fileURLToPath(new URL('approved-android/app/src/test/java/',root)));
assert.equal(original.sourceHead,previous39.sourceHead);assert.equal(original.sourceVersionCode,39);assert.equal(original.cases.length,54);assert.equal(new Set(original.cases).size,54);for(const name of original.cases)assert(current.has(name),'Original39 JVM case removed: '+name);
assert.equal(FEATURE_SCHEMA,4);
const workflow=await text('.github/workflows/desktop-0130-android-upgrade.yml'),script=await text('scripts/test-parity0130-android-upgrade.sh'),fixture=await text('approved-android/parity0130-androidTest/java/mr/alkarna/mobile/approved/Desktop0130UpgradeTest.java'),gradle=await text('approved-android/app/build.gradle');
assert(workflow.includes('branches: [feat/desktop-main-parity-20261123]'));assert(!workflow.includes("github.ref == 'refs/heads/main'"));
assert(workflow.includes('needs: [business, build, native, upgrade]'),'A distributable update requires all business, build, native and upgrade gates');
assert(workflow.includes('ref: '+desktopSource));assert(workflow.includes(previous39.sourceHead)&&workflow.includes(String(previous39.runId))&&workflow.includes(String(previous39.artifactId))&&workflow.includes(previous39.sha256));
assert(workflow.includes("ALKARNA_HIGHEST_DISTRIBUTED_CODE: '39'"));assert(workflow.includes('-PalkarnaVersionCode=40 -PalkarnaVersionName=1.0.39 -PalkarnaParity0130Tests=true'));assert(workflow.includes('baseline: [27, 39]'));
assert(!workflow.includes('baseline-v38'));assert(script.includes('CANDIDATE_VERSION_CODE=40')&&script.includes('suite=Desktop0130UpgradeTest'));assert(script.includes('native_count==75'));assert(script.includes("'Recovery39UpgradeTest','Desktop0130UpgradeTest'"));assert(!script.includes('expectedVersionCode 39'));
assert(fixture.includes('"Warm only the original distributed APK39",39'));assert(fixture.includes('"Candidate is exactly40",40'));for(const inherited of ['super.seedPreviousVersion()','super.verifyAfterInPlaceUpdate()','super.verifyAfterOfflineColdRestart()','super.verifyAfterRepeatedInPlaceUpdate()'])assert(fixture.includes(inherited));
for(const guarantee of ['recoveryConsumedId','lifecycleConsumedId','identity.sign','Original encrypted backup decrypts','Backup schedule/consent survive','Remote control generation/fence are not reset','Saved literal note appears once','Rendering source-backed notes/cost changes no stored row'])assert(fixture.includes(guarantee));
assert(gradle.includes("gradleProperty('alkarnaParity0130Tests')"));assert(gradle.includes("sourceSets.androidTest.java.srcDir(rootProject.file('parity0130-androidTest/java'))"));
const modules=['business-interchange.js','desktop-backup-export.js','document-note.js','feature-interchange.js','historical-settlement.js','party-create.js','warehouse-identity.js','business-merge-identity.js'];
const stylePins={'theme.css':'52751cf7ba580769d13aedb4b274049f1762f04f0a0b7c8d32b7ee9c7caf00c3','site.css':'ebaee5579c54d9311f0c862a79339a84cf25153c5bb07f2480cb5be1f2ef72ce','pos.css':'f503e5e69fd21a37f010597c9a64f2019e4a746357f1e631f6b2622154144fe1'};for(const[file,digest]of Object.entries(stylePins))assert.equal(hash(await text('approved-runtime/'+file)),digest,'Approved phone style changed: '+file);
const consumer=workflow.match(/ref: ([a-f0-9]{40})\n\s+path: desktop-consumer\n/);
assert.equal(consumer?.[1],desktopConsumerSource,'Verified paired Desktop consumer head changed');assert(workflow.includes(desktopConsumerTree),'Consumer tree must be pinned');
if(!planOnly){
 assert(consumer&&!workflow.includes('PENDING_'),'A verified paired Desktop consumer commit must be explicit before any release build');
 await import('./verify-862-package.mjs');const manifest=JSON.parse(await text('approved-runtime/reference-sha256.json')),sw=await text('approved-runtime/sw.js');
 for(const name of modules){assert(Object.hasOwn(manifest,name),'New module missing from sealed source: '+name);assert(sw.includes('"./'+name+'"'),'Offline cache omits '+name);assert.equal(await text('approved-android/app/src/main/assets/approved/'+name),await text('approved-runtime/'+name));}
}
const result={schema:'alkarna-desktop0130-package-plan',desktopSource,desktopConsumerSource,desktopConsumerTree,versionCode:40,versionName:'1.0.39',highestDistributedCode:39,previous39,featureSchema:4,originalJVMRetained:54,currentJVMSourceCases:current.size,nativeSourceScenarioRequirement:75,upgradeBaselines:[27,39],upgradeScenarioRequirement:16,oldReleaseFilesRetained:Object.keys(retainedReleaseFiles).length,newFixtureOptInOnly:true,approvedStylesUnchanged:true,sourcePackagingVerified:!planOnly,apkBuilt:false,deviceUpgradeTested:false,planChecksPassed:true,releaseReady:false};
await mkdir(new URL('outputs/main-parity-qa/',root),{recursive:true});await writeFile(new URL(planOnly?'outputs/main-parity-qa/release40-plan-check.json':'outputs/main-parity-qa/release40-package-check.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
