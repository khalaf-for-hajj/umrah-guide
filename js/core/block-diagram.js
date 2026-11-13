// كتلة «رسم متحرك»: مخطط الطواف ومخطط السعي، يكشفهما الشيخ مرحلةً مرحلة مع «التالي».
// للشرح فقط (ليست عدّاداً شخصياً للمعتمر). أشكال مبسطة بلا ملامح.
// كل ترتيب وعدد فيها من العرض: الطواف يبدأ بالحجر الأسود وينتهي به، والكعبة عن يسار الطائف، حول حِجر إسماعيل، سبعة أشواط؛
// والسعي يبدأ بالصفا ويختم الشوط الأول بالمروة، سبعة أشواط يُختم السابع بالمروة.
// العبارات تحت الرسم تُكتب من المحرر (منقولة من نصوص العرض)، ويبقى الرسم «مسودة» حتى يعتمده الشيخ.
import { registerBlock } from './blocks.js';
import { el, paras } from './dom.js';
import { DIAGRAM_STAGES, DIAGRAM_KINDS } from './pack.js';

const NS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs = {}, ...kids) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) n.setAttribute(k, v);
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}
export const label = (x, y, text, cls = '') => s('text', { x, y, class: 'dg-lbl ' + cls, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, text);
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const ease = t => 0.5 - Math.cos(Math.PI * t) / 2;

// السهم الذي يمثّل الشخص: دائرة وسهم اتجاه، بلا ملامح
function walker() {
  return s('g', { class: 'dg-walker' },
    s('circle', { r: 11 }),
    s('path', { d: 'M -4 -6 L 7 0 L -4 6 Z', class: 'dg-head' }));
}
const place = (g, x, y, deg) => g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${deg.toFixed(1)})`);
const numBadge = (x, y, n, cls = '') => s('g', { class: 'dg-num ' + cls, transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` }, s('circle', { r: 12 }), s('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central' }, n));

