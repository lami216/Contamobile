package mr.alkarna.mobile.approved;
import android.content.Context;
/** UI language only; the signed licence and business data are never translated. */
final class NativeUi {
 static boolean french(Context context){return "fr".equals(context.getSharedPreferences("appearance",Context.MODE_PRIVATE).getString("language","ar"));}
 static String text(Context context,String source){if(source==null)return french(context)?"Une erreur est survenue":"تعذّر تنفيذ العملية";if(!french(context))return source;switch(source){
 case "انتظر اكتمال حفظ الملف الحالي":return "Attendez la fin de l’enregistrement en cours";
 case "تعذّر تجهيز الملف":return "Impossible de préparer le fichier";
 case "تعذّر تشغيل الكاميرا":return "Impossible d’ouvrir la caméra";
 case "تعذّر حفظ ملف التفعيل":return "Impossible d’enregistrer la licence";
 case "تعذّر فتح الطباعة":return "Impossible d’ouvrir l’impression";
 case "تعذّر فتح بيانات التفعيل. أعد فتح التطبيق":return "Impossible de lire la licence. Rouvrez l’application.";
 case "تعذّر فتح وسيلة التواصل. الرقم: 49823328":return "Impossible d’ouvrir le contact. Numéro : 49823328";
 case "تعذّر كتابة الملف":return "Impossible d’écrire le fichier";
 case "قارئ الباركود مفتوح بالفعل":return "Le lecteur de codes-barres est déjà ouvert";
 case "لا توجد خدمة لحفظ الملفات على هذا الجهاز":return "Aucun service d’enregistrement de fichiers sur cet appareil";
 case "لم يكتمل حفظ الملف؛ أعد المحاولة":return "Enregistrement incomplet. Réessayez.";
 case "لم يُحفظ الملف":return "Le fichier n’a pas été enregistré";
 case "لم يُسمح بالكاميرا. أدخل الباركود يدويًا.":return "Caméra non autorisée. Saisissez le code-barres manuellement.";
 case "إغلاق الكاميرا":return "Fermer la caméra";
 case "الكاميرا غير متاحة. أدخل الباركود يدويًا.":return "Caméra indisponible. Saisissez le code-barres manuellement.";
 case "وجّه الكاميرا نحو الباركود":return "Visez le code-barres avec la caméra";
 case "أضف ملف تفعيل هذا الهاتف":return "Ajoutez la licence de ce téléphone";
 case "تعذّر استخراج كود الهاتف":return "Impossible de lire le code du téléphone";
 case "تعذّر التحقق من بيانات التفعيل المحفوظة. تواصل مع مسؤول التفعيل":return "Impossible de vérifier la licence enregistrée. Contactez l’assistance.";
 case "تعذّر التحقق من سجل التفعيل. تواصل مع مسؤول التفعيل":return "Impossible de vérifier l’historique d’activation. Contactez l’assistance.";
 case "تعذّر حفظ التفعيل. تحقّق من مساحة التخزين وأعد فتح التطبيق":return "Impossible d’enregistrer la licence. Vérifiez le stockage puis rouvrez l’application.";
 case "فعّل هذا الهاتف للبدء":return "Activez ce téléphone pour commencer";
 case "لم يكتمل حفظ التفعيل. أعد فتح التطبيق قبل المحاولة مجددًا":return "Activation non enregistrée. Rouvrez l’application avant de réessayer.";
 case "ملف الترخيص المحفوظ غير صالح. أضف ملف تفعيل جديدًا":return "La licence enregistrée est invalide. Ajoutez un nouveau fichier.";
 case "ملف التفعيل مستخدم من قبل. اطلب ملفًا جديدًا للتجديد":return "Cette licence a déjà été utilisée. Demandez un nouveau fichier pour le renouvellement.";
 case "انتهت مدة الترخيص. أضف ملف تفعيل جديدًا":return "La licence a expiré. Ajoutez un nouveau fichier.";
 case "تم اكتشاف إرجاع ساعة الجهاز. تواصل مع مسؤول التفعيل":return "Un recul de l’horloge a été détecté. Contactez l’assistance.";
 case "تعذّر استخراج كود الجهاز":return "Impossible de lire le code de l’appareil";
 case "ملف الترخيص أكبر من 64 كيلوبايت":return "Le fichier de licence dépasse 64 Ko";
 case "ملف الترخيص غير صالح أو تم تغييره":return "Le fichier de licence est invalide ou a été modifié";
 case "هذا الترخيص مخصص لجهاز آخر":return "Cette licence est destinée à un autre appareil";
 default:return source;}}
}
