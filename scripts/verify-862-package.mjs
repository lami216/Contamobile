import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),source=path.join(root,'approved-runtime'),packaged=path.join(root,'approved-android/app/src/main/assets/approved');
const manifest=JSON.parse(await readFile(path.join(source,'reference-sha256.json'),'utf8'));
const text=async file=>(await readFile(file,'utf8')).replaceAll('\r\n','\n');
for(const [name,hash]of Object.entries(manifest)){
 assert.equal(createHash('sha256').update(await text(path.join(source,name))).digest('hex'),hash,'Frozen source changed: '+name);
 const built=await text(path.join(packaged,name));
 if(!['app.js','barcode-camera.js','index.html'].includes(name))assert.equal(built,await text(path.join(source,name)),'Package differs: '+name);
}
const visited=new Set(),queue=['app.js','engine.js','native-adapter.js','runtime-boot.js'];
while(queue.length){
 const name=queue.shift();if(visited.has(name))continue;visited.add(name);
 const code=await text(path.join(packaged,name));
 for(const match of code.matchAll(/(?:\bfrom\s*|\bimport\s*)['"](\.[^'"]+\.js)['"]/g)){
  const child=path.normalize(path.join(path.dirname(name),match[1]));assert(!child.startsWith('..'),'Import escaped package');queue.push(child);
 }
}
const app=await text(path.join(packaged,'app.js'));
assert(app.includes('await window.NativeFiles.saveBlob(name,blob)'),'Native file saving must remain connected');
assert(app.includes("if(false&&'serviceWorker' in navigator)"),'Native app must not reuse browser service workers');
for(const name of await readdir(packaged))assert(!/\.(apk|jks|p12|keystore|zip)$|^(scripts|fixtures|node_modules|outputs)$/i.test(name),'Non-runtime material bundled: '+name);
const result={at:new Date().toISOString(),sourceFiles:Object.keys(manifest).length,reachableJavaScriptModules:visited.size,nativeExportConnected:true,nativeServiceWorkerDisabled:true,apkBuilt:false,deviceUpgradeTested:false};
await mkdir(path.join(root,'outputs/desktop862-qa'),{recursive:true});await writeFile(path.join(root,'outputs/desktop862-qa/package-integrity.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
