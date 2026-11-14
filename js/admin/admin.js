// لوحة المشرف: الأبواب، المحرر، الاستيراد، المراجعة، النشر والإعدادات، الشيوخ والغرف
import '../core/blocks-builtin.js';
import { el, $, toast, download, fmtDate } from '../core/dom.js';
import { flatSlides, emptyChapter, uid, newVersion, CHAPTER_STATUS, chapterMinutesCheck, PACK_FORMAT, SCHEMA_VERSION, EXPLAIN_FOR, bookTitle } from '../core/pack.js';
import { openBook } from './book-open.js';
import { marjaCard } from './marjas.js';
import { slideMedia } from '../core/render.js';
import { applyPrefs, confirmBox, modal } from '../core/ui.js';
import { A, loadWork, replaceWork, changed, onChange, logChange, putMedia, preloadMediaUrls, getMediaBlob, flush, clearAll } from './state.js';
import { openEditor } from './editor.js';
import { reviewTab } from './review.js';
import { sheikhsTab } from './sheikhs.js';
import { importPptx } from './importer.js';
import { fontsReady } from '../core/stage.js';

const TABS = [
  ['chapters', 'الأبواب'], ['editor', 'المحرر'], ['import', 'استيراد'], ['review', 'المراجعة والتصحيح'],
  ['publish', 'النشر والإعدادات'], ['sheikhs', 'الشيوخ والغرف'],
];
let current = 'chapters';
const main = el('main.admin-main');
const savedLbl = el('span.small', { 'aria-live': 'polite' });

function shell() {
  const nav = el('nav.tabs', { role: 'tablist' }, TABS.map(([id, t]) => el('button', { type: 'button', role: 'tab', 'aria-selected': String(id === current), onclick: () => show(id) }, t)));
  $('#app').replaceChildren(
    el('header.appbar', {}, el('img.mark', { src: 'assets/img/logo-mark.jpg', alt: '' }),
      el('div.title', {}, el('b', {}, 'محرر الدليل التفاعلي للمعتمر'), el('span', {}, 'للمشرف والشيخ المراجع')), savedLbl),
    nav, main);
}
onChange(kind => {
  if (kind === 'saved') savedLbl.textContent = A.savedAt ? `حُفظ تلقائياً ${A.savedAt.toLocaleTimeString('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', hour: 'numeric', minute: '2-digit' })}` : 'تعذّر الحفظ في المتصفح!';
});

export function show(id, ...args) {
  current = id;
  document.querySelectorAll('.tabs button').forEach((b, i) => b.setAttribute('aria-selected', String(TABS[i][0] === id)));
  main.replaceChildren();
  ({ chapters: chaptersTab, editor: h => openEditor(h, ...args), import: importTab, review: reviewTab, publish: publishTab, sheikhs: sheikhsTab })[id](main);
}

