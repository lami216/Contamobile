import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const current=path.resolve(fileURLToPath(new URL('../approved-runtime/',import.meta.url)));
const baseline=process.env.BACKUP_BASELINE_RUNTIME?path.resolve(process.env.BACKUP_BASELINE_RUNTIME):null;
const roots={current,...(baseline?{baseline}:{})};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://fixture'),parts=url.pathname.split('/').filter(Boolean);if(!parts.length){res.setHeader('content-type','text/html');res.end('<html><body>Isolated backup benchmark</body></html>');return;}const selected=roots[parts.shift()],filename=selected&&path.resolve(selected,parts.join('/'));if(!filename||!filename.startsWith(selected+path.sep)){res.writeHead(404).end();return;}res.setHeader('content-type',filename.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(await readFile(filename));}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{channel:'chrome'})});
 const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 const result=await page.evaluate(async({modes})=>{
  const percentile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];};
  const stats=values=>({samples:values.length,p50:percentile(values,.5),p95:percentile(values,.95),p99:percentile(values,.99)});
  const results=[];
  for(const mode of modes){
   const {ShopDatabase}=await import('/'+mode+'/database.js'),{installCloudBackup}=await import('/'+mode+'/cloud-backup.js');
   for(const [size,count]of [['small',100],['medium',5000],['large',20000]]){
    const state={originId:'benchmark-shop',products:[],parties:[],accounts:[{id:1,name:'Cash',balance:100}],warehouses:['Main'],warehouse:'Main',records:Array.from({length:count},(_,i)=>({id:i+1,kind:'expense',date:'2026-11-12',title:'مصروف محاسبي اصطناعي '+i,total:1,paid:1,due:0,account:1,lines:[]})),opening:{stocks:{},parties:{},accounts:{1:100}}};
    const owner={id:'benchmark-owner',username:'owner',name:'Owner',role:'owner',active:true,password:{algorithm:'PBKDF2-SHA256',iterations:210000,hash:'a'.repeat(64),salt:'b'.repeat(32)}};
    const db=await new ShopDatabase('benchmark-'+mode+'-'+size+'-'+crypto.randomUUID()).open();await db.replace(state,[owner]);
    const snapshot=[],serialize=[],save=[],durations=[],metadata=[],hash=[];let bytes=0;
    for(let i=0;i<7;i++){
     const before=performance.now(),reading=db.cloudSnapshot();const savingAt=performance.now(),saving=db.save({...state,branding:'Fixture '+i}).then(()=>save.push(performance.now()-savingAt));
     const value=await reading;snapshot.push(performance.now()-before);const serialAt=performance.now(),text=JSON.stringify(value.payload);serialize.push(performance.now()-serialAt);bytes=new TextEncoder().encode(text).byteLength;
     const hashAt=performance.now();await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));hash.push(performance.now()-hashAt);await saving;durations.push(performance.now()-before);
     const metaAt=performance.now();if(typeof db.cloudRevision==='function')await db.cloudRevision();else await db.cloudSnapshot();metadata.push(performance.now()-metaAt);
    }
    // Exercise the real controller's repeated unchanged automatic staging. Clock is
    // virtual only for the waiting window; all IndexedDB snapshot work remains real.
    let snapshots=0,stages=0,now=100000,timerId=0;const timers=new Map(),realNow=Date.now,realSetTimeout=globalThis.setTimeout,realClearTimeout=globalThis.clearTimeout;
    const status={settings:{consent:true,schedule:'daily',time:'21:00',weekday:1,wifiOnly:false},stagedRevision:String((await db.cloudSnapshot()).revision),lastBackedUpRevision:'0'};
    const originalSnapshot=db.cloudSnapshot.bind(db);db.cloudSnapshot=async()=>{snapshots++;return originalSnapshot();};
    globalThis.NativeFiles={async cloudBackup(){return structuredClone(status);},async stageCloudBackup(){stages++;return structuredClone(status);}};
    const api={database:{get:async()=>({context:{shopId:state.originId,ownerId:owner.id}}),put:async()=>{},cloudSnapshot:()=>db.cloudSnapshot(),...(typeof db.cloudRevision==='function'?{cloudRevision:()=>db.cloudRevision()}: {})},state:()=>state,users:()=>[owner],actor:()=>owner,language:()=> 'ar',escape:String,modal:()=>null,render:()=>{},isVisible:()=>false};
    Date.now=()=>now;globalThis.setTimeout=(fn,ms)=>{const id=++timerId;timers.set(id,{fn,at:now+ms});return id;};globalThis.clearTimeout=id=>timers.delete(id);
    try{const controller=installCloudBackup(api);await controller.start();for(let j=0;j<10;j++){controller.committed();now+=2000;for(const [id,timer]of [...timers])if(timer.at<=now){timers.delete(id);await timer.fn();}}}
    finally{Date.now=realNow;globalThis.setTimeout=realSetTimeout;globalThis.clearTimeout=realClearTimeout;}
    results.push({mode,size,records:count,bytes,snapshotMs:stats(snapshot),serializeMs:stats(serialize),sha256Ms:stats(hash),concurrentLocalSaveMs:stats(save),snapshotAndSaveMs:stats(durations),unchangedRevisionCheckMs:stats(metadata),unchangedControllerCalls:10,fullSnapshotsForUnchangedRevision:snapshots,nativeStagesForUnchangedRevision:stages});db.db.close();
   }
  }
  return results;
 },{modes:Object.keys(roots)});
 const report={schema:'local-backup-performance',version:1,environment:{os:os.platform(),release:os.release(),architecture:os.arch(),cpus:os.cpus().length,cpuModel:os.cpus()[0]?.model,memoryBytes:os.totalmem(),node:process.version,browser:await browser.version()},baselineAvailable:!!baseline,scope:'Actual IndexedDB snapshot/validation, JSON serialization, SHA256, and concurrent ShopDatabase.save on synthetic data. Does not measure Android Keystore/native staging or claim a real phone test. Baseline/current run on this host; p95/p99 of seven samples are descriptive, not capacity guarantees.',results:result};
 const out=fileURLToPath(new URL('../benchmark-proof/',import.meta.url));await mkdir(out,{recursive:true});await writeFile(path.join(out,'local-backup-performance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
