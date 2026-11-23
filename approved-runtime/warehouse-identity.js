import {sha256Hex} from './accounting-hash.js';

// Bind identity only during an explicit warehouse command. A rename carries
// the original entity identity, with no migration or posting during startup.
export function bindWarehouseIdentities(state){
 if(typeof state.originId!=='string'||!state.originId||!Array.isArray(state.warehouses)||!state.warehouseMeta)throw Error('هوية المخازن غير صالحة');
 const prefix='mobile:'+sha256Hex(state.originId).slice(0,32)+':warehouse:';
 for(const name of state.warehouses){
  const meta=state.warehouseMeta[name];if(!meta||typeof name!=='string'||!name.trim()||['__proto__','constructor','prototype'].includes(name))throw Error('هوية المخزن غير صالحة');
  if(meta.canonicalId!=null||meta._id!=null||meta.id!=null)continue;
  meta.canonicalId=prefix+sha256Hex(name).slice(0,24);
 }
 return state;
}