// ---------- الأبواب ----------
function chaptersTab(host) {
  const rows = A.pack.chapters.map((ch, i) => {
    const n = flatSlides(ch).length, rv = flatSlides(ch).filter(x => x.slide.review?.status === 'reviewed').length;
    const mins = chapterMinutesCheck(ch);
    return el('div.ch-row', {},
      el('div.ch-main', {},
        el('input.inline.big', { type: 'text', value: ch.title, 'aria-label': 'عنوان الباب', onchange: e => { logChange({ where: 'الأبواب', field: 'عنوان الباب', before: ch.title, after: e.target.value }); ch.title = e.target.value; changed(); } }),
        el('div.small', {}, `${n} شريحة · ${ch.sections.length} قسم · مدقَّق ${rv}/${n}`),
        mins.over ? el('div.warnline', {}, `⚠ مجموع دقائق الأقسام (${mins.sum}) يتجاوز وقت الباب (${ch.minutes})`) : null),
      el('label.fld.inl', {}, el('span', {}, 'الحالة'), el('select', { onchange: e => { logChange({ where: ch.title, field: 'حالة الباب', before: ch.status, after: e.target.value }); ch.status = e.target.value; changed(); } },
        Object.entries(CHAPTER_STATUS).map(([v, t]) => el('option', { value: v, selected: ch.status === v ? true : null }, t)))),
      el('label.fld.inl', {}, el('span', {}, 'الدقائق'), el('input', { type: 'number', min: 0, value: ch.minutes ?? '', style: { width: '80px' }, onchange: e => { ch.minutes = Number(e.target.value) || 0; changed(); chaptersTab(host); } })),
      el('div.row', {},
        el('button.tool', { type: 'button', title: 'لأعلى', onclick: () => { if (i) { [A.pack.chapters[i - 1], A.pack.chapters[i]] = [ch, A.pack.chapters[i - 1]]; changed(); chaptersTab(host); } } }, '↑'),
        el('button.tool', { type: 'button', title: 'لأسفل', onclick: () => { if (i < A.pack.chapters.length - 1) { [A.pack.chapters[i + 1], A.pack.chapters[i]] = [ch, A.pack.chapters[i + 1]]; changed(); chaptersTab(host); } } }, '↓'),
        el('button.btn', { type: 'button', onclick: () => show('editor', ch.id) }, 'حرّر'),
        el('button.tool', { type: 'button', onclick: () => openBook(ch.id) }, `📖 ${bookTitle(A.pack.settings)} (PDF)`),
        el('button.tool', { type: 'button', onclick: () => exportChapter(ch) }, 'تصدير JSON'),
        el('button.tool.danger', { type: 'button', onclick: async () => {
          if (!(await confirmBox(`حذف باب «${ch.title}» نهائياً من نسخة العمل؟ (${n} شريحة)`, 'نعم، احذف', 'تراجع'))) return;
          A.pack.chapters.splice(i, 1); logChange({ where: 'الأبواب', field: 'حذف باب', before: ch.title, after: '' }); changed(); chaptersTab(host);
        } }, 'حذف')));
  });
  host.replaceChildren(
    el('section.card', {}, el('h3', {}, 'الأبواب'),
      el('p.small', {}, 'كل باب وحدة مستقلة: إضافته أو حذفه أو إخفاؤه لا يمس غيره. المعتمر يرى «المنشور» فقط؛ «مخفي» يستطيع الشيخ عرضه؛ «قريباً» لا يظهر لأحد.'),
      ...rows,
      el('div.row', { style: { marginTop: '12px' } },
        el('button.btn', { type: 'button', onclick: () => { const c = emptyChapter('باب جديد', 'hidden'); A.pack.chapters.push(c); logChange({ where: 'الأبواب', field: 'إضافة باب', before: '', after: c.title }); changed(); show('editor', c.id); } }, '+ باب فارغ'),
        el('button.btn.ghost', { type: 'button', onclick: () => show('import') }, 'استيراد باب من PPTX أو JSON'))),
    el('section.card', {}, el('h3', {}, '📖 ' + bookTitle(A.pack.settings)),
      el('label.fld', {}, el('span', {}, 'عنوان الكتاب (يظهر على الغلاف وفي الأزرار)'),
        el('input', { type: 'text', value: bookTitle(A.pack.settings), placeholder: 'كتاب الشيخ', onchange: e => {
          const v = e.target.value.trim() || 'كتاب الشيخ', before = bookTitle(A.pack.settings);
          if (v === before) return;
          A.pack.settings.bookTitle = v; logChange({ where: 'الإعدادات', field: 'عنوان كتاب الشيخ', before, after: v }); changed(); chaptersTab(host); toast('غُيّر عنوان الكتاب');
        } })),
      el('p.small', {}, 'كتاب للطباعة أو الحفظ PDF فيه العرض كاملاً خطوة بخطوة مع شرح الشيخ وملاحظاته، ترسله لشيخ الباص ليقرأه قبل المحاضرة. يُبنى من نسخة العمل الحالية، ويستطيع الشيخ أيضاً فتحه من شاشته بعد الدخول.'),
      el('button.btn', { type: 'button', onclick: () => openBook('all') }, `افتح ${bookTitle(A.pack.settings)} لكل الأبواب`)));
}

