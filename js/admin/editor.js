// محرر الشرائح: تعديل أي نص بنقرة، إضافة وحذف وترتيب الأقسام والشرائح والخطوات والكتل، رفع الصور، معاينة حية
import { el, toast } from '../core/dom.js';
import { blockType, blockTypes } from '../core/blocks.js';
import { renderSlide } from '../core/render.js';
import { drawStage } from '../core/stage.js';
import { flatSlides, emptySlide, emptySection, uid, AUDIENCE, CHAPTER_STATUS, stepCount, chapterMinutesCheck, EXPLAIN_FOR, explainFor } from '../core/pack.js';
import { verifyTashkeel, STATUS_LABELS } from '../core/arabic.js';
import { confirmBox } from '../core/ui.js';
import { A, changed, logChange, putMedia, preloadMediaUrls, resolveMedia, reviewer, locateSlide } from './state.js';
import { toWebp, randName } from './importer.js';
import { openSegmentTool } from './segment.js';

const sel = { ch: null, slide: null, step: null, viewer: 'pilgrim', marja: 'other', shape: 'iphone' };
let host = null;

export function openEditor(container, chId, slideId) {
  host = container;
  if (chId) sel.ch = chId;
  if (slideId) sel.slide = slideId;
  draw();
}

function chapter() { return A.pack.chapters.find(c => c.id === sel.ch) || A.pack.chapters[0]; }
function where(slide) {
  const loc = locateSlide(slide.id);
  return loc ? `${loc.ch.title} / شريحة ${loc.no}` : '';
}

function draw() {
  if (!host) return;
  const ch = chapter();
  if (!ch) { host.replaceChildren(el('p', {}, 'لا توجد أبواب. أضف باباً من تبويب «الأبواب».')); return; }
  sel.ch = ch.id;
  const list = flatSlides(ch);
  if (!list.some(x => x.slide.id === sel.slide)) sel.slide = list[0]?.slide.id || null;
  host.replaceChildren(el('div.ed-grid', {}, tree(ch, list), slidePanel(ch, list), previewPanel()));
  refreshPreview();
}

// ---------- الشجرة ----------
function tree(ch, list) {
  const mins = chapterMinutesCheck(ch);
  return el('aside.ed-tree', {},
    el('select.ed-chsel', { 'aria-label': 'الباب', onchange: e => { sel.ch = e.target.value; sel.slide = null; draw(); } },
      A.pack.chapters.map(c => el('option', { value: c.id, selected: c.id === ch.id ? true : null }, `${c.title} (${CHAPTER_STATUS[c.status]})`))),
    el('div.small', {}, `${list.length} شريحة · ${ch.minutes || 0} دقيقة` + (mins.sum ? ` · مجموع الأقسام ${mins.sum}` : '')),
    mins.over ? el('div.warnline', {}, `⚠ مجموع دقائق الأقسام (${mins.sum}) يتجاوز دقائق الباب (${ch.minutes})`) : null,
    ...ch.sections.map((sec, si) => el('div.ed-sec', {},
      el('div.ed-sec-head', {},
        inlineInput(sec.title, v => { logChange({ where: ch.title, field: 'عنوان القسم', before: sec.title, after: v }); sec.title = v; changed(); }, 'عنوان القسم'),
        el('input.mins', { type: 'number', min: 0, onwheel: e => e.target.blur(), value: sec.minutes ?? '', placeholder: 'د', title: 'دقائق القسم', onchange: e => { sec.minutes = e.target.value === '' ? null : Number(e.target.value); changed(); draw(); } })),
      el('div.ed-sec-tools', {},
        tool('↑', 'قسم لأعلى', () => moveIn(ch.sections, si, -1)),
        tool('↓', 'قسم لأسفل', () => moveIn(ch.sections, si, 1)),
        tool('+ شريحة', 'إضافة شريحة في هذا القسم', () => { const s = emptySlide(); sec.slides.push(s); sel.slide = s.id; logChange({ where: ch.title, field: 'إضافة شريحة', before: '', after: sec.title }); changed(); draw(); }),
        tool('🗑', 'حذف القسم', async () => {
          if (sec.slides.length && !(await confirmBox(`حذف القسم «${sec.title}» وشرائحه (${sec.slides.length})؟`))) return;
          ch.sections.splice(si, 1); logChange({ where: ch.title, field: 'حذف قسم', before: sec.title, after: '' }); changed(); draw();
        })),
      el('ol.ed-slides', {}, sec.slides.map(s => {
        const no = list.find(x => x.slide === s)?.no;
        return el('li', {}, el('button', {
          type: 'button', class: s.id === sel.slide ? 'on' : '',
          onclick: () => { sel.slide = s.id; sel.step = null; draw(); },
        }, el('b', {}, no + '. '), (s.title || firstText(s) || 'بلا عنوان').slice(0, 42),
        s.review?.status === 'reviewed' ? el('span.ok', { title: 'دُقِّق' }, ' ✓') : null,
        s.needsExplain && !s.explain ? el('span.warn', { title: 'شرح الشيخ فارغ' }, ' ✎') : null,
        s.audience !== 'all' ? el('span.aud', {}, ' ' + AUDIENCE[s.audience]) : null));
      })))),
    el('button.btn.ghost.block', { type: 'button', onclick: () => { ch.sections.push(emptySection()); changed(); draw(); } }, '+ قسم جديد'));
}

