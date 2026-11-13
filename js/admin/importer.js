// أداة استيراد PPTX داخل المتصفح (تعتمد على JSZip المحلي window.JSZip)
// تقرأ الشرائح بترتيبها، والنصوص حرفياً، والصور (WebP ≤ 200KB)، وحركات الظهور من p:timing
// فتحوّل كل نقرة إلى «خطوة كشف»، وتتعرف على شارات الأرقام وأقوال المراجع والأسئلة.
import { uid, emptySection, DEFAULT_SETTINGS } from '../core/pack.js';
import { detectStatus, normalizeSearch } from '../core/arabic.js';

const MAX_IMG_BYTES = 200 * 1024;

// ---------- أدوات XML ----------
const kids = (n, name) => n ? [...n.children].filter(c => c.localName === name) : [];
const kid = (n, name) => kids(n, name)[0] || null;
const path = (n, ...names) => names.reduce((a, nm) => kid(a, nm), n);
const desc = (n, name) => n ? [...n.getElementsByTagName('*')].filter(c => c.localName === name) : [];
const num = v => (v == null ? 0 : Number(v));
const parseXml = s => new DOMParser().parseFromString(s, 'application/xml');

function resolvePath(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/'); parts.pop();
  for (const p of target.split('/')) { if (p === '..') parts.pop(); else if (p !== '.') parts.push(p); }
  return parts.join('/');
}

async function readRels(zip, partPath) {
  const p = partPath.replace(/([^/]+)$/, '_rels/$1.rels');
  const f = zip.file(p);
  const map = {};
  if (!f) return map;
  const x = parseXml(await f.async('string'));
  for (const r of desc(x, 'Relationship')) {
    map[r.getAttribute('Id')] = { target: resolvePath(partPath, r.getAttribute('Target')), type: r.getAttribute('Type') || '', external: r.getAttribute('TargetMode') === 'External' };
  }
  return map;
}

// نص الفقرة: a:r/a:t و a:fld/a:t و a:br → سطر جديد
function paraText(p) {
  let s = '';
  for (const c of p.children) {
    if (c.localName === 'r' || c.localName === 'fld') s += desc(c, 't').map(t => t.textContent).join('');
    else if (c.localName === 'br') s += '\n';
  }
  return s;
}

function readXfrm(xfrm) {
  if (!xfrm) return null;
  const off = kid(xfrm, 'off'), ext = kid(xfrm, 'ext');
  if (!off || !ext) return null;
  return { x: num(off.getAttribute('x')), y: num(off.getAttribute('y')), w: num(ext.getAttribute('cx')), h: num(ext.getAttribute('cy')) };
}

