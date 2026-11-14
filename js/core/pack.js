// نموذج الحزمة (pack.json): باب ← أقسام ← شرائح ← خطوات كشف ← كتل
// راجع README لوصف الصيغة. الإصدار الحالي للصيغة: 1

export const PACK_FORMAT = 'alkhalaf-umrah-guide';
export const SCHEMA_VERSION = 1;

export const CHAPTER_STATUS = {
  published: 'منشور',
  hidden: 'مخفي',
  soon: 'قريباً',
};

export const AUDIENCE = { all: 'الكل', men: 'رجال', women: 'نساء' };

export const DEFAULT_SETTINGS = {
  appName: 'الدليل التفاعلي للمعتمر',
  org: 'حملة الخلف للحج والعمرة',
  disclaimer: 'هذا الشرح لا يغني عن الرجوع إلى رسالة مرجعك العملي',
  copyright: '© حملة الخلف — جميع الحقوق محفوظة',
  terms: [
    'هذا التطبيق مادة تعليمية خاصة بمعتمري حملة الخلف للحج والعمرة.',
    'المحتوى محفوظ الحقوق للحملة، ولا يجوز نسخه أو نشره أو بيعه دون إذن مكتوب منها.',
    'لا يجمع التطبيق اسمك ولا رقم جوالك ولا أي بيانات شخصية، وتُحفظ إعداداتك على جهازك فقط.',
    'هذا الشرح لا يغني عن الرجوع إلى رسالة مرجعك العملي.',
  ].join('\n'),
  // كيف يُحدَّد مرجع المعتمر: ask = يسأله التطبيق، all = تُعرض أقوال كل المراجع دون سؤال، أو معرّف مرجع واحد للجميع
  marjaMode: 'ask',
  // عنوان كتاب الشيخ (غلافه وأزراره)
  bookTitle: 'كتاب الشيخ',
  explainFor: 'all', // من يرى «شرح الشيخ»: all = الشيخ والمعتمر، sheikh = الشيخ فقط (ويمكن تغييره لكل شريحة)
  marjas: [
    { id: 'khoei', name: 'الخوئي', aliases: ['الخوئي', 'خوئي', 'الخوئى'] },
    { id: 'sistani', name: 'السيستاني', aliases: ['السيستاني', 'سيستاني', 'السيستانى'] },
  ],
};

export function uid(prefix = 'x') {
  const a = new Uint8Array(6);
  (globalThis.crypto || {}).getRandomValues?.(a);
  return prefix + '-' + Array.from(a, b => (b % 36).toString(36)).join('') + Date.now().toString(36).slice(-3);
}

export function emptyPack() {
  return {
    format: PACK_FORMAT,
    schema: SCHEMA_VERSION,
    version: newVersion(),
    updated: new Date().toISOString(),
    settings: structuredClone(DEFAULT_SETTINGS),
    chapters: [],
  };
}

export function emptyChapter(title = 'باب جديد', status = 'hidden') {
  return { id: uid('ch'), title, status, minutes: 30, sections: [emptySection('القسم الأول')] };
}

export function emptySection(title = 'قسم جديد') {
  return { id: uid('sec'), title, minutes: null, slides: [] };
}

export function emptySlide(title = 'شريحة جديدة') {
  return {
    id: uid('s'), title, audience: 'all',
    steps: [{ blocks: [] }],
    explain: '', notes: '',
    review: { status: 'unreviewed', by: '', at: '' },
  };
}

// رقم إصدار الحزمة بتوقيت الرياض: YYYY.MM.DD-HHMM
export function newVersion(date = new Date()) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date).reduce((o, p) => (o[p.type] = p.value, o), {});
  return `${f.year}.${f.month}.${f.day}-${f.hour}${f.minute}`;
}

// ترقية الحزم القديمة إلى الصيغة الحالية دون كسر ما سبق
export function migrate(pack) {
  if (!pack || typeof pack !== 'object') throw new Error('ملف الحزمة غير صالح');
  if (pack.format && pack.format !== PACK_FORMAT) throw new Error('هذا الملف ليس حزمة للدليل التفاعلي');
  pack.schema ??= 1;
  if (pack.schema > SCHEMA_VERSION) console.warn('الحزمة أحدث من التطبيق؛ قد لا تظهر بعض الكتل');
  pack.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(pack.settings || {}) };
  pack.chapters ??= [];
  for (const ch of pack.chapters) {
    ch.status ??= 'hidden';
    ch.sections ??= [];
    for (const sec of ch.sections) {
      sec.slides ??= [];
      for (const s of sec.slides) {
        s.steps ??= [{ blocks: [] }];
        if (!s.steps.length) s.steps.push({ blocks: [] });
        s.review ??= { status: 'unreviewed', by: '', at: '' };
        s.audience ??= 'all';
        s.explain ??= '';
        s.notes ??= '';
      }
    }
  }
  return pack;
}

