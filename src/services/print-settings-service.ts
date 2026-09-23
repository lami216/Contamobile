import type { SQLiteDatabase } from 'expo-sqlite';

export const PRINT_SETTINGS_KEY='print-settings';
export const printProfiles=['a4','thermal80','thermal58'] as const;
export type PrintProfile=typeof printProfiles[number];
export type PrintSettings={profile:PrintProfile};

export const DEFAULT_PRINT_SETTINGS:PrintSettings={profile:'a4'};

export function normalizePrintSettings(value:unknown):PrintSettings{
  const source=value&&typeof value==='object'?value as Partial<PrintSettings>:{};
  const profile=printProfiles.includes(source.profile as PrintProfile)?source.profile as PrintProfile:'a4';
  return {profile};
}

export async function getPrintSettings(db:SQLiteDatabase):Promise<PrintSettings>{
  const row=await db.getFirstAsync<{value:string}>('SELECT value FROM app_settings WHERE key=?',[PRINT_SETTINGS_KEY]);
  if(!row)return DEFAULT_PRINT_SETTINGS;
  try{return normalizePrintSettings(JSON.parse(row.value))}catch{return DEFAULT_PRINT_SETTINGS}
}

export async function savePrintSettings(db:SQLiteDatabase,value:unknown):Promise<PrintSettings>{
  const settings=normalizePrintSettings(value),updatedAt=new Date().toISOString();
  await db.runAsync('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',[PRINT_SETTINGS_KEY,JSON.stringify(settings),updatedAt]);
  return settings;
}

export function printProfileLabel(profile:PrintProfile,locale:'ar'|'fr'){
  if(profile==='thermal80')return locale==='ar'?'حراري 80 مم':'Thermique 80 mm';
  if(profile==='thermal58')return locale==='ar'?'حراري 58 مم':'Thermique 58 mm';
  return locale==='ar'?'A4 — فاتورة كاملة':'A4 — facture complète';
}

export function printFileLayout(profile:PrintProfile,lineCount:number){
  if(profile==='thermal80')return {width:227,height:Math.min(2800,Math.max(520,390+lineCount*66))};
  if(profile==='thermal58')return {width:164,height:Math.min(3200,Math.max(600,440+lineCount*78))};
  return {width:595,height:842};
}