function firstText(s) {
  const b = s.steps.flatMap(st => st.blocks).find(b => b.text || b.q || b.shared);
  return (b?.text || b?.q || b?.shared || '').split('\n')[0];
}

function tool(label, title, fn) { return el('button.tool', { type: 'button', title, 'aria-label': title, onclick: fn }, label); }
function moveIn(arr, i, d) { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; changed(); draw(); }

function inlineInput(value, onCommit, label) {
  return el('input.inline', { type: 'text', value, 'aria-label': label, onchange: e => onCommit(e.target.value) });
}

// ---------- لوحة الشريحة ----------
function slidePanel(ch, list) {
  const x = list.find(x => x.slide.id === sel.slide);
  if (!x) return el('section.ed-main', {}, el('p.muted', {}, 'لا توجد شرائح في هذا الباب. أضف شريحة من قائمة الأقسام.'));
  const s = x.slide, sec = x.section;
  const idx = sec.slides.indexOf(s);
  const w = `${ch.title} / شريحة ${x.no}`;
  const field = (label, key, kind = 'text', hint) => fieldRow(label, s, key, { kind, hint, where: w });
  const reviewed = s.review?.status === 'reviewed';
  return el('section.ed-main', {},
    el('div.ed-slide-head', {},
      el('h2', {}, `شريحة ${x.no}`, s.src ? el('span.small', {}, `  (الأصل: شريحة ${s.src.no} في ${s.src.file})`) : null),
      el('div.row', {},
        tool('↑', 'الشريحة لأعلى', () => { if (idx > 0) moveIn(sec.slides, idx, -1); else moveAcross(ch, sec, s, -1); }),
        tool('↓', 'الشريحة لأسفل', () => { if (idx < sec.slides.length - 1) moveIn(sec.slides, idx, 1); else moveAcross(ch, sec, s, 1); }),
        el('select.tool', { title: 'نقل إلى قسم', onchange: e => { const to = ch.sections.find(q => q.id === e.target.value); if (!to || to === sec) return; sec.slides.splice(idx, 1); to.slides.push(s); changed(); draw(); } },
          el('option', { value: '' }, 'نقل إلى قسم…'), ch.sections.map(q => el('option', { value: q.id }, q.title))),
        tool('⧉ تكرار', 'تكرار الشريحة', () => { const c = cloneSlide(s); sec.slides.splice(idx + 1, 0, c); sel.slide = c.id; changed(); draw(); }),
        tool('🗑 حذف', 'حذف الشريحة', async () => {
          if (!(await confirmBox('حذف هذه الشريحة؟'))) return;
          sec.slides.splice(idx, 1); logChange({ where: w, field: 'حذف شريحة', before: s.title || firstText(s), after: '' }); changed(); draw();
        }))),
    el('div.ed-meta', {},
      field('عنوان الشريحة', 'title'),
      fieldRow('الجمهور', s, 'audience', { kind: 'select', options: Object.entries(AUDIENCE), where: w }),
      field('شرح الشيخ', 'explain', 'textarea', s.needsExplain ? 'هذه الشريحة عنوانها فقط في العرض الأصلي' : ''),
      fieldRow('من يرى «شرح الشيخ»؟', s, 'explainFor', { kind: 'select', where: w, options: [
        ['', `حسب الإعداد العام (${EXPLAIN_FOR[A.pack.settings.explainFor || 'all']})`], ['all', 'الشيخ والمعتمر'], ['sheikh', 'الشيخ فقط']] }),
      field('ملاحظات الشيخ (تظهر للشيخ فقط)', 'notes', 'textarea'),
      el('label.check', {}, el('input', {
        type: 'checkbox', checked: reviewed ? true : null,
        onchange: e => {
          const before = s.review?.status || 'unreviewed';
          s.review = e.target.checked ? { status: 'reviewed', by: reviewer() || 'المشرف', at: new Date().toISOString() } : { status: 'unreviewed', by: '', at: '' };
          logChange({ where: w, field: 'التدقيق', before, after: s.review.status }); changed(); draw();
        },
      }), ' دُقِّق ✓', reviewed ? el('span.small', {}, ` — ${s.review.by} ${new Date(s.review.at).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh' })}`) : null)),
    ...s.steps.map((st, k) => stepCard(s, st, k, w)),
    el('button.btn.ghost.block', { type: 'button', onclick: () => { s.steps.push({ blocks: [] }); changed(); draw(); } }, '+ خطوة كشف جديدة'));
}

