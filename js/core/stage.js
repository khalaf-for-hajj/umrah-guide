// منصة العرض: تعرض الشريحة كاملة داخل الشاشة دون تمرير (الجوال عمودياً هو الأساس)، بخط النسخ،
// وتختار حجم الخط وعدد الأعمدة آلياً لتناسب كل جوال. العناصر غير المكشوفة تحجز مكانها
// (مثل PowerPoint) فلا يتغير التنسيق مع كل خطوة.
import { el } from './dom.js';
import { renderSlide } from './render.js';
import { stepCount } from './pack.js';

const fitCache = new Map();

// تحميل خط النسخ قبل القياس (القياس بخط بديل يعطي أحجاماً خاطئة)
export const fontsReady = (async () => {
  try {
    await Promise.all(['400 20px Naskh', '600 20px Naskh', '700 20px Naskh', '400 20px Tajawal', '700 20px Tajawal', '800 20px Tajawal']
      .map(f => document.fonts.load(f, 'أبجد هوز ١٢٣')));
  } catch { /* تجاهل */ }
})();
export function onFontsChanged(fn) {
  try { document.fonts.addEventListener('loadingdone', () => { fitCache.clear(); fn(); }); } catch { /* تجاهل */ }
}

/**
 * يرسم الشريحة في عنصر host بحجمه الحالي
 * ctx: سياق العرض (viewer: pilgrim|sheikh|editor)
 * opt: { step, animateFrom, fallbackTitle }
 * إذا لم تتسع الشريحة بخط مقروء قُسّمت خطواتها على صفحات، وتظهر الصفحة التي فيها الخطوة الحالية.
 * يعيد { node, page, pages }
 */
export function drawStage(host, slide, ctx, opt = {}) {
  const cs = getComputedStyle(host);
  const W = Math.floor(host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
  const H = Math.floor(host.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom));
  if (!W || !H) return {};
  const total = stepCount(slide);
  const step = Math.min(opt.step ?? total, total);
  const base = `${slide.id}|${W}x${H}|${ctx.viewer}|${ctx.marja}|${JSON.stringify(slide).length}`;
  let pages = fitCache.get(base + '|pages');
  if (!pages) { pages = paginate(host, slide, ctx, W, H, opt); fitCache.set(base + '|pages', pages); }
  const pi = Math.max(0, pages.findIndex(([a, b]) => step >= a && step <= b));
  const range = pages[pi] || [0, total];
  const node = build(slide, ctx, { step, animateFrom: opt.animateFrom, range }, W, H, opt.fallbackTitle);
  if (pages.length > 1) node.querySelector('.slide-title').append(el('span.pg', {}, ` (${pi + 1}/${pages.length})`));
  host.replaceChildren(node);
  const key = base + '|' + range.join('-');
  const apply = ({ f, cols }) => {
    node.style.setProperty('--f', f + 'px');
    setCols(node, cols);
    node.classList.toggle('scroll', f <= MIN_F && overflows(node));
  };
  const cached = fitCache.get(key);
  if (cached) apply(cached);
  else { const best = fit(node, W, H); fitCache.set(key, best); apply(best); }
  // بعد تحميل الصور تُعاد الملاءمة والتقسيم (أحجامها قبل التحميل تقديرية)
  const pending = [...node.querySelectorAll('img')].filter(img => !img.complete);
  if (pending.length) {
    let left = pending.length;
    const done = () => {
      if (--left) return;
      for (const k of [...fitCache.keys()]) if (k.startsWith(base)) fitCache.delete(k);
      if (opt.onRelayout) opt.onRelayout(); else apply(fit(node, W, H));
    };
    pending.forEach(img => { img.loading = 'eager'; img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true }); });
  }
  return { node, page: pi + 1, pages: pages.length };
}

function build(slide, ctx, o, W, H, fallbackTitle) {
  const node = renderSlide(slide, ctx, { step: o.step, showFuture: true, animateFrom: o.animateFrom, noExplain: true, range: o.range });
  if (!slide.title && fallbackTitle) node.querySelector('.slide-title').textContent = fallbackTitle;
  node.classList.add('stage-slide');
  node.style.width = W + 'px';
  node.style.height = H + 'px';
  return node;
}