async function exportChapter(ch) {
  await flush();
  const media = {};
  for (const x of flatSlides(ch)) for (const p of slideMedia(x.slide)) {
    try { const b = await getMediaBlob(p); media[p] = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); } catch (e) { toast(e.message); }
  }
  download(`باب-${ch.title.replace(/\s+/g, '-')}.json`, JSON.stringify({ format: 'alkhalaf-umrah-chapter', schema: SCHEMA_VERSION, chapter: ch, media }));
}

function reId(ch) {
  ch.id = uid('ch');
  for (const sec of ch.sections) { sec.id = uid('sec'); for (const s of sec.slides) { s.id = uid('s'); s.steps.forEach(st => st.blocks.forEach(b => { b.id = uid('b'); })); } }
}

// ---------- الاستيراد ----------
function importTab(host) {
  const prog = el('div.progress', {}, el('i'));
  const progTxt = el('p.small');
  const report = el('div');
  const ranges = el('div.ranges');
  let file = null;
  const addRange = (from = 1, to = 999, title = '') => ranges.append(el('div.row.range', {},
    el('span', {}, 'من شريحة'), el('input', { type: 'number', min: 1, value: from, style: { width: '80px' }, 'data-k': 'from' }),
    el('span', {}, 'إلى'), el('input', { type: 'number', min: 1, value: to, style: { width: '80px' }, 'data-k': 'to' }),
    el('input', { type: 'text', value: title, placeholder: 'اسم الباب', 'data-k': 'title', style: { flex: 1 } }),
    el('button.tool', { type: 'button', onclick: e => e.target.closest('.range').remove() }, '🗑')));
  const pptx = el('input', { type: 'file', accept: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation', onchange: async e => {
    file = e.target.files[0]; if (!file) return;
    try {
      const zip = await JSZip.loadAsync(file);
      const n = (await zip.file('ppt/presentation.xml').async('string')).match(/<p:sldId /g)?.length || 0;
      ranges.replaceChildren(); addRange(1, n, file.name.replace(/\.pptx$/i, ''));
      progTxt.textContent = `في الملف ${n} شريحة. حدّد نطاق كل باب ثم اضغط «استيراد».`;
    } catch { toast('ملف PPTX غير صالح'); }
  } });
  const run = el('button.btn', { type: 'button', onclick: async () => {
    if (!file) return toast('اختر ملف PPTX');
    const rs = [...ranges.querySelectorAll('.range')].map(r => ({ from: +r.querySelector('[data-k=from]').value, to: +r.querySelector('[data-k=to]').value, title: r.querySelector('[data-k=title]').value.trim() || 'باب مستورد', status: 'hidden', minutes: 30 }));
    run.disabled = true;
    try {
      const res = await importPptx(file, { fileName: file.name, ranges: rs, marjas: A.pack.settings.marjas, onProgress: (m, r) => { progTxt.textContent = m; prog.firstChild.style.width = Math.round(r * 100) + '%'; } });
      for (const [p, b] of res.media) await putMedia(p, b);
      await preloadMediaUrls();
      A.pack.chapters.push(...res.chapters);
      logChange({ where: 'الاستيراد', field: 'استيراد PPTX', before: '', after: `${file.name}: ${res.chapters.map(c => c.title).join('، ')}` });
      changed();
      const text = `# تقرير استيراد ${file.name}\n\n` + res.report.join('\n');
      report.replaceChildren(el('h3', {}, 'تقرير الاستيراد'),
        el('div.row', {}, el('button.btn.ghost', { type: 'button', onclick: () => download('import-report.md', text, 'text/markdown') }, 'تنزيل التقرير'),
          ...res.chapters.map(c => el('button.btn', { type: 'button', onclick: () => show('editor', c.id) }, 'حرّر: ' + c.title))),
        el('pre.report', {}, text));
      toast('اكتمل الاستيراد. الأبواب الجديدة «مخفية» حتى تراجعها وتنشرها.');
    } catch (e) { console.error(e); toast('تعذّر الاستيراد: ' + e.message); }
    run.disabled = false;
  } }, 'استيراد');
  const json = el('input', { type: 'file', accept: '.json,application/json', onchange: async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.format !== 'alkhalaf-umrah-chapter' || !d.chapter) throw new Error('ليس ملف باب');
      const ch = d.chapter;
      const ids = new Set(A.pack.chapters.flatMap(c => [c.id, ...flatSlides(c).map(x => x.slide.id)]));
      if (ids.has(ch.id) || flatSlides(ch).some(x => ids.has(x.slide.id))) reId(ch);
      ch.status = 'hidden';
      for (const [p, u] of Object.entries(d.media || {})) await putMedia(p, await (await fetch(u)).blob());
      await preloadMediaUrls();
      A.pack.chapters.push(ch);
      logChange({ where: 'الاستيراد', field: 'استيراد باب JSON', before: '', after: ch.title });
      changed(); toast('استُورد الباب «' + ch.title + '» مخفياً'); show('chapters');
    } catch (err) { toast('تعذّر الاستيراد: ' + err.message); }
  } });
  host.replaceChildren(
    el('section.card', {}, el('h3', {}, 'استيراد عرض PowerPoint (PPTX)'),
      el('p.small', {}, 'تقرأ الأداة النصوص حرفياً بترتيب الشرائح، وتحوّل كل نقرة ظهور إلى «خطوة كشف»، وتحوّل الصور إلى WebP بحد أقصى 200KB، وتتعرف على أقوال المراجع والأسئلة. كل شيء يجري في متصفحك ولا يُرفع الملف لأي خادم.'),
      pptx, ranges, el('div.row', {}, el('button.tool', { type: 'button', onclick: () => addRange() }, '+ نطاق باب آخر'), run), progTxt, prog, report),
    el('section.card', {}, el('h3', {}, 'استيراد باب من ملف JSON'), el('p.small', {}, 'ملف باب صُدّر من محرر آخر (زر «تصدير JSON» في تبويب الأبواب).'), json));
}

