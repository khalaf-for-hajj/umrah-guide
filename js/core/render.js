// رسم الشريحة بخطوات الكشف
import { blockType, renderUnknown } from './blocks.js';
import { el, paras } from './dom.js';
import { stepCount } from './pack.js';

/**
 * ctx: { viewer, marja, marjas, resolveMedia, dataSaver }
 * opt: { step, showFuture (للشيخ: يرى القادم باهتاً), animateFrom }
 */
export function renderSlide(slide, ctx, opt = {}) {
  const total = stepCount(slide);
  const step = Math.min(opt.step ?? total, total);
  const body = el('div.slide-body');
  slide.steps.forEach((st, k) => {
    if (k > step && !opt.showFuture) return;
    if (opt.range && (k < opt.range[0] || k > opt.range[1])) return; // صفحة من الشريحة
    for (const b of st.blocks) {
      if (b.internal && ctx.viewer !== 'editor') continue; // ملاحظة داخلية للمؤلف لا تُعرض
      if (b.hideAt != null && step >= b.hideAt && ctx.viewer === 'pilgrim') continue;
      const def = blockType(b.type);
      let node;
      try { node = def ? def.render(b, ctx, { at: k, step, animateFrom: opt.animateFrom }) : renderUnknown(b); }
      catch (e) { console.error(e); node = renderUnknown(b); }
      node.dataset.step = k;
      node.dataset.bid = b.id || '';
      if (k > step) node.classList.add('future');
      if (opt.animateFrom != null && k > opt.animateFrom && k <= step) node.classList.add('reveal');
      if (b.internal) node.classList.add('internal');
      body.append(node);
    }
  });
  if (opt.noExplain) { /* شرح الشيخ يُعرض بزر خاص في منصة العرض */ }
  else if (slide.explain?.trim() && (step >= total || ctx.viewer !== 'pilgrim')
    && !(ctx.viewer === 'pilgrim' && (slide.explainFor || ctx.explainDefault || 'all') === 'sheikh')) {
    const own = (slide.explainFor || ctx.explainDefault || 'all') === 'sheikh';
    body.append(el('div.blk.explain', {}, el('div.ex-tag', {}, 'شرح الشيخ' + (own && ctx.viewer !== 'pilgrim' ? ' (للشيخ فقط)' : '')), paras(slide.explain)));
  } else if (ctx.viewer === 'editor' && slide.needsExplain) {
    body.append(el('div.blk.explain.empty', {}, el('div.ex-tag', {}, 'شرح الشيخ'), el('p.pending', {}, 'فارغ — يمكن تعبئته من المحرر')));
  }
  const wrap = el('article.slide.v-' + (ctx.viewer || 'pilgrim'), { dataset: { sid: slide.id } },
    el('header.slide-head', {}, el('h2.slide-title', {}, slide.title || '')),
    body,
    el('div.wm', { 'aria-hidden': 'true' }));
  return wrap;
}

// عدّاد البحث داخل كل الكتل
export function blockSearchText(b) {
  const def = blockType(b.type);
  try { return def?.searchText?.(b) || ''; } catch { return ''; }
}

export function slideMedia(slide) {
  const out = [];
  for (const st of slide.steps) for (const b of st.blocks) {
    const def = blockType(b.type);
    try { out.push(...(def?.media?.(b) || [])); } catch { /* تجاهل */ }
  }
  return out;
}