function moveAcross(ch, sec, s, d) {
  const si = ch.sections.indexOf(sec), to = ch.sections[si + d];
  if (!to) return;
  sec.slides.splice(sec.slides.indexOf(s), 1);
  if (d < 0) to.slides.push(s); else to.slides.unshift(s);
  changed(); draw();
}

function cloneSlide(s) {
  const c = structuredClone(s);
  c.id = uid('s'); delete c.src;
  c.review = { status: 'unreviewed', by: '', at: '' };
  c.steps.forEach(st => st.blocks.forEach(b => { b.id = uid('b'); }));
  return c;
}

function stepCard(s, st, k, w) {
  const typeSel = el('select', { 'aria-label': 'نوع الكتلة' }, blockTypes().map(t => el('option', { value: t.type }, t.label)));
  return el('div.ed-step', { dataset: { step: k } },
    el('div.ed-step-head', {},
      el('b', {}, k === 0 ? 'تظهر من البداية (بلا نقرة)' : `الخطوة ${k} — تظهر مع النقرة ${k}`),
      el('span.grow'),
      k > 0 ? tool('↑', 'تقديم الخطوة', () => { [s.steps[k - 1], s.steps[k]] = [s.steps[k], s.steps[k - 1]]; changed(); draw(); }) : null,
      k > 0 && k < s.steps.length - 1 ? tool('↓', 'تأخير الخطوة', () => { [s.steps[k + 1], s.steps[k]] = [s.steps[k], s.steps[k + 1]]; changed(); draw(); }) : null,
      s.steps.length > 1 ? tool('🗑', 'حذف الخطوة', async () => {
        if (st.blocks.length && !(await confirmBox('حذف الخطوة وما فيها من كتل؟'))) return;
        s.steps.splice(k, 1); if (!s.steps.length) s.steps.push({ blocks: [] }); changed(); draw();
      }) : null),
    ...st.blocks.map((b, i) => blockCard(s, st, k, b, i, w)),
    el('div.row.ed-add', {}, typeSel, el('button.btn', {
      type: 'button', onclick: () => {
        const def = blockType(typeSel.value);
        const b = { id: uid('b'), type: def.type, ...structuredClone(def.create()) };
        st.blocks.push(b); logChange({ where: w, field: 'إضافة كتلة', before: '', after: def.label }); changed(); draw();
        setTimeout(() => host.querySelector(`[data-edblock="${b.id}"] textarea, [data-edblock="${b.id}"] input`)?.focus(), 30);
      },
    }, '+ إضافة كتلة')));
}