// ---------- النشر والإعدادات ----------
function publishTab(host) {
  let mode = 'reviewed';
  const all = A.pack.chapters.flatMap(c => flatSlides(c));
  const rv = all.filter(x => x.slide.review?.status === 'reviewed').length;
  const summary = el('p');
  const upd = () => { summary.textContent = mode === 'reviewed' ? `سيُنشر ${rv} من ${all.length} شريحة (المدقَّق فقط).` : `سيُنشر كل الشرائح (${all.length})، ومنها ${all.length - rv} لم تُدقَّق.`; };
  upd();
  const s = A.pack.settings;
  const set = (k, label, kind = 'text') => {
    const inp = el(kind === 'textarea' ? 'textarea' : 'input', { rows: 5, onchange: e => { logChange({ where: 'الإعدادات', field: label, before: s[k], after: e.target.value }); s[k] = e.target.value; changed(); } });
    inp.value = s[k] ?? '';
    return el('label.fld', {}, el('span', {}, label), inp);
  };
  host.replaceChildren(
    el('section.card', {}, el('h3', {}, 'تصدير حزمة النشر'),
      el('p.small', {}, `نسخة العمل الحالية: ${A.pack.version}. يُنتج ملف ZIP فيه content/pack.json ومجلد media، ترفعه إلى مستودع GitHub داخل مجلد site.`),
      el('div.seg', {}, ...[['reviewed', 'نشر المدقَّق فقط'], ['all', 'نشر الكل']].map(([v, t]) => el('button', { type: 'button', 'aria-pressed': String(v === mode), onclick: e => { mode = v; e.target.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === e.target))); upd(); } }, t))),
      summary,
      el('button.btn.big', { type: 'button', onclick: () => exportZip(mode) }, 'تصدير حزمة النشر (ZIP)')),
    explainCard(host),
    el('section.card', {}, el('h3', {}, 'نصوص التطبيق'),
      set('appName', 'اسم التطبيق'), set('org', 'اسم الحملة'), set('disclaimer', 'تنبيه التذييل'), set('copyright', 'سطر الحقوق'), set('terms', 'شروط الاستخدام (تظهر عند أول دخول)', 'textarea')),
    marjaCard(() => publishTab(host)),
    el('section.card', {}, el('h3', {}, 'نسخة العمل'),
      el('p.small', {}, 'تُحفظ تلقائياً في هذا المتصفح. احفظ نسخة احتياطية قبل مسح بيانات المتصفح.'),
      el('div.row', {},
        el('button.btn.ghost', { type: 'button', onclick: async () => { await flush(); download(`نسخة-احتياطية-${A.pack.version}.json`, JSON.stringify({ pack: A.pack, base: A.base, log: A.log })); } }, 'نسخة احتياطية (JSON)'),
        el('label.btn.ghost', {}, 'استعادة نسخة احتياطية', el('input', { type: 'file', accept: '.json', hidden: true, onchange: async e => {
          try { const d = JSON.parse(await e.target.files[0].text()); if (!d.pack) throw 0; A.log = d.log || []; await replaceWork(d.pack, { resetBase: false }); A.base = d.base || structuredClone(d.pack); changed(); toast('استُعيدت النسخة'); publishTab(host); } catch { toast('ملف غير صالح'); }
        } })),
        el('button.btn.danger', { type: 'button', onclick: async () => {
          if (!(await confirmBox('تجاهل نسخة العمل والبدء من الحزمة المنشورة على الموقع؟ ستفقد التعديلات غير المصدّرة.', 'نعم، ابدأ من المنشور', 'تراجع'))) return;
          await clearAll(); location.reload();
        } }, 'البدء من الحزمة المنشورة'))));
}