// ---------------------------------------------------------------- الطواف (من الأعلى)
// الكعبة في الوسط، والحجر الأسود في ركنها الأيمن العلوي، وحِجر إسماعيل على جدارها الأيسر.
// الحركة عكس عقارب الساعة كما تُرى من الأعلى، فتكون الكعبة عن يسار الطائف.
const T = { cx: 190, cy: 200, stone: [240, 160] };
T.a0 = Math.atan2(T.stone[1] - T.cy, T.stone[0] - T.cx); // زاوية خط البدء
const ringR = lap => 104 + 7 * lap;
const pt = (r, a) => [T.cx + r * Math.cos(a), T.cy + r * Math.sin(a)];
const heading = a => Math.atan2(-Math.cos(a), Math.sin(a)) * 180 / Math.PI; // اتجاه السير عكس عقارب الساعة
function ringPath(r) {
  const [x0, y0] = pt(r, T.a0), [x1, y1] = pt(r, T.a0 - Math.PI);
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 1 0 ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 1 0 ${x0.toFixed(1)} ${y0.toFixed(1)}`;
}

function tawaf(stage, anim) {
  const id = DIAGRAM_STAGES.tawaf[stage]?.[0] || 'map';
  const lap = id.startsWith('lap') ? Number(id.slice(3)) : 0;
  const svg = s('svg', { viewBox: '0 0 400 420', class: 'dg-svg', role: 'img', 'aria-label': 'مخطط الطواف من الأعلى' });
  svg.append(
    s('circle', { cx: T.cx, cy: T.cy, r: 168, class: 'dg-floor' }),
    s('circle', { cx: T.cx, cy: T.cy, r: 118, class: 'dg-guide' + (lap ? ' faint' : '') }));
  // الأشواط المكتملة حلقاتٌ متتالية
  for (let i = 1; i <= lap; i++) {
    const cur = i === lap;
    svg.append(s('path', { d: ringPath(ringR(i)), class: 'dg-ring' + (cur ? ' cur' : ''), pathLength: 100, 'stroke-dasharray': cur && anim ? '100' : null, 'stroke-dashoffset': cur && anim ? '100' : null }));
  }
  // حِجر إسماعيل
  svg.append(s('path', { d: 'M 160 168 C 104 168 104 232 160 232', class: 'dg-hijr' + (id === 'map' ? ' hl' : '') }));
  // مقام إبراهيم
  svg.append(s('rect', { x: 207, y: 120, width: 16, height: 16, rx: 4, class: 'dg-maqam' }));
  // الكعبة
  svg.append(s('rect', { x: 160, y: 160, width: 80, height: 80, rx: 3, class: 'dg-kaaba' }),
    s('rect', { x: 160, y: 173, width: 80, height: 7, class: 'dg-band' }));
  // خط البدء والانتهاء والحجر الأسود
  const showStart = id !== 'map';
  if (showStart) {
    const [ex, ey] = pt(ringR(7) + 14, T.a0);
    svg.append(s('line', { x1: T.stone[0], y1: T.stone[1], x2: ex.toFixed(1), y2: ey.toFixed(1), class: 'dg-startline' }));
  }
  svg.append(s('circle', { cx: T.stone[0], cy: T.stone[1], r: 7, class: 'dg-stone' + (id === 'start' || id === 'lap7' ? ' pulse' : '') }));
  // عدّاد الأشواط أسفل الرسم: سبع دوائر تمتلئ شوطاً بعد شوط (الأول من اليمين)
  if (lap) for (let i = 1; i <= 7; i++) {
    const g = numBadge(T.cx + 10 + (4 - i) * 34, 400, i, i < lap ? 'done' : i === lap ? 'cur' : 'todo');
    if (i === lap && anim) g.classList.add('wait');
    svg.append(g);
  }
  // التسميات
  svg.append(
    label(T.cx + 6, T.cy + 20, 'الكعبة', 'on-dark'),
    label(136, 200, 'الحِجر', 'small'),
    label(206, 104, 'مقام إبراهيم', 'small'),
    label(T.stone[0] + 62, T.stone[1] + 30, 'الحجر الأسود', 'small' + (showStart ? ' strong' : '')));
  // الطائف
  let w = null, left = null;
  if (id === 'left' || lap) {
    const r = lap ? ringR(lap) : ringR(1);
    const [x, y] = pt(r, T.a0);
    w = walker(); place(w, x, y, heading(T.a0));
    if (id === 'left') {
      // سهم من الطائف إلى الكعبة: جانبه الأيسر باتجاهها
      left = s('path', { d: `M ${(x - 8).toFixed(1)} ${(y + 8).toFixed(1)} L ${(T.stone[0] + 12).toFixed(1)} ${(T.stone[1] - 10).toFixed(1)}`, class: 'dg-leftarrow', 'marker-end': 'url(#dg-arrow)' });
      svg.append(s('defs', {}, s('marker', { id: 'dg-arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }, s('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'dg-arrowhead' }))));
      svg.append(left);
    }
    svg.append(w);
  }
  // الحركة: الطائف يدور شوطاً كاملاً عكس عقارب الساعة ويُرسم أثره
  const play = anim && lap ? () => {
    const r = ringR(lap), trail = svg.querySelector('.dg-ring.cur'), badge = svg.querySelector('.dg-num.wait');
    return { dur: 3600, frame: t => {
      const a = T.a0 - 2 * Math.PI * ease(t);
      const [x, y] = pt(r, a); place(w, x, y, heading(a));
      trail.setAttribute('stroke-dashoffset', (100 * (1 - ease(t))).toFixed(2));
      if (t >= 1 && badge) badge.classList.remove('wait');
    } };
  } : null;
  return { svg, play };
}

// ---------------------------------------------------------------- السعي
// الصفا في الأسفل والمروة في الأعلى؛ كل شوط مسار مستقل حتى يظهر العدد.
const SY = { top: 92, bottom: 352, greenA: 222, greenB: 268 };
const laneX = lap => 200 - (lap - 4) * 26; // الشوط الأول من اليمين
const up = lap => lap % 2 === 1; // الأشواط الفردية من الصفا إلى المروة
function lapPath(lap) {
  const x = laneX(lap), [y0, y1] = up(lap) ? [SY.bottom, SY.top] : [SY.top, SY.bottom];
  if (lap === 1) return `M ${x} ${y0} L ${x} ${y1}`;
  const px = laneX(lap - 1), d = up(lap) ? -1 : 1;
  return `M ${px} ${y0} Q ${(px + x) / 2} ${y0 - d * 14} ${x} ${y0 + d * 16} L ${x} ${y1}`;
}

function sai(stage, anim) {
  const id = DIAGRAM_STAGES.sai[stage]?.[0] || 'map';
  const lap = id.startsWith('lap') ? Number(id.slice(3)) : 0;
  const svg = s('svg', { viewBox: '0 0 400 440', class: 'dg-svg', role: 'img', 'aria-label': 'مخطط السعي بين الصفا والمروة' });
  svg.append(
    s('rect', { x: 92, y: 62, width: 216, height: 316, rx: 14, class: 'dg-floor' }),
    s('rect', { x: 92, y: SY.greenA, width: 216, height: SY.greenB - SY.greenA, class: 'dg-green' + (id === 'green' ? ' hl' : '') }),
    s('line', { x1: 92, y1: SY.greenA, x2: 308, y2: SY.greenA, class: 'dg-greenline' }),
    s('line', { x1: 92, y1: SY.greenB, x2: 308, y2: SY.greenB, class: 'dg-greenline' }),
    // الجبلان
    s('path', { d: 'M 104 62 Q 200 -22 296 62 Z', class: 'dg-hill' + (id === 'lap7' ? ' hl' : '') }),
    s('path', { d: 'M 104 378 Q 200 462 296 378 Z', class: 'dg-hill' + (id === 'start' ? ' hl' : '') }),
    label(200, 40, 'المروة', 'on-dark big'),
    label(200, 398, 'الصفا', 'on-dark big'),
    label(50, (SY.greenA + SY.greenB) / 2 - 11, 'الضوء', 'small' + (id === 'green' ? ' strong' : '')),
    label(50, (SY.greenA + SY.greenB) / 2 + 11, 'الأخضر', 'small' + (id === 'green' ? ' strong' : '')));
  if (id === 'map') svg.append(s('line', { x1: 200, y1: SY.bottom, x2: 200, y2: SY.top, class: 'dg-guide' }));
  for (let i = 1; i <= lap; i++) {
    const cur = i === lap;
    svg.append(s('path', { d: lapPath(i), class: 'dg-ring' + (cur ? ' cur' : ''), pathLength: 100, 'stroke-dasharray': cur && anim ? '100' : null, 'stroke-dashoffset': cur && anim ? '100' : null }));
  }
  for (let i = 1; i <= lap; i++) {
    const g = numBadge(laneX(i), up(i) ? SY.top - 16 : SY.bottom + 16, i, i === lap ? 'cur' : 'done');
    if (i === lap && anim) g.classList.add('wait');
    svg.append(g);
  }
  let w = null;
  if (id === 'start' || lap) {
    w = walker();
    const x = lap ? laneX(lap) : laneX(1), y = lap ? (up(lap) ? SY.top : SY.bottom) : SY.bottom;
    place(w, x, y, lap && !up(lap) ? 90 : -90);
    svg.append(w);
  }
  const play = anim && lap ? () => {
    const path = svg.querySelector('.dg-ring.cur'), badge = svg.querySelector('.dg-num.wait');
    const len = path.getTotalLength();
    return { dur: 3000, frame: t => {
      const p = path.getPointAtLength(len * ease(t));
      const q = path.getPointAtLength(Math.min(len, len * ease(t) + 1));
      const deg = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
      place(w, p.x, p.y, t >= 1 ? (up(lap) ? -90 : 90) : deg);
      path.setAttribute('stroke-dashoffset', (100 * (1 - ease(t))).toFixed(2));
      if (t >= 1 && badge) badge.classList.remove('wait');
    } };
  } : null;
  return { svg, play };
}

// سجل الرسوم: كل نوع دالة ترسم المرحلة (stage) وتعيد { svg, play }؛ play (اختياري) يحرّك الانتقال إلى هذه المرحلة.
// printStage: المرحلة التي تُطبع في كتاب الشيخ وورقة المراجعة (الافتراضي: الأخيرة)
const DRAW = {};
const PRINT = {};
export function registerDiagram(kind, fn, { printStage } = {}) { DRAW[kind] = fn; if (printStage != null) PRINT[kind] = printStage; }
registerDiagram('tawaf', tawaf);
registerDiagram('sai', sai);

// تشغيل الحركة بعد أن تصير العقدة في الصفحة (منصة العرض ترسم الشريحة ثم تضعها)
function run(svg, prep) {
  let tries = 0, t0 = null, job = null;
  const tick = now => {
    if (!svg.isConnected) { if (job || ++tries > 30) return; requestAnimationFrame(tick); return; }
    if (!job) { job = prep(); t0 = now; }
    const t = Math.min(1, (now - t0) / job.dur);
    job.frame(t);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// أسماء المراجع المعروضة بجانب عبارة كل مرجع
const marjaName = (ctx, id) => (ctx.marjas || []).find(m => m.id === id)?.name || id;

registerBlock('diagram', {
  label: 'رسم متحرك (طواف / سعي / وضوء / غسل)',
  create: () => ({ kind: 'tawaf', captions: [], marjaCaptions: {}, media: [], approved: false }),
  fields: [
    { key: 'kind', label: 'الرسم', kind: 'select', options: Object.entries(DIAGRAM_KINDS) },
    { key: 'captions', label: 'العبارة تحت الرسم في كل مرحلة (مشتركة، ولكل مرجع عبارة خاصة إن اختلف رأيه)، ويمكن استبدال رسم أي مرحلة بصورة', kind: 'stages', stages: b => (DIAGRAM_STAGES[b.kind] || []).map(x => x[1]), marjaKey: 'marjaCaptions', mediaKey: 'media' },
    { key: 'approved', label: 'اعتمد الشيخ هذا الرسم (يُزال وسم «مسودة»)', kind: 'checkbox' },
  ],
  render(b, ctx, info = {}) {
    const stages = DIAGRAM_STAGES[b.kind];
    if (!stages || !DRAW[b.kind]) return el('div.blk.unknown', {}, 'رسم غير معروف');
    const caps = b.captions || [];
    const mcaps = b.marjaCaptions || {};
    const draft = b.approved ? null : el('span.chip.dg-draft', {}, 'رسم توضيحي — مسودة لم يعتمدها الشيخ بعد');
    // عبارات المراجع: المعتمر الذي اختار مرجعه يرى عبارة مرجعه فقط، والشيخ ومن لم يختر يرى الجميع بأسمائهم
    const own = ctx.viewer === 'pilgrim' && ctx.marja && ctx.marja !== 'other' ? ctx.marja : null;
    const marjaLines = i => Object.entries(mcaps).filter(([id, arr]) => arr?.[i]?.trim() && (!own || id === own))
      .map(([id, arr]) => el('div.dg-marja', { dataset: { marja: id } }, el('b', {}, marjaName(ctx, id) + ': '), arr[i]));
    // صورة بديلة لمرحلة (يرفعها المشرف من المحرر) تحل محل الرسم المبني
    const pic = i => {
      const m = (b.media || [])[i];
      if (!m?.src) return null;
      return el('img.dg-img', { src: ctx.resolveMedia ? ctx.resolveMedia(m.src) : m.src, alt: stages[i][1], width: m.w || null, height: m.h || null, loading: 'eager' });
    };
    // الطباعة (كتاب الشيخ وورقة المراجعة): مرحلة واحدة مع قائمة المراحل وعباراتها
    if (ctx.print) {
      const ps = PRINT[b.kind] ?? stages.length - 1;
      const visual = pic(ps) || DRAW[b.kind](ps, false, ctx).svg;
      return el('div.blk.diagram.print', { dataset: { kind: b.kind } }, visual,
        el('ol.dg-stages', {}, stages.map(([, name], i) => el('li', {}, el('b', {}, name), caps[i]?.trim() ? ' — ' + caps[i] : '', marjaLines(i)))), draft);
    }
    const step = info.step ?? stages.length - 1;
    const stage = Math.max(0, Math.min(stages.length - 1, step - (info.at || 0)));
    const prev = info.animateFrom != null ? info.animateFrom - (info.at || 0) : null;
    const anim = prev === stage - 1 && !reduceMotion();
    let visual = pic(stage);
    if (!visual) {
      const { svg, play } = DRAW[b.kind](stage, anim, ctx);
      if (play) run(svg, play);
      visual = svg;
    }
    // العبارات كلها في الخانة نفسها والظاهرة عبارة المرحلة الحالية: يبقى حجم الرسم ثابتاً من مرحلة إلى أخرى
    const capOf = i => {
      const [sid, name] = stages[i];
      const count = sid.startsWith('lap') ? `الشوط ${sid.slice(3)} من 7` : '';
      const ml = marjaLines(i);
      return el('div' + (i === stage ? '.cur' : ''), { 'aria-hidden': i === stage ? null : 'true' },
        count ? el('div.dg-count', {}, count) : (b.kind === 'wudu' || b.kind === 'ghusl') ? el('div.dg-count', {}, name) : null,
        caps[i]?.trim() ? el('div.dg-text', {}, paras(caps[i])) : (count || ml.length || b.kind === 'wudu' || b.kind === 'ghusl' ? null : el('div.dg-count.muted', {}, name)),
        ml.length ? el('div.dg-marjas', {}, ml) : null);
    };
    return el('div.blk.diagram', { dataset: { kind: b.kind, stage: stages[stage][0] } },
      visual,
      el('div.dg-side', {}, el('div.dg-cap', { 'aria-live': 'polite' }, stages.map((_, i) => capOf(i))), draft));
  },
  media: b => (b.media || []).map(m => m?.src).filter(Boolean),
  searchText: b => [DIAGRAM_KINDS[b.kind], ...(b.captions || []), ...Object.values(b.marjaCaptions || {}).flat()].join(' '),
});
