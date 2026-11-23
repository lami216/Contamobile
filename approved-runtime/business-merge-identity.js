import {createDesktopBusinessBackup,DESKTOP_BUSINESS_COLLECTIONS} from './desktop-backup-export.js';
import {sha256Hex} from './accounting-hash.js';

const identity=value=>String(value??'');
const reviewMessage='هذه نسخة من نفس المحل تحتوي على تغييرات مختلفة؛ لا يمكن دمجها بأمان. راجع النسخة قبل استبدال البيانات كاملة.';
function businessProjection(collections){
 const clean=value=>Array.isArray(value)?value.map(clean):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).filter(name=>!(name==='_id'&&value.id!=null&&identity(value._id)===identity(value.id))).sort().map(name=>[name,clean(value[name])])):value;
 return Object.fromEntries(DESKTOP_BUSINESS_COLLECTIONS.filter(name=>name!=='users').map(name=>[name,clean(name==='appSettings'?(collections[name]||[]).filter(row=>!row.inertSourceArchive):collections[name])]));
}

/** A native offset and opening dictionary have more than one canonical view.
 * Their own unchanged snapshot is an idempotent no-op, not additional postings.
 * Compare current canonical business data with the primary canonical file; an
 * archived businessState is never trusted to override or reconcile live data. */
export function equivalentOwnBusinessImport(current,source){
 const backup=source.desktopOriginal,marker=backup?.collections?.appSettings?.find(row=>(row._id??row.id)==='mobile-business-origin');
 if(backup?.format!=='conta-backup'||backup.schemaVersion!==1||marker?.schemaVersion!==1||typeof marker.originId!=='string'||marker.originId!==current.originId||source.originId!==current.originId)return false;
 const expected=createDesktopBusinessBackup(current,{createdAt:backup.createdAt}).backup;
 const liveIncoming=createDesktopBusinessBackup(source,{createdAt:backup.createdAt}).backup;
 const digest=collections=>sha256Hex(JSON.stringify(businessProjection(collections))),primary=digest(backup.collections);
 // desktopOriginal can legitimately remain unchanged after a native phone edit.
 // It therefore cannot authorize dropping a changed LIVE incoming snapshot.
 if(digest(expected.collections)===primary&&digest(liveIncoming.collections)===primary)return true;
 const error=new Error(reviewMessage);error.code='OWN_BUSINESS_SNAPSHOT_REVIEW_REQUIRED';throw error;
}
