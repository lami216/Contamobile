// Independent issuer-contract fixtures. Ephemeral private key stays in this process; no issuer is shipped.
import {webcrypto,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
const {subtle}=webcrypto;
const pair=await subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const publicKey=await subtle.exportKey('jwk',pair.publicKey);
const identity='android|fixture-device',hash=createHash('sha256').update('mr.alkarna.desktop|device-v1|'+identity).digest('hex').slice(0,20).toUpperCase();
const device='AKD-'+hash.match(/.{4}/g).join('-');
const common={licenseId:'fixture-v1',storeId:'store-fixture',customerName:'أحمد "ولد" محمد',storeName:'متجر </النخيل> 🛒',deviceId:device,edition:'desktop'};
const canonical=(p,v)=>JSON.stringify(v===1?{licenseId:p.licenseId,storeId:p.storeId,customerName:p.customerName,storeName:p.storeName,deviceId:p.deviceId,edition:p.edition,type:p.type,issuedAt:p.issuedAt,notes:p.notes}:{licenseId:p.licenseId,storeId:p.storeId,customerName:p.customerName,storeName:p.storeName,deviceId:p.deviceId,edition:p.edition,type:p.type,durationSeconds:p.durationSeconds,activationMode:p.activationMode,notes:p.notes});
async function sign(p,version){return {schema:'alkarna-license',version,keyId:'alkarna-license-v'+version,algorithm:'ECDSA_P256_SHA256',payload:p,signature:Buffer.from(await subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,new TextEncoder().encode(canonical(p,version)))).toString('base64url')}}
const notes='سطر\nتبويب\tشرطة \\ \u2028 lone:\ud800';
const v1=await sign({...common,type:'perpetual',issuedAt:'2026-10-18T12:00:00.000Z',notes},1);
const v2=await sign({...common,licenseId:'fixture-v2',type:'temporary',durationSeconds:10800,activationMode:'single-install',notes},2);
const perpetual=await sign({...v2.payload,licenseId:'fixture-perpetual',type:'perpetual',durationSeconds:null},2);
const out=new URL('../approved-android/app/src/androidTest/assets/',import.meta.url);await mkdir(out,{recursive:true});
await writeFile(new URL('license-contract.json',out),JSON.stringify({publicKey,identity,device,v1,v2,perpetual,canonical1:canonical(v1.payload,1),canonical2:canonical(v2.payload,2)}));
console.log('Desktop v1/v2 contract fixtures prepared; signing key discarded.');