// أصغر خط مقبول قبل تقسيم الشريحة إلى صفحات (للجوال)
const READ_F = 17;
function fitsAt(node, f) {
  for (const cols of colOptions(node, node.clientWidth, node.clientHeight)) {
    setCols(node, cols);
    node.style.setProperty('--f', f + 'px');
    if (!overflows(node)) return true;
  }
  return false;
}
function paginate(host, slide, ctx, W, H, opt) {
  const total = stepCount(slide);
  // شريحة فيها رسم متحرك: صفحة واحدة دائماً (مراحل الرسم خطوات بلا كتل جديدة، والرسم يتسع للمساحة)
  if (slide.steps.some(st => st.blocks.some(b => b.type === 'diagram'))) return [[0, total]];
  const probe = r => {
    const n = build(slide, ctx, { step: total, range: r }, W, H, opt.fallbackTitle);
    host.replaceChildren(n);
    return fitsAt(n, READ_F);
  };
  if (probe([0, total])) return [[0, total]];
  const pages = [];
  let a = 0;
  while (a <= total) {
    let b = a;
    while (b < total && probe([a, b + 1])) b++;
    pages.push([a, b]);
    a = b + 1;
  }
  // توزيع متوازن: إن أمكن تقسيم الخطوات على عدد الصفحات نفسه بالتساوي (حتى لا تبقى خطوة وحيدة في الصفحة الأخيرة)
  if (pages.length > 1) {
    const P = pages.length, n = total + 1, eq = [];
    for (let i = 0, a0 = 0; i < P; i++) { const size = Math.floor(n / P) + (i < n % P ? 1 : 0); eq.push([a0, a0 + size - 1]); a0 += size; }
    if (eq.every(r => probe(r))) return eq;
  }
  // صفحة لا تحوي إلا خطوة فارغة تُدمج مع التالية
  return pages.filter(([x, y], i) => !(x === y && !slide.steps[x].blocks.length && i < pages.length - 1))
    .map((p, i, arr) => i === 0 ? [0, p[1]] : [arr[i - 1][1] + 1, p[1]]);
}

const MIN_F = 12;
// عمود واحد = تخطيط مرن يوسّط المحتوى؛ يُقاس بالتخطيط نفسه الذي يُعرض به
function setCols(node, cols) { node.style.setProperty('--cols', cols); node.classList.toggle('one', cols === 1); }

function overflows(node) {
  const body = node.querySelector('.slide-body');
  return body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1;
}

function colOptions(node, W, H) {
  const blocks = node.querySelectorAll('.slide-body > .blk').length;
  const opts = [1];
  if (node.querySelector('.blk.diagram')) return opts; // الرسم يأخذ الشاشة كلها (ويتجاور مع عبارته إن كانت الشاشة عريضة)
  if (W / H > 1.15 && blocks >= 1) opts.push(2);
  if (W / H > 2 && blocks >= 3) opts.push(3);
  return opts;
}

function fit(node, W, H) {
  // شريحة الرسم: العبارة لا تكبر على حساب الرسم
  const maxF = Math.max(MIN_F, Math.floor(Math.min(H / 6.5, W / 12, node.querySelector('.blk.diagram') ? (W > H ? 34 : 24) : 64)));
  let best = { f: MIN_F, cols: 1 };
  for (const cols of colOptions(node, W, H)) {
    setCols(node, cols);
    let lo = MIN_F, hi = maxF, ok = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      node.style.setProperty('--f', mid + 'px');
      if (!overflows(node)) { ok = mid; lo = mid + 1; } else hi = mid - 1;
    }
    // الأعمدة الإضافية تُقبل فقط إذا كبّرت الخط
    if (ok && (ok > best.f * 1.06 || (cols === 1 && ok >= best.f))) best = { f: ok, cols };
  }
  return best;
}

/** حاوية المشغّل: شريط علوي + منصة + شريط تنقل سفلي (في متناول الإبهام) */
export function playerShell() {
  const bar = el('div.pl-bar');
  const stage = el('div.pl-stage');
  const nav = el('div.pl-nav');
  const root = el('div.player', { role: 'region', 'aria-label': 'عرض الشريحة' }, bar, stage, nav);
  return { root, bar, stage, nav };
}
