import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const domain=[
 'test-business-identity-862.mjs',
 'verify-approved-source-navigation.mjs','verify-invoice-ux.mjs','verify-signed-accounts.mjs',
 'verify-stock-correction-parity.mjs','verify-archived-balances.mjs','verify-report-sources.mjs',
 'verify-party-summaries.mjs','verify-french-locale.mjs','verify-feature-domains.mjs','verify-import-features.mjs',
 'test-import-allocation.mjs','test-native-save-boundary.mjs',
 'test-native-adapter.mjs','test-cloud-native-adapter.mjs','test-reset-native-adapter.mjs',
 'test-business-boundaries-862.mjs','test-862-import-merge.mjs','test-desktop-import-parity-862.mjs','test-stock-recovery-parity-862.mjs',
 'test-service-contact.mjs','test-standalone-control.mjs',
 'test-payroll-parity-862.mjs','test-party-opening-parity-862.mjs',
 'test-expense-categories-parity-862.mjs','test-finance-parity-862.mjs'
];
const browser=[
 'test-accounting-parity.mjs',
 'test-storage-integrity.mjs','test-runtime-integrity.mjs','test-invoice-ux.mjs',
 'test-signed-accounts.mjs','test-accounting-reset.mjs','test-accounting-reset-lock.mjs',
 'test-cloud-backup.mjs','test-device-lifecycle-ux.mjs','test-phone-replacement-ux.mjs',
 'test-backup-ux.mjs','test-owner-recovery-ux.mjs','test-user-integrity.mjs',
 'test-import-html-escaping.mjs','test-standalone-control-ux.mjs'
];
const scope=process.argv.includes('--browser')?'browser':'domain',names=scope==='browser'?browser:domain;
const results=[],dir=new URL('../outputs/desktop862-qa/regressions/',import.meta.url);
await mkdir(dir,{recursive:true});
for(const name of names){
 const row=await new Promise(resolve=>{
  const child=spawn(process.execPath,['scripts/'+name],{env:process.env,stdio:['ignore','pipe','pipe']}),chunks=[];
  child.stdout.on('data',data=>chunks.push(data));child.stderr.on('data',data=>chunks.push(data));
  const timer=setTimeout(()=>child.kill(),180000);
  child.on('close',code=>{clearTimeout(timer);resolve({name,passed:code===0,code,output:Buffer.concat(chunks).toString()})});
 });
 await writeFile(new URL(row.name+'.log',dir),row.output);
 console.log((row.passed?'PASS ':'FAIL ')+name+(row.passed?'':'\n'+row.output.slice(-1800)));
 results.push({name:row.name,passed:row.passed,exitCode:row.code});
}
await writeFile(new URL(scope+'-results.json',dir),JSON.stringify({scope,at:new Date().toISOString(),results},null,2));
console.log(JSON.stringify({scope,passed:results.filter(r=>r.passed).length,total:results.length}));
if(results.some(r=>!r.passed))process.exitCode=1;
