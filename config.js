// إعدادات النشر — عدّلها بعد إنشاء مشروع Supabase (راجع README)
// اترك relayUrl فارغاً ليعمل التطبيق بالوضع اليدوي فقط
export default {
  // رابط مشروع Supabase مثل: https://abcdxyz.supabase.co
  relayUrl: '',
  // المفتاح العام (anon / publishable) — آمن للنشر لأن الجداول مغلقة والوصول عبر الدوال فقط
  relayAnonKey: '',
  // الفاصل التقريبي لمتابعة الغرفة بالملي ثانية
  pollMs: 4000,
  // رابط الموقع المنشور (يُستخدم لتوليد روابط الشيوخ)، مثل: https://user.github.io/umrah/
  siteUrl: '',
};
