// Transport admission only. Business invariants remain in the canonical adapter
// and database validator; credentials and activation never belong to this file.
export const BUSINESS_INTERCHANGE_FORMAT='alkarna-mobile-business-backup';
const collections=['employees','parties','warehouses','products','productCategories','expenseCategories','documents','stockMovements','financialMovements','paymentAccounts','recurringExpenses','accountTransfers','counters','auditEvents','appSettings','users','importMappings'];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fail=()=>{throw Error('ملف تبادل بيانات الهاتف غير صالح؛ لم تتغير البيانات')};
function withoutCredentials(value,depth=0){
 if(depth>80)fail();
 if(Array.isArray(value)){for(const row of value)withoutCredentials(row,depth+1);return;}
 if(!object(value))return;
 if(value.format==='conta-backup'&&object(value.collections)&&(!Array.isArray(value.collections.users)||value.collections.users.length))fail();
 if(value.format==='alkarna-web-backup'&&object(value.state)&&(!Array.isArray(value.users)||value.users.length||Array.isArray(value.state.users)&&value.state.users.length))fail();
 for(const row of Object.values(value))withoutCredentials(row,depth+1);
}
export function readBusinessInterchange(value){
 if(!object(value)||value.format!==BUSINESS_INTERCHANGE_FORMAT||value.schemaVersion!==1||Object.keys(value).some(key=>!['format','schemaVersion','createdAt','source','backup'].includes(key))||typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt)))fail();
 const source=value.source,backup=value.backup;
 if(!object(source)||source.application!=='alkarna-mobile'||source.featureSchema!==4||source.businessOnly!==true||typeof source.originId!=='string'||!source.originId||source.originId.length>200||Object.keys(source).some(key=>!['application','featureSchema','originId','businessOnly'].includes(key)))fail();
 if(!object(backup)||backup.format!=='conta-backup'||backup.schemaVersion!==1||backup.encoding!=='json-v2'||backup.createdAt!==value.createdAt||!object(backup.collections)||Object.keys(backup.collections).length!==collections.length||Object.keys(backup.collections).some(key=>!collections.includes(key))||collections.some(name=>!Array.isArray(backup.collections[name]))||backup.collections.users.length)fail();
 withoutCredentials(backup);
 const result=structuredClone(backup);delete result.mobileImport;return result;
}