// ---------- قراءة الأشكال ----------
function collectShapes(spTree, rels, tf = r => r, out = [], issues = []) {
  for (const n of spTree.children) {
    const ln = n.localName;
    if (ln === 'sp' || ln === 'pic') {
      const nv = path(n, ln === 'sp' ? 'nvSpPr' : 'nvPicPr');
      const c = kid(nv, 'cNvPr');
      const spPr = kid(n, 'spPr');
      const rect0 = readXfrm(kid(spPr, 'xfrm'));
      const item = {
        spid: c?.getAttribute('id'), name: c?.getAttribute('name') || '', descr: c?.getAttribute('descr') || '',
        kind: ln, prst: kid(spPr, 'prstGeom')?.getAttribute('prst') || (ln === 'sp' && kid(path(nv, 'cNvSpPr'), 'spLocks') ? '' : ''),
        isTextBox: kid(nv, 'cNvSpPr')?.getAttribute('txBox') === '1',
        ph: path(nv, 'nvPr', 'ph')?.getAttribute('type') || (path(nv, 'nvPr', 'ph') ? 'body' : null),
        rect: rect0 ? tf(rect0) : null,
        paras: [], image: null,
      };
      const tx = kid(n, 'txBody');
      if (tx) item.paras = kids(tx, 'p').map(paraText);
      // صورة: p:pic/p:blipFill أو تعبئة الشكل بصورة spPr/a:blipFill
      const blip = (ln === 'pic' ? desc(kid(n, 'blipFill'), 'blip')[0] : desc(kid(spPr, 'blipFill'), 'blip')[0]);
      if (blip) {
        const rid = blip.getAttribute('r:embed') || blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
        if (rels[rid] && !rels[rid].external) item.image = rels[rid].target;
        const src = desc(kid(n, 'blipFill') || kid(spPr, 'blipFill'), 'srcRect')[0];
        if (src && [...src.attributes].some(a => Number(a.value))) issues.push(`الصورة في الشكل ${item.spid} مقصوصة في العرض (srcRect) — استُوردت كاملة`);
      }
      out.push(item);
    } else if (ln === 'grpSp') {
      const x = path(n, 'grpSpPr', 'xfrm');
      let t2 = tf;
      if (x) {
        const off = kid(x, 'off'), ext = kid(x, 'ext'), chOff = kid(x, 'chOff'), chExt = kid(x, 'chExt');
        if (off && ext && chOff && chExt) {
          const sx = num(ext.getAttribute('cx')) / (num(chExt.getAttribute('cx')) || 1);
          const sy = num(ext.getAttribute('cy')) / (num(chExt.getAttribute('cy')) || 1);
          const ox = num(off.getAttribute('x')), oy = num(off.getAttribute('y'));
          const cx = num(chOff.getAttribute('x')), cy = num(chOff.getAttribute('y'));
          t2 = r => tf({ x: ox + (r.x - cx) * sx, y: oy + (r.y - cy) * sy, w: r.w * sx, h: r.h * sy });
        }
      }
      const groupId = kid(path(n, 'nvGrpSpPr'), 'cNvPr')?.getAttribute('id');
      const before = out.length;
      collectShapes(n, rels, t2, out, issues);
      for (let i = before; i < out.length; i++) out[i].group ??= groupId;
    } else if (ln === 'graphicFrame') {
      const tbl = desc(n, 'tbl')[0];
      const c = kid(path(n, 'nvGraphicFramePr'), 'cNvPr');
      if (tbl) {
        const rows = desc(tbl, 'tr').map(tr => desc(tr, 'tc').map(tc => desc(tc, 'p').map(paraText).join(' ').trim()).join(' | '));
        out.push({ spid: c?.getAttribute('id'), kind: 'table', prst: 'rect', paras: rows, rect: tf(readXfrm(kid(n, 'xfrm')) || { x: 0, y: 0, w: 0, h: 0 }) });
        issues.push(`جدول في الشكل ${c?.getAttribute('id')} حُوّل إلى أسطر نصية`);
      } else issues.push(`عنصر غير مدعوم (رسم بياني/كائن) في الشكل ${c?.getAttribute('id')} — تُجوهل`);
    }
  }
  return out;
}

// ---------- قراءة الحركات من p:timing ----------
// كل clickEffect يبدأ خطوة جديدة؛ withEffect/afterEffect تتبع الخطوة نفسها
function readTiming(slideXml, issues) {
  const res = { shapes: {}, clicks: 0, hasTiming: false };
  const timing = desc(slideXml, 'timing')[0];
  if (!timing) return res;
  const mainSeq = desc(timing, 'cTn').find(c => c.getAttribute('nodeType') === 'mainSeq');
  if (desc(timing, 'cTn').some(c => c.getAttribute('nodeType') === 'interactiveSeq')) issues.push('حركات تفاعلية (بالضغط على شكل) تُجوهلت');
  if (!mainSeq) return res;
  res.hasTiming = true;
  let step = 0;
  for (const c of desc(mainSeq, 'cTn')) {
    const cls = c.getAttribute('presetClass');
    const nt = c.getAttribute('nodeType');
    if (!cls) continue;
    if (nt === 'clickEffect') step++;
    const tgt = desc(c, 'spTgt')[0];
    if (!tgt) continue;
    const spid = tgt.getAttribute('spid');
    const pRg = desc(tgt, 'pRg')[0];
    const rec = res.shapes[spid] ??= { entr: null, exit: null, paras: {}, emph: 0 };
    if (cls === 'entr') {
      if (pRg) {
        for (let i = num(pRg.getAttribute('st')); i <= num(pRg.getAttribute('end')); i++) rec.paras[i] ??= step;
      } else rec.entr ??= step;
    } else if (cls === 'exit') rec.exit ??= step;
    else rec.emph++;
  }
  res.clicks = step;
  return res;
}

