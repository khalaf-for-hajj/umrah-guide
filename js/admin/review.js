// التصحيح والمراجعة: تصدير التصحيحات من الشيخ المراجع، واستيرادها عند المشرف بقبول/رفض كل تعديل،
// وسجل التعديلات، واعتماد الباب كله، وورقة المراجعة للطباعة
import { el, toast, download, fmtDate } from '../core/dom.js';
import { flatSlides, DIAGRAM_STAGES, DIAGRAM_KINDS } from '../core/pack.js';
import { STATUS_LABELS as ST } from '../core/arabic.js';
import { blockType } from '../core/blocks.js';
import { confirmBox } from '../core/ui.js';
import { A, changed, logChange, reviewer, setReviewer, locateSlide, locateBlock, getMediaBlob, putMedia, preloadMediaUrls, flush } from './state.js';

const J = v => JSON.stringify(v ?? null);
const SLIDE_FIELDS = { title: 'العنوان', explain: 'شرح الشيخ', notes: 'ملاحظات الشيخ', audience: 'الجمهور', review: 'التدقيق' };
const CH_FIELDS = { title: 'عنوان الباب', minutes: 'الدقائق', status: 'الحالة' };

// ---------- حساب التعديلات بين الأساس ونسخة العمل ----------
export function diffPacks(base, work) {
  const items = [];
  const baseSlides = new Map(), workSlides = new Map();
  const index = (pack, map) => pack.chapters.forEach(ch => ch.sections.forEach(sec => sec.slides.forEach((s, i) => map.set(s.id, { ch, sec, s, i }))));
  index(base, baseSlides); index(work, workSlides);
  for (const ch of work.chapters) {
    const bch = base.chapters.find(c => c.id === ch.id);
    if (!bch) continue;
    for (const [f, label] of Object.entries(CH_FIELDS)) if (J(ch[f]) !== J(bch[f])) items.push({ kind: 'chapter', chId: ch.id, field: f, label, before: bch[f], after: ch[f], where: ch.title });
    ch.sections.forEach(sec => { const bs = bch.sections.find(x => x.id === sec.id); if (bs && bs.title !== sec.title) items.push({ kind: 'section', chId: ch.id, secId: sec.id, field: 'title', label: 'عنوان القسم', before: bs.title, after: sec.title, where: ch.title }); });
  }
  for (const [id, w] of workSlides) {
    const b = baseSlides.get(id);
    const where = `${w.ch.title} / شريحة ${flatSlides(w.ch).findIndex(x => x.slide.id === id) + 1}`;
    if (!b) { items.push({ kind: 'slideAdd', slideId: id, secId: w.sec.id, afterId: w.sec.slides[w.i - 1]?.id || null, after: w.s, label: 'شريحة جديدة', where }); continue; }
    for (const [f, label] of Object.entries(SLIDE_FIELDS)) if (J(w.s[f]) !== J(b.s[f])) items.push({ kind: 'slide', slideId: id, field: f, label, before: b.s[f], after: w.s[f], where });
    const shape = s => J(s.steps.map(st => st.blocks.map(x => x.id)));
    if (shape(w.s) !== shape(b.s)) { items.push({ kind: 'slideReplace', slideId: id, label: 'تغيير في بنية الشريحة (كتل/خطوات)', before: b.s, after: w.s, where }); continue; }
    w.s.steps.forEach((st, k) => st.blocks.forEach((blk, i) => {
      const bb = b.s.steps[k].blocks[i];
      const keys = new Set([...Object.keys(blk), ...Object.keys(bb)]);
      for (const f of keys) if (f !== 'id' && J(blk[f]) !== J(bb[f])) {
        const def = blockType(blk.type);
        const label = `${def?.label || blk.type}: ${def?.fields.find(x => x.key === f)?.label || f}`;
        items.push({ kind: 'block', slideId: id, blockId: blk.id, field: f, label, before: bb[f], after: blk[f], where });
      }
    }));
  }
  for (const [id, b] of baseSlides) if (!workSlides.has(id)) items.push({ kind: 'slideDelete', slideId: id, before: b.s, label: 'حذف شريحة', where: b.ch.title });
  return items;
}

