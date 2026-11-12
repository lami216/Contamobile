// Pure Android entry/binding rules. No credentials or financial data are stored here.
export function identifierKind(value){
 const identifier=String(value??'').normalize('NFKC').trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));
 if(/^[234][0-9]{7}$/.test(identifier))return {mode:'offline',identifier};
 if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier))return {mode:'online',identifier:identifier.toLowerCase()};
 throw Object.assign(Error('INVALID_IDENTIFIER'),{code:'INVALID_IDENTIFIER'});
}
export function loginInput(identifier,code,consent){
 const result=identifierKind(identifier);
 if(consent!==true)throw Object.assign(Error('CONSENT_REQUIRED'),{code:'CONSENT_REQUIRED'});
 if(typeof code!=='string'||code.length<(result.mode==='online'?12:6)||code.length>256)throw Object.assign(Error(result.mode==='online'?'ONLINE_CODE_LENGTH':'OFFLINE_CODE_LENGTH'),{code:result.mode==='online'?'ONLINE_CODE_LENGTH':'OFFLINE_CODE_LENGTH'});
 return {identifier:result.identifier,code,consent:true};
}
export function assertOfflineScope(binding,state,users,credential){
 if(!binding||! /^[234][0-9]{7}$/.test(binding.phone||'')||typeof binding.localOwnerId!=='string'||!binding.localOwnerId||typeof binding.localShopId!=='string'||!binding.localShopId)throw Object.assign(Error('OFFLINE_BINDING_INVALID'),{code:'OFFLINE_BINDING_INVALID'});
 const existing=state!==null&&state!==undefined;
 if(existing||users.length){
  const owner=users.find(u=>u.id===binding.localOwnerId&&u.role==='owner'&&u.active!==false);
  if(!existing||state.originId!==binding.localShopId||!owner)throw Object.assign(Error('OFFLINE_SCOPE_MISMATCH'),{code:'OFFLINE_SCOPE_MISMATCH'});
  return {fresh:false,owner};
 }
 if(credential?.phone!==binding.phone||typeof credential.code!=='string'||credential.code.length<6)throw Object.assign(Error('OFFLINE_SETUP_CREDENTIAL_REQUIRED'),{code:'OFFLINE_SETUP_CREDENTIAL_REQUIRED'});
 if(!binding.ownerName?.trim()||!binding.shopName?.trim())throw Object.assign(Error('OFFLINE_BINDING_INVALID'),{code:'OFFLINE_BINDING_INVALID'});
 return {fresh:true,owner:null};
}
export function accessReason(error,language='ar'){
 const fr=language==='fr',key=String(error?.code||'')+' '+String(error?.message||'');
 const messages=[
  [/ONLINE_PENDING_OTHER_ACCOUNT|PENDING_COMMAND/,['هناك عملية غير محسومة لحساب سابق. ادخل بالحساب السابق وتحقق من نتيجتها أولًا.','Une opération reste à vérifier sur le compte précédent. Reconnectez-vous à ce compte pour confirmer son résultat.']],
  [/DEVICE_APPROVAL/,['تعذّر التحقق من اعتماد هذا الجهاز. راجع المسؤول وتأكد من تحديث خدمة المنشأة.','Impossible de vérifier l’approbation de cet appareil. Contactez le responsable et vérifiez la version du service.']],
  [/CLIENT_UPDATE_REQUIRED/,['حدّث التطبيق لاستخدام صلاحيات هذا الحساب بأمان. ترخيصك وبياناتك المحلية محفوظان.','Mettez l’application à jour pour utiliser les droits de ce compte. Votre licence et vos données locales sont conservées.']],
  [/INVALID_IDENTIFIER|ACCOUNT_IDENTIFIER_INVALID/,['أدخل بريد المنشأة أو رقمًا من 8 أرقام يبدأ بـ 2 أو 3 أو 4.','Saisissez l’adresse de l’établissement ou 8 chiffres commençant par 2, 3 ou 4.']],
  [/OFFLINE_LOCAL_SCOPE_REQUIRED/,['ادخل بترخيصك المحلي الحالي ثم اربط الرقم من حساب المالك.','Connectez-vous avec votre licence locale actuelle, puis liez le numéro depuis le compte du propriétaire.']],
  [/CONSENT_REQUIRED/,['اقرأ توضيح استخدام البيانات ووافق عليه قبل المتابعة.','Lisez et acceptez l’utilisation des données avant de continuer.']],
  [/ONLINE_CODE_LENGTH/,['كلمة مرور المنشأة لا تقل عن 12 حرفًا.','Le mot de passe de l’établissement comporte au moins 12 caractères.']],
  [/OFFLINE_CODE_LENGTH/,['اختر رمزًا سريًا لا يقل عن 6 أحرف.','Choisissez un code secret d’au moins 6 caractères.']],
  [/INVALID_CREDENTIAL|LOGIN_FAILED|UNAUTHORIZED|BAD_CREDENTIAL|AUTH_FAILED|ACCOUNT_AUTH_INVALID/,['بيانات الدخول غير صحيحة أو لم يعد الحساب متاحًا. راجع مسؤول منشأتك.','Identifiants incorrects ou accès indisponible. Contactez votre responsable.']],
  [/ACCOUNT_LOGIN_REQUIRED/,['أعد إدخال معرّفك ورمزك السري للمتابعة.','Saisissez à nouveau votre identifiant et votre code secret.']],
  [/REVIEW_REQUIRED/,['راجع سجل المنشأة ونتيجة العملية السابقة، ثم أكّد المراجعة قبل تسجيل عملية أخرى.','Vérifiez le registre et le résultat précédent, puis confirmez cette vérification avant une nouvelle opération.']],
  [/DEVICE_LIMIT|CAPACITY|MAX_DEVICES/,['اكتمل عدد الهواتف المسموح بها للمنشأة. راجع المسؤول.','La limite de téléphones est atteinte. Contactez votre responsable.']],
  [/REVOKED|DISABLED|SUSPENDED|ENTITLEMENT|EXPIRED/,['الوصول غير متاح حاليًا. راجع المسؤول عن الحساب.','L’accès est indisponible. Contactez le responsable du compte.']],
  [/ONLINE_RESULT_UNCERTAIN|RECEIPT_MISMATCH|NATIVE_TIMEOUT|PENDING_ONLINE|NATIVE_PAGE_HIDDEN/,['لم تتأكد نتيجة العملية السابقة. تحقّق من نتيجتها قبل تسجيل عملية أخرى.','Le résultat précédent est incertain. Vérifiez-le avant toute nouvelle opération.']],
  [/SETTLEMENT|VERSION_CONFLICT|STALE_EPOCH|blocked|needs-settlement/i,['لم تُسجل العملية. تغيّرت البيانات أو تحتاج العملية مراجعة مسؤول المنشأة؛ بيانات النموذج محفوظة.','Opération non enregistrée. Les données ont changé ou une vérification du responsable est nécessaire ; votre saisie est conservée.']],
  [/OFFLINE_SCOPE_MISMATCH|OFFLINE_BINDING_INVALID|OFFLINE_SETUP_CREDENTIAL_REQUIRED/,['التفعيل لا يطابق صاحب هذا المحل وبياناته. لم تتغير بيانات الجهاز؛ تواصل مع الدعم.','L’activation ne correspond pas au propriétaire et à cette boutique. Les données sont conservées ; contactez l’assistance.']],
  [/CONSENT|PRIVACY/,['الموافقة على استخدام البيانات مطلوبة.','Votre consentement à l’utilisation des données est requis.']],
  [/FORBIDDEN|BRANCH_READ_REQUIRED/,['لا تسمح صلاحيات حسابك بهذا الإجراء. راجع مسؤول المنشأة.','Vos droits ne permettent pas cette action. Contactez votre responsable.']],
  [/NOT_CONFIGURED|NOT_ENABLED|UNAVAILABLE|HTTP_404|404/,['خدمة الحسابات الجديدة غير متاحة على السيرفر بعد. يمكنك استخدام ترخيصك المحلي الحالي.','Le service des nouveaux comptes n’est pas encore disponible. Votre licence locale reste utilisable.']],
  [/OFFLINE|NETWORK|CONNECTION|fetch|TIMEOUT|HTTP_50|ONLINE_REQUIRED/i,['يلزم اتصال بالإنترنت والتحقق من حساب المنشأة للمتابعة. المسودة باقية في هذه الجلسة.','Une connexion et la vérification du compte sont nécessaires. Le brouillon reste dans cette session.']],
 ];
 const match=messages.find(([pattern])=>pattern.test(key));
 return match?match[1][fr?1:0]:(fr?'Impossible de terminer. Réessayez après avoir vérifié l’état de votre compte.':'تعذّر إكمال الطلب. تحقّق من حالة حسابك ثم أعد المحاولة.');
}
