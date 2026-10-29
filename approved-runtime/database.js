import {validateFeatureState} from './upgrade-state.js';
import {CAPABILITIES} from './permissions.js';
export class StoreError extends Error {}
export class ShopDatabase {
  constructor(name='alkarna-site-v1'){this.name=name;this.db=null;this.revision=0;this.opening=null}
  async open(){
    if(this.opening)return this.opening;
    if(this.db)return this;
    const opening=(async()=>{
      const connection=await new Promise((resolve,reject)=>{
        const request=indexedDB.open(this.name,1);let blocked=false;
        request.onupgradeneeded=()=>{for(const name of ['snapshots','users','meta'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'id'})};
        request.onblocked=()=>{blocked=true;reject(new StoreError('أغلق نوافذ المحل الأخرى ثم أعد المحاولة. لم تتغير بياناتك.'))};
        request.onsuccess=()=>{if(blocked){request.result.close();return}resolve(request.result)};
        request.onerror=()=>reject(new StoreError('تعذّر فتح التخزين المحلي. لم تُحذف بياناتك أو تُعد تهيئتها.',{cause:request.error}));
      });
      if(!['snapshots','users','meta'].every(name=>connection.objectStoreNames.contains(name))){connection.close();throw new StoreError('بنية التخزين المحلي غير مكتملة. لا تُنشئ محلاً جديدًا؛ استخدم مدخل دعم استرجاع البيانات.')}
      const invalidate=()=>{connection.close();if(this.db===connection)this.db=null};
      connection.onversionchange=invalidate;connection.onclose=()=>{if(this.db===connection)this.db=null};this.db=connection;return this;
    })();
    this.opening=opening;try{return await opening}finally{if(this.opening===opening)this.opening=null}
  }
  async transaction(stores,mode='readonly'){
    for(let attempt=0;attempt<2;attempt++){
      await this.open();const connection=this.db;if(!connection)continue;
      try{return connection.transaction(stores,mode)}catch(error){
        if(error?.name!=='InvalidStateError'||attempt===1)throw error;
        // Retry only transaction CREATION after a closed connection. No read/write request
        // has run yet; aborted or uncertain financial transactions are never replayed.
        if(this.db===connection)this.db=null;connection.close();
      }
    }
    throw new StoreError('تعذّر إعادة فتح التخزين المحلي. أعد فتح التطبيق دون حذف بياناته.');
  }
  async run(stores,mode,setup,message='لم يكتمل الحفظ؛ لم تُسجّل العملية'){
    const tx=await this.transaction(stores,mode);
    return new Promise((resolve,reject)=>{
      let value,failure=null;
      const abort=error=>{failure=error;try{tx.abort()}catch{reject(failure)}};
      const guard=fn=>(...args)=>{try{fn(...args)}catch(error){abort(error)}};
      tx.oncomplete=()=>failure?reject(failure):resolve(value);
      tx.onabort=()=>reject(failure||new StoreError(tx.error?.name==='QuotaExceededError'?'مساحة الجهاز غير كافية للحفظ. لم تُسجّل العملية؛ حرّر مساحة ثم أعد المحاولة.':message,{cause:tx.error}));
      tx.onerror=()=>{}; // Let IndexedDB abort first; never report failure while a write may still commit.
      guard(()=>setup(tx,result=>{value=result},abort,guard))();
    });
  }
  async get(store,id){return this.run(store,'readonly',(tx,result)=>{const request=tx.objectStore(store).get(id);request.onsuccess=()=>result(request.result)},'تعذّرت قراءة البيانات المحلية')}
  async all(store){return this.run(store,'readonly',(tx,result)=>{const request=tx.objectStore(store).getAll();request.onsuccess=()=>result(request.result)},'تعذّرت قراءة البيانات المحلية')}
  async put(store,value){const copy=structuredClone(value);return this.run(store,'readwrite',(tx,result)=>{tx.objectStore(store).put(copy);result(copy)})}
  async load(){
    const loaded=await this.run(['snapshots','users','meta'],'readonly',(tx,result,abort,guard)=>{
      const values={};let pending=4;
      const done=guard(()=>{
        if(--pending)return;
        const row=values.shop;
        if(!row){
          if(values.users||values.snapshots||values.meta)throw incompleteShop();
          result({state:null,revision:0});return;
        }
        assertShop(row);try{validateState(row.state)}catch(error){throw new StoreError('بيانات المحل غير مكتملة أو غير صالحة. لم تُستبدل؛ استخدم مدخل دعم استرجاع البيانات.',{cause:error})}
        result({state:row.state,revision:row.revision});
      });
      for(const [key,request]of [['shop',tx.objectStore('snapshots').get('shop')],['users',tx.objectStore('users').count()],['snapshots',tx.objectStore('snapshots').count()],['meta',tx.objectStore('meta').count()]])request.onsuccess=()=>{values[key]=request.result;done()};
    },'تعذّر قراءة المحل؛ لم تتغير البيانات المحلية');
    this.revision=loaded.revision;return loaded.state;
  }
  async recoverOwner(prepared){
    const p=structuredClone(prepared),password=p?.password;
    if(p?.stage!=='prepared'||!['shopId','ownerId','requestId','grantId','intentId'].every(k=>typeof p[k]==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(p[k]))||password?.algorithm!=='PBKDF2-SHA256'||password.iterations!==210000||! /^[a-f0-9]{32}$/.test(password.salt)||! /^[a-f0-9]{64}$/.test(password.hash))throw new StoreError('تفويض الاستعادة غير صالح');
    // Password, receipt and session invalidation commit together. Accounting is read-only.
    return this.run(['users','meta','snapshots'],'readwrite',(tx,setResult,abort,guard)=>{
      const users=tx.objectStore('users'),meta=tx.objectStore('meta'),result={applied:true,alreadyApplied:false};setResult(result);
      const deny=message=>abort(new StoreError(message)),receipt=meta.get('owner-recovery:'+p.grantId);
      receipt.onsuccess=guard(()=>{
        if(receipt.result){const r=receipt.result;if(r.ownerId!==p.ownerId||r.shopId!==p.shopId||r.intentId!==p.intentId||r.requestId!==p.requestId)return deny('تعارض في إيصال الاستعادة');result.alreadyApplied=true;return}
        const shop=tx.objectStore('snapshots').get('shop');shop.onsuccess=guard(()=>{
          if(shop.result?.state?.originId!==p.shopId)return deny('هذا التفويض يخص محلاً آخر');
          const owner=users.get(p.ownerId);owner.onsuccess=guard(()=>{
            if(owner.result?.role!=='owner'||owner.result.active===false)return deny('الاستعادة خاصة بحساب المالك الفعال');
            users.put({...owner.result,password:structuredClone(password),updatedAt:new Date().toISOString()});
            meta.put({id:'owner-recovery:'+p.grantId,ownerId:p.ownerId,shopId:p.shopId,intentId:p.intentId,requestId:p.requestId,appliedAt:new Date().toISOString()});
            const cursor=meta.openCursor();cursor.onsuccess=guard(()=>{const c=cursor.result;if(c){if(typeof c.value.id==='string'&&c.value.id.startsWith('session:')&&c.value.user===p.ownerId)c.delete();c.continue()}});
          });
        });
      });
    },'لم تكتمل الاستعادة؛ أعد المحاولة');
  }
  async save(state,backup=null){
    const copy=structuredClone(state),savedBackup=backup?structuredClone(backup):null,expected=this.revision;validateState(copy);
    const revision=await this.run(['snapshots','meta','users'],'readwrite',(tx,result,abort,guard)=>{
      const store=tx.objectStore('snapshots'),request=store.get('shop');
      const write=guard(row=>{
        if(row)assertShop(row);
        if((row?.revision??0)!==expected)throw revisionConflict();
        if(savedBackup)store.put({id:'before-compact-product-names',state:savedBackup,updatedAt:new Date().toISOString()});
        store.put({id:'shop',revision:expected+1,state:copy,updatedAt:new Date().toISOString()});result(expected+1);
      });
      request.onsuccess=guard(()=>{
        if(request.result){write(request.result);return}
        let pending=3,total=0;for(const name of ['snapshots','meta','users']){const count=tx.objectStore(name).count();count.onsuccess=guard(()=>{total+=count.result;if(--pending===0){if(total)throw incompleteShop();write(null)}})}
      });
    });
    this.revision=revision;return revision;
  }
  async replace(state,users){
    // Clone and validate before opening a write transaction. In particular boolean/object
    // IDs are invalid IDB keys and must never throw only AFTER users.clear() was queued.
    const copy=structuredClone(state),incoming=structuredClone(users),expected=this.revision;validateState(copy);validateUsers(incoming);
    const revision=await this.run(['snapshots','users','meta'],'readwrite',(tx,result,abort,guard)=>{
      const snapshots=tx.objectStore('snapshots'),accounts=tx.objectStore('users'),meta=tx.objectStore('meta'),values={};let pending=4;
      const done=guard(()=>{
        if(--pending)return;const old=values.shop;
        if(old)assertShop(old);else if(values.users.length||values.snapshots||values.meta)throw incompleteShop();
        if((old?.revision??0)!==expected)throw revisionConflict();
        const now=new Date().toISOString();
        if(old){
          meta.put({id:'safety-backup',backup:{state:old.state,users:values.users},savedAt:now});
          snapshots.put({id:'safety-backup',state:old.state,users:[],updatedAt:now});
        }
        snapshots.put({id:'shop',state:copy,revision:expected+1,updatedAt:now});accounts.clear();for(const user of incoming)accounts.put(user);result(expected+1);
      });
      for(const [key,request]of [['shop',snapshots.get('shop')],['users',accounts.getAll()],['snapshots',snapshots.count()],['meta',meta.count()]])request.onsuccess=()=>{values[key]=request.result;done()};
    },'فشلت الاستعادة؛ بقيت البيانات السابقة');
    this.revision=revision;
  }
}
function incompleteShop(){return new StoreError('سجل المحل مفقود أو غير مكتمل مع وجود بيانات محلية. لا تُنشئ محلاً جديدًا؛ استخدم مدخل دعم استرجاع البيانات.')}
function revisionConflict(){return new StoreError('تغيّرت البيانات من نافذة أخرى. أعد تحميل الموقع قبل متابعة التسجيل أو الاستعادة.')}
function assertShop(row){if(!row||row.id!=='shop'||!row.state||typeof row.state!=='object'||Array.isArray(row.state)||!Number.isSafeInteger(row.revision)||row.revision<0)throw incompleteShop()}
function validateUsers(users){
  if(!Array.isArray(users)||users.length>100000)throw new StoreError('حسابات المستخدمين غير صالحة في النسخة');
  const validId=id=>typeof id==='string'&&id.trim().length>0||Number.isSafeInteger(id)&&id>0;
  for(const u of users)if(!u||!validId(u.id)||typeof u.username!=='string'||!u.username.trim()||!['owner','manager','accountant','sales','custom'].includes(u.role)||!/^([a-f0-9]{64})$/.test(u.password?.hash||'')||!/^([a-f0-9]{32})$/.test(u.password?.salt||''))throw new StoreError('حساب مستخدم غير صالح في النسخة');
  for(const u of users)if(u.capabilities&&(!Array.isArray(u.capabilities)||u.capabilities.some(c=>!CAPABILITIES.includes(c))))throw new StoreError('صلاحيات مستخدم غير صالحة');
  if(new Set(users.map(u=>u.username)).size!==users.length||new Set(users.map(u=>u.id)).size!==users.length)throw new StoreError('حسابات مكررة في النسخة');
  if(!users.some(u=>u.role==='owner'&&u.active!==false))throw new StoreError('النسخة تحتاج حساب مالك فعال');
}
export function validateState(s){if(!s||typeof s!=='object'||!s.opening)throw new StoreError('بنية البيانات غير صالحة');for(const k of ['products','parties','accounts','records','warehouses'])if(!Array.isArray(s[k])||s[k].length>100000)throw new StoreError('بيانات '+k+' غير صالحة');for(const k of ['products','parties','accounts','records']){const ids=s[k].map(x=>x.id);if(ids.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(ids).size!==ids.length)throw new StoreError('معرّفات مكررة أو غير صالحة في '+k)}if(!s.warehouses.length||new Set(s.warehouses).size!==s.warehouses.length||s.warehouses.some(x=>typeof x!=='string'||!x.trim()))throw new StoreError('أسماء المخازن غير صالحة');const finite=(n)=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e14;for(const p of s.products){if(!p.name?.trim()||![p.price,p.cost,p.wholesale??p.price].every(n=>finite(n)&&n>=0)||!p.stocks||Object.values(p.stocks).some(n=>!finite(n)||n<0)||Object.keys(p.stocks).some(w=>!s.warehouses.includes(w)))throw new StoreError('بيانات المنتج غير صالحة')}for(const a of s.accounts)if(!a.name?.trim()||!finite(a.balance)||a.balance<0)throw new StoreError('رصيد حساب غير صالح');for(const p of s.parties)if(!p.name?.trim()||!['customer','supplier'].includes(p.type)||!finite(p.balance))throw new StoreError('حساب طرف غير صالح');const kinds=['sale','purchase','expense','receive','pay','deposit','withdraw','transfer','stocktransfer','adjustment','offset'];for(const r of s.records){if(!kinds.includes(r.kind)||!finite(r.total)||r.total<0||!Array.isArray(r.lines)||!/^\d{4}-\d{2}-\d{2}$/.test(r.date||''))throw new StoreError('مستند غير صالح');if(!finite(r.paid??0)||!finite(r.due??0)||(r.paid??0)<0||(r.due??0)<0||r.to&&!s.accounts.some(a=>a.id===r.to)||r.otherParty&&!s.parties.some(p=>p.id===r.otherParty)||[r.warehouse,r.from,r.toWarehouse].filter(Boolean).some(w=>!s.warehouses.includes(w)))throw new StoreError('مبالغ أو مراجع المستند غير صالحة');if(r.party&&!s.parties.some(p=>p.id===r.party)||r.account&&!s.accounts.some(a=>a.id===r.account))throw new StoreError('المستند يشير إلى حساب غير موجود');for(const l of r.lines)if(!s.products.some(p=>p.id===l.product)||!finite(l.qty)||!finite(l.price)||l.qty<0||r.kind==='adjustment'&&!finite(l.delta))throw new StoreError('بند فاتورة غير صالح')}validateFeatureState(s);return true}
export async function passwordDigest(password,salt){const saltBytes=salt?Uint8Array.from(salt.match(/.{2}/g),x=>parseInt(x,16)):crypto.getRandomValues(new Uint8Array(16));const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:saltBytes,iterations:210000},key,256);const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');return {algorithm:'PBKDF2-SHA256',iterations:210000,salt:hex(saltBytes),hash:hex(bits)}}
export async function verifyPassword(password,stored){if(!stored?.salt||!stored?.hash)return false;const got=await passwordDigest(password,stored.salt);let diff=got.hash.length^stored.hash.length;for(let i=0;i<got.hash.length;i++)diff|=got.hash.charCodeAt(i)^stored.hash.charCodeAt(i);return diff===0}