function blockCard(s, st, k, b, i, w) {
  const def = blockType(b.type);
  const bw = `${w} / ${def?.label || b.type}`;
  const move = (dk) => {
    const to = s.steps[k + dk];
    if (!to) return;
    st.blocks.splice(i, 1); to.blocks.push(b); changed(); draw();
  };
  return el('div.ed-block', { dataset: { edblock: b.id } },
    el('div.ed-block-head', {},
      el('span.tag', {}, def?.label || b.type), b.internal ? el('span.warn', {}, ' ملاحظة داخلية — لا تُعرض') : null,
      b.origin === 'sheikh' ? el('span.small', { title: 'أُضيف من التفريغ النصي لشرح الشيخ' }, ` من شرح الشيخ ⏱ ${b.ts || ''}`) : null,
      el('span.grow'),
      tool('↑', 'لأعلى', () => { if (i > 0) { [st.blocks[i - 1], st.blocks[i]] = [st.blocks[i], st.blocks[i - 1]]; changed(); draw(); } else move(-1); }),
      tool('↓', 'لأسفل', () => { if (i < st.blocks.length - 1) { [st.blocks[i + 1], st.blocks[i]] = [st.blocks[i], st.blocks[i + 1]]; changed(); draw(); } else move(1); }),
      k > 0 ? tool('⇡ خطوة', 'إلى الخطوة السابقة', () => move(-1)) : null,
      k < s.steps.length - 1 ? tool('⇣ خطوة', 'إلى الخطوة التالية', () => move(1)) : null,
      tool('🗑', 'حذف الكتلة', async () => { if (await confirmBox('حذف هذه الكتلة؟')) { st.blocks.splice(i, 1); logChange({ where: bw, field: 'حذف كتلة', before: JSON.stringify(b).slice(0, 300), after: '' }); changed(); draw(); } })),
    ...(def?.fields || []).map(f => fieldRow(f.label, b, f.key, { ...f, where: bw })),
    b.internal !== undefined ? el('label.check', {}, el('input', { type: 'checkbox', checked: b.internal ? true : null, onchange: e => { b.internal = e.target.checked; changed(); draw(); } }), ' ملاحظة داخلية (لا تُعرض ولا تُنشر)') : null);
}

