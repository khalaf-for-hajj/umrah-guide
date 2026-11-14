// كتاب الشيخ: يجمع العرض كاملاً (كل الخطوات وأقوال المراجع) مع «شرح الشيخ» و«ملاحظات للشيخ»
// في صفحات A4 للطباعة أو الحفظ PDF، ليقرأه الشيخ قبل المحاضرة.
// المصدر: نسخة العمل في المحرر (إن فُتح منه) أو الدرس المنشور.
import './core/blocks-builtin.js';
import { el, $, paras } from './core/dom.js';
import { loadPack, flatSlides, stepCount, explainFor, AUDIENCE, bookTitle } from './core/pack.js';
import { renderSlide } from './core/render.js';
import { fontsReady } from './core/stage.js';

const app = $('#app');
const q = new URLSearchParams(location.search);
const fromAdmin = q.get('src') === 'admin' ? window.opener?.__umBook : null;
const opt = {
  ch: q.get('ch') || fromAdmin?.ch || 'all',
  explain: q.get('explain') !== '0',
  notes: q.get('notes') !== '0',
  ts: q.get('ts') === '1',
  images: q.get('images') !== '0',
};
let pack, resolveMedia;

const bookChapters = () => pack.chapters.filter(c => c.status !== 'soon' && flatSlides(c).length && (opt.ch === 'all' || c.id === opt.ch));
const mins = m => (m ? `${m} دقيقة` : '');

function toolbar() {
  const chs = pack.chapters.filter(c => c.status !== 'soon' && flatSlides(c).length);
  const sel = el('select', { 'aria-label': 'الباب', onchange: e => { opt.ch = e.target.value; draw(); } },
    el('option', { value: 'all', selected: opt.ch === 'all' ? true : null }, 'كل الأبواب'),
    ...chs.map(c => el('option', { value: c.id, selected: opt.ch === c.id ? true : null }, c.title)));
  const chk = (key, label) => el('label', {}, el('input', { type: 'checkbox', checked: opt[key] ? true : null, onchange: e => { opt[key] = e.target.checked; draw(); } }), label);
  return el('div.bk-tools', {},
    el('b', { style: { color: 'var(--gold)' } }, '📖 ' + bookTitle(pack.settings)),
    sel, chk('explain', 'شرح الشيخ'), chk('notes', 'ملاحظات للشيخ'), chk('images', 'الصور'), chk('ts', 'أوقات التسجيل'),
    el('button.btn', { type: 'button', onclick: () => print() }, '🖨 طباعة / حفظ PDF'),
    el('span.hint', {}, 'لحفظه ملف PDF: اضغط «طباعة / حفظ PDF» ثم اختر من الطابعات «حفظ بصيغة PDF» (Save as PDF)، والورق A4. يمكن إرسال الملف للشيخ ليطبعه.'));
}

// سطور «⏱ 00:00:00» في الملاحظات تخص المراجعة على التسجيل، وتُخفى افتراضياً
function cleanNotes(t) {
  const lines = String(t || '').split('\n');
  return opt.ts ? lines : lines.filter(l => !/^\s*⏱/.test(l));
}
function noteParas(t) {
  return cleanNotes(t).filter(l => l.trim()).map(l => /^\s*⏱/.test(l) ? el('p.ts', {}, l) : el('p', {}, l));
}

function slideCard(ch, x) {
  const s = x.slide;
  const ctx = { viewer: 'sheikh', marja: 'other', marjas: pack.settings.marjas, resolveMedia, dataSaver: true, print: true };
  const total = stepCount(s);
  const body = el('div.bs-body');
  for (let k = 0; k <= total; k++) {
    const part = renderSlide(s, ctx, { step: total, range: [k, k], noExplain: true }).querySelector('.slide-body');
    const blocks = [...part.children];
    if (!blocks.length) continue;
    if (total > 0) body.append(el('div.bs-step', {}, k === 0 ? 'يظهر أولاً' : `النقرة ${k}`));
    for (const b of blocks) {
      // الفيديو: رابطه بدل المشغّل
      b.querySelectorAll('.v-frame').forEach(f => { const a = b.querySelector('a[href]'); f.replaceWith(el('p.v-link', {}, '▶ ' + (a?.href || ''))); });
      if (!opt.images && b.matches('.img')) continue;
      b.querySelectorAll('img').forEach(i => { i.loading = 'eager'; });
      body.append(b);
    }
  }
  if (opt.explain && s.explain?.trim()) {
    const all = explainFor(pack, s) === 'all';
    body.append(el('div.bx.ex', {}, el('b', {}, 'شرح الشيخ' + (all ? ' — يراه المعتمر أيضاً بزر «شرح الشيخ»' : ' — للشيخ فقط')), paras(s.explain)));
  }
  if (opt.notes) {
    const n = noteParas(s.notes);
    if (n.length) body.append(el('div.bx.nt', {}, el('b', {}, 'ملاحظات للشيخ'), ...n));
  }
  return el('section.bs', {},
    el('div.bs-head', {}, el('span.no', {}, `شريحة ${x.no}`), el('span.tt', {}, s.title || x.section.title),
      s.audience && s.audience !== 'all' ? el('span.aud', {}, AUDIENCE[s.audience]) : null),
    body);
}

