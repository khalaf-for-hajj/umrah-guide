// برنامج التدريب على قراءة السورة: يستمع المعتمر للآية بصوت القارئ، ويكررها، ويُعطى مهلة ليردّدها،
// ويسجّل قراءته ويقارنها بالقارئ. التسجيل يبقى في جواله ولا يُرسل إلى أي مكان.
import { el, toast } from './core/dom.js';
import { flatSlides } from './core/pack.js';
import { seg } from './core/ui.js';
import { store } from './core/store.js';
import { playSegment, playFile, stopAudio } from './core/audio.js';
import { arNum, ayahHasAudio } from './core/block-ayah.js';

/** آيات الباب بالترتيب (الآية المكررة في أكثر من شريحة تُؤخذ مرة واحدة) */
export function chapterAyahs(ch) {
  const m = new Map();
  for (const x of flatSlides(ch)) for (const st of x.slide.steps) for (const b of st.blocks) if (b.type === 'ayah' && b.no && !m.has(Number(b.no))) m.set(Number(b.no), b);
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
}
export const hasAyahs = ch => chapterAyahs(ch).length > 0;

const sleep = ms => new Promise(r => setTimeout(r, ms));

export function mountTrainer({ chapter, resolveMedia, onClose, host = document.body }) {
  const ayahs = chapterAyahs(chapter);
  const anyAudio = ayahs.some(ayahHasAudio);
  const st = {
    i: 0,
    repeat: store.get('rc.repeat', 1),
    gap: store.get('rc.gap', true),
    rate: store.get('rc.rate', 1),
    token: 0, playing: false, recording: null, recs: {},
  };
  const root = el('div.player.recite', { role: 'region', 'aria-label': 'التدريب على القراءة' });
  const list = el('div.rc-list');
  const status = el('div.rc-status', { 'aria-live': 'polite' });
  const meta = el('span');
  const playBtn = el('button.btn.big.rc-play', { type: 'button', onclick: () => (st.playing ? stop() : playCurrent(false)) });
  const recBtn = el('button.btn.ghost', { type: 'button', onclick: () => toggleRecord() });
  const mineBtn = el('button.btn.ghost', { type: 'button', onclick: () => playMine() }, '▶ قراءتي');
  const cmpBtn = el('button.btn.ghost', { type: 'button', onclick: () => compare() }, '⇆ القارئ ثم أنا');

  const say = (t, cls = '') => { status.className = 'rc-status ' + cls; status.textContent = t; };
  const src = a => resolveMedia(a.audio);

  function paint(scroll = true) {
    meta.textContent = `الآية ${arNum(ayahs[st.i]?.no || 1)} من ${arNum(ayahs.length)}`;
    list.replaceChildren(...ayahs.map((a, i) => el('div.rc-ayah' + (i === st.i ? '.cur' : ''), {
      role: 'button', tabindex: 0, 'aria-current': i === st.i ? 'true' : null,
      onclick: () => { if (i !== st.i) { stop(); st.i = i; paint(); } },
      onkeydown: e => { if (e.key === 'Enter') { stop(); st.i = i; paint(); } },
    }, el('div.ay-text', {}, a.text, el('span.ay-no', {}, ` ﴿${arNum(a.no)}﴾`)),
      i === st.i && (a.tips || []).length ? el('ul.ay-tips', {}, a.tips.map(t => el('li', {}, t))) : null)));
    const cur = ayahs[st.i];
    playBtn.textContent = st.playing ? '⏸ إيقاف' : '▶ استمع';
    playBtn.disabled = !ayahHasAudio(cur || {}) && !st.playing ? true : null;
    recBtn.textContent = st.recording ? '⏹ أوقف التسجيل' : '🎙 سجّل قراءتي';
    recBtn.classList.toggle('danger', Boolean(st.recording));
    mineBtn.disabled = st.recs[st.i] ? null : true;
    cmpBtn.disabled = st.recs[st.i] && ayahHasAudio(cur || {}) ? null : true;
    if (scroll) requestAnimationFrame(() => list.querySelector('.rc-ayah.cur')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }

  function stop() {
    st.token++; st.playing = false; stopAudio(); say(''); paint(false);
  }

  // الاستماع للآية بعدد التكرار، مع مهلة للترديد بعد كل مرة؛ chain: يتابع إلى الآية التالية (قراءة السورة كاملة)
  async function playCurrent(chain) {
    const my = ++st.token;
    st.playing = true; paint(false);
    try {
      do {
        const a = ayahs[st.i];
        if (!ayahHasAudio(a)) { say('لا يوجد صوت لهذه الآية بعد'); break; }
        const times = st.repeat === 0 ? Infinity : st.repeat;
        for (let r = 0; r < times && my === st.token; r++) {
          say(times > 1 ? `استمع (${arNum(r + 1)}${times === Infinity ? '' : ' من ' + arNum(times)})` : 'استمع');
          await playSegment(src(a), a.start, a.end, { rate: st.rate });
          if (my !== st.token) return;
          if (st.gap && !chain) {
            const dur = ((Number(a.end) - Number(a.start)) / st.rate) * 1000 * 1.15 + 600;
            say('دورك الآن: ردّد الآية', 'turn');
            await sleep(dur);
            if (my !== st.token) return;
          }
        }
        if (!chain || st.i >= ayahs.length - 1) break;
        st.i++; paint();
      } while (my === st.token);
    } catch (e) { say(e.message || 'تعذّر تشغيل الصوت'); }
    if (my === st.token) { st.playing = false; if (!status.classList.contains('turn')) say(''); else say(''); paint(false); }
  }

  async function toggleRecord() {
    if (st.recording) { st.recording.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { toast('جهازك لا يدعم التسجيل من المتصفح'); return; }
    stop();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { toast('لم يُسمح باستخدام الميكروفون'); return; }
    const type = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported?.(t));
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    const idx = st.i;
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      if (st.recs[idx]) URL.revokeObjectURL(st.recs[idx]);
      st.recs[idx] = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' }));
      st.recording = null; say('حُفظ تسجيلك لهذه الآية على جهازك. استمع له أو قارنه بالقارئ.'); paint(false);
    };
    rec.start();
    st.recording = rec; say('⏺ جارٍ التسجيل… اقرأ الآية ثم اضغط «أوقف التسجيل»', 'rec'); paint(false);
  }

  async function playMine() {
    const u = st.recs[st.i]; if (!u) return;
    const my = ++st.token; st.playing = true; paint(false); say('قراءتك');
    try { await playFile(u); } catch { toast('تعذّر تشغيل التسجيل'); }
    if (my === st.token) { st.playing = false; say(''); paint(false); }
  }
  async function compare() {
    const a = ayahs[st.i], u = st.recs[st.i]; if (!u || !ayahHasAudio(a)) return;
    const my = ++st.token; st.playing = true; paint(false);
    try {
      say('القارئ'); await playSegment(src(a), a.start, a.end, { rate: st.rate });
      if (my !== st.token) return;
      await sleep(400); say('قراءتك'); await playFile(u);
    } catch { /* تجاهل */ }
    if (my === st.token) { st.playing = false; say(''); paint(false); }
  }
  const go = d => { const n = st.i + d; if (n < 0 || n >= ayahs.length) return; stop(); st.i = n; paint(); };

  root.append(...[
    el('div.pl-bar', {},
      el('button.pl-x', { type: 'button', 'aria-label': 'رجوع', title: 'رجوع', onclick: () => { destroy(); onClose?.(); } }, '✕'),
      el('div.ttl', {}, el('b', {}, 'التدريب على قراءة ' + chapter.title), meta),
      anyAudio ? el('button.btn.teal.rc-all', { type: 'button', onclick: () => { stop(); st.i = 0; paint(); playCurrent(true); } }, '▶ السورة كاملة') : null),
    anyAudio ? null : el('div.pl-note.info', {}, 'لم يُرفع صوت القراءة بعد. يمكنك قراءة الآيات وتسجيل قراءتك والاستماع لها.'),
    list,
    el('div.rc-panel', {},
      status,
      el('div.rc-main', {},
        el('button.btn.ghost', { type: 'button', 'aria-label': 'الآية السابقة', onclick: () => go(-1) }, '▶ السابقة'),
        playBtn,
        el('button.btn.ghost', { type: 'button', 'aria-label': 'الآية التالية', onclick: () => go(1) }, 'التالية ◀')),
      el('div.rc-opts', {},
        el('span.small', {}, 'التكرار:'),
        seg([[1, '١'], [3, '٣'], [5, '٥'], [0, '∞']], st.repeat, v => { st.repeat = v; store.set('rc.repeat', v); }, 'عدد التكرار'),
        el('label.check.small', {}, el('input', { type: 'checkbox', checked: st.gap ? true : null, onchange: e => { st.gap = e.target.checked; store.set('rc.gap', st.gap); } }), ' مهلة لأردّد'),
        seg([[1, 'عادي'], [0.75, 'أبطأ']], st.rate, v => { st.rate = v; store.set('rc.rate', v); }, 'سرعة القراءة')),
      el('div.rc-rec', {}, recBtn, mineBtn, cmpBtn)),
  ].filter(Boolean));
  host.append(root);
  paint();

  function destroy() {
    stop();
    if (st.recording) try { st.recording.stop(); } catch { /* تجاهل */ }
    Object.values(st.recs).forEach(u => URL.revokeObjectURL(u));
    root.remove();
  }
  return { destroy };
}