export async function loadPack(url = 'content/pack.json', { cache = 'no-cache' } = {}) {
  const r = await fetch(url, { cache });
  if (!r.ok) throw new Error('تعذّر تحميل الدرس (' + r.status + ')');
  return migrate(await r.json());
}

// قائمة شرائح الباب مسطّحة مع رقمها داخل الباب
export function flatSlides(chapter) {
  const out = [];
  chapter?.sections?.forEach(sec => sec.slides.forEach(slide => out.push({ slide, section: sec, no: out.length + 1 })));
  return out;
}

export function findChapter(pack, id) { return pack.chapters.find(c => c.id === id); }

/** مرجع المعتمر بحسب إعداد الحملة: اختياره هو، أو كل الأقوال، أو مرجع واحد يحدده المشرف */
export function pilgrimMarja(settings, stored) {
  const m = settings?.marjaMode || 'ask';
  if (m === 'ask') return stored;
  if (m === 'all') return 'other';
  return (settings.marjas || []).some(x => x.id === m) ? m : 'other';
}
export const bookTitle = settings => String(settings?.bookTitle || '').trim() || 'كتاب الشيخ';
export const askingMarja = settings => (settings?.marjaMode || 'ask') === 'ask';

/** من يرى «شرح الشيخ» لهذه الشريحة: إعداد الشريحة أولاً ثم الإعداد العام */
export function explainFor(pack, slide) { return slide?.explainFor || pack?.settings?.explainFor || 'all'; }
export const EXPLAIN_FOR = { all: 'الشيخ والمعتمر', sheikh: 'الشيخ فقط' };

// مراحل الرسوم المتحركة: كل مرحلة نقرة من الشيخ (تُحسب ضمن خطوات الشريحة دون خطوات فارغة)
export const DIAGRAM_STAGES = {
  tawaf: [['map', 'المطاف'], ['start', 'نقطة البدء'], ['left', 'الكعبة على اليسار'], ...[1, 2, 3, 4, 5, 6, 7].map(n => ['lap' + n, 'الشوط ' + n])],
  sai: [['map', 'المسعى'], ['green', 'العلامتان الخضراوان'], ['start', 'البدء من الصفا'], ...[1, 2, 3, 4, 5, 6, 7].map(n => ['lap' + n, 'الشوط ' + n])],
  wudu: [['parts', 'أجزاء الوضوء'], ['face-limits', 'حدّ الوجه'], ['face', 'غسل الوجه'], ['arm-limits', 'حدّ اليد'], ['right-arm', 'غسل اليد اليمنى'], ['left-arm', 'غسل اليد اليسرى'], ['head', 'مسح الرأس'], ['right-foot', 'مسح القدم اليمنى'], ['left-foot', 'مسح القدم اليسرى'], ['order', 'الترتيب والموالاة']],
  ghusl: [['types', 'كيفيتا الغسل'], ['niyya', 'النية'], ['head', 'الرأس والرقبة'], ['right', 'الجانب الأيمن'], ['left', 'الجانب الأيسر'], ['done', 'إيصال الماء إلى البشرة'], ['dafi', 'الارتماس الدفعي'], ['tadriji', 'الارتماس التدريجي']],
};
export const DIAGRAM_KINDS = { tawaf: 'مخطط الطواف', sai: 'مخطط السعي', wudu: 'كيفية الوضوء', ghusl: 'كيفية الغسل' };

export function stepCount(slide) {
  let n = Math.max(0, (slide?.steps?.length || 1) - 1);
  (slide?.steps || []).forEach((st, k) => {
    for (const b of st.blocks || []) if (b.type === 'diagram' && DIAGRAM_STAGES[b.kind]) n = Math.max(n, k + DIAGRAM_STAGES[b.kind].length - 1);
  });
  return n;
}

export function chapterMinutesCheck(ch) {
  const sum = ch.sections.reduce((a, s) => a + (Number(s.minutes) || 0), 0);
  return { sum, limit: Number(ch.minutes) || 0, over: ch.minutes && sum > ch.minutes };
}

export function publishedChapters(pack) {
  return pack.chapters.filter(c => c.status === 'published');
}

// كل الكتل في شريحة مع رقم خطوتها
export function* slideBlocks(slide) {
  for (let k = 0; k < slide.steps.length; k++) for (const b of slide.steps[k].blocks) yield { block: b, step: k };
}
