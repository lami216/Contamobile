import type { Locale } from '@/domain/types';

type ErrorLike={message?:unknown;code?:unknown};

const exact:Record<string,string>={
  'المخزن غير موجود':'Le dépôt est introuvable.',
  'المنتج غير موجود':'Le produit est introuvable.',
  'الحساب غير موجود':'Le compte est introuvable.',
  'وسيلة الدفع غير موجودة':'Le moyen de paiement est introuvable.',
  'اسم المنتج مطلوب':'Le nom du produit est obligatoire.',
  'ملاحظة المنتج طويلة جدًا':'La note du produit est trop longue.',
  'هذا الباركود مستخدم لمنتج آخر':'Ce code-barres est déjà utilisé par un autre produit.',
  'سعر الشراء والمخزن مطلوبان عند إدخال رصيد بداية':"Le prix d’achat et le dépôt sont obligatoires pour saisir un stock initial.",
  'اسم الحساب مطلوب':'Le nom du compte est obligatoire.',
  'اسم المخزن مطلوب':'Le nom du dépôt est obligatoire.',
  'يجب إضافة منتج واحد على الأقل':'Ajoutez au moins un produit.',
  'لا يمكن تكرار المنتج في الفاتورة':'Un produit ne peut pas être ajouté deux fois à la même facture.',
  'يجب اختيار عميل صالح':'Choisissez un client valide.',
  'يجب اختيار مورد صالح':'Choisissez un fournisseur valide.',
  'اختر عميلاً عند وجود مبلغ مستحق':'Choisissez un client lorsqu’un montant reste dû.',
  'اختر موردًا عند وجود مبلغ مستحق':'Choisissez un fournisseur lorsqu’un montant reste dû.',
  'اختر مخزنين مختلفين':'Choisissez deux dépôts différents.',
  'سبب التصحيح مطلوب':'Le motif de la correction est obligatoire.',
  'لا يوجد تغيير في المخزون لاعتماده':'Aucune modification de stock à valider.',
  'العنوان والتاريخ مطلوبان':'Le libellé et la date sont obligatoires.',
  'اسم وسيلة الدفع مطلوب':'Le nom du moyen de paiement est obligatoire.',
  'رصيد البداية غير صالح':'Le solde initial est invalide.',
  'اختر حسابين مختلفين':'Choisissez deux comptes différents.',
  'رصيد البداية الصحيح غير صالح':'Le nouveau solde initial est invalide.',
  'رصيد البداية الجديد يطابق الرصيد الحالي':'Le nouveau solde initial est identique au solde actuel.',
  'اسم البنك أو وسيلة الدفع مطلوب':'Le nom de la banque ou du moyen de paiement est obligatoire.',
  'بيانات وسيلة الدفع غير صالحة':'Les informations du moyen de paiement sont invalides.',
  'لا يمكن حذف وسيلة الدفع النقدية الأساسية':'Le moyen de paiement espèces principal ne peut pas être supprimé.',
  'لا يمكن حذف أو أرشفة وسيلة الدفع ورصيدها غير صفري. صفّر أو سوِّ الرصيد أولًا.':"Impossible d’archiver ce moyen de paiement tant que son solde n’est pas nul.",
  'وسيلة الدفع غير مؤرشفة':'Ce moyen de paiement n’est pas archivé.',
  'رقم الهاتف مستخدم لحساب آخر من نفس النوع':'Ce numéro de téléphone est déjà utilisé par un autre compte du même type.',
  'المستخدم غير موجود':'Utilisateur introuvable.',
  'اسم المستخدم مطلوب':"L’identifiant est obligatoire.",
  'اسم المستخدم مستخدم بالفعل':"Cet identifiant est déjà utilisé.",
  'لا يمكن تعطيل المستخدم الوحيد. فعّل مستخدمًا آخر أولًا.':'Impossible de désactiver le seul utilisateur actif. Activez-en un autre d’abord.',
  'ملف النسخة الاحتياطية غير صالح أو غير مدعوم':'Le fichier de sauvegarde est invalide ou non pris en charge.',
  'هذا الملف ليس نسخة الكرنه':"Ce fichier n’est pas une sauvegarde Al Karna.",
  'إصدار النسخة أحدث من هذا التطبيق':'La sauvegarde provient d’une version plus récente de l’application.',
  'إصدار النسخة غير مدعوم':'Cette version de sauvegarde n’est pas prise en charge.',
  'ملف النسخة ليس JSON صالحًا':'Le fichier de sauvegarde n’est pas un JSON valide.',
  'يجب أن تحتوي النسخة على مخزن بيع افتراضي واحد':'La sauvegarde doit contenir exactement un dépôt de vente par défaut.',
  'ملف نسخة الكمبيوتر أكبر من 50MB':'La sauvegarde ordinateur dépasse la limite de 50 Mo.',
  'ملف نسخة الكمبيوتر ليس JSON صالحًا':"La sauvegarde ordinateur n’est pas un JSON valide.",
  'هذا الملف ليس نسخة رسمية مدعومة من نسخة الكمبيوتر':"Ce fichier n’est pas une sauvegarde ordinateur officielle prise en charge.",
  'بنية collections غير صالحة':'La structure des collections de la sauvegarde est invalide.',
  'عدد السجلات في النسخة أكبر من الحد المسموح':'La sauvegarde contient trop d’enregistrements.',
  'معرف المخزن مكرر أو غير صالح':'Un identifiant de dépôt est dupliqué ou invalide.',
  'معرف المنتج مكرر أو غير صالح':'Un identifiant de produit est dupliqué ou invalide.',
  'معرف الحساب مكرر أو غير صالح':'Un identifiant de compte est dupliqué ou invalide.',
  'معرف الطرف مكرر أو غير صالح':'Un identifiant de tiers est dupliqué ou invalide.',
  'معرف المستند مكرر أو غير صالح':'Un identifiant de document est dupliqué ou invalide.',
  'نسخة الكمبيوتر يجب أن تحتوي مخزن بيع افتراضيًا واحدًا':'La sauvegarde ordinateur doit contenir exactement un dépôt de vente par défaut.',
  'مخزون يشير إلى مخزن غير موجود':'Un stock fait référence à un dépôt introuvable.',
  'مستند يشير إلى مخزن غير موجود':'Un document fait référence à un dépôt introuvable.',
  'تحويل يشير إلى مخزن غير موجود':'Un transfert fait référence à un dépôt introuvable.',
  'مستند يشير إلى طرف غير موجود':'Un document fait référence à un client ou fournisseur introuvable.',
  'مستند يشير إلى وسيلة دفع غير موجودة':'Un document fait référence à un moyen de paiement introuvable.',
  'تسلسل البيع اليومي مكرر':'La séquence quotidienne des ventes contient un doublon.',
  'مستند يشير إلى منتج غير موجود':'Un document fait référence à un produit introuvable.',
  'حركة مخزون تشير إلى منتج غير موجود':'Un mouvement de stock fait référence à un produit introuvable.',
  'حركة مخزون تشير إلى مخزن غير موجود':'Un mouvement de stock fait référence à un dépôt introuvable.',
  'حركة مخزون تشير إلى مستند غير موجود':'Un mouvement de stock fait référence à un document introuvable.',
  'اسم مستخدم مكرر أو غير صالح في نسخة الكمبيوتر':'Un identifiant utilisateur de la sauvegarde ordinateur est dupliqué ou invalide.',
  'لم يتم اختيار ملف':'Aucun fichier n’a été sélectionné.',
  'التاريخ غير صالح':'La date est invalide.',
  'الفترة مطلوبة':'La période est obligatoire.',
  'بداية الفترة يجب ألا تتجاوز نهايتها':'La date de début ne peut pas être postérieure à la date de fin.',
  'يجب اختيار الطرف':'Choisissez un client ou un fournisseur.',
  'الطرف غير موجود':'Le client ou fournisseur est introuvable.',
  'لا يمكن تعديل هذه الفاتورة':'Cette facture ne peut pas être modifiée.',
  'الفاتورة غير موجودة':'La facture est introuvable.',
  'المصروف غير موجود':'La dépense est introuvable.',
};

