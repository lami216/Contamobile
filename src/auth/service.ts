import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { CAPABILITIES, normalizeUsername, sanitizePermissions, type Capability } from './permissions';
import { hashPassword, verifyPasswordHash } from './password';
import type { AppUser, Principal } from './types';

type UserRow={id:string;username:string|null;username_normalized:string|null;name:string;password_hash:string|null;permissions_json:string;is_owner:number;is_active:number;created_at:string;updated_at:string};

export async function ensureAuthSchema(db: SQLiteDatabase) {
  const columns = await db.getAllAsync<{name:string}>('PRAGMA table_info(users)');
  const names = new Set(columns.map(column => column.name));
  if (!names.has('username')) await db.execAsync('ALTER TABLE users ADD COLUMN username TEXT;');
  if (!names.has('username_normalized')) await db.execAsync('ALTER TABLE users ADD COLUMN username_normalized TEXT;');
  const rows = await db.getAllAsync<{id:string;name:string;username:string|null}>('SELECT id,name,username FROM users');
  for (const row of rows) {
    const username = row.username?.trim() || row.name.trim();
    await db.runAsync('UPDATE users SET username=?,username_normalized=? WHERE id=?',[username,normalizeUsername(username),row.id]);
  }
  await db.execAsync('CREATE UNIQUE INDEX IF NOT EXISTS users_username_normalized_unique ON users(username_normalized) WHERE username_normalized IS NOT NULL;');
}

function parsePermissions(raw:string){try{return sanitizePermissions(JSON.parse(raw))}catch{return []}}
function safe(row:UserRow):AppUser{return{id:row.id,username:row.username??row.name,name:row.name,isActive:row.is_active===1,permissions:row.is_owner===1?[...CAPABILITIES]:parsePermissions(row.permissions_json),owner:row.is_owner===1,createdAt:row.created_at,updatedAt:row.updated_at}}
export async function listUsers(db:SQLiteDatabase){const rows=await db.getAllAsync<UserRow>('SELECT id,username,username_normalized,name,password_hash,permissions_json,is_owner,is_active,created_at,updated_at FROM users ORDER BY is_owner DESC,created_at');return rows.map(safe)}
export async function userCount(db:SQLiteDatabase){const row=await db.getFirstAsync<{count:number}>('SELECT COUNT(*) count FROM users');return Number(row?.count??0)}
export async function activeUserCount(db:SQLiteDatabase){const row=await db.getFirstAsync<{count:number}>('SELECT COUNT(*) count FROM users WHERE is_active=1');return Number(row?.count??0)}
export async function getUser(db:SQLiteDatabase,id:string){const row=await db.getFirstAsync<UserRow>('SELECT id,username,username_normalized,name,password_hash,permissions_json,is_owner,is_active,created_at,updated_at FROM users WHERE id=?',[id]);return row?safe(row):null}
export async function createUser(db:SQLiteDatabase,input:{username:string;name?:string;password:string;permissions:Capability[]}){const username=input.username.trim(),normalized=normalizeUsername(username);if(!normalized)throw new Error('اسم المستخدم مطلوب');if(await db.getFirstAsync('SELECT id FROM users WHERE username_normalized=?',[normalized]))throw new Error('اسم المستخدم مستخدم بالفعل');const stamp=new Date().toISOString(),id=Crypto.randomUUID(),passwordHash=await hashPassword(input.password),permissions=sanitizePermissions(input.permissions);await db.runAsync('INSERT INTO users(id,username,username_normalized,name,password_hash,permissions_json,is_owner,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,0,1,?,?)',[id,username,input.name?.trim()||username,passwordHash,JSON.stringify(permissions),stamp,stamp]);return getUser(db,id)}
export async function updateUser(db:SQLiteDatabase,id:string,input:{username:string;name?:string;password?:string;permissions:Capability[];isActive:boolean}){const row=await db.getFirstAsync<UserRow>('SELECT id,username,username_normalized,name,password_hash,permissions_json,is_owner,is_active,created_at,updated_at FROM users WHERE id=?',[id]);if(!row)throw new Error('المستخدم غير موجود');if(row.is_active===1&&!input.isActive&&await activeUserCount(db)<=1)throw new Error('لا يمكن تعطيل المستخدم الوحيد. فعّل مستخدمًا آخر أولًا.');const username=row.is_owner===1?(row.username??row.name):input.username.trim(),normalized=normalizeUsername(username);if(!normalized)throw new Error('اسم المستخدم مطلوب');const duplicate=await db.getFirstAsync<{id:string}>('SELECT id FROM users WHERE username_normalized=?',[normalized]);if(duplicate&&duplicate.id!==id)throw new Error('اسم المستخدم مستخدم بالفعل');const passwordHash=input.password?await hashPassword(input.password):row.password_hash;const permissions=row.is_owner===1?[...CAPABILITIES]:sanitizePermissions(input.permissions);await db.runAsync('UPDATE users SET username=?,username_normalized=?,name=?,password_hash=?,permissions_json=?,is_active=?,updated_at=? WHERE id=?',[username,normalized,row.is_owner===1?row.name:input.name?.trim()||username,passwordHash,JSON.stringify(permissions),input.isActive?1:0,new Date().toISOString(),id]);return getUser(db,id)}
export async function deleteUser(db:SQLiteDatabase,id:string){const found=await db.getFirstAsync<{id:string}>('SELECT id FROM users WHERE id=?',[id]);if(!found)throw new Error('المستخدم غير موجود');await db.runAsync('DELETE FROM users WHERE id=?',[id]);return id}
export async function authenticate(db:SQLiteDatabase,username:string,password:string){const normalized=normalizeUsername(username);const row=await db.getFirstAsync<UserRow>('SELECT id,username,username_normalized,name,password_hash,permissions_json,is_owner,is_active,created_at,updated_at FROM users WHERE username_normalized=? AND is_active=1',[normalized]);if(!row)return null;if(!await verifyPasswordHash(password,row.password_hash??''))return null;return safe(row)}
export function principalForUser(user:AppUser):Principal{return user.owner?{principalType:'owner',userId:user.id,name:user.name,username:user.username,permissions:[...CAPABILITIES]}:{principalType:'user',userId:user.id,name:user.name,username:user.username,permissions:user.permissions}}
export function localPrincipal():Principal{return{principalType:'local',name:'دخول مباشر',permissions:[...CAPABILITIES]}}
export function hasCapability(principal:Principal|null,capability:Capability){return principal?.principalType==='local'||principal?.principalType==='owner'||principal?.permissions.includes(capability)===true}