function draw() {
  const chs = bookChapters();
  const st = pack.settings;
  const totalSlides = chs.reduce((n, c) => n + flatSlides(c).length, 0);
  const cover = el('section.cover', {},
    el('img', { src: 'assets/img/logo-full.png', alt: st.org }),
    el('div.k1', {}, bookTitle(st)),
    el('div.k2', {}, chs.map(c => c.title).join(' · ')),
    el('div.k3', {}, `${st.org} — ${st.appName}`),
    el('div.k3', {}, `${chs.length} ${chs.length === 1 ? 'باب' : 'أبواب'} · ${totalSlides} شريحة · نسخة الدرس ${pack.version}`),
    el('div.box', {}, 'للمحاضرين: يُقرأ قبل المحاضرة. فيه كل ما يظهر للمعتمرين خطوة بخطوة، مع شرح الشيخ وملاحظاته.'),
    st.disclaimer ? el('div.k3', {}, st.disclaimer) : null);

  const toc = el('table.toc', {}, el('tr', {}, el('th', {}, 'القسم'), el('th', {}, 'الشرائح'), el('th', {}, 'الوقت المقترح')));
  for (const c of chs) {
    const list = flatSlides(c);
    toc.append(el('tr.ch', {}, el('td', {}, c.title), el('td.n', {}, `1–${list.length}`), el('td', {}, mins(c.minutes))));
    for (const sec of c.sections) {
      const nos = list.filter(x => x.section === sec).map(x => x.no);
      if (!nos.length) continue;
      toc.append(el('tr', {}, el('td', {}, sec.title), el('td.n', {}, nos.length > 1 ? `${nos[0]}–${nos[nos.length - 1]}` : String(nos[0])), el('td', {}, mins(sec.minutes))));
    }
  }
  const intro = el('section.intro', {},
    el('h2', {}, 'كيف تقرأ هذا الكتاب'),
    el('div.legend', {},
      el('div', {}, el('span.bs-step', { style: { margin: 0 } }, 'النقرة 1'), el('span', {}, 'ما يظهر للمعتمرين عند كل ضغطة «التالي» في شاشة الشيخ، بالترتيب.')),
      opt.explain ? el('div', {}, el('span.bx.ex', { style: { margin: 0, padding: '0 3mm' } }, 'شرح الشيخ'), el('span', {}, 'الشرح المعتمد للشريحة. يُذكر تحته هل يراه المعتمر أيضاً أم هو للشيخ فقط.')) : null,
      opt.notes ? el('div', {}, el('span.bx.nt', { style: { margin: 0, padding: '0 3mm' } }, 'ملاحظات للشيخ'), el('span', {}, 'نقاط تعين الشيخ على الشرح، ولا يراها المعتمر.')) : null,
      el('div', {}, el('span', {}, 'أقوال المراجع تظهر كلها هنا، وكل معتمر يرى قول مرجعه فقط.'))),
    el('h2', {}, 'المحتويات وخطة الوقت'), toc);

  const parts = [];
  for (const c of chs) {
    parts.push(el('h1.chap-h', {}, c.title));
    const list = flatSlides(c);
    for (const sec of c.sections) {
      const items = list.filter(x => x.section === sec);
      if (!items.length) continue;
      parts.push(el('h2.sec-h', {}, sec.title, el('span', {}, [mins(sec.minutes), `الشرائح ${items[0].no}–${items[items.length - 1].no}`].filter(Boolean).join(' · '))));
      for (const x of items) parts.push(slideCard(c, x));
    }
  }
  document.title = `${bookTitle(st)} — ${chs.map(c => c.title).join('، ')}`;
  app.replaceChildren(toolbar(), el('article.book', {}, cover, intro, ...parts));
}

async function boot() {
  try {
    if (fromAdmin) { pack = fromAdmin.pack; resolveMedia = fromAdmin.resolveMedia; }
    else { pack = await loadPack(); resolveMedia = s => 'content/' + s; }
  } catch (e) { app.replaceChildren(el('main', {}, el('div.banner', {}, 'تعذّر تحميل الدرس: ' + e.message))); return; }
  await fontsReady;
  draw();
  document.body.dataset.ready = '1';
}
boot();