// من يرى «شرح الشيخ»: إعداد عام، ويمكن استثناء أي شريحة من المحرر
function explainCard(host) {
  const s = A.pack.settings;
  const slides = A.pack.chapters.flatMap(c => flatSlides(c)).map(x => x.slide);
  const withEx = slides.filter(x => x.explain?.trim()).length;
  const over = slides.filter(x => x.explainFor).length;
  return el('section.card', {}, el('h3', {}, 'شرح الشيخ: من يراه؟'),
    el('p.small', {}, `في الدرس ${withEx} شريحة لها «شرح الشيخ». الشيخ يراه دائماً أثناء العرض وفي «كتاب الشيخ». اختر هل يظهر للمعتمر أيضاً بزر «شرح الشيخ».`),
    el('div.seg', {}, ...Object.entries(EXPLAIN_FOR).map(([v, t]) => el('button', { type: 'button', 'aria-pressed': String((s.explainFor || 'all') === v), onclick: () => {
      logChange({ where: 'الإعدادات', field: 'من يرى شرح الشيخ', before: EXPLAIN_FOR[s.explainFor || 'all'], after: t });
      s.explainFor = v; changed(); publishTab(host);
    } }, v === 'all' ? 'للشيخ والمعتمر معاً' : 'للشيخ فقط'))),
    over ? el('p.small', {}, `${over} شريحة لها إعداد خاص من المحرر يختلف عن هذا. `,
      el('button.tool', { type: 'button', onclick: () => { for (const x of slides) delete x.explainFor; logChange({ where: 'الإعدادات', field: 'إلغاء الإعدادات الخاصة لشرح الشيخ', before: String(over), after: '0' }); changed(); publishTab(host); } }, 'اجعل كل الشرائح تتبع الإعداد العام')) : null);
}