// ---------- تصنيف النصوص ----------
function marjaMatcher(marjas) {
  const alts = marjas.flatMap(m => m.aliases.map(a => ({ a, id: m.id }))).sort((x, y) => y.a.length - x.a.length);
  return line => {
    const t = line.replace(/^\s+/, '');
    // قول ملفوف بقوسين بالكامل: «( السيستاني: على الأحوط الأولى )»
    const wrapped = t.match(/^\(\s*([^():]+?)\s*[:：]\s*([\s\S]*?)\s*\)\s*$/);
    if (wrapped) {
      const hit = alts.find(x => wrapped[1] === x.a);
      if (hit) return { id: hit.id, label: wrapped[1], text: wrapped[2], wrap: '()' };
    }
    for (const { a, id } of alts) {
      if (t.startsWith(a)) {
        const rest = t.slice(a.length);
        const m = rest.match(/^\s*[:：]\s*/) || rest.match(/^\s+/);
        if (m) return { id, label: a + rest.slice(0, m[0].length).replace(/\s+$/, ''), text: rest.slice(m[0].length) };
      }
    }
    return null;
  };
}

const isQuestionLine = l => /[؟?]\s*$/.test(l.trim()) || /^\s*(سؤال|هل)\b/.test(l);
const isAnswerLine = l => /^\s*(ال)?جواب\s*[:/：]?/.test(l);

function classifyText(paras, matchMarja) {
  const lines = paras.map(p => p.replace(/\s+$/, '')).filter(p => p.replace(/[\s ​-‏‪-‮⁦-⁩]/g, '') !== '');
  const text = lines.join('\n');
  const marjaIdx = lines.map((l, i) => matchMarja(l) ? i : -1).filter(i => i >= 0);
  // أين ينتهي السؤال؟ أول سطر فيه «؟» إن بدأ الكلام بسؤال
  const qEnd = lines.findIndex(l => /[؟?]/.test(l));
  const startsQ = /^\s*(سؤال|هل|ما |من )/.test(lines[0] || '') || qEnd === 0;
  if (marjaIdx.length) {
    const first = marjaIdx[0];
    let q = '', sharedLines = lines.slice(0, first);
    if (startsQ && qEnd >= 0 && qEnd < first) { q = lines.slice(0, qEnd + 1).join('\n'); sharedLines = lines.slice(qEnd + 1, first); }
    const opinions = [];
    for (let k = 0; k < marjaIdx.length; k++) {
      const i = marjaIdx[k], end = marjaIdx[k + 1] ?? lines.length;
      const m = matchMarja(lines[i]);
      const body = [m.text, ...lines.slice(i + 1, end)].filter(s => s !== '').join('\n');
      const op = { marja: m.id, label: m.label, text: body, status: detectStatus(body) };
      if (m.wrap) op.wrap = m.wrap;
      if (/يضاف إلى ما ذكره|يضاف الى ما ذكره/.test(body)) op.ref = marjaIdxRef(opinions);
      opinions.push(op);
    }
    const shared = sharedLines.join('\n');
    return { type: 'ruling', q, shared, sharedStatus: shared ? detectStatus(shared) : 'unspecified', opinions };
  }
  const hasAnswer = lines.some(isAnswerLine) || (startsQ && qEnd >= 0 && qEnd < lines.length - 1);
  if (startsQ && qEnd >= 0 && hasAnswer) {
    return { type: 'ruling', q: lines.slice(0, qEnd + 1).join('\n'), shared: lines.slice(qEnd + 1).join('\n'), sharedStatus: detectStatus(lines.slice(qEnd + 1).join('\n')), opinions: [] };
  }
  if (detectStatus(text) !== 'unspecified' || /احوط/.test(normalizeSearch(text))) {
    return { type: 'ruling', q: '', shared: text, sharedStatus: detectStatus(text), opinions: [] };
  }
  return { type: 'text', text };
}
function marjaIdxRef(opinions) { return opinions[opinions.length - 1]?.marja || null; }

// ---------- تحويل الصور إلى WebP ----------
export async function toWebp(blob, maxBytes = MAX_IMG_BYTES) {
  const bmp = await createImageBitmap(blob);
  let scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  for (let attempt = 0; attempt < 8; attempt++) {
    const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
    for (const q of [0.82, 0.72, 0.62, 0.52]) {
      const out = await new Promise(r => cv.toBlob(r, 'image/webp', q));
      if (!out || out.type !== 'image/webp') throw new Error('المتصفح لا يدعم إنشاء WebP');
      if (out.size <= maxBytes) return { blob: out, w, h, q };
    }
    scale *= 0.8;
  }
  throw new Error('تعذّر ضغط الصورة إلى 200KB');
}

