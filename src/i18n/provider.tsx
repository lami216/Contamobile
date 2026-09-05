import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { I18nManager } from 'react-native';
import type { Locale } from '@/domain/types';
import { messages, type MessageKey } from './messages';
import { translateError } from './errors';

const STORAGE_KEY='alkarna.locale';
type I18nValue={locale:Locale;isRTL:boolean;t:(key:MessageKey)=>string;setLocale:(locale:Locale)=>Promise<void>;money:(value:number)=>string;number:(value:number)=>string;date:(value:string|Date)=>string;errorMessage:(error:unknown)=>string};
const I18nContext=createContext<I18nValue|null>(null);

export function I18nProvider({children}:{children:ReactNode}){
  const [locale,setLocaleState]=useState<Locale>('ar');
  useEffect(()=>{void SecureStore.getItemAsync(STORAGE_KEY).then(value=>{if(value==='ar'||value==='fr')setLocaleState(value)})},[]);
  const setLocale=useCallback(async(next:Locale)=>{await SecureStore.setItemAsync(STORAGE_KEY,next);I18nManager.allowRTL(true);I18nManager.forceRTL(next==='ar');setLocaleState(next)},[]);
  const value=useMemo<I18nValue>(()=>{
    const tag=locale==='ar'?'ar-MR-u-nu-latn':'fr-MR-u-nu-latn';
    const fallback=messages[locale].error;
    return {locale,isRTL:locale==='ar',t:(key)=>messages[locale][key],setLocale,money:(amount)=>`${new Intl.NumberFormat(tag,{maximumFractionDigits:0,numberingSystem:'latn'}).format(amount)} MRU`,number:(amount)=>new Intl.NumberFormat(tag,{maximumFractionDigits:2,numberingSystem:'latn'}).format(amount),date:(input)=>new Intl.DateTimeFormat(tag,{day:'2-digit',month:'2-digit',year:'numeric',numberingSystem:'latn'}).format(new Date(input)),errorMessage:(error)=>translateError(error,locale,fallback)};
  },[locale,setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export function useI18n(){const value=useContext(I18nContext);if(!value)throw new Error('useI18n must be inside I18nProvider');return value;}