function currentValue(it) {
  if (it.kind === 'chapter') return A.pack.chapters.find(c => c.id === it.chId)?.[it.field];
  if (it.kind === 'section') return A.pack.chapters.find(c => c.id === it.chId)?.sections.find(s => s.id === it.secId)?.title;
  const loc = locateSlide(it.slideId);
  if (it.kind === 'slide') return loc?.slide[it.field];
  if (it.kind === 'block') return loc && locateBlock(loc.slide, it.blockId)?.block[it.field];
  if (it.kind === 'slideReplace' || it.kind === 'slideDelete') return loc?.slide;
  if (it.kind === 'slideAdd') return loc ? it.after : undefined;
}

function applyItem(it) {
  if (it.kind === 'chapter') { A.pack.chapters.find(c => c.id === it.chId)[it.field] = structuredClone(it.after); return true; }
  if (it.kind === 'section') { const s = A.pack.chapters.find(c => c.id === it.chId)?.sections.find(s => s.id === it.secId); if (!s) return false; s.title = it.after; return true; }
  const loc = locateSlide(it.slideId);
  if (it.kind === 'slide') { if (!loc) return false; loc.slide[it.field] = structuredClone(it.after); return true; }
  if (it.kind === 'block') { const b = loc && locateBlock(loc.slide, it.blockId); if (!b) return false; b.block[it.field] = structuredClone(it.after); return true; }
  if (it.kind === 'slideReplace') { if (!loc) return false; loc.sec.slides[loc.index] = structuredClone(it.after); return true; }
  if (it.kind === 'slideDelete') { if (!loc) return true; loc.sec.slides.splice(loc.index, 1); return true; }
  if (it.kind === 'slideAdd') {
    if (loc) return true;
    for (const ch of A.pack.chapters) { const sec = ch.sections.find(s => s.id === it.secId); if (sec) { const i = it.afterId ? sec.slides.findIndex(s => s.id === it.afterId) + 1 : 0; sec.slides.splice(i, 0, structuredClone(it.after)); return true; } }
    return false;
  }
  return false;
}

// ---------- تصدير التصحيحات (الشيخ المراجع) ----------
async function exportCorrections() {
  if (!reviewer()) return toast('اكتب اسم المراجع أولاً');
  await flush();
  const items = diffPacks(A.base, A.pack);
  if (!items.length) return toast('لا توجد تعديلات منذ آخر أساس');
  const media = {};
  const paths = new Set(JSON.stringify(items).match(/media\/[a-z0-9]+\.[a-z0-9]+/g) || []);
  for (const p of paths) {
    try { const b = await getMediaBlob(p); media[p] = await blobToDataUrl(b); } catch { /* موجود عند المشرف */ }
  }
  const file = { format: 'alkhalaf-umrah-corrections', schema: 1, baseVersion: A.base.version, reviewer: reviewer(), at: new Date().toISOString(), items, media };
  const d = new Date().toISOString().slice(0, 10);
  download(`تصحيحات-${reviewer().replace(/\s+/g, '-')}-${d}.json`, JSON.stringify(file));
  toast(`صُدّر ${items.length} تعديلاً`);
}

function blobToDataUrl(b) { return new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); }
async function dataUrlToBlob(u) { return (await fetch(u)).blob(); }

