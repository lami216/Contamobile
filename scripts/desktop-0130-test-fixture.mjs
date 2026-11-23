import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

export const commit='2327ccc83b3f76f7a30d13c0ca8d356c4cd7483b';
export const desktop=process.env.DESKTOP_0130_ROOT||fileURLToPath(new URL('../../Desktop/',import.meta.url));
export const pins={
 'lib/product-cost.ts':'5ca4c57efa63eda84213d700f5bd9da50e1480a1c4ca33e04f75fb6e387bc4d3',
 'lib/mobile-backup.ts':'f5dd2ac4aa4ba5f226ccb78ceeb3d5ae8a8dbdda6045dc176d0150df663d7e38',
 'lib/report-commerce.ts':'4fbbe6841ba2a147ebfad8e2c7b9de04353d1f4fe4e39244a3415bf83b91d6a9',
 'lib/adjustment-stock-cost.ts':'f0d8b9d8dcd19f55315ab2a0b43b1399a719ddf65134378e9b5cfa3aa8475b10',
 'lib/stock-numbers.ts':'30b944a9b453785a629921133c983db68d59e72e1f62857191c3b771ad9cd02e',
 'app/invoice-line-amount.ts':'27fdce1669225620a674a3e178798e6a76911ed4cb47aeb95287186d18a3e72e',
 'app/api/command/route.ts':'72e5ff20914f3f0d52f97b801e51c50151d6966314cf0c21c970eb68fda0748a',
 'lib/reports.ts':'62df99cd1c13543fc4156d22d632a281cbcfee0365107b04189ae122c5dd656b',
 'lib/transaction-lifecycle.ts':'aeef807657c21e5574ff5454312a00d391b4ac06aeedc05e9aa705e7d903f667',
 'tests/fixtures/mobile-backup-v23.mjs':'fdd2e7365f9af304208ba256b6d6c2542a113c32ddc827ff0d8ce9e16e3e04ca',
 'tests/mobile-current-cost.test.mjs':'db4b9ecf547cbeebafaa2abe135e62e0e1bffcdcf0afd6276803b2d45344339f',
 'tests/mobile-repeated-invoice-lines.test.mjs':'6898d932d4e192dab8a2e881d367100edde32e338e01e682ef3667bf96c84f34',
 'tests/mobile-repeated-lines-scale.test.mjs':'b56b0a93221362b118a96c19efc57a118ff86ee9de6bfef705a949e3c73d2275',
 'tests/mobile-backup-routes.test.mjs':'ef37f450d931f24ddc92fa8c111c5b329579571501ecf23a0ae0e39532c90892'
};
export async function source(file){
 const value=(await readFile(path.join(desktop,file),'utf8')).replaceAll('\r\n','\n');
 assert.equal(createHash('sha256').update(value).digest('hex'),pins[file],'Pinned Desktop0.1.30 source changed: '+file);
 return value;
}
export async function references(){
 for(const file of Object.keys(pins))await source(file);
 return {cost:await import(pathToFileURL(path.join(desktop,'lib/product-cost.ts'))),backup:await import(pathToFileURL(path.join(desktop,'lib/mobile-backup.ts'))),fixture:await import(pathToFileURL(path.join(desktop,'tests/fixtures/mobile-backup-v23.mjs')))};
}
export function withoutHistoricalOffset(raw){
 const result=structuredClone(raw);
 for(const row of result.state.records.filter(row=>row.kind==='offset'&&!row.voided))for(const id of [row.party,row.otherParty])result.state.parties.find(p=>p.id===id).balance+=row.total;
 result.state.records=result.state.records.filter(row=>row.kind!=='offset');
 return result;
}
export async function commandReference(){
 // Execute the pinned command implementation. Irrelevant external admission,
 // license and web imports are not invoked by these source guard tests.
 const {desktopLifecycleReference}=await import('./desktop-882-lifecycle-test-fixture.mjs');
 const lifecycle=await desktopLifecycleReference();
 const compiled=stripTypeScriptTypes(await source('app/api/command/route.ts'),{mode:'transform'}).replace(/^import .*;\r?\n/gm,'');
 const key='__desktop0130LifecycleForTests';globalThis[key]=lifecycle;
 try{return await import('data:text/javascript;base64,'+Buffer.from(`const {executeLifecycleCommand}=globalThis.${key};\n`+compiled+'\nexport {lines as parseInvoiceLines};\n//# sourceURL=desktop-0130-command-reference.mjs\n').toString('base64'));}
 finally{delete globalThis[key];}
}
export async function legacySettlementReference(){
 const lifecycle=stripTypeScriptTypes(await source('lib/transaction-lifecycle.ts'),{mode:'transform'}).replace(/^import .*;\r?\n/gm,'');
 const module=await import('data:text/javascript;base64,'+Buffer.from(lifecycle+'\nexport {legacyPartyBalanceDelta};\n//# sourceURL=desktop-0130-legacy-lifecycle.mjs\n').toString('base64'));
 const reports=await source('lib/reports.ts'),constants=reports.split('\n').filter(line=>/^const (SALE_KINDS|PURCHASE_KINDS|isSaleKind|isPurchaseKind|n) =/.test(line)).join('\n');
 const effectLine=reports.split('\n').find(line=>line.trim().startsWith('const effect='));assert(effectLine,'Actual source party-ledger effect missing');
 const sourceModule=stripTypeScriptTypes(constants+'\nconst parentKinds=new Map();\n'+effectLine+'\nexport {effect};',{mode:'transform'});
 const report=await import('data:text/javascript;base64,'+Buffer.from(sourceModule+'\n//# sourceURL=desktop-0130-legacy-report.mjs\n').toString('base64'));
 return {lifecycleDelta:module.legacyPartyBalanceDelta,reportDelta:report.effect};
}
export async function proof(name,cases,extra={}){
 const output=new URL('../outputs/desktop0130-qa/',import.meta.url);await mkdir(output,{recursive:true});
 const result={suite:name,sourceCommit:commit,sourceHashes:pins,tests:cases.length,passed:cases.length,cases,...extra};
 await writeFile(new URL(name+'.json',output),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({suite:name,tests:cases.length,passed:cases.length,actualPinnedDesktop:true,...extra}));
}