async function exportZip(mode) {
  if (typeof JSZip === 'undefined') return toast('مكتبة الضغط غير محمّلة');
  await flush();
  const out = structuredClone(A.pack);
  let kept = 0, dropped = 0;
  for (const ch of out.chapters) for (const sec of ch.sections) {
    sec.slides = sec.slides.filter(s => { const ok = mode === 'all' || s.review?.status === 'reviewed'; ok ? kept++ : dropped++; return ok; });
    for (const s of sec.slides) for (const st of s.steps) st.blocks = st.blocks.filter(b => !b.internal);
  }
  if (!kept && !(await confirmBox('لا توجد شرائح مدقَّقة؛ ستكون الأبواب فارغة عند المعتمرين. هل تريد المتابعة؟'))) return;
  const v = newVersion();
  out.version = v; out.updated = new Date().toISOString(); out.format = PACK_FORMAT; out.schema = SCHEMA_VERSION;
  A.pack.version = v; changed();
  const zip = new JSZip();
  zip.file('content/pack.json', JSON.stringify(out));
  const media = new Set();
  for (const ch of out.chapters) for (const x of flatSlides(ch)) slideMedia(x.slide).forEach(p => media.add(p));
  let miss = 0;
  for (const p of media) { try { zip.file('content/' + p, await getMediaBlob(p)); } catch { miss++; } }
  zip.file('اقرأني.txt', `حزمة نشر الدليل التفاعلي للمعتمر\nالإصدار: ${v}\nالوضع: ${mode === 'all' ? 'نشر الكل' : 'المدقَّق فقط'} — ${kept} شريحة${dropped ? `، واستُبعدت ${dropped} غير مدقَّقة` : ''}\n\nانسخ مجلد content إلى site/content في المستودع (استبدل الملفات) ثم ارفع التعديل إلى GitHub.\nسيظهر للمعتمرين «حدّث الدرس» عند دخولهم غرفة شيخ يعرض النسخة الجديدة.\n`);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  download(`حزمة-النشر-${v}.zip`, blob, 'application/zip');
  logChange({ where: 'النشر', field: 'تصدير حزمة النشر', before: '', after: `${v} (${kept} شريحة)` });
  toast(`صُدّرت الحزمة ${v}${miss ? ` — تعذّر ${miss} ملفاً` : ''}`);
}

// ---------- الإقلاع ----------
async function boot() {
  applyPrefs();
  shell();
  main.replaceChildren(el('div.spinner'));
  try { await loadWork(); await preloadMediaUrls(); await fontsReady; }
  catch (e) { main.replaceChildren(el('div.banner', {}, 'تعذّر تحميل الحزمة: ' + e.message)); return; }
  show('chapters');
  addEventListener('beforeunload', () => { flush(); });
  // تنبيه إذا نُشرت نسخة أحدث من الدرس بعد بدء نسخة العمل في هذا المتصفح
  try {
    const pub = await (await fetch('content/pack.json', { cache: 'no-cache' })).json();
    if (pub.version && A.base?.version && pub.version !== A.base.version && pub.version > A.base.version) {
      main.prepend(el('div.banner', {}, `على الموقع نسخة أحدث من الدرس (${pub.version}) من نسخة العمل في هذا المتصفح (${A.base.version}).`,
        el('div.row', { style: { marginTop: '8px' } },
          el('button.btn', { type: 'button', onclick: async () => { if (await confirmBox('استبدال نسخة العمل بالنسخة المنشورة؟ صدّر تصحيحاتك أولاً إن كانت لديك تعديلات.', 'نعم، ابدأ من المنشور', 'تراجع')) { await clearAll(); location.reload(); } } }, 'البدء من النسخة المنشورة'))));
    }
  } catch { /* بلا اتصال */ }
}
boot();
