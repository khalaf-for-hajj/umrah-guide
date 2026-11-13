// رسوم متحركة لكيفية الوضوء وكيفية الغسل (المرحلة 3).
// أشكال مبسطة بلا ملامح وجه. كل مرحلة نقرة من الشيخ، والعبارات (المشتركة ولكل مرجع) تُكتب من المحرر.
// يمكن استبدال رسم أي مرحلة بصورة من المحرر، أو تعديل هذا الملف لاحقاً دون المساس بالمحتوى.
import { registerDiagram, s, label, ease } from './block-diagram.js';
import { DIAGRAM_STAGES } from './pack.js';

let N = 0;
const uid = p => `${p}${++N}`;
const W = 400, H = 420;
const svgRoot = (aria) => s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'dg-svg bd', role: 'img', 'aria-label': aria });
const clip = (id, ...shapes) => s('clipPath', { id }, ...shapes);
const lerp = (a, b, t) => a + (b - a) * t;

// قطرات ماء تتساقط: تُحرَّك في play
function drops(n, x0, x1, y0, y1) {
  const g = s('g', { class: 'bd-drops' });
  const list = [];
  for (let i = 0; i < n; i++) {
    const x = lerp(x0, x1, (i + 0.5) / n), c = s('circle', { cx: x.toFixed(1), cy: y0, r: 3.2, class: 'bd-drop' });
    list.push({ c, x, off: (i * 0.37) % 1 }); g.append(c);
  }
  g.tick = t => list.forEach(d => { const k = (t * 3 + d.off) % 1; d.c.setAttribute('cy', lerp(y0, y1, k).toFixed(1)); d.c.style.opacity = t >= 1 ? '0' : String(1 - k * 0.6); });
  return g;
}
const dimTo = (pts, cls = 'bd-limit') => s('polyline', { points: pts.map(p => p.join(',')).join(' '), class: cls });
const arrowDefs = id => s('defs', {}, s('marker', { id, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, s('path', { d: 'M0 0 L10 5 L0 10 z', class: 'bd-arrowhead' })));

// ============================================================ الوضوء
// ---- المشهد العام: أجزاء الوضوء على الجسم (منظر أمامي: يمين الشخص على يسار الشاشة)
function wuduParts(highlightAll) {
  const svg = svgRoot('أجزاء الوضوء على الجسم');
  const hl = (on, el) => { if (on) el.classList.add('on'); return el; };
  svg.append(
    // الساقان والقدمان
    s('rect', { x: 160, y: 250, width: 36, height: 120, rx: 12, class: 'bd-cloth' }),
    s('rect', { x: 204, y: 250, width: 36, height: 120, rx: 12, class: 'bd-cloth' }),
    s('path', { d: 'M156 372 h44 q6 18 -8 22 h-38 q-10 -4 2 -22z', class: 'bd-skin' }),
    s('path', { d: 'M200 372 h44 q12 18 -2 22 h-38 q-14 -4 -4 -22z', class: 'bd-skin' }),
    hl(true, s('path', { d: 'M160 376 h36 q2 8 -6 12 h-28 q-6 -4 -2 -12z', class: 'bd-part' })),
    hl(true, s('path', { d: 'M206 376 h36 q4 8 -4 12 h-28 q-8 -4 -4 -12z', class: 'bd-part' })),
    // الجذع والكتفان
    s('rect', { x: 146, y: 104, width: 108, height: 150, rx: 26, class: 'bd-cloth' }),
    // الذراعان: العضد بالثوب، والساعد والكف مكشوفان
    s('path', { d: 'M150 112 L124 182', class: 'bd-limb-cloth' }),
    s('path', { d: 'M250 112 L276 182', class: 'bd-limb-cloth' }),
    s('path', { d: 'M124 182 L116 246', class: 'bd-limb-skin' }),
    s('path', { d: 'M276 182 L284 246', class: 'bd-limb-skin' }),
    s('circle', { cx: 115, cy: 256, r: 13, class: 'bd-skin' }),
    s('circle', { cx: 285, cy: 256, r: 13, class: 'bd-skin' }),
    hl(true, s('path', { d: 'M124 176 L116 250', class: 'bd-part-limb' })),
    hl(true, s('path', { d: 'M276 176 L284 250', class: 'bd-part-limb' })),
    // الرقبة والرأس
    s('rect', { x: 188, y: 86, width: 24, height: 22, rx: 6, class: 'bd-skin' }),
    s('ellipse', { cx: 200, cy: 58, rx: 30, ry: 36, class: 'bd-skin' }),
    s('path', { d: 'M170 54 C 170 22 230 22 230 54 C 224 38 210 34 200 34 C 190 34 176 38 170 54 Z', class: 'bd-hair' }),
    hl(true, s('ellipse', { cx: 200, cy: 66, rx: 21, ry: 27, class: 'bd-part' })),
    hl(true, s('path', { d: 'M180 36 C 188 26 212 26 220 36 C 212 33 188 33 180 36 Z', class: 'bd-part strong' })),
  );
  const tag = (x, y, n, text, anchorX) => s('g', { class: 'bd-tag' + (highlightAll ? ' done' : '') },
    s('line', { x1: x, y1: y, x2: anchorX, y2: y, class: 'bd-leader' }),
    s('circle', { cx: anchorX, cy: y, r: 13, class: 'bd-num' }),
    s('text', { x: anchorX, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'bd-numt' }, n),
    label(anchorX + (anchorX > 200 ? 0 : 0), y + 24, text, 'small'));
  svg.append(
    tag(226, 74, 1, 'الوجه', 330),
    tag(118, 214, 2, 'اليد اليمنى', 52),
    tag(282, 214, 3, 'اليد اليسرى', 348),
    tag(186, 32, 4, 'مقدّم الرأس', 70),
    tag(244, 384, 5, 'القدمان', 340));
  return { svg };
}

// ---- الوجه: الحدود ثم الغسل من الأعلى إلى الأسفل
function wuduFace(mode, anim) {
  const svg = svgRoot('الوجه وحدّه');
  const cf = uid('cf'), cw = uid('cw'), am = uid('am');
  const faceEl = () => s('ellipse', { cx: 200, cy: 210, rx: 96, ry: 128 });
  const TOP = 122, BOT = 338, L = 120, R = 280;
  const waterClip = s('rect', { x: L, y: TOP, width: R - L, height: mode === 'wash' && anim ? 0 : BOT - TOP });
  svg.append(s('defs', {}, clip(cf, faceEl()), clip(cw, waterClip)), arrowDefs(am),
    s('path', { d: 'M40 420 Q 52 356 160 346 L 240 346 Q 348 356 360 420 Z', class: 'bd-cloth' }),
    s('rect', { x: 162, y: 300, width: 76, height: 70, rx: 12, class: 'bd-skin' }),
    s('ellipse', { cx: 104, cy: 212, rx: 14, ry: 28, class: 'bd-skin' }),
    s('ellipse', { cx: 296, cy: 212, rx: 14, ry: 28, class: 'bd-skin' }),
    Object.assign(faceEl(), {}),
  );
  svg.lastChild.setAttribute('class', 'bd-skin');
  // منطقة الغسل: ما بين قصاص الشعر وطرف الذقن، وما دارت عليه الإبهام والوسطى
  const region = s('g', { 'clip-path': `url(#${cf})` },
    s('rect', { x: L, y: TOP, width: R - L, height: BOT - TOP, class: mode === 'limits' ? 'bd-region' : 'bd-region faint' }),
    s('g', { 'clip-path': `url(#${cw})` }, s('rect', { x: L, y: TOP, width: R - L, height: BOT - TOP, class: mode === 'wash' ? 'bd-water' : 'bd-none' })));
  svg.append(region,
    s('path', { d: 'M104 206 C 98 112 150 70 200 70 C 250 70 302 112 296 206 C 290 162 268 128 200 122 C 132 128 110 162 104 206 Z', class: 'bd-hair' }));
  if (mode === 'limits') {
    svg.append(
      dimTo([[146, TOP], [254, TOP]]), dimTo([[166, BOT], [234, BOT]]),
      s('line', { x1: 336, y1: TOP, x2: 336, y2: BOT, class: 'bd-dim', 'marker-start': `url(#${am})`, 'marker-end': `url(#${am})` }),
      s('line', { x1: 300, y1: TOP, x2: 336, y2: TOP, class: 'bd-leader' }), s('line', { x1: 236, y1: BOT, x2: 336, y2: BOT, class: 'bd-leader' }),
      s('line', { x1: L, y1: 176, x2: R, y2: 176, class: 'bd-dim', 'marker-start': `url(#${am})`, 'marker-end': `url(#${am})` }),
      s('circle', { cx: L, cy: 176, r: 6, class: 'bd-finger' }), s('circle', { cx: R, cy: 176, r: 6, class: 'bd-finger' }),
      label(200, 100, 'قصاص الشعر', 'small strong'), label(200, 362, 'طرف الذقن', 'small strong'),
      label(366, 230, 'طولاً', 'small'), label(200, 160, 'عرضاً', 'small'),
      label(L + 4, 198, 'الإبهام', 'tiny'), label(R - 4, 198, 'الوسطى', 'tiny'));
  }
  let play = null;
  if (mode === 'wash') {
    const d = drops(5, 150, 250, TOP, BOT);
    svg.append(s('path', { d: 'M168 34 q32 -18 64 0 q-6 22 -32 24 q-26 -2 -32 -24z', class: 'bd-skin' }),
      s('path', { d: 'M196 58 L196 124 M204 58 L204 124', class: 'bd-stream' }), d,
      s('line', { x1: 344, y1: TOP, x2: 344, y2: BOT, class: 'bd-dim', 'marker-end': `url(#${am})` }),
      label(368, 230, 'إلى الأسفل', 'tiny'));
    if (anim) play = () => ({ dur: 2800, frame: t => { waterClip.setAttribute('height', ((BOT - TOP) * ease(t)).toFixed(1)); d.tick(t); } });
    else d.tick(1);
  }
  return { svg, play };
}

// ---- اليد: من المرفق إلى أطراف الأصابع (المرفق على يمين الشاشة لليد اليمنى، ويُعكس لليسرى)
function wuduArm(mode, side, anim) {
  const svg = svgRoot(side === 'right' ? 'اليد اليمنى' : 'اليد اليسرى');
  const ca = uid('ca'), cw = uid('cw'), am = uid('am');
  const flip = side === 'left';
  const X = x => (flip ? W - x : x); // لمواضع التسميات خارج المجموعة المعكوسة
  const armShapes = () => [
    s('rect', { x: 290, y: 172, width: 92, height: 56, rx: 26 }),
    s('circle', { cx: 300, cy: 200, r: 28 }),
    s('path', { d: 'M300 172 C 250 176 190 182 150 186 L 150 214 C 190 218 250 224 300 228 Z' }),
    s('rect', { x: 100, y: 180, width: 56, height: 42, rx: 12 }),
    ...[181, 191.5, 202, 212.5].map((y, i) => s('rect', { x: 40 + i * 3, y, width: 66 - i * 3, height: 9.5, rx: 4.7 })),
    s('path', { d: 'M112 182 C 116 162 136 156 148 170 L 140 184 Z' }),
  ];
  const ELB = 300, TIP = 38, X0 = 332;
  const waterClip = s('rect', { x: anim ? X0 : TIP, y: 150, width: anim ? 0 : X0 - TIP, height: 100 });
  const g = s('g', { transform: flip ? `translate(${W} 0) scale(-1 1)` : null });
  g.append(
    s('defs', {}, clip(ca, ...armShapes()), clip(cw, waterClip)),
    s('g', { class: 'bd-skin' }, ...armShapes()),
    s('path', { d: 'M352 166 L 420 160 L 420 240 L 352 234 Z', class: 'bd-cloth' }),
    s('g', { 'clip-path': `url(#${ca})` },
      s('rect', { x: TIP - 4, y: 150, width: X0 - TIP + 4, height: 100, class: mode === 'limits' ? 'bd-region' : 'bd-region faint' }),
      s('g', { 'clip-path': `url(#${cw})` }, s('rect', { x: TIP - 4, y: 150, width: X0 - TIP + 4, height: 100, class: mode === 'wash' ? 'bd-water' : 'bd-none' }))),
    s('circle', { cx: ELB, cy: 200, r: 9, class: 'bd-joint' }));
  svg.append(arrowDefs(am), g);
  svg.append(label(200, 40, side === 'right' ? 'اليد اليمنى' : 'اليد اليسرى', 'big'));
  if (mode === 'limits') {
    svg.append(
      s('line', { x1: X(ELB), y1: 132, x2: X(ELB), y2: 262, class: 'bd-limit' }),
      s('line', { x1: X(TIP), y1: 150, x2: X(TIP), y2: 262, class: 'bd-limit' }),
      label(X(ELB), 116, 'المرفق', 'small strong'), label(X(ELB), 284, '(يُغسل مع اليد)', 'tiny'),
      label(X(TIP + 14), 134, 'أطراف الأصابع', 'small strong'));
  }
  // سهم الاتجاه: من المرفق إلى الأصابع
  svg.append(s('line', { x1: X(ELB - 20), y1: 312, x2: X(TIP + 20), y2: 312, class: 'bd-dim', 'marker-end': `url(#${am})` }),
    label(200, 338, 'من المرفق إلى أطراف الأصابع', 'small'));
  let play = null;
  if (mode === 'wash') {
    // اليد الأخرى تصب الماء عند المرفق
    const d = drops(4, X(ELB - 6), X(ELB + 6), 112, 180);
    svg.append(s('path', { d: `M${X(ELB - 34)} 86 q34 -18 68 0 q-8 22 -34 24 q-26 -2 -34 -24z`, class: 'bd-skin' }),
      s('path', { d: `M${X(ELB - 4)} 110 L${X(ELB - 4)} 176 M${X(ELB + 4)} 110 L${X(ELB + 4)} 176`, class: 'bd-stream' }), d);
    if (anim) play = () => ({ dur: 2800, frame: t => {
      const w = (X0 - TIP) * ease(t);
      waterClip.setAttribute('x', (X0 - w).toFixed(1)); waterClip.setAttribute('width', w.toFixed(1)); d.tick(t);
    } });
    else d.tick(1);
  }
  return { svg, play };
}

// ---- الرأس: مسح مقدّم الرأس ببقية البلل (منظر جانبي، الجبهة إلى اليمين)
function wuduHead(anim) {
  const svg = svgRoot('مسح مقدّم الرأس');
  const cx = 196, cy = 214, rx = 100, ry = 118;
  const P = (r1, r2, a) => [cx + r1 * Math.cos(a), cy + r2 * Math.sin(a)];
  const deg = d => (d * Math.PI) / 180;
  const A0 = deg(-84), A1 = deg(-34); // مقدّم الرأس: نحو ربعه مما يلي الجبهة
  const [ox0, oy0] = P(108, 126, A0), [ox1, oy1] = P(108, 126, A1), [ix1, iy1] = P(92, 110, A1), [ix0, iy0] = P(92, 110, A0);
  const f = n => n.toFixed(1);
  const [bx, by] = P(108, 126, deg(160)), [bix, biy] = P(92, 110, deg(160));
  svg.append(
    s('path', { d: 'M48 420 Q 60 360 150 350 L 250 350 Q 340 360 352 420 Z', class: 'bd-cloth' }),
    s('path', { d: 'M150 300 L 236 300 L 240 372 L 146 372 Z', class: 'bd-skin' }),
    // رأس من الجانب (الجبهة والأنف إلى اليمين) بلا ملامح
    s('path', { d: `M${cx - rx} ${cy} A${rx} ${ry} 0 0 1 ${cx + 78} ${cy - 74} C ${cx + 96} ${cy - 50} ${cx + 100} ${cy - 22} ${cx + 100} ${cy - 2} L ${cx + 118} ${cy + 30} L ${cx + 100} ${cy + 38} C ${cx + 102} ${cy + 60} ${cx + 96} ${cy + 84} ${cx + 70} ${cy + 100} C ${cx + 30} ${cy + 124} ${cx - 40} ${cy + 116} ${cx - 70} ${cy + 86} C ${cx - 92} ${cy + 62} ${cx - rx} ${cy + 30} ${cx - rx} ${cy} Z`, class: 'bd-skin' }),
    s('ellipse', { cx: cx - 18, cy: cy + 6, rx: 13, ry: 24, class: 'bd-ear' }),
    // الشعر من الخلف إلى قصاص الشعر
    s('path', { d: `M${f(bx)} ${f(by)} A108 126 0 0 1 ${f(ox1)} ${f(oy1)} L${f(ix1)} ${f(iy1)} A92 110 0 0 0 ${f(bix)} ${f(biy)} Z`, class: 'bd-hair' }),
    s('path', { d: `M${f(ox0)} ${f(oy0)} A108 126 0 0 1 ${f(ox1)} ${f(oy1)} L${f(ix1)} ${f(iy1)} A92 110 0 0 0 ${f(ix0)} ${f(iy0)} Z`, class: 'bd-region' }));
  // أثر المسح على وسط المنطقة
  const mid = a => P(100, 118, a);
  const [mx0, my0] = mid(A0), [mx1, my1] = mid(A1);
  const trail = s('path', { d: `M${f(mx0)} ${f(my0)} A100 118 0 0 1 ${f(mx1)} ${f(my1)}`, class: 'bd-wipe', pathLength: 100, 'stroke-dasharray': '100', 'stroke-dashoffset': anim ? '100' : '0' });
  // ثلاث أصابع مضمومة
  const hand = s('g', { class: 'bd-hand' }, s('rect', { x: -34, y: -21, width: 68, height: 14, rx: 7 }), s('rect', { x: -36, y: -7, width: 72, height: 14, rx: 7 }), s('rect', { x: -32, y: 7, width: 64, height: 14, rx: 7 }), s('rect', { x: 26, y: -24, width: 46, height: 50, rx: 14 }));
  const placeHand = a => { const [hx, hy] = P(122, 140, a); const t = Math.atan2(ry * Math.cos(a), -rx * Math.sin(a)) * 180 / Math.PI; hand.setAttribute('transform', `translate(${f(hx)} ${f(hy)}) rotate(${f(t + 180)})`); };
  placeHand(anim ? A0 : A1);
  svg.append(trail, hand,
    s('line', { x1: f(ox1 - 10), y1: f(oy1 - 14), x2: 330, y2: 84, class: 'bd-leader' }), label(338, 70, 'مقدّم الرأس', 'small strong'),
    label(f(ix1 + 54), f(iy1 + 22), 'قصاص الشعر', 'tiny'),
    label(110, 92, 'ببقية البلل', 'small'), label(110, 114, 'دون ماء جديد', 'tiny'));
  const play = anim ? () => ({ dur: 2400, frame: t => { placeHand(lerp(A0, A1, ease(t))); trail.setAttribute('stroke-dashoffset', f(100 * (1 - ease(t)))); } }) : null;
  return { svg, play };
}

// ---- القدم: من أطراف الأصابع إلى المفصل بين الساق والقدم (منظر جانبي، الأصابع إلى اليمين للقدم اليمنى)
function wuduFoot(side, anim) {
  const svg = svgRoot(side === 'right' ? 'القدم اليمنى' : 'القدم اليسرى');
  const flip = side === 'left';
  const X = x => (flip ? W - x : x);
  const g = s('g', { transform: flip ? `translate(${W} 0) scale(-1 1)` : null });
  const TOPC = 'M354 314 C 318 304 282 280 252 268 C 236 262 222 258 212 252';
  g.append(
    s('path', { d: 'M146 110 L 208 110 L 214 254 L 148 262 Z', class: 'bd-skin' }),
    s('path', { d: 'M138 86 L 216 86 L 214 140 L 140 144 Z', class: 'bd-cloth' }),
    s('path', { d: 'M150 255 C 130 286 128 332 152 342 L 342 344 C 366 344 370 318 354 314 C 318 304 282 280 252 268 C 236 262 222 258 212 252 Z', class: 'bd-skin' }),
    s('circle', { cx: 178, cy: 266, r: 10, class: 'bd-ear' }),
    ...[[342, 344], [326, 342], [310, 338]].map(([x, y]) => s('path', { d: `M${x} ${y - 20} q8 2 8 10`, class: 'bd-toe' })),
    s('path', { d: TOPC, class: 'bd-region-line' }));
  const trail = s('path', { d: TOPC, class: 'bd-wipe', pathLength: 100, 'stroke-dasharray': '100', 'stroke-dashoffset': anim ? '100' : '0' });
  const hand = s('g', { class: 'bd-hand' }, s('rect', { x: -30, y: -22, width: 60, height: 20, rx: 10 }), s('rect', { x: -38, y: -18, width: 12, height: 12, rx: 6 }));
  g.append(trail, hand,
    s('circle', { cx: 212, cy: 252, r: 7, class: 'bd-joint' }),
    s('circle', { cx: 250, cy: 267, r: 5, class: 'bd-dome' }));
  svg.append(g,
    label(200, 30, side === 'right' ? 'القدم اليمنى' : 'القدم اليسرى', 'big'),
    s('line', { x1: X(212), y1: 244, x2: X(268), y2: 196, class: 'bd-leader' }), label(X(292), 186, 'المفصل', 'small strong'),
    s('line', { x1: X(250), y1: 272, x2: X(276), y2: 300, class: 'bd-leader' }), label(X(296), 316, 'قبة القدم', 'tiny'),
    label(X(340), 372, 'أطراف الأصابع', 'small strong'));
  // اليد تمسح من الأصابع إلى المفصل
  let len = null;
  const placeHand = t => {
    const p = trail.getTotalLength ? trail : null;
    if (!p || !p.isConnected) { hand.setAttribute('transform', t > 0.5 ? 'translate(214 236)' : 'translate(350 298)'); return; }
    len = len || p.getTotalLength();
    const a = p.getPointAtLength(len * t), b = p.getPointAtLength(Math.min(len, len * t + 1));
    hand.setAttribute('transform', `translate(${a.x.toFixed(1)} ${(a.y - 4).toFixed(1)}) rotate(${(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 180).toFixed(1)})`);
  };
  placeHand(anim ? 0 : 1);
  const play = anim ? () => ({ dur: 2600, frame: t => { placeHand(ease(t)); trail.setAttribute('stroke-dashoffset', (100 * (1 - ease(t))).toFixed(2)); } }) : null;
  if (!anim) requestAnimationFrame(() => placeHand(1));
  return { svg, play };
}

// ---- الخلاصة: الترتيب والموالاة
function wuduOrder() {
  const svg = svgRoot('ترتيب أفعال الوضوء');
  const rows = [['غَسل', 'الوجه'], ['غَسل', 'اليد اليمنى'], ['غَسل', 'اليد اليسرى'], ['مسح', 'مقدّم الرأس'], ['مسح', 'القدمين']];
  const am = uid('am');
  svg.append(arrowDefs(am));
  rows.forEach(([verb, part], i) => {
    const y = 40 + i * 70;
    svg.append(
      s('rect', { x: 70, y: y - 24, width: 260, height: 48, rx: 14, class: 'bd-row' + (verb === 'مسح' ? ' wipe' : '') }),
      s('circle', { cx: 300, cy: y, r: 15, class: 'bd-num' }),
      s('text', { x: 300, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'bd-numt' }, i + 1),
      label(196, y, `${verb} ${part}`, ''),
      i < rows.length - 1 ? s('line', { x1: 200, y1: y + 25, x2: 200, y2: y + 44, class: 'bd-dim', 'marker-end': `url(#${am})` }) : null);
  });
  svg.append(label(200, 400, 'متتابعة دون فاصل (الموالاة)', 'small strong'));
  return { svg };
}

function wudu(stage, anim) {
  const id = DIAGRAM_STAGES.wudu[stage]?.[0] || 'parts';
  switch (id) {
    case 'parts': return wuduParts(false);
    case 'face-limits': return wuduFace('limits', false);
    case 'face': return wuduFace('wash', anim);
    case 'arm-limits': return wuduArm('limits', 'right', false);
    case 'right-arm': return wuduArm('wash', 'right', anim);
    case 'left-arm': return wuduArm('wash', 'left', anim);
    case 'head': return wuduHead(anim);
    case 'right-foot': return wuduFoot('right', anim);
    case 'left-foot': return wuduFoot('left', anim);
    default: return wuduOrder();
  }
}
registerDiagram('wudu', wudu, { printStage: 0 });

// ============================================================ الغسل
// شخص مبسّط يُرى من الخلف: يمين الشاشة = يمين الشخص
const BODY = {
  head: () => [s('circle', { cx: 200, cy: 76, r: 28 }), s('rect', { x: 188, y: 100, width: 24, height: 24, rx: 4 })],
  right: () => [
    s('path', { d: 'M200 120 Q 232 116 260 126 L 254 268 Q 228 278 200 278 Z' }),
    s('path', { d: 'M260 126 L 284 130 L 296 266 L 274 270 Z' }), s('circle', { cx: 287, cy: 276, r: 12 }),
    s('path', { d: 'M202 270 L 250 266 L 240 404 L 206 404 Z' }), s('ellipse', { cx: 224, cy: 410, rx: 22, ry: 8 })],
  left: () => [
    s('path', { d: 'M200 120 Q 168 116 140 126 L 146 268 Q 172 278 200 278 Z' }),
    s('path', { d: 'M140 126 L 116 130 L 104 266 L 126 270 Z' }), s('circle', { cx: 113, cy: 276, r: 12 }),
    s('path', { d: 'M198 270 L 150 266 L 160 404 L 194 404 Z' }), s('ellipse', { cx: 176, cy: 410, rx: 22, ry: 8 })],
};
const REG = { head: [44, 126], right: [116, 420], left: [116, 420] };

function figure(parts = { head: '', right: '', left: '' }) {
  return s('g', {}, ...['left', 'right', 'head'].map(k => s('g', { class: 'bd-pict ' + (parts[k] || '') }, ...BODY[k]())));
}
function shower() {
  return s('g', { class: 'bd-shower' }, s('path', { d: 'M200 0 L200 14' }), s('path', { d: 'M176 14 h48 l-6 12 h-36 z', class: 'bd-shower-head' }));
}
// غسل جزء من البدن: طبقة ماء تنزل من الأعلى إلى الأسفل داخل حدود الجزء
function washLayer(part, anim) {
  const cid = uid('cg');
  const [y0, y1] = REG[part];
  const r = s('rect', { x: 0, y: y0, width: W, height: anim ? 0 : y1 - y0 });
  const g = s('g', {}, s('defs', {}, clip(cid, r)), s('g', { 'clip-path': `url(#${cid})`, class: 'bd-water-g' }, ...BODY[part]()));
  return { g, set: t => r.setAttribute('height', ((y1 - y0) * t).toFixed(1)) };
}

function ghusl(stage, anim, ctx = {}) {
  let id = DIAGRAM_STAGES.ghusl[stage]?.[0] || 'types';
  const svg = svgRoot('كيفية الغسل');
  let play = null;
  if (id === 'types') {
    const badge = (x, y, n) => s('g', {}, s('circle', { cx: x, cy: y, r: 11, class: 'bd-num' }), s('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'bd-numt small' }, n));
    const sc = 0.6, fy = 52;
    const fx = x => x + 91 - 200 * sc;
    const panel = (x, title, inWater) => s('g', {},
      s('rect', { x, y: 30, width: 182, height: 310, rx: 16, class: 'bd-panel' }),
      inWater ? null : s('g', { transform: `translate(${fx(x)} ${fy - 14}) scale(${sc})` }, shower()),
      s('g', { transform: `translate(${fx(x)} ${fy}) scale(${sc})` }, figure(inWater ? {} : { head: 'n1', right: 'n2', left: 'n3' })),
      inWater ? s('rect', { x, y: 62, width: 182, height: 278, rx: 14, class: 'bd-pool front' }) : null,
      inWater ? null : [badge(x + 91, fy + 76 * sc, 1), badge(x + 91 + 34 * sc, fy + 190 * sc, 2), badge(x + 91 - 34 * sc, fy + 190 * sc, 3)],
      label(x + 91, 368, title, ''));
    svg.append(panel(214, 'الترتيبي', false), panel(4, 'الارتماسي', true));
    return { svg };
  }
  svg.append(label(330, 404, '(منظر من الخلف)', 'tiny'));
  if (id === 'niyya') {
    svg.append(shower(), figure(), label(200, 30, '', ''));
    svg.append(s('g', { class: 'bd-bubble' }, s('rect', { x: 236, y: 22, width: 120, height: 44, rx: 16 }), label(296, 44, 'النية', 'small strong')));
    return { svg };
  }
  if (id === 'dafi' || (id === 'tadriji' && ctx.viewer === 'pilgrim' && ctx.marja === 'khoei')) {
    // الارتماس الدفعي: يغطي الماء البدن كله دفعة واحدة
    const water = s('rect', { x: 50, y: anim && id === 'dafi' ? 420 : 30, width: 300, height: 400, class: 'bd-pool front' });
    svg.append(s('rect', { x: 50, y: 30, width: 300, height: 390, rx: 18, class: 'bd-panel' }), figure(), water, label(200, 18, 'دفعةً واحدة', 'small strong'));
    if (anim && id === 'dafi') play = () => ({ dur: 1100, frame: t => water.setAttribute('y', lerp(420, 30, ease(t)).toFixed(1)) });
    return { svg, play };
  }
  if (id === 'tadriji') {
    // الارتماس التدريجي: غمس البدن في الماء شيئاً فشيئاً
    const body = s('g', { transform: anim ? 'translate(0 -300)' : null }, figure());
    const cp = uid('ct');
    svg.append(s('defs', {}, clip(cp, s('rect', { x: 50, y: 30, width: 300, height: 390, rx: 18 }))),
      s('rect', { x: 50, y: 30, width: 300, height: 390, rx: 18, class: 'bd-panel' }),
      s('g', { 'clip-path': `url(#${cp})` }, body, s('rect', { x: 50, y: 30, width: 300, height: 390, class: 'bd-pool front' })),
      label(200, 18, 'شيئاً فشيئاً', 'small strong'));
    if (anim) play = () => ({ dur: 3600, frame: t => body.setAttribute('transform', `translate(0 ${lerp(-300, 0, ease(t)).toFixed(1)})`) });
    return { svg, play };
  }
  // الترتيبي: الرأس والرقبة، ثم الأيمن، ثم الأيسر
  const order = ['head', 'right', 'left'];
  const cur = id === 'done' ? null : id;
  const doneParts = id === 'done' ? order : order.slice(0, order.indexOf(id));
  const parts = {};
  for (const p of doneParts) parts[p] = 'washed';
  if (cur) parts[cur] = 'cur';
  svg.append(shower(), figure(parts));
  for (const p of doneParts) svg.append(washLayer(p, false).g);
  let layer = null, d = null;
  if (cur) {
    layer = washLayer(cur, anim);
    const [y0, y1] = REG[cur];
    const xr = cur === 'head' ? [180, 220] : cur === 'right' ? [210, 290] : [110, 190];
    d = drops(4, xr[0], xr[1], y0, y1);
    svg.append(layer.g, s('path', { d: `M${(xr[0] + xr[1]) / 2 - 6} 26 L${(xr[0] + xr[1]) / 2 - 6} ${y0} M${(xr[0] + xr[1]) / 2 + 6} 26 L${(xr[0] + xr[1]) / 2 + 6} ${y0}`, class: 'bd-stream' }), d);
    if (anim) play = () => ({ dur: 2600, frame: t => { layer.set(ease(t)); d.tick(t); } });
    else d.tick(1);
  }
  svg.append(label(338, 190, 'الأيمن', 'small' + (cur === 'right' ? ' strong' : '')), label(62, 190, 'الأيسر', 'small' + (cur === 'left' ? ' strong' : '')));
  if (cur === 'head') svg.append(label(300, 80, 'الرأس والرقبة', 'small strong'));
  return { svg, play };
}
registerDiagram('ghusl', ghusl, { printStage: 5 });