// ---------- استيراد التصحيحات (المشرف) ----------
async function importCorrections(file, host) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { return toast('ملف غير صالح'); }
  if (data.format !== 'alkhalaf-umrah-corrections') return toast('هذا ليس ملف تصحيحات');
  for (const [p, u] of Object.entries(data.media || {})) await putMedia(p, await dataUrlToBlob(u));
  await preloadMediaUrls();
  const list = el('div');
  const items = data.items.map(it => ({ ...it, state: 'pending' }));
  const draw = () => list.replaceChildren(...items.map((it, i) => {
    const cur = currentValue(it);
    const conflict = it.kind !== 'slideAdd' && J(cur) !== J(it.before) && J(cur) !== J(it.after);
    const already = J(cur) === J(it.after);
    return el('div.corr' + (it.state !== 'pending' ? '.done' : ''), {},
      el('div.corr-head', {}, el('b', {}, it.where), ' — ', it.label,
        it.state === 'accepted' ? el('span.ok', {}, ' ✓ قُبل') : it.state === 'rejected' ? el('span.warn', {}, ' ✗ رُفض') : null,
        conflict && it.state === 'pending' ? el('span.warn', {}, ' ⚠ تغيّرت القيمة عند المشرف بعد إرسال التصحيح') : null,
        already && it.state === 'pending' ? el('span.ok', {}, ' (مطبّق مسبقاً)') : null),
      el('div.diff', {}, el('div.before', {}, el('span.small', {}, 'قبل'), show(it.before, it)), el('div.after', {}, el('span.small', {}, 'بعد'), show(it.after, it, it.before))),
      it.state === 'pending' ? el('div.row', {},
        el('button.btn.teal', { type: 'button', onclick: () => {
          if (!applyItem(it)) return toast('تعذّر التطبيق: العنصر غير موجود');
          it.state = 'accepted';
          logChange({ where: it.where, field: it.label + ' (تصحيح ' + data.reviewer + ')', before: txt(it.before), after: txt(it.after), by: reviewer() || 'المشرف', from: data.reviewer, decision: 'قبول' });
          changed(); draw();
        } }, conflict ? 'اقبل رغم ذلك' : 'اقبل'),
        el('button.btn.danger', { type: 'button', onclick: () => { it.state = 'rejected'; logChange({ where: it.where, field: it.label + ' (تصحيح ' + data.reviewer + ')', before: txt(it.before), after: txt(it.after), from: data.reviewer, decision: 'رفض' }); changed(); draw(); } }, 'ارفض')) : null);
  }));
  draw();
  host.replaceChildren(
    el('h3', {}, `تصحيحات ${data.reviewer} — ${fmtDate(data.at, true)} (${items.length} تعديلاً)`),
    data.baseVersion !== A.pack.version ? el('p.small', {}, `أُعدّت على نسخة ${data.baseVersion}، ونسختك الحالية ${A.pack.version}.`) : null,
    el('div.row', {},
      el('button.btn', { type: 'button', onclick: () => { items.filter(i => i.state === 'pending').forEach(it => { const cur = currentValue(it); if (it.kind === 'slideAdd' || J(cur) === J(it.before)) { if (applyItem(it)) { it.state = 'accepted'; logChange({ where: it.where, field: it.label + ' (تصحيح ' + data.reviewer + ')', before: txt(it.before), after: txt(it.after), from: data.reviewer, decision: 'قبول' }); } } }); changed(); draw(); } }, 'اقبل كل ما لا تعارض فيه')),
    list);
}

function txt(v) { return typeof v === 'string' ? v : J(v).slice(0, 2000); }

// عرض القيمة مع إبراز الكلمات المتغيّرة
function show(v, it, before) {
  if (v == null || v === '') return el('em.muted', {}, '— فارغ —');
  if (typeof v === 'string' && typeof before === 'string') return el('div.pre', {}, wordDiff(before, v));
  if (typeof v === 'string') return el('div.pre', {}, v);
  if (it.field === 'review' || v?.status) return el('div', {}, v.status === 'reviewed' ? `دُقِّق ✓ ${v.by || ''} ${fmtDate(v.at)}` : 'لم يُدقَّق');
  if (it.field === 'opinions') return el('div.pre', {}, v.map(o => `${A.pack.settings.marjas.find(m => m.id === o.marja)?.name || o.marja} (${ST[o.status] || ''}): ${o.text}`).join('\n'));
  if (v?.steps) return el('div.pre', {}, slideText(v));
  return el('div.pre', {}, J(v));
}