// ---------- الحقول العامة ----------
function fieldRow(label, obj, key, f) {
  const commit = (after, before) => {
    if (JSON.stringify(after) === JSON.stringify(before)) return;
    logChange({ where: f.where, field: label, before: typeof before === 'string' ? before : JSON.stringify(before), after: typeof after === 'string' ? after : JSON.stringify(after) });
    changed();
  };
  const live = () => { changed(); refreshPreview(); };
  let input;
  switch (f.kind) {
    case 'textarea': {
      let before;
      input = el('textarea', {
        rows: Math.min(10, Math.max(2, String(obj[key] ?? '').split('\n').length + 1)), dir: 'rtl',
        onfocus: () => { before = obj[key]; },
        oninput: e => { obj[key] = e.target.value; live(); if (f.tashkeelCheck) check(); },
        onchange: e => commit(e.target.value, before),
      });
      input.value = obj[key] ?? '';
      if (f.readonlyHint) input.readOnly = true;
      const out = el('div.small');
      const check = () => {
        const r = verifyTashkeel(obj[f.tashkeelCheck] || '', obj[key] || '');
        out.className = 'small ' + (r.ok ? 'okline' : 'warnline');
        out.textContent = r.ok ? '✓ التشكيل لا يغيّر أي حرف من الأصل' : '✗ ' + r.message;
      };
      if (f.tashkeelCheck && obj[f.tashkeelCheck]) check();
      return el('label.fld', {}, el('span', {}, label), input, f.tashkeelCheck ? out : null, f.hint ? el('span.small', {}, f.hint) : null);
    }
    case 'select': {
      input = el('select', { onchange: e => { const before = obj[key]; obj[key] = e.target.value; commit(obj[key], before); refreshPreview(); } },
        (f.options || []).map(([v, t]) => el('option', { value: v, selected: obj[key] === v ? true : null }, t)));
      return el('label.fld', {}, el('span', {}, label), input);
    }
    case 'checkbox':
      return el('label.check', {}, el('input', { type: 'checkbox', checked: obj[key] ? true : null, onchange: e => { const before = obj[key]; obj[key] = e.target.checked; commit(obj[key], before); refreshPreview(); } }), ' ' + label);
    case 'lines': {
      let before;
      input = el('textarea', { rows: 2, onfocus: () => { before = obj[key]; }, oninput: e => { obj[key] = e.target.value.split('\n').map(x => x.trim()).filter(Boolean); live(); }, onchange: () => commit(obj[key], before) });
      input.value = (obj[key] || []).join('\n');
      return el('label.fld', {}, el('span', {}, label), input);
    }
    case 'image': case 'audio': {
      const isImg = f.kind === 'image';
      const file = el('input', { type: 'file', accept: isImg ? 'image/*' : 'audio/*', onchange: async e => {
        const fl = e.target.files[0]; if (!fl) return;
        try {
          const before = obj[key];
          if (isImg) {
            const out = await toWebp(fl);
            const path = 'media/' + randName('webp');
            await putMedia(path, out.blob);
            obj[key] = path; obj.w = out.w; obj.h = out.h;
            toast(`حُوّلت الصورة إلى WebP (${Math.round(out.blob.size / 1024)}KB)`);
          } else {
            if (fl.size > 5 * 1024 * 1024) { toast('ملف الصوت أكبر من 5MB؛ اضغطه أولاً'); return; }
            const ext = (fl.name.split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '');
            const path = 'media/' + randName(ext);
            await putMedia(path, fl);
            obj[key] = path;
          }
          await preloadMediaUrls();
          commit(obj[key], before); draw();
        } catch (err) { toast('تعذّر رفع الملف: ' + err.message); }
      } });
      return el('div.fld', {}, el('span', {}, label),
        obj[key] ? (isImg ? el('img.thumb', { src: resolveMedia(obj[key]), alt: '' }) : el('audio', { controls: true, src: resolveMedia(obj[key]) })) : el('span.small', {}, 'لا يوجد ملف'),
        file, isImg ? el('span.small', {}, 'تُحوّل الصورة تلقائياً إلى WebP بحد أقصى 200KB') : null);
    }
    case 'action':
      // أزرار أدوات خاصة بنوع الكتلة
      return el('div.fld', {}, el('button.btn.ghost', { type: 'button', onclick: () => {
        if (f.action === 'segment-audio') openSegmentTool(chapter(), () => draw());
      } }, label));
    case 'opinions': return opinionsField(label, obj, key, f, commit);
    case 'stages': {
      // خانة لكل مرحلة من مراحل الرسم (عددها ثابت بحسب نوع الرسم): عبارة مشتركة، وعبارة لكل مرجع إن اختلف، وصورة بديلة اختيارية
      const names = f.stages(obj);
      const fit = arr => Array.from({ length: names.length }, (_, i) => (arr || [])[i] ?? '');
      obj[key] = fit(obj[key]);
      const marjas = (A.pack.settings.marjas || []).filter(m => m.id !== 'other');
      if (f.marjaKey) { obj[f.marjaKey] = obj[f.marjaKey] || {}; for (const m of marjas) obj[f.marjaKey][m.id] = fit(obj[f.marjaKey][m.id]); }
      if (f.mediaKey) obj[f.mediaKey] = Array.from({ length: names.length }, (_, i) => (obj[f.mediaKey] || [])[i] || null);
      const area = (arr, i, aria, rows = 2) => {
        let before;
        const ta = el('textarea', { rows, 'aria-label': aria, onfocus: () => { before = arr[i]; }, oninput: e => { arr[i] = e.target.value; live(); }, onchange: e => commit(e.target.value, before) });
        ta.value = arr[i] || '';
        return ta;
      };
      const mediaRow = i => {
        const cur = obj[f.mediaKey][i];
        const file = el('input', { type: 'file', accept: 'image/*', onchange: async e => {
          const fl = e.target.files[0]; if (!fl) return;
          try {
            const before = obj[f.mediaKey][i];
            let blob = fl, w = null, h = null, ext = (fl.name.split('.').pop() || 'img').toLowerCase();
            // الصور المتحركة (GIF) والرسوم (SVG) تُحفظ كما هي، وغيرها يُحوّل إلى WebP
            if (!/^image\/(gif|svg\+xml)$/.test(fl.type)) { const out = await toWebp(fl); blob = out.blob; w = out.w; h = out.h; ext = 'webp'; }
            else if (fl.size > 1.5 * 1024 * 1024) { toast('الصورة المتحركة أكبر من 1.5MB، صغّرها ثم أعد المحاولة'); return; }
            const path = 'media/' + randName(ext === 'svg' ? 'svg' : ext);
            await putMedia(path, blob);
            await preloadMediaUrls();
            obj[f.mediaKey][i] = { src: path, w, h };
            commit(JSON.stringify(obj[f.mediaKey][i]), JSON.stringify(before)); draw();
          } catch (err) { toast('تعذّر رفع الصورة: ' + err.message); }
        } });
        return el('div.row.small', {}, cur?.src ? '🖼 صورة بديلة مرفوعة لهذه المرحلة ' : '',
          el('label.tool', {}, cur?.src ? 'تغيير الصورة' : 'استبدال رسم هذه المرحلة بصورة', file),
          cur?.src ? el('button.tool', { type: 'button', onclick: () => { const before = obj[f.mediaKey][i]; obj[f.mediaKey][i] = null; commit('', JSON.stringify(before)); draw(); } }, 'العودة إلى الرسم') : null);
      };
      return el('div.fld', {}, el('span', {}, label),
        el('div.dg-fields', {}, names.map((nm, i) => el('div.dg-field', {},
          el('b.small', {}, `المرحلة ${i + 1}: ${nm}`),
          el('label', {}, el('span.small', {}, 'العبارة المشتركة'), area(obj[key], i, `${nm}: العبارة المشتركة`)),
          f.marjaKey ? el('details', { open: marjas.some(m => obj[f.marjaKey][m.id][i]?.trim()) ? true : null }, el('summary.small', {}, 'عبارة خاصة بكل مرجع (إن اختلف رأيه)'),
            ...marjas.map(m => el('label', {}, el('span.small', {}, m.name), area(obj[f.marjaKey][m.id], i, `${nm}: ${m.name}`)))) : null,
          f.mediaKey ? mediaRow(i) : null))));
    }
    case 'review': {
      const r = obj[key] || { status: 'unreviewed' };
      return el('label.check', {}, el('input', { type: 'checkbox', checked: r.status === 'reviewed' ? true : null, onchange: e => {
        const before = r.status;
        obj[key] = e.target.checked ? { status: 'reviewed', by: reviewer() || 'المشرف', at: new Date().toISOString() } : { status: 'unreviewed', by: '', at: '' };
        commit(obj[key].status, before); draw();
      } }), ' اعتمد المراجع هذا النص' + (r.status === 'reviewed' ? ` — ${r.by} ${new Date(r.at).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh' })}` : ' (لم يُدقَّق)'));
    }
    default: {
      let before;
      input = el('input', { type: f.kind === 'number' ? 'number' : 'text', onwheel: e => { if (f.kind === 'number') e.target.blur(); }, onfocus: () => { before = obj[key]; }, oninput: e => { obj[key] = e.target.value; live(); }, onchange: e => commit(e.target.value, before) });
      input.value = obj[key] ?? '';
      return el('label.fld', {}, el('span', {}, label), input, f.hint ? el('span.small', {}, f.hint) : null);
    }
  }
}

