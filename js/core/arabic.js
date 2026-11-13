// أدوات النص العربي: حذف التشكيل، تطبيع البحث، والتحقق من أن التشكيل لم يغيّر حرفاً

// علامات التشكيل المحذوفة عند المقارنة: U+064B..U+065F و U+0670 (الألف الخنجرية) و U+0640 (التطويل)
export const TASHKEEL_RE = /[ً-ٰٟـ]/g;

export function stripTashkeel(s) {
  return String(s ?? '').replace(TASHKEEL_RE, '');
}

// توحيد المسافات فقط (لا يمس الحروف)
function normSpace(s) {
  return String(s ?? '').replace(/[\s ]+/g, ' ').trim();
}

/**
 * يتحقق أن النص المشكول يطابق الأصل حرفاً بحرف بعد حذف التشكيل.
 * يعيد { ok, index, expected, got, message } ويفشل عند أول حرف مختلف.
 * إن مُرِّر keepOriginalMarks=true يتحقق أيضاً أن كل علامة تشكيل موجودة في الأصل باقية على حرفها.
 */
export function verifyTashkeel(original, voweled, { keepOriginalMarks = true } = {}) {
  const a = normSpace(stripTashkeel(original));
  const b = normSpace(stripTashkeel(voweled));
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return {
        ok: false, index: i, expected: a[i] ?? '∅', got: b[i] ?? '∅',
        message: `اختلاف عند الحرف ${i + 1}: المتوقع «${a[i] ?? '—'}» والموجود «${b[i] ?? '—'}» — «…${a.slice(Math.max(0, i - 12), i + 12)}…»`,
      };
    }
  }
  if (keepOriginalMarks) {
    const ma = marksPerLetter(original), mb = marksPerLetter(voweled);
    for (let i = 0; i < ma.length; i++) {
      for (const m of ma[i].marks) {
        if (!mb[i] || !mb[i].marks.includes(m)) {
          return {
            ok: false, index: i, expected: m, got: (mb[i]?.marks || []).join(''),
            message: `علامة تشكيل من الأصل حُذفت عند الحرف ${i + 1} («${ma[i].ch}»)`,
          };
        }
      }
    }
  }
  return { ok: true, message: 'مطابق' };
}

// يعيد لكل حرف (بعد توحيد المسافات) قائمة علاماته
function marksPerLetter(s) {
  const out = [];
  const t = normSpace(s);
  for (const ch of t) {
    if (/[ً-ٰٟ]/.test(ch)) { if (out.length) out[out.length - 1].marks.push(ch); }
    else if (ch === 'ـ') { /* التطويل لا يُحسب */ }
    else out.push({ ch, marks: [] });
  }
  return out;
}

// تطبيع للبحث: حذف التشكيل وتوحيد الهمزات والياء والتاء المربوطة
export function normalizeSearch(s) {
  return stripTashkeel(s)
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// أرقام عربية-هندية → لاتينية (لإدخال رقم الغرفة)
export function toLatinDigits(s) {
  return String(s ?? '').replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0));
}

// تصنيف حالة الحكم بحسب لفظ النص فقط
export const STATUS_LABELS = {
  fatwa: 'فتوى',
  wajib: 'احتياط وجوبي',
  mustahab: 'احتياط استحبابي',
  unspecified: 'غير محدد',
};

export function detectStatus(text) {
  const t = normalizeSearch(text);
  const kinds = new Set();
  if (/احوط وجوبا/.test(t)) kinds.add('wajib');
  if (/احوط استحبابا/.test(t)) kinds.add('mustahab');
  if (kinds.size === 1) return [...kinds][0];
  return 'unspecified';
}
