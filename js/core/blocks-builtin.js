// أنواع الكتل الأساسية: نص، صورة، بطاقة حكم، سؤال وجواب، نص شرعي، فيديو، صوت
import { registerBlock } from './blocks.js';
import { el, paras, fmtDate } from './dom.js';
import { STATUS_LABELS } from './arabic.js';

const TEXT_STYLES = [
  ['box', 'مربع'], ['heading', 'عنوان فرعي'], ['label', 'وسم صغير'], ['niyyah', 'نية / صيغة'],
  ['question', 'سؤال'], ['plain', 'نص عادي'],
];
const STATUS_OPTS = Object.entries(STATUS_LABELS);

// عرض المصدر: اسم الكتاب ثم الأرقام معزولة الاتجاه (LTR) حتى لا تنقلب
export function renderSource(src) {
  if (!src) return null;
  const m = String(src).match(/^([^:：]+[:：])\s*(.+)$/);
  return el('div.src', { title: 'المصدر' },
    el('span.src-ico', { 'aria-hidden': 'true' }, '📖'),
    m ? [el('span', {}, m[1] + ' '), el('bdi.ltr', { dir: 'ltr' }, m[2])] : el('bdi.ltr', { dir: 'ltr' }, src));
}

function badge(b) { return b ? el('span.badge', { 'aria-label': 'رقم ' + b }, b) : null; }

function statusChip(st, ctx) {
  if (!st) return null;
  // المعتمر لا يرى «غير محدد» حتى لا تزدحم الشاشة؛ الشيخ والمحرر يرونها
  if (st === 'unspecified' && ctx.viewer === 'pilgrim') return null;
  return el('span.chip.st-' + st, {}, STATUS_LABELS[st] || st);
}

// ---------- نص ----------
registerBlock('text', {
  label: 'نص',
  create: () => ({ text: '', style: 'box', badge: '', source: '' }),
  fields: [
    { key: 'text', label: 'النص', kind: 'textarea' },
    { key: 'style', label: 'الشكل', kind: 'select', options: TEXT_STYLES },
    { key: 'badge', label: 'شارة الترتيب (رقم أو «أولاً»)', kind: 'text' },
    { key: 'source', label: 'المصدر (كما في الملف)', kind: 'text' },
  ],
  render(b) {
    return el('div.blk.t-' + (b.style || 'box'), {},
      badge(b.badge), el('div.tx', {}, paras(b.text)), renderSource(b.source));
  },
  searchText: b => b.text,
});

// ---------- صورة ----------
registerBlock('image', {
  label: 'صورة',
  create: () => ({ src: '', alt: '', labels: [] }),
  fields: [
    { key: 'src', label: 'الصورة', kind: 'image' },
    { key: 'alt', label: 'نص بديل (وصف الصورة)', kind: 'text' },
    { key: 'labels', label: 'تسميات على الصورة (سطر لكل تسمية)', kind: 'lines' },
  ],
  render(b, ctx) {
    const url = b.src ? ctx.resolveMedia(b.src) : '';
    return el('figure.blk.img', {},
      url ? el('img', { src: url, alt: b.alt || '', loading: 'lazy', draggable: 'false', width: b.w, height: b.h })
        : el('div.img-empty', {}, 'لا توجد صورة'),
      b.labels?.length ? el('figcaption', {}, b.labels.map(l => el('span.chip', {}, l))) : null);
  },
  media: b => b.src ? [b.src] : [],
});