function opinionsField(label, obj, key, f, commit) {
  obj[key] ??= [];
  const marjas = A.pack.settings.marjas;
  const rows = obj[key].map((o, i) => {
    let before;
    const ta = el('textarea', { rows: 2, onfocus: () => { before = o.text; }, oninput: e => { o.text = e.target.value; changed(); refreshPreview(); }, onchange: e => commit(e.target.value, before) });
    ta.value = o.text || '';
    return el('div.op-row', {},
      el('div.row', {},
        el('select', { onchange: e => { o.marja = e.target.value; changed(); refreshPreview(); } }, marjas.map(m => el('option', { value: m.id, selected: o.marja === m.id ? true : null }, m.name))),
        el('select', { onchange: e => { const b = o.status; o.status = e.target.value; commit(o.status, b); refreshPreview(); } }, Object.entries(STATUS_LABELS).map(([v, t]) => el('option', { value: v, selected: o.status === v ? true : null }, t))),
        el('span.small', {}, o.label ? `التسمية في الملف: «${o.label}»` : ''),
        o.review ? el('button.tool.warn', { type: 'button', title: 'هذا القول لم يُطابق نص الرسالة بعد', onclick: () => { delete o.review; commit('تم التحقق من الرسالة', 'يُراجع'); draw(); } }, '⚠ يُراجع — اضغط بعد التحقق من الرسالة') : null,
        el('span.grow'),
        tool('🗑', 'حذف القول', () => { obj[key].splice(i, 1); changed(); draw(); })),
      ta);
  });
  return el('div.fld', {}, el('span', {}, label), ...rows,
    el('button.btn.ghost', { type: 'button', onclick: () => { obj[key].push({ marja: marjas[0]?.id, label: '', text: '', status: 'unspecified' }); changed(); draw(); } }, '+ قول مرجع'));
}

