// أداة تقسيم صوت السورة على الآيات: يستمع المشرف إلى القراءة ويضغط عند نهاية كل آية،
// فتُحفظ بداية كل آية ونهايتها في كتل «آية» في هذا الباب (ويمكن تعديل الأرقام يدوياً بعدها).
import { el, toast } from '../core/dom.js';
import { flatSlides } from '../core/pack.js';
import { modal } from '../core/ui.js';
import { playSegment, stopAudio } from '../core/audio.js';
import { arNum } from '../core/block-ayah.js';
import { A, changed, logChange, putMedia, preloadMediaUrls, resolveMedia } from './state.js';
import { randName } from './importer.js';

const fmt = t => (t == null || t === '' ? '' : Number(t).toFixed(2));

export function ayahBlocks(ch) {
  const seen = new Map();
  for (const x of flatSlides(ch)) for (const st of x.slide.steps) for (const b of st.blocks) {
    if (b.type !== 'ayah' || !b.no) continue;
    const k = Number(b.no);
    if (!seen.has(k)) seen.set(k, []);
    seen.get(k).push(b); // الآية قد تتكرر في أكثر من شريحة: تُحدَّث كلها
  }
  return [...seen.entries()].sort((a, b) => a[0] - b[0]);
}

export function openSegmentTool(ch, onDone = () => {}) {
  const ayahs = ayahBlocks(ch);
  if (!ayahs.length) { toast('لا توجد كتل «آية» مرقّمة في هذا الباب'); return; }
  let src = ayahs.find(([, bs]) => bs[0].audio)?.[1][0].audio || '';
  const marks = ayahs.map(([, bs]) => ({ start: bs[0].start ?? '', end: bs[0].end ?? '' }));
  const audio = el('audio', { controls: true, preload: 'auto', style: { width: '100%' } });
  const setSrc = () => { audio.src = src ? resolveMedia(src) : ''; };
  setSrc();
  let cursor = -1; // رقم الآية التي ننتظر نهايتها
  const file = el('input', { type: 'file', accept: 'audio/*', onchange: async e => {
    const fl = e.target.files[0]; if (!fl) return;
    if (fl.size > 8 * 1024 * 1024) { toast('ملف الصوت أكبر من 8MB؛ اضغطه أولاً'); return; }
    const ext = (fl.name.split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '');
    src = 'media/' + randName(ext);
    await putMedia(src, fl); await preloadMediaUrls(); setSrc(); paint();
    toast('رُفع ملف الصوت');
  } });
  const table = el('table.seg-table');
  const tapBtn = el('button.btn.big.block', { type: 'button', disabled: true, onclick: () => tap() }, '…');
  const startBtn = el('button.btn.teal', { type: 'button', onclick: () => begin() }, '▶ ابدأ التقسيم من أول الملف');
  const status = el('p.small');

  function begin() {
    if (!src) { toast('ارفع ملف صوت السورة أولاً'); return; }
    cursor = 0; marks[0].start = 0;
    audio.currentTime = 0; audio.play();
    tapBtn.disabled = false; paint();
  }
  function tap() {
    if (cursor < 0) return;
    const t = audio.currentTime;
    marks[cursor].end = Math.max(Number(marks[cursor].start) + 0.2, t);
    if (cursor + 1 < marks.length) { marks[cursor + 1].start = t; cursor++; }
    else { cursor = -1; audio.pause(); tapBtn.disabled = true; toast('اكتمل التقسيم. استمع لكل آية للتأكد ثم احفظ.'); }
    paint();
  }
  function paint() {
    tapBtn.textContent = cursor >= 0 ? `اضغط عند نهاية الآية ${arNum(ayahs[cursor][0])}` : 'اضغط «ابدأ التقسيم» ثم اضغط هنا عند نهاية كل آية';
    status.textContent = src ? 'ملف الصوت جاهز.' : 'لم يُرفع ملف صوت بعد.';
    table.replaceChildren(el('tr', {}, el('th', {}, 'الآية'), el('th', {}, 'البداية'), el('th', {}, 'النهاية'), el('th', {}, '')),
      ...ayahs.map(([no, bs], i) => {
        const num = k => { const inp = el('input', { type: 'number', step: '0.01', min: 0, value: fmt(marks[i][k]), 'aria-label': `${k === 'start' ? 'بداية' : 'نهاية'} الآية ${no}`, onchange: e => { marks[i][k] = e.target.value === '' ? '' : Number(e.target.value); } }); return inp; };
        return el('tr' + (i === cursor ? '.cur' : ''), {},
          el('td', {}, el('b', {}, arNum(no)), ' ', el('span.small', {}, (bs[0].text || '').slice(0, 28) + '…')),
          el('td', {}, num('start')), el('td', {}, num('end')),
          el('td', {}, el('button.tool', { type: 'button', disabled: !src || marks[i].end === '' ? true : null, onclick: () => playSegment(resolveMedia(src), marks[i].start, marks[i].end).catch(err => toast(err.message)) }, '▶')));
      }));
  }
  paint();
  const body = el('div.seg-tool', {},
    el('p.small', {}, '1) ارفع ملف صوت السورة كاملة (قراءة قارئ معتمد). 2) اضغط «ابدأ التقسيم»، ثم اضغط الزر الكبير عند نهاية كل آية وأنت تستمع. 3) استمع لكل آية بزر ▶ وعدّل الأرقام إن لزم، ثم احفظ.'),
    el('label.tool', {}, src ? 'تغيير ملف الصوت' : 'رفع ملف صوت السورة', file), status, audio,
    el('div.row', {}, startBtn), tapBtn, table);
  modal('تقسيم صوت السورة على الآيات', body, [{ label: 'إلغاء', value: 0, cls: 'ghost' }, { label: 'حفظ', value: 1 }]).then(v => {
    stopAudio(); audio.pause();
    if (!v) return;
    let n = 0;
    ayahs.forEach(([no, bs], i) => {
      for (const b of bs) {
        const before = JSON.stringify({ audio: b.audio, start: b.start, end: b.end });
        b.audio = src; b.start = marks[i].start === '' ? '' : Number(fmt(marks[i].start)); b.end = marks[i].end === '' ? '' : Number(fmt(marks[i].end));
        const after = JSON.stringify({ audio: b.audio, start: b.start, end: b.end });
        if (before !== after) { logChange({ where: `${ch.title} · الآية ${no}`, field: 'مقطع الصوت', before, after }); n++; }
      }
    });
    if (n) { changed(); toast(`حُفظ تقسيم الصوت على ${ayahs.length} آيات`); }
    onDone();
  });
}