// ---------- بطاقة حكم بحسب المرجع ----------
registerBlock('ruling', {
  label: 'بطاقة حكم',
  create: () => ({ q: '', shared: '', sharedStatus: 'unspecified', opinions: [] }),
  fields: [
    { key: 'q', label: 'السؤال / المسألة (اختياري)', kind: 'textarea' },
    { key: 'shared', label: 'النص المشترك', kind: 'textarea' },
    { key: 'sharedStatus', label: 'حالة النص المشترك', kind: 'select', options: STATUS_OPTS },
    { key: 'opinions', label: 'أقوال المراجع', kind: 'opinions' },
  ],
  render(b, ctx) {
    const marjas = ctx.marjas || [];
    const name = id => marjas.find(m => m.id === id)?.name || id;
    const showAll = ctx.viewer !== 'pilgrim' || !ctx.marja || ctx.marja === 'other';
    let ops = (b.opinions || []).filter(o => showAll || o.marja === ctx.marja);
    // إن أحال قول مرجع إلى قول غيره («يضاف إلى ما ذكره») يُعرض المُحال إليه معه
    if (!showAll) {
      const refs = ops.map(o => o.ref).filter(Boolean);
      const extra = (b.opinions || []).filter(o => refs.includes(o.marja) && !ops.includes(o));
      ops = [...extra.map(o => ({ ...o, _ref: true })), ...ops];
    }
    const box = el('div.blk.ruling', {},
      badge(b.badge),
      b.q ? el('div.r-q', {}, paras(b.q)) : null,
      b.shared ? el('div.r-shared', {}, paras(b.shared), statusChip(b.sharedStatus, ctx)) : null,
      ops.map(o => el('div.r-op' + (o._ref ? '.r-ref' : ''), { dataset: { marja: o.marja } },
        el('div.r-who', {}, (o._ref ? 'قول ' : '') + (o.label?.trim() ? o.label.replace(/[(:：\s]+$/, '').replace(/^\s*\(\s*/, '') : name(o.marja))),
        el('div.r-tx', {}, paras(o.text)), statusChip(o.status, ctx),
        o.review && ctx.viewer !== 'pilgrim' ? el('span.chip.st-review', {}, '⚠ يُراجع على الرسالة') : null)),
      (!showAll && !ops.length && (b.opinions || []).length)
        ? el('div.r-none', {}, 'لا يوجد في العرض قول خاص بمرجعك في هذه المسألة') : null,
    );
    return box;
  },
  searchText: b => [b.q, b.shared, ...(b.opinions || []).map(o => o.text)].join(' '),
});

// ---------- سؤال وجواب ----------
registerBlock('qa', {
  label: 'سؤال وجواب',
  create: () => ({ q: '', a: '' }),
  fields: [
    { key: 'q', label: 'السؤال', kind: 'textarea' },
    { key: 'a', label: 'الجواب (يكتبه الشيخ)', kind: 'textarea' },
    { key: 'aStatus', label: 'حالة الجواب', kind: 'select', options: STATUS_OPTS },
  ],
  render(b, ctx) {
    const ans = el('div.qa-a', { hidden: ctx.viewer === 'pilgrim' ? true : null },
      b.a?.trim() ? [paras(b.a), statusChip(b.aStatus, ctx)] : el('p.pending', {}, 'بانتظار الإضافة'));
    const btn = ctx.viewer === 'pilgrim'
      ? el('button.btn.reveal', {
        type: 'button', 'aria-expanded': 'false',
        onclick: e => { ans.hidden = !ans.hidden; e.currentTarget.setAttribute('aria-expanded', String(!ans.hidden)); e.currentTarget.textContent = ans.hidden ? 'اكشف الجواب' : 'أخفِ الجواب'; },
      }, 'اكشف الجواب') : null;
    return el('div.blk.qa', {}, badge(b.badge), el('div.qa-q', {}, paras(b.q)), btn, ans);
  },
  searchText: b => b.q + ' ' + (b.a || ''),
});

// ---------- نص شرعي (رواية / دعاء / تلبية / آية) ----------
registerBlock('nass', {
  label: 'نص شرعي (رواية/دعاء)',
  create: () => ({ kind: 'hadith', text: '', plain: '', source: '', autoTashkeel: false, review: { status: 'unreviewed', by: '', at: '' } }),
  fields: [
    { key: 'kind', label: 'النوع', kind: 'select', options: [['hadith', 'رواية'], ['talbiya', 'تلبية'], ['dua', 'دعاء'], ['ayah', 'آية']] },
    { key: 'text', label: 'النص (مشكولاً)', kind: 'textarea', tashkeelCheck: 'plain' },
    { key: 'plain', label: 'النص كما في الملف (للمقارنة — لا يُعرض)', kind: 'textarea', readonlyHint: true },
    { key: 'source', label: 'المصدر (يُنسخ كما في الملف)', kind: 'text' },
    { key: 'autoTashkeel', label: 'تشكيل آلي — يُراجَع', kind: 'checkbox' },
    { key: 'review', label: 'الاعتماد', kind: 'review' },
  ],
  render(b, ctx) {
    const ok = b.review?.status === 'reviewed';
    return el('div.blk.nass.k-' + (b.kind || 'hadith'), {},
      badge(b.badge),
      el('div.nass-tx', { lang: 'ar' }, paras(b.text)),
      renderSource(b.source),
      el('div.tags', {},
        ok ? el('span.chip.ok', {}, `دُقِّق ✓ ${b.review.by || ''} ${fmtDate(b.review.at)}`)
          : el('span.chip.warn', {}, 'لم يُدقَّق'),
        (!ok && b.autoTashkeel) ? el('span.chip.warn', {}, 'تشكيل آلي — يُراجَع') : null));
  },
  searchText: b => b.text,
});

// ---------- فيديو يوتيوب ----------
export function youtubeId(v) {
  const s = String(v || '').trim();
  const m = s.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : (/^[\w-]{11}$/.test(s) ? s : '');
}
registerBlock('video', {
  label: 'فيديو (يوتيوب)',
  create: () => ({ youtube: '', title: '' }),
  fields: [
    { key: 'youtube', label: 'رابط يوتيوب أو المعرّف', kind: 'text' },
    { key: 'title', label: 'عنوان الفيديو', kind: 'text' },
  ],
  render(b, ctx) {
    const id = youtubeId(b.youtube);
    if (!id) return el('div.blk.video', {}, el('p.pending', {}, 'لم يُحدد رابط الفيديو'));
    const watch = `https://www.youtube.com/watch?v=${id}`;
    const embed = `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
    const frame = () => el('iframe', {
      src: embed, title: b.title || 'فيديو', loading: 'lazy',
      allow: 'encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin',
    });
    const open = el('a.btn.ghost', { href: watch, target: '_blank', rel: 'noopener' }, 'افتح في يوتيوب');
    const note = el('p.small', {}, 'الفيديو يحتاج إنترنت ولا يعمل ضمن الدرس المحمّل بلا اتصال.');
    if (ctx.viewer !== 'pilgrim') {
      return el('div.blk.video', {}, b.title ? el('div.v-title', {}, b.title) : null, el('div.v-frame', {}, frame()), el('div.row', {}, open), note);
    }
    // المعتمر: لقطة الفيديو وزر «شاهد على جوالك»
    const holder = el('div.v-frame');
    const thumb = el('img', { src: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, alt: b.title || 'لقطة الفيديو', loading: 'lazy', onerror: e => e.target.replaceWith(el('div.v-ph', {}, '▶')) });
    holder.append(thumb);
    const btn = el('button.btn', {
      type: 'button', disabled: ctx.dataSaver ? true : null,
      onclick: () => { holder.replaceChildren(frame()); btn.remove(); },
    }, ctx.dataSaver ? 'شاهد على جوالك (معطّل: توفير البيانات)' : 'شاهد على جوالك');
    return el('div.blk.video', {}, b.title ? el('div.v-title', {}, b.title) : null, holder, el('div.row', {}, btn, open), note);
  },
});

// ---------- صوت ----------
registerBlock('audio', {
  label: 'صوت',
  create: () => ({ src: '', title: '' }),
  fields: [
    { key: 'src', label: 'ملف الصوت', kind: 'audio' },
    { key: 'title', label: 'العنوان', kind: 'text' },
  ],
  render(b, ctx) {
    return el('div.blk.audio', {}, b.title ? el('div.v-title', {}, b.title) : null,
      b.src ? el('audio', { controls: true, preload: 'none', src: ctx.resolveMedia(b.src), controlslist: 'nodownload' }) : el('p.pending', {}, 'لا يوجد ملف صوت'));
  },
  media: b => b.src ? [b.src] : [],
});

// الرسوم المتحركة (المرحلة 2)
import './block-diagram.js';

import './diagram-body.js';
import './block-ayah.js';
