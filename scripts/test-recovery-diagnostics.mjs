import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';

test('native adapter retains recovery status, phase and support reference without changing the rejection contract',async()=>{
 const source=await readFile(new URL('../approved-runtime/native-adapter.js',import.meta.url),'utf8'),window={addEventListener(){}};
 const requestId='12345678-1234-5678-9012-123456789abc';
 const context={window,crypto:{randomUUID},setTimeout,clearTimeout,document:{documentElement:{}},MutationObserver:class{observe(){}},NativeHost:{ownerRecovery(id){window.__nativeResult(id,{error:'Closed native recovery failure',code:'RECOVERY_PHONE_NOT_CURRENT',status:409,permanent:true,retryAt:60000,phase:'request',requestId});}}};
 window.setTimeout=setTimeout;window.clearTimeout=clearTimeout;vm.runInNewContext(source,context);
 await assert.rejects(window.NativeFiles.ownerRecovery('request','owner'),error=>error.code==='RECOVERY_PHONE_NOT_CURRENT'&&error.status===409&&error.phase==='request'&&error.requestId===requestId&&error.retryAt===60000&&error.permanent===true);
});