// ---------- المعاينة ----------
// أحجام الجزء الظاهر من الصفحة في متصفح الجوال (بعد شريط العنوان وأزرار المتصفح)
const SHAPES = {
  iphone: ['آيفون عمودي (390×664)', 390, 664],
  android: ['أندرويد صغير عمودي (360×560)', 360, 560],
  big: ['جوال كبير عمودي (430×760)', 430, 760],
  land: ['جوال بالعرض (740×340)', 740, 340],
  list: ['قائمة بخط كبير'],
};
let pv = null;
function previewPanel() {
  pv = el('div.ed-preview-body');
  const s = locateSlide(sel.slide)?.slide;
  const total = s ? stepCount(s) : 0;
  if (sel.step == null || sel.step > total) sel.step = total;
  const range = el('input', { type: 'range', min: 0, max: total, value: sel.step, 'aria-label': 'الخطوة', oninput: e => { sel.step = Number(e.target.value); refreshPreview(); } });
  return el('aside.ed-preview', {},
    el('div.row', {},
      el('select', { onchange: e => { sel.viewer = e.target.value; refreshPreview(); } }, [['pilgrim', 'كما يراه المعتمر'], ['sheikh', 'كما يراه الشيخ']].map(([v, t]) => el('option', { value: v, selected: sel.viewer === v ? true : null }, t))),
      el('select', { onchange: e => { sel.marja = e.target.value; refreshPreview(); } }, [...A.pack.settings.marjas.map(m => [m.id, 'مقلد ' + m.name]), ['other', 'آخر / لا أدري']].map(([v, t]) => el('option', { value: v, selected: sel.marja === v ? true : null }, t)))),
    el('div.row', {}, el('select', { onchange: e => { sel.shape = e.target.value; refreshPreview(); } }, Object.entries(SHAPES).map(([v, [t]]) => el('option', { value: v, selected: sel.shape === v ? true : null }, t)))),
    el('div.row', {}, el('span.small', {}, 'الخطوة:'), range, el('span.small.stepv', {}, `${sel.step} / ${total}`)),
    pv);
}