function wordDiff(a, b) {
  const A1 = a.split(/(\s+)/), B1 = b.split(/(\s+)/);
  if (A1.length * B1.length > 400000) return [b];
  const dp = Array.from({ length: A1.length + 1 }, () => new Uint16Array(B1.length + 1));
  for (let i = A1.length - 1; i >= 0; i--) for (let j = B1.length - 1; j >= 0; j--) dp[i][j] = A1[i] === B1[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (j < B1.length) {
    if (i < A1.length && A1[i] === B1[j]) { out.push(B1[j]); i++; j++; }
    else if (i < A1.length && dp[i + 1][j] >= dp[i][j + 1]) i++;
    else { out.push(el('ins', {}, B1[j])); j++; }
  }
  return out;
}

function slideText(s) {
  return s.steps.map((st, k) => st.blocks.map(b => `[${k}] ` + (b.text || b.q || '') + (b.shared ? '\n' + b.shared : '') + (b.opinions || []).map(o => `\n${o.marja}: ${o.text}`).join('')).join('\n')).join('\n');
}

// ---------- اعتماد الباب كله ----------
async function approveChapter(chId) {
  const ch = A.pack.chapters.find(c => c.id === chId);
  if (!reviewer()) return toast('اكتب اسم المراجع أولاً');
  if (!(await confirmBox(`اعتماد كل شرائح باب «${ch.title}» ونصوصه الشرعية باسم ${reviewer()}؟ افعل ذلك بعد مراجعة الشيخ فقط.`, 'نعم، اعتمد الباب', 'تراجع'))) return;
  const at = new Date().toISOString(), by = reviewer();
  let n = 0;
  for (const x of flatSlides(ch)) {
    if (x.slide.review?.status !== 'reviewed') { x.slide.review = { status: 'reviewed', by, at }; n++; }
    for (const st of x.slide.steps) for (const b of st.blocks) if (b.type === 'nass' && b.review?.status !== 'reviewed') b.review = { status: 'reviewed', by, at };
  }
  logChange({ where: ch.title, field: 'اعتماد الباب كله', before: '', after: `${n} شريحة` });
  changed();
  toast(`اعتُمدت ${n} شريحة`);
}

// ---------- ورقة المراجعة للطباعة ----------
function printSheet(chId, secId) {
  const ch = A.pack.chapters.find(c => c.id === chId);
  const list = flatSlides(ch).filter(x => !secId || x.section.id === secId);
  const marja = id => A.pack.settings.marjas.find(m => m.id === id)?.name || id;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/\n/g, '<br>');
  const blockHtml = b => {
    if (b.internal) return `<div class="blk int">ملاحظة داخلية (لا تُعرض): ${esc(b.text)}</div>`;
    const lab = blockType(b.type)?.label || b.type;
    let h = '';
    if (b.type === 'text') h = esc(b.text) + (b.source ? `<div class="src">المصدر: <bdi dir="ltr">${esc(b.source)}</bdi></div>` : '');
    else if (b.type === 'nass') h = `<div class="nass">${esc(b.text)}</div>` + (b.source ? `<div class="src">المصدر: <bdi dir="ltr">${esc(b.source)}</bdi></div>` : '') + (b.autoTashkeel ? '<div class="tag">تشكيل آلي — يُراجَع</div>' : '');
    else if (b.type === 'ruling') h = (b.q ? `<div class="q">${esc(b.q)}</div>` : '') + (b.shared ? `<div>${esc(b.shared)} <span class="tag">${ST[b.sharedStatus] || ''}</span></div>` : '') + (b.opinions || []).map(o => `<div class="op"><b>${esc(marja(o.marja))}:</b> ${esc(o.text)} <span class="tag">${ST[o.status] || ''}</span></div>`).join('');
    else if (b.type === 'qa') h = `<div class="q">${esc(b.q)}</div><div>الجواب: ${b.a ? esc(b.a) : '<i>بانتظار الإضافة</i>'}</div>`;
    else if (b.type === 'image') h = `[صورة: ${esc(b.alt)}]`;
    else if (b.type === 'video') h = `[فيديو: ${esc(b.title || b.youtube)}]`;
    else if (b.type === 'audio') h = `[صوت: ${esc(b.title)}]`;
    else if (b.type === 'diagram') {
      const st = DIAGRAM_STAGES[b.kind] || [];
      h = `<div class="q">[${esc(DIAGRAM_KINDS[b.kind] || 'رسم')} — ${b.approved ? 'اعتمده الشيخ' : 'مسودة: يراجعه الشيخ مرحلةً مرحلة'}]</div><ol>${st.map(([, nm], i) => `<li><b>${esc(nm)}</b>${(b.captions || [])[i]?.trim() ? ' — ' + esc(b.captions[i]) : ''}</li>`).join('')}</ol>`;
    }
    const from = b.origin === 'sheikh' ? `<span class="tag">من شرح الشيخ ⏱ ${esc(b.ts)}</span> ` : '';
    return `<div class="blk"><span class="lab">${esc(lab)}${b.badge ? ' ' + esc(b.badge) : ''}</span> ${from}${h}
      <div class="marks">☐ صحيح &nbsp;&nbsp; ☐ يحتاج تعديل</div></div>`;
  };
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>ورقة مراجعة — ${esc(ch.title)}</title>
<style>
 @font-face{font-family:Tajawal;src:url(assets/fonts/tajawal-arabic-400-normal.woff2) format('woff2')}
 @font-face{font-family:Tajawal;font-weight:700;src:url(assets/fonts/tajawal-arabic-700-normal.woff2) format('woff2')}
 body{font-family:Tajawal,Tahoma,sans-serif;font-size:13pt;line-height:1.7;margin:0;color:#111}
 @page{size:A4;margin:14mm}
 header{border-bottom:3px solid #a87b1e;margin-bottom:10px;display:flex;align-items:center;gap:12px}
 header img{width:60px;height:60px} h1{font-size:16pt;margin:0}
 .meta{font-size:10pt;color:#555}
 .slide{border:1.5px solid #a87b1e;border-radius:8px;padding:8px 12px;margin:0 0 10px;break-inside:avoid}
 .slide h2{font-size:13pt;margin:0 0 6px;color:#23558f}
 .blk{border-top:1px dashed #ccc;padding:5px 0}
 .step{font-size:8.5pt;color:#3f8f86;font-weight:700;margin-top:4px}
 .lab{font-size:9pt;background:#f6ecd6;border-radius:4px;padding:0 6px;color:#7a5a14}
 .q{font-weight:700;color:#b3261e} .op{margin-inline-start:14px} .nass{font-size:14pt;line-height:2.1}
 .src{font-size:10pt;color:#23558f} .tag{font-size:9pt;color:#9a5b00}
 .marks{font-size:10.5pt;color:#333;margin-top:2px} .int{color:#b3261e}
 .lines div{border-bottom:1px solid #999;height:24px}
 .notes{font-size:10.5pt;color:#444}
 .sign{margin-top:20px;display:grid;grid-template-columns:1fr 1fr;gap:20px;font-size:11pt}
 .sign div{border-bottom:1px solid #333;padding-bottom:22px}
</style></head><body>
<header><img src="assets/img/logo-mark.jpg" alt=""><div><h1>ورقة مراجعة: ${esc(ch.title)}${secId ? ' — ' + esc(list[0]?.section.title) : ''}</h1>
<div class="meta">نسخة الدرس ${esc(A.pack.version)} — طُبعت ${esc(fmtDate(new Date().toISOString(), true))} — ${list.length} شريحة</div></div></header>
${list.map(x => `<section class="slide"><h2>شريحة ${x.no}: ${esc(x.slide.title || x.section.title)}</h2>
${x.slide.steps.map((st, k) => st.blocks.length ? `<div class="step">${k ? 'الخطوة ' + k : 'تظهر من البداية'}</div>` + st.blocks.map(b => blockHtml(b)).join('') : '').join('')}
${x.slide.explain ? `<div class="blk"><span class="lab">شرح الشيخ (للمعتمر)</span> ${esc(x.slide.explain)}<div class="marks">☐ صحيح &nbsp;&nbsp; ☐ يحتاج تعديل</div></div>` : ''}
${x.slide.notes ? `<div class="blk notes"><span class="lab">ملاحظات للشيخ</span> ${esc(x.slide.notes)}</div>` : ''}
<div class="lines"><b style="font-size:10pt">ملاحظات المراجع:</b><div></div><div></div></div></section>`).join('')}
<div class="sign"><div>اسم المراجع:</div><div>التوقيع والتاريخ:</div></div>
<script>window.onload=()=>setTimeout(()=>print(),300)<\/script></body></html>`;
  const w = open('', '_blank');
  if (!w) return toast('اسمح بالنوافذ المنبثقة لطباعة الورقة');
  w.document.open(); w.document.write(html); w.document.close();
  // المسارات النسبية للصور والخطوط
  const baseEl = w.document.createElement('base'); baseEl.href = location.href.replace(/[^/]*$/, ''); w.document.head.prepend(baseEl);
}

// ---------- التبويب ----------
export function reviewTab(host) {
  const nameInp = el('input', { type: 'text', value: reviewer(), placeholder: 'مثال: الشيخ فلان', onchange: e => { setReviewer(e.target.value.trim()); toast('حُفظ اسم المراجع'); } });
  const chSel = el('select', {}, A.pack.chapters.map(c => el('option', { value: c.id }, c.title)));
  const secSel = el('select');
  const fillSec = () => secSel.replaceChildren(el('option', { value: '' }, 'الباب كله'), ...(A.pack.chapters.find(c => c.id === chSel.value)?.sections || []).map(s => el('option', { value: s.id }, s.title)));
  chSel.addEventListener('change', fillSec); fillSec();
  const pending = diffPacks(A.base, A.pack).length;
  const corrHost = el('div');
  const fileInp = el('input', { type: 'file', accept: '.json,application/json', onchange: e => e.target.files[0] && importCorrections(e.target.files[0], corrHost) });
  const stats = A.pack.chapters.map(c => { const l = flatSlides(c); const r = l.filter(x => x.slide.review?.status === 'reviewed').length; return l.length ? el('li', {}, `${c.title}: ${r} من ${l.length} مدقَّقة`) : null; });
  host.replaceChildren(
    el('section.card', {}, el('h3', {}, 'اسم المراجع'), el('p.small', {}, 'يُكتب مع كل علامة «دُقِّق ✓» ومع كل تعديل في السجل.'), nameInp),
    el('section.card', {}, el('h3', {}, 'حالة التدقيق'), el('ul', {}, stats)),
    el('section.card', {}, el('h3', {}, 'للشيخ المراجع: تصدير التصحيحات'),
      el('p.small', {}, `عدّل في المحرر وضع «دُقِّق ✓»، ثم صدّر ملف التصحيحات وأرسله للمشرف. التعديلات منذ آخر أساس: ${pending}.`),
      el('div.row', {},
        el('button.btn', { type: 'button', onclick: exportCorrections }, 'تصدير التصحيحات'),
        el('button.btn.ghost', { type: 'button', onclick: async () => { if (await confirmBox('جعل النسخة الحالية أساساً جديداً للمقارنة؟ (افعل ذلك بعد إرسال التصحيحات)')) { A.base = structuredClone(A.pack); changed(); reviewTab(host); } } }, 'اجعل الحالي أساساً جديداً'))),
    el('section.card', {}, el('h3', {}, 'للمشرف: استيراد التصحيحات'), el('p.small', {}, 'ترى كل تعديل (قبل / بعد) وتقبله أو ترفضه.'), fileInp, corrHost),
    el('section.card', {}, el('h3', {}, 'اعتماد الباب وورقة المراجعة'),
      el('div.row', {}, chSel, secSel),
      el('div.row', { style: { marginTop: '10px' } },
        el('button.btn.teal', { type: 'button', onclick: async () => { await approveChapter(chSel.value); reviewTab(host); } }, 'اعتماد الباب كله'),
        el('button.btn.ghost', { type: 'button', onclick: () => printSheet(chSel.value, secSel.value) }, 'ورقة مراجعة للطباعة (PDF)'))),
    el('section.card', {}, el('h3', {}, `سجل التعديلات (${A.log.length})`),
      el('div.row', {}, el('button.btn.ghost', { type: 'button', onclick: () => download('سجل-التعديلات.json', JSON.stringify(A.log, null, 1)) }, 'تنزيل السجل')),
      el('div.logtable', {}, el('table', {}, el('thead', {}, el('tr', {}, ['الوقت', 'بواسطة', 'الموضع', 'الحقل', 'قبل', 'بعد', 'القرار'].map(h => el('th', {}, h)))),
        el('tbody', {}, A.log.slice(-200).reverse().map(l => el('tr', {}, el('td', {}, fmtDate(l.at, true)), el('td', {}, l.by + (l.from ? ' ← ' + l.from : '')), el('td', {}, l.where), el('td', {}, l.field),
          el('td.cell', {}, String(l.before ?? '').slice(0, 160)), el('td.cell', {}, String(l.after ?? '').slice(0, 160)), el('td', {}, l.decision || '')))))))
  );
}