function dynamic(message:string){
  let match=message.match(/^المخزون غير كافٍ للمنتج (.+)$/);if(match)return `Stock insuffisant pour ${match[1]}.`;
  match=message.match(/^انتهت صلاحية (.+) ولا يمكن بيعه$/);if(match)return `${match[1]} est périmé et ne peut pas être vendu.`;
  match=message.match(/^تكلفة الشراء مطلوبة لإضافة مخزون (.+)$/);if(match)return `Le coût d’achat est obligatoire pour ajouter du stock à ${match[1]}.`;
  match=message.match(/^لا يمكن تعديل الفاتورة لأن جزءًا من مخزونها تم التصرف فيه\.?$/);if(match)return 'Impossible de modifier la facture car une partie de son stock a déjà été utilisée.';
  match=message.match(/^لا يمكن حذف الفاتورة لأن جزءًا من مخزونها تم التصرف فيه\.?$/);if(match)return 'Impossible d’annuler la facture car une partie de son stock a déjà été utilisée.';
  match=message.match(/^النسخة لا تحتوي جدول (.+)$/);if(match)return `La sauvegarde ne contient pas la table ${match[1]}.`;
  match=message.match(/^حقل غير متوقع في (.+)$/);if(match)return `Champ inattendu dans ${match[1]}.`;
  match=message.match(/^collection مفقود: (.+)$/);if(match)return `Collection manquante dans la sauvegarde : ${match[1]}.`;
  return null;
}

export function translateError(input:unknown,locale:Locale,fallback:string){
  const message=input instanceof Error?input.message:typeof input==='string'?input:String((input as ErrorLike|null)?.message??'').trim();
  if(!message)return fallback;
  if(locale==='ar')return message;
  return exact[message]??dynamic(message)??message;
}
