import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import type { Capability } from './permissions';
import { authenticate, getUser, hasCapability, localPrincipal, principalForUser, userCount } from './service';
import type { Principal } from './types';

const SESSION_KEY='alkarna.auth.session';
const MAX_AGE_MS=12*60*60*1000;
type Session={userId:string;expiresAt:number};
type AuthValue={ready:boolean;principal:Principal|null;hasUsers:boolean;login:(username:string,password:string)=>Promise<boolean>;logout:()=>Promise<void>;refresh:()=>Promise<void>;has:(capability:Capability)=>boolean};
const AuthContext=createContext<AuthValue|null>(null);

export function AuthProvider({children}:{children:ReactNode}){
  const db=useSQLiteContext();
  const [ready,setReady]=useState(false),[principal,setPrincipal]=useState<Principal|null>(null),[hasUsers,setHasUsers]=useState(false);
  const refresh=useCallback(async()=>{
    const count=await userCount(db);setHasUsers(count>0);
    if(count===0){setPrincipal(localPrincipal());setReady(true);return}
    const raw=await SecureStore.getItemAsync(SESSION_KEY);
    if(!raw){setPrincipal(null);setReady(true);return}
    try{
      const session=JSON.parse(raw) as Partial<Session>;
      if(typeof session.userId!=='string'||typeof session.expiresAt!=='number'||session.expiresAt<=Date.now())throw new Error('expired');
      const user=await getUser(db,session.userId);if(!user?.isActive)throw new Error('inactive');
      setPrincipal(principalForUser(user));
    }catch{await SecureStore.deleteItemAsync(SESSION_KEY);setPrincipal(null)}finally{setReady(true)}
  },[db]);
  useEffect(()=>{void refresh()},[refresh]);
  const login=useCallback(async(username:string,password:string)=>{const user=await authenticate(db,username,password);if(!user)return false;await SecureStore.setItemAsync(SESSION_KEY,JSON.stringify({userId:user.id,expiresAt:Date.now()+MAX_AGE_MS} satisfies Session));setPrincipal(principalForUser(user));setHasUsers(true);return true},[db]);
  const logout=useCallback(async()=>{await SecureStore.deleteItemAsync(SESSION_KEY);setPrincipal((await userCount(db))===0?localPrincipal():null)},[db]);
  const value=useMemo<AuthValue>(()=>({ready,principal,hasUsers,login,logout,refresh,has:(capability)=>hasCapability(principal,capability)}),[ready,principal,hasUsers,login,logout,refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(){const value=useContext(AuthContext);if(!value)throw new Error('useAuth must be inside AuthProvider');return value}
