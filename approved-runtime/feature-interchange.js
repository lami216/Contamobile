import {createDesktopBusinessBackup} from './desktop-backup-export.js';
import {appLanguage} from './i18n.js';

export function installBusinessInterchangeFeatures(api){
 const t=(ar,fr)=>appLanguage()==='fr'?fr:ar;
 const previous=utility;
 utility=function(){
  const html=previous();if(view!=='backup'||!api.can('settings.backup.manage'))return html;
  return html+section(t('تبادل بيانات الجهاز','Échange avec l’ordinateur'))+listMenu([[t('تصدير لكونتا الكمبيوتر','Exporter vers Conta sur ordinateur'),t('لنسخة الكمبيوتر الداعمة لتبادل بيانات الهاتف','Pour la version de Conta compatible avec l’échange mobile'),'box','site:feature:export-desktop-business']]);
 };
 return {
  sheet:()=>null,
  handles:command=>command==='export-desktop-business',
  permission:()=> 'settings.backup.manage',
  async action(){
   const snapshot=createDesktopBusinessBackup(api.stateForSave());
   await api.offerExport('alkarna-business-'+api.today()+'.json',new Blob([JSON.stringify(snapshot)],{type:'application/json'}));
  }
 };
}