let rp = null;
function refreshPreview() {
  clearTimeout(rp);
  rp = setTimeout(() => {
    if (!pv) return;
    const loc = locateSlide(sel.slide);
    if (!loc) { pv.replaceChildren(); return; }
    const total = stepCount(loc.slide);
    const step = Math.min(sel.step ?? total, total);
    const c = { viewer: sel.viewer, marja: sel.marja, marjas: A.pack.settings.marjas, resolveMedia, dataSaver: true, explainDefault: A.pack.settings.explainFor };
    let node;
    if (SHAPES[sel.shape]?.[1]) {
      // معاينة شاشة المعتمر كما هي على الجوال (الشريط العلوي + المنصة + أزرار التنقل) ثم تصغيرها لتناسب اللوحة
      const [, w, h] = SHAPES[sel.shape];
      const list = flatSlides(loc.ch);
      const no = list.findIndex(x => x.slide === loc.slide) + 1;
      const stageHost = el('div.pl-stage');
      const exOK = loc.slide.explain?.trim() && (sel.viewer !== 'pilgrim' || explainFor(A.pack, loc.slide) === 'all');
      const meta = el('span', {}, `شريحة ${no} من ${list.length}` + (total ? ` · خطوة ${step} من ${total}` : ''));
      const box = el('div.player.pv-player', { style: { width: w + 'px', height: h + 'px' } },
        el('div.pl-bar', {}, el('button.pl-x', { type: 'button', tabindex: -1 }, '✕'), el('div.ttl', {}, el('b', {}, loc.slide.title || loc.sec.title), meta)),
        stageHost,
        el('div.pl-nav', {},
          exOK ? el('div.pl-extra', {}, el('button.btn.teal', { type: 'button', tabindex: -1 }, '📖 شرح الشيخ')) : '',
          el('div.pl-main', {}, el('button.btn.ghost', { type: 'button', tabindex: -1 }, '▶ السابق'), el('button.btn', { type: 'button', tabindex: -1 }, 'التالي ◀'))));
      const scaler = el('div.pv-scaler', {}, box);
      pv.replaceChildren(scaler);
      const k = Math.min(1, ((pv.clientWidth || 360) - 16) / (w + 16));
      box.style.transform = `scale(${k})`; scaler.style.height = (h + 16) * k + 'px';
      const r = drawStage(stageHost, loc.slide, c, { step, fallbackTitle: loc.sec.title });
      if (r?.pages > 1) { meta.textContent += ` · صفحة ${r.page}/${r.pages}`; scaler.after(el('p.small', {}, `على هذا الجوال تُعرض الشريحة في ${r.pages} صفحات (صفحة ${r.page} الآن). تنتقل الصفحات تلقائياً مع الخطوات.`)); }
      node = box;
    } else {
      node = renderSlide(loc.slide, c, { step, showFuture: sel.viewer === 'sheikh' });
      if (!loc.slide.title) node.querySelector('.slide-title').textContent = loc.sec.title;
    }
    node.addEventListener('click', e => {
      const b = e.target.closest('[data-bid]');
      const card = b && host.querySelector(`[data-edblock="${b.dataset.bid}"]`);
      if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 1200); card.querySelector('textarea, input')?.focus({ preventScroll: true }); }
    });
    if (sel.shape === 'list') pv.replaceChildren(node);
    const sv = pv.parentElement?.querySelector('.stepv'); if (sv) sv.textContent = `${step} / ${total}`;
  }, 120);
}
export function editorRefresh() { refreshPreview(); }
export function editorRedraw() { draw(); }
export { sel as editorSel };