export function randName(ext) {
  const a = new Uint8Array(8); crypto.getRandomValues(a);
  return Array.from(a, b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('') + '.' + ext;
}

const ORDINAL_RE = /^(اولا|ثانيا|ثالثا|رابعا|خامسا|سادسا|سابعا|ثامنا|تاسعا|عاشرا)/;

// ---------- الاستيراد ----------
/**
 * @param {Blob|ArrayBuffer} file ملف PPTX
 * @param {object} opt { fileName, ranges: [{from, to, title}], marjas, onProgress(msg, ratio) }
 * @returns { chapters, media: Map(path → Blob), report: string[], slides: rawInfo[] }
 */
export async function importPptx(file, opt = {}) {
  const JSZip = globalThis.JSZip;
  if (!JSZip) throw new Error('مكتبة JSZip غير محمّلة');
  const prog = opt.onProgress || (() => {});
  const marjas = opt.marjas || DEFAULT_SETTINGS.marjas;
  const matchMarja = marjaMatcher(marjas);
  const zip = await JSZip.loadAsync(file);
  const presPath = 'ppt/presentation.xml';
  const pres = parseXml(await zip.file(presPath).async('string'));
  const sz = desc(pres, 'sldSz')[0];
  const W = num(sz?.getAttribute('cx')) || 12192000, H = num(sz?.getAttribute('cy')) || 6858000;
  const presRels = await readRels(zip, presPath);
  const order = desc(pres, 'sldId').map(s => presRels[s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')]?.target).filter(Boolean);

  const report = [];
  const media = new Map();
  const imageCache = new Map(); // نفس الصورة في أكثر من شريحة تُحوّل مرة
  const slidesOut = [];

  for (let i = 0; i < order.length; i++) {
    const no = i + 1;
    prog(`قراءة الشريحة ${no} من ${order.length}`, i / order.length);
    const sp = order[i];
    const xml = parseXml(await zip.file(sp).async('string'));
    const rels = await readRels(zip, sp);
    const issues = [];
    const spTree = desc(xml, 'spTree')[0];
    const shapes = spTree ? collectShapes(spTree, rels, r => r, [], issues) : [];
    const timing = readTiming(xml, issues);
    // ملاحظات المتحدث (إن وجدت) تصير «ملاحظات الشيخ»
    let notes = '';
    const notesRel = Object.values(rels).find(r => r.type.endsWith('/notesSlide'));
    if (notesRel && zip.file(notesRel.target)) {
      const nx = parseXml(await zip.file(notesRel.target).async('string'));
      notes = desc(nx, 'sp').filter(s => desc(s, 'ph').some(p => p.getAttribute('type') === 'body'))
        .map(s => desc(s, 'p').map(paraText).join('\n')).join('\n').trim();
    }

    // خطوة كل شكل (أو فقرة)
    const items = [];
    for (const s of shapes) {
      const t = timing.shapes[s.spid];
      const base = t?.entr ?? 0;
      const hideAt = t?.exit ?? null;
      if (t?.emph) issues.push(`حركات تأكيد على الشكل ${s.spid} تُجوهلت`);
      const pSteps = t && Object.keys(t.paras).length ? t.paras : null;
      if (pSteps && s.paras.length) {
        // حركة على مستوى الفقرة: كل فقرة خطوة
        const groups = new Map();
        s.paras.forEach((p, idx) => { const k = pSteps[idx] ?? base; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
        for (const [k, ps] of groups) items.push({ ...s, paras: ps, step: k, hideAt, splitFrom: s.spid });
      } else items.push({ ...s, step: base, hideAt });
    }
    const txt = it => it.paras.join('\n').trim();
    const area = r => r ? r.w * r.h : 0;
    const inside = (a, b, pad = 0) => a && b && a.x >= b.x - pad && a.y >= b.y - pad && a.x + a.w <= b.x + b.w + pad && a.y + a.h <= b.y + b.h + pad;
    const center = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
    const dist = (p, r) => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.w)), Math.max(r.y - p.y, 0, p.y - (r.y + r.h)));

    // 1) الصور
    const images = items.filter(it => it.image);
    // 2) الشارات: أشكال بيضاوية بنص قصير
    const isBadge = it => !it.image && /ellipse|flowChartConnector/.test(it.prst || '') && txt(it) && txt(it).length <= 14 && txt(it).split(/\s+/).length <= 3;
    const badges = items.filter(isBadge);
    // 3) العنوان: مستطيل بنص قصير في أعلى الشريحة
    const titleCand = items.filter(it => !it.image && !isBadge(it) && txt(it) && it.rect && (it.ph === 'title' || it.ph === 'ctrTitle' || it.prst === 'rect')
      && it.rect.y < H * 0.30 && txt(it).length <= 70);
    titleCand.sort((a, b) => (a.ph ? -1 : 0) - (b.ph ? -1 : 0) || a.rect.y - b.rect.y);
    const titleItem = titleCand[0] || null;
    // 4) المصادر: نص قصير فيه رقم داخل مربع نص آخر
    const textItems = items.filter(it => !it.image && !isBadge(it) && it !== titleItem && txt(it));
    const sourceOf = new Map();
    for (const it of textItems) {
      const t = txt(it);
      if (t.length <= 40 && /\d/.test(t) && /[:：]/.test(t)) {
        const host = textItems.filter(h => h !== it && inside(it.rect, h.rect, H * 0.01) && area(h.rect) > area(it.rect) * 2).sort((a, b) => area(a.rect) - area(b.rect))[0];
        if (host) sourceOf.set(it, host);
      }
    }
    // 5) تسميات فوق الصور
    const labelOf = new Map();
    for (const it of textItems) {
      if (sourceOf.has(it)) continue;
      const img = images.find(im => inside(it.rect, im.rect, H * 0.01));
      if (img && txt(it).length <= 30) labelOf.set(it, img);
    }
    // 5ب) نص موضوع فوق فراغ داخل مربع نص آخر (مثل صيغة النية وسط الشرح):
    //      يُقسم المربع عند السطر الفارغ ويوضع النص بينهما، ويظهر مع المربع نفسه
    for (const x of [...textItems]) {
      if (sourceOf.has(x) || labelOf.has(x)) continue;
      const host = textItems.find(h => h !== x && !h.splitDone && inside(x.rect, h.rect, H * 0.01) && area(h.rect) > area(x.rect) * 2);
      if (!host) continue;
      const blank = p => p.replace(/[\s ​-‏‪-‮⁦-⁩]/g, '') === '';
      const ps = host.paras;
      const gap = ps.findIndex((p, i) => i > 0 && blank(p) && ps.slice(0, i).some(q => !blank(q)) && ps.slice(i).some(q => !blank(q)));
      if (gap < 0) continue;
      let end = gap; while (end < ps.length && blank(ps[end])) end++;
      const b1 = { ...host, paras: ps.slice(0, gap), splitDone: true, rect: { ...host.rect, h: 1 } };
      const b2 = { ...host, paras: ps.slice(end), splitDone: true, rect: { ...host.rect, y: host.rect.y + host.rect.h, h: 1 } };
      const hi = items.indexOf(host);
      items.splice(hi, 1, b1, b2);
      textItems.splice(textItems.indexOf(host), 1, b1, b2);
      if (x.step < host.step) x.step = host.step;
      issues.push(`نص «${txt(x).slice(0, 30)}…» داخل فراغ مربع آخر: وُضع في موضعه من الشرح ويظهر معه`);
    }
    // 6) ربط الشارات بأقرب مربع
    const badgeOf = new Map();
    const hosts = textItems.filter(it => !sourceOf.has(it) && !labelOf.has(it));
    for (const b of badges) {
      const c = center(b.rect);
      const best = hosts.filter(h => h.rect && !badgeOf.has(h)).map(h => ({ h, d: dist(c, h.rect) })).sort((x, y) => x.d - y.d)[0];
      if (best && best.d <= Math.max(b.rect.w, b.rect.h) * 0.9) badgeOf.set(best.h, b);
      else issues.push(`شارة «${txt(b)}» لم تُربط بمربع — عُرضت وسماً مستقلاً`);
    }
    const usedBadges = new Set(badgeOf.values());

    // بناء الكتل
    const blocks = [];
    const slideTitle = titleItem ? txt(titleItem).replace(/\s+/g, ' ') : '';
    for (const it of items) {
      if (it === titleItem || sourceOf.has(it) || labelOf.has(it) || usedBadges.has(it)) continue;
      if (it.image) {
        const labels = [...labelOf].filter(([, im]) => im === it).map(([l]) => txt(l));
        blocks.push({ step: it.step, hideAt: it.hideAt, rect: it.rect, b: { id: uid('b'), type: 'image', zipPath: it.image, alt: it.descr || '', labels, _altAuto: !it.descr } });
        continue;
      }
      const t = txt(it);
      if (!t) continue; // مربعات حاوية فارغة
      const badgeItem = badgeOf.get(it);
      if (isBadge(it)) { blocks.push({ step: it.step, hideAt: it.hideAt, rect: it.rect, b: { id: uid('b'), type: 'text', style: 'label', text: t, badge: '' } }); continue; }
      const c = classifyText(it.paras, matchMarja);
      const src = [...sourceOf].find(([, h]) => h === it)?.[0];
      let b;
      if (c.type === 'ruling') b = { id: uid('b'), type: 'ruling', q: c.q, shared: c.shared, sharedStatus: c.sharedStatus, opinions: c.opinions };
      else {
        const single = !t.includes('\n');
        let style = 'box';
        if (single && t.length <= 14 && !badgeItem) style = (it.rect && it.rect.h < H * 0.11) || it.isTextBox ? 'label' : 'heading';
        if (/^\s*\(.*\)\s*$/s.test(t) || (/قربة (ا|إ)لى الله/.test(t) && t.length < 140 && !t.includes('\n'))) style = 'niyyah';
        b = { id: uid('b'), type: 'text', style, text: t, badge: '' };
      }
      if (badgeItem) b.badge = txt(badgeItem);
      if (src) b.source = txt(src);
      blocks.push({ step: Math.max(it.step, 0), hideAt: it.hideAt, rect: it.rect, b });
    }

    // ترتيب القراءة داخل الخطوة: من الأعلى للأسفل ثم من اليمين لليسار
    const band = H * 0.06;
    blocks.sort((a, b) => a.step - b.step || (a.rect && b.rect ? (Math.round(a.rect.y / band) - Math.round(b.rect.y / band)) || (b.rect.x + b.rect.w) - (a.rect.x + a.rect.w) : 0));

    // سؤال بلا جواب في الملف: آخر محتوى نصي في الشريحة وينتهي بـ«؟»
    const contentIdx = blocks.map((x, i) => (x.b.type === 'text' && x.b.style !== 'label' && x.b.style !== 'heading') || x.b.type === 'ruling' ? i : -1).filter(i => i >= 0);
    const lastIdx = contentIdx[contentIdx.length - 1];
    if (lastIdx != null) {
      const x = blocks[lastIdx];
      if (x.b.type === 'text' && /[؟?]\s*$/.test(x.b.text.trim()) && !blocks.some(y => y.b.type === 'text' && isAnswerLine(y.b.text))) {
        x.b = { id: x.b.id, type: 'qa', q: x.b.text, a: '', aStatus: 'unspecified', badge: x.b.badge || '' };
        issues.push('سؤال بلا جواب في الملف → بطاقة «سؤال» والجواب «بانتظار الإضافة»');
      }
    }
    // أسئلة لها جواب في مربع آخر تُعرض بشكل «سؤال»
    for (const x of blocks) if (x.b.type === 'text' && /^\s*سؤال/.test(x.b.text) && x.b.style === 'box') x.b.style = 'question';

    // ضغط الخطوات: حذف النقرات التي لا تكشف شيئاً ظاهراً (مثل حركة العنوان أو مربع فارغ)
    const used = [...new Set([0, ...blocks.map(x => x.step)])].sort((a, b) => a - b);
    const remap = new Map(used.map((s, idx) => [s, idx]));
    const dropped = timing.clicks - (used.length - 1);
    if (dropped > 0) issues.push(`${dropped} نقرة لا تكشف محتوى ظاهراً (عنوان/مربع فارغ) دُمجت`);
    const steps = used.map(() => ({ blocks: [] }));
    for (const x of blocks) {
      if (x.hideAt != null) { x.b.hideAt = remap.get([...remap.keys()].filter(s => s <= x.hideAt).pop() ?? 0); issues.push('حركة خروج (إخفاء) مدعومة على كتلة'); }
      steps[remap.get(x.step)].blocks.push(x.b);
    }
    if (!timing.hasTiming) issues.push('لا توجد حركات ظهور: الشريحة تظهر كاملة');

    // شريحة عنوانها فقط (بلا شرح): حقل «شرح الشيخ» فارغ
    const all = blocks.map(x => x.b);
    const substantial = all.some(b => b.type === 'image' || b.type === 'ruling' || b.type === 'qa' || (b.type === 'text' && b.text.replace(/\s+/g, '').length > 40));
    const slide = {
      id: uid('s'), title: slideTitle, audience: 'all', steps,
      explain: '', notes, review: { status: 'unreviewed', by: '', at: '' },
      src: { file: opt.fileName || 'pptx', no },
    };
    if (!substantial && all.length) slide.needsExplain = true;
    slidesOut.push({ no, slide, issues, empty: !all.length, clicks: timing.clicks, hasTiming: timing.hasTiming });
  }

  // تحويل الصور
  const imgBlocks = slidesOut.flatMap(s => s.slide.steps.flatMap(st => st.blocks.filter(b => b.type === 'image').map(b => ({ b, s }))));
  for (let k = 0; k < imgBlocks.length; k++) {
    const { b, s } = imgBlocks[k];
    prog(`تحويل الصورة ${k + 1} من ${imgBlocks.length}`, k / Math.max(1, imgBlocks.length));
    let done = imageCache.get(b.zipPath);
    if (!done) {
      const raw = await zip.file(b.zipPath).async('blob');
      const typed = new Blob([raw], { type: /\.png$/i.test(b.zipPath) ? 'image/png' : 'image/jpeg' });
      const out = await toWebp(typed);
      const name = 'media/' + randName('webp');
      media.set(name, out.blob);
      done = { name, w: out.w, h: out.h, size: out.blob.size, from: b.zipPath, orig: raw.size };
      imageCache.set(b.zipPath, done);
    }
    b.src = done.name; b.w = done.w; b.h = done.h;
    if (!b.alt) b.alt = 'صورة توضيحية' + (s.slide.title ? ': ' + s.slide.title : '');
    s.issues.push(`صورة ${done.from.split('/').pop()} (${Math.round(done.orig / 1024)}KB) → ${done.name} (${Math.round(done.size / 1024)}KB، ${done.w}×${done.h})${b._altAuto ? ' — نص بديل تلقائي يحتاج مراجعة' : ''}`);
    delete b.zipPath; delete b._altAuto;
  }

  // تقسيم إلى أبواب بحسب النطاقات
  const ranges = opt.ranges?.length ? opt.ranges : [{ from: 1, to: slidesOut.length, title: opt.title || (opt.fileName || 'باب مستورد').replace(/\.pptx$/i, '') }];
  const chapters = [];
  for (const r of ranges) {
    const ch = { id: uid('ch'), title: r.title, status: r.status || 'hidden', minutes: r.minutes ?? 30, sections: [] };
    let sec = null;
    for (const s of slidesOut.filter(s => s.no >= r.from && s.no <= r.to)) {
      if (s.empty) { report.push(`الشريحة ${s.no}: فارغة — تُجوهلت`); continue; }
      const t = normalizeSearch(s.slide.title);
      if (!sec || (ORDINAL_RE.test(t) && normalizeSearch(sec.title) !== t)) {
        sec = emptySection(sec ? s.slide.title : (ORDINAL_RE.test(t) ? s.slide.title : 'مقدمة'));
        ch.sections.push(sec);
      }
      sec.slides.push(s.slide);
    }
    chapters.push(ch);
  }
  for (const s of slidesOut) {
    const nSteps = s.slide.steps.length - 1;
    report.push(`الشريحة ${s.no}: «${s.slide.title || '—'}» — ${nSteps} خطوة كشف (من ${s.clicks} نقرة)${s.slide.needsExplain ? ' — عنوان فقط: أُنشئ حقل «شرح الشيخ»' : ''}${s.issues.length ? '\n    - ' + s.issues.join('\n    - ') : ''}`);
  }
  prog('اكتمل الاستيراد', 1);
  return { chapters, media, report, slides: slidesOut, size: { W, H } };
}
