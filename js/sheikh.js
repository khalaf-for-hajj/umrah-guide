// شاشة الشيخ: الدخول برقم الغرفة والرقم السري، بدء العرض وإنهاؤه، العرض خطوة بخطوة،
// البث أو التصفح الخاص، الإخفاء المؤقت، الوضع اليدوي، وحساب وقت الشرح لكل باب وقسم
import './core/blocks-builtin.js';
import { el, $, toast, paras } from './core/dom.js';
import { store } from './core/store.js';
import { loadPack, flatSlides, findChapter, stepCount, explainFor, bookTitle } from './core/pack.js';
import { drawStage, fontsReady, onFontsChanged } from './core/stage.js';
import { rpc, relayConfigured, relayHeaders } from './core/relay.js';
import { registerSW } from './core/offline.js';
import { sheikhTitle, applyPrefs, modal, confirmBox, footer } from './core/ui.js';
import { toLatinDigits } from './core/arabic.js';
import config from '../config.js';

const S = {
  pack: null,
  cred: store.get('sh.cred'),         // { code, pin }
  room: null,                         // { code, sheikh, bus, live, session }
  pos: store.get('sh.pos'),           // { ch, no, step }
  broadcast: store.get('sh.broadcast', true),
  hidden: false,
  manual: false,                      // عرض بلا مرحّل
  pubState: 'idle', pubTimer: null, pubRetry: 0, lastSent: null,
};
const app = $('#app');
const ctx = () => ({ viewer: 'sheikh', marja: 'other', marjas: S.pack.settings.marjas, resolveMedia: s => 'content/' + s, dataSaver: false });
const auth = () => ({ p_code: S.cred.code, p_pin: S.cred.pin });

// ---------- حساب وقت الشرح ----------
const T = {
  sid: null, data: null, last: Date.now(), lastInput: Date.now(), dirty: false, timer: null, sender: null,
  start(sid) {
    const saved = store.get('sh.stats');
    this.sid = sid;
    this.data = saved?.sid === sid ? saved.data : { v: 1, total: 0, ch: {} };
    this.last = Date.now();
    clearInterval(this.timer); clearInterval(this.sender);
    this.timer = setInterval(() => this.tick(), 5000);
    this.sender = setInterval(() => this.send(), 60000);
  },
  tick() {
    const now = Date.now(), dt = Math.min(10, (now - this.last) / 1000);
    this.last = now;
    // يُحسب الوقت والعرض ظاهر، وآخر استخدام خلال 20 دقيقة
    if (!this.data || !S.pos || document.hidden || now - this.lastInput > 20 * 60000 || !ui.stage?.isConnected) return;
    const ch = findChapter(S.pack, S.pos.ch); if (!ch) return;
    const x = flatSlides(ch)[S.pos.no - 1]; if (!x) return;
    const c = this.data.ch[ch.id] ??= { t: ch.title, m: ch.minutes || 0, s: 0, sec: {} };
    const sc = c.sec[x.section.id] ??= { t: x.section.title, m: x.section.minutes || 0, s: 0 };
    c.s += dt; sc.s += dt; this.data.total += dt;
    this.dirty = true;
    store.set('sh.stats', { sid: this.sid, data: this.data });
    timerView();
  },
  rounded() {
    const r = structuredClone(this.data);
    r.total = Math.round(r.total);
    for (const c of Object.values(r.ch)) { c.s = Math.round(c.s); for (const s of Object.values(c.sec)) s.s = Math.round(s.s); }
    return r;
  },
  async send(keepalive = false) {
    if (!this.dirty || !this.sid || !S.room?.live || S.manual) return;
    try {
      if (keepalive) {
        fetch(`${config.relayUrl.replace(/\/$/, '')}/rest/v1/rpc/um_stats`, {
          method: 'POST', keepalive: true,
          headers: relayHeaders(),
          body: JSON.stringify({ ...auth(), p_stats: this.rounded(), p_session: this.sid }),
        }).catch(() => {});
      } else await rpc('um_stats', { ...auth(), p_stats: this.rounded(), p_session: this.sid });
      this.dirty = false;
    } catch { /* يُعاد لاحقاً */ }
  },
  stop() { clearInterval(this.timer); clearInterval(this.sender); },
};
const touch = () => { T.lastInput = Date.now(); };
addEventListener('pointerdown', touch); addEventListener('keydown', touch);
addEventListener('pagehide', () => T.send(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) T.send(true); else T.last = Date.now(); });

// ---------- الدخول ----------
function viewLogin(msg) {
  const code = el('input.code-input', { type: 'text', inputmode: 'numeric', maxlength: 4, placeholder: 'رقم الغرفة', 'aria-label': 'رقم الغرفة', value: S.cred?.code || '' });
  const pin = el('input.code-input', { type: 'password', inputmode: 'numeric', maxlength: 6, placeholder: 'الرقم السري', 'aria-label': 'الرقم السري', autocomplete: 'off' });
  const go = async () => {
    const c = toLatinDigits(code.value).replace(/\D/g, ''), p = toLatinDigits(pin.value).replace(/\D/g, '');
    if (c.length !== 4 || p.length !== 6) return toast('رقم الغرفة 4 أرقام والرقم السري 6 أرقام');
    try {
      const r = await rpc('um_sheikh_login', { p_code: c, p_pin: p });
      S.cred = { code: c, pin: p }; store.set('sh.cred', S.cred);
      S.room = r; viewHome();
    } catch (e) { viewLogin(e.message); }
  };
  pin.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  app.replaceChildren(el('main', {},
    el('img.hero-logo', { src: 'assets/img/logo-full.png', alt: 'حملة الخلف للحج والعمرة', style: { width: '180px', height: '180px' } }),
    el('h1.page-title.center', {}, 'دخول الشيخ'),
    msg ? el('div.banner', {}, msg) : null,
    relayConfigured() ? el('section.card.join', { style: { display: 'grid', gap: '12px' } },
      el('label', {}, 'رقم الغرفة'), code, el('label', {}, 'الرقم السري'), pin,
      el('button.btn.huge.block', { type: 'button', onclick: go }, 'دخول'),
      el('p.small', {}, 'الرقم السري مطبوع في البطاقة التي سلّمها لك المشرف.'))
      : el('div.banner', {}, 'المتابعة التلقائية غير مضبوطة بعد. يمكنك العرض بالوضع اليدوي: تعلن رقم الشريحة والمعتمرون يذهبون إليها.'),
    el('section.card', { style: { display: 'grid', gap: '10px' } }, el('button.btn.big.ghost.block', { type: 'button', onclick: startManual }, 'اعرض بالوضع اليدوي (بلا متابعة)'),
      el('a.btn.ghost.block', { href: 'book.html', target: '_blank', rel: 'noopener' }, `📖 ${bookTitle(S.pack.settings)} (للقراءة والطباعة)`)),
    el('p.center', {}, el('a', { href: 'index.html' }, 'العودة لصفحة المعتمر')),
    footer(S.pack.settings)));
  setTimeout(() => (S.cred?.code ? pin : code).focus(), 50);
}

function viewHome(msg) {
  const r = S.room;
  app.replaceChildren(el('main', {},
    el('img.hero-logo', { src: 'assets/img/logo-full.png', alt: 'حملة الخلف للحج والعمرة', style: { width: '160px', height: '160px' } }),
    msg ? el('div.banner', {}, msg) : null,
    el('section.card.center', {},
      el('p.msg', { style: { fontSize: '1.2em', fontWeight: 800, color: 'var(--blue)' } }, `غرفة ${sheikhTitle(r.sheikh)}`),
      r.bus ? el('p.muted', {}, r.bus) : null,
      el('p', {}, 'أعلن هذا الرقم للمعتمرين'),
      el('div.bigcode', { 'aria-label': 'رقم الغرفة ' + r.code }, r.code),
      el('p', {}, r.live ? '🟢 العرض قائم الآن' : 'لم يبدأ العرض بعد')),
    el('section.card', { style: { display: 'grid', gap: '10px' } },
      el('button.btn.huge.block', { type: 'button', onclick: startSession }, r.live ? 'متابعة العرض' : 'ابدأ العرض'),
      r.live ? el('button.btn.danger.block', { type: 'button', onclick: endSession }, 'إنهاء العرض') : null,
      el('a.btn.ghost.block', { href: 'book.html', target: '_blank', rel: 'noopener' }, `📖 ${bookTitle(S.pack.settings)} (للقراءة والطباعة)`),
      el('button.btn.ghost.block', { type: 'button', onclick: () => { store.del('sh.cred'); S.cred = null; S.room = null; viewLogin(); } }, 'تسجيل الخروج من هذا الجهاز')),
    footer(S.pack.settings)));
}

async function startSession() {
  try {
    const r = await rpc('um_start', auth());
    S.room = r; S.manual = false;
    T.start(r.session);
    if (S.pos && findChapter(S.pack, S.pos.ch) && store.get('sh.posSession') === r.session) { presenter(); publishSoon(true); }
    else { store.set('sh.posSession', r.session); chooseChapter(); }
  } catch (e) {
    if (e.network) { toast('لا يوجد اتصال — يمكنك العرض بالوضع اليدوي'); startManual(); }
    else viewLogin(e.message);
  }
}

async function endSession() {
  if (!(await confirmBox('إنهاء العرض؟ ستتوقف متابعة المعتمرين ويعودون للتصفح الحر، ويُحفظ وقت الشرح.', 'نعم، أنهِ العرض', 'تراجع'))) return;
  T.tick();
  try { await rpc('um_end', { ...auth(), p_stats: T.data ? T.rounded() : null }); } catch (e) { toast(e.message); }
  T.stop(); store.del('sh.stats'); store.del('sh.posSession');
  S.room = { ...S.room, live: false };
  viewHome('انتهى العرض، وحُفظ وقت الشرح.');
}

function startManual() {
  S.manual = true; S.room = null;
  T.start('manual-' + new Date().toISOString().slice(0, 10));
  chooseChapter();
}

function chooseChapter() {
  const list = S.pack.chapters.filter(c => c.status !== 'soon' && flatSlides(c).length);
  modal('اختر الباب الذي ستشرحه', el('div', { style: { display: 'grid', gap: '10px' } },
    list.map(c => el('button.chapter-btn', { type: 'button', onclick: e => { const d = e.target.closest('dialog'); d.close(); d.remove(); openChapter(c.id); } },
      el('span', {}, c.title, el('span.n', {}, `${flatSlides(c).length} شريحة · ${c.minutes || '—'} دقيقة${c.status === 'hidden' ? ' · غير منشور للمعتمرين' : ''}`)), el('span.arrow', {}, '‹')))), []);
}

function openChapter(chId) {
  const resume = S.pos?.ch === chId ? S.pos : null;
  S.pos = resume || { ch: chId, no: 1, step: 0 };
  presenter();
  publishSoon(true);
}

// ---------- شاشة العرض ----------
const ui = {};
function presenter() {
  const live = S.room?.live && !S.manual;
  ui.code = live ? el('button.codechip', { type: 'button', title: 'اعرض رقم الغرفة بخط ضخم', onclick: showCode }, '# ' + S.room.code) : el('span.stat.bad', {}, 'الوضع اليدوي');
  ui.stat = el('span.stat');
  ui.bcast = el('button.btn', { type: 'button', onclick: toggleBroadcast });
  ui.hide = el('button.btn.ghost', { type: 'button', onclick: toggleHidden });
  ui.pos = el('div.sh-pos', { 'aria-live': 'polite' });
  ui.stage = el('div.sh-stage');
  ui.prev = el('button.btn.ghost', { type: 'button', onclick: () => move(-1) }, '▶ السابق');
  ui.next = el('button.btn', { type: 'button', onclick: () => move(1) }, 'التالي ◀');
  ui.jump = el('select', { 'aria-label': 'القفز إلى قسم', onchange: e => { const n = Number(e.target.value); if (n) { S.pos.no = n; S.pos.step = 0; draw(); publishSoon(); } } });
  ui.go = el('input', { type: 'text', inputmode: 'numeric', placeholder: 'رقم', style: { width: '90px', minHeight: '48px', textAlign: 'center', border: '2px solid var(--gold)', borderRadius: '12px', fontSize: '1.1em' } });
  ui.notes = el('div.notes');
  ui.timer = el('div.timer');
  ui.banner = el('div');
  const ch = findChapter(S.pack, S.pos.ch);
  const exit = () => { T.stop(); S.room ? viewHome() : viewLogin(); };
  app.replaceChildren(
    el('div.sh-top', {},
      el('img.mark', { src: 'assets/img/logo-mark.jpg', alt: '', style: { width: '40px', height: '40px', borderRadius: '8px', background: '#fff' } }),
      ui.code, ui.stat, el('span.grow'),
      live ? ui.bcast : null, live ? el('span.wide-only', {}, ui.hide) : null,
      el('button.btn.ghost.wide-only', { type: 'button', onclick: chooseChapter }, 'الأبواب'),
      live ? el('button.btn.danger.wide-only', { type: 'button', onclick: endSession }, 'إنهاء العرض')
        : el('button.btn.ghost.wide-only', { type: 'button', onclick: exit }, 'خروج'),
      // الجوال: بقية الأزرار في قائمة واحدة
      el('button.btn.ghost.phone-only', { type: 'button', 'aria-label': 'القائمة', onclick: () => phoneMenu(live, exit) }, '☰')),
    ui.banner,
    el('div.sh-wrap', {},
      el('div', {}, ui.pos, el('div', { style: { height: '6px' } }), ui.stage, el('div.sh-controls', {}, ui.prev, ui.next)),
      ui.side = el('aside.sh-side', {},
        el('section.card', {}, el('h3', {}, 'الوقت'), ui.timer),
        el('section.card.jump', {}, el('h3', {}, ch.title), ui.jump,
          el('div.row', { style: { marginTop: '8px' } }, el('span', {}, 'اذهب إلى شريحة:'), ui.go,
            el('button.btn', { type: 'button', onclick: () => { const n = parseInt(toLatinDigits(ui.go.value), 10); if (n >= 1 && n <= flatSlides(ch).length) { S.pos.no = n; S.pos.step = 0; draw(); publishSoon(); } else toast('رقم غير موجود'); } }, 'اذهب'))),
        el('section.card', {}, el('h3', {}, 'ملاحظات للشيخ'), ui.notes))),
  );
  scrollTo(0, 0);
  fillJump();
  draw();
}

function phoneMenu(live, exit) {
  const item = (label, fn, cls = 'ghost') => el('button.btn.block.' + cls, { type: 'button', onclick: e => { const d = e.target.closest('dialog'); d.close(); d.remove(); fn(); } }, label);
  modal('القائمة', el('div', { style: { display: 'grid', gap: '10px' } },
    item('📝 شرح الشيخ والملاحظات', showNotes, 'teal'),
    item('الأبواب', chooseChapter),
    live ? item(S.hidden ? 'إظهار الشاشة للمعتمرين' : 'إخفاء الشاشة مؤقتاً', toggleHidden) : null,
    live ? item('رقم الغرفة بخط كبير', showCode) : null,
    item('الوقت والقفز إلى قسم', () => ui.side.scrollIntoView({ behavior: 'smooth' })),
    live ? item('إنهاء العرض', endSession, 'danger') : item('خروج', exit, 'danger')), [{ label: 'إغلاق', value: 0, cls: 'ghost' }]);
}

function showNotes() {
  const box = el('div.notes');
  box.append(...ui.notes.cloneNode(true).childNodes);
  modal('شرح الشيخ والملاحظات', box, [{ label: 'إغلاق', value: 0 }]);
}

function showCode() {
  const d = el('div.cover', { role: 'dialog', 'aria-label': 'رقم الغرفة' },
    el('div', {},
      el('img', { src: 'assets/img/logo-full.png', alt: 'حملة الخلف للحج والعمرة' }),
      el('p.msg', {}, `غرفة ${sheikhTitle(S.room.sheikh)}${S.room.bus ? ' — ' + S.room.bus : ''}`),
      el('p.muted', {}, 'أعلن هذا الرقم للمعتمرين'),
      el('div.bigcode', {}, S.room.code),
      el('button.btn.huge', { type: 'button', onclick: () => d.remove() }, 'متابعة العرض')));
  document.body.append(d);
}

function fillJump() {
  const ch = findChapter(S.pack, S.pos.ch);
  const list = flatSlides(ch);
  ui.jump.replaceChildren(el('option', { value: '' }, 'القفز إلى قسم…'),
    ...ch.sections.map(sec => {
      const first = list.find(x => x.section === sec);
      return first ? el('option', { value: first.no }, `${sec.title} (من ${first.no})${sec.minutes ? ' — ' + sec.minutes + ' د' : ''}`) : null;
    }));
}

function draw(animateFrom = null) {
  const ch = findChapter(S.pack, S.pos.ch);
  const list = flatSlides(ch);
  S.pos.no = Math.min(Math.max(1, S.pos.no), list.length);
  const cur = list[S.pos.no - 1];
  const total = stepCount(cur.slide);
  S.pos.step = Math.min(Math.max(0, S.pos.step), total);
  store.set('sh.pos', S.pos);
  sizeStage();
  drawStage(ui.stage, cur.slide, ctx(), { step: S.pos.step, animateFrom, fallbackTitle: cur.section.title, onRelayout: () => draw() });
  if (S.hidden) ui.stage.prepend(el('div.slide-hidden-note', {}, 'الشاشة مخفية عند المعتمرين'));
  posLine();
  ui.prev.disabled = S.pos.no === 1 && S.pos.step === 0;
  ui.next.disabled = S.pos.no === list.length && S.pos.step >= total;
  ui.next.textContent = S.pos.step < total ? 'التالي: اكشف ◀' : 'الشريحة التالية ◀';
  const exAll = explainFor(S.pack, cur.slide) === 'all';
  const notes = [cur.slide.explain?.trim() ? el('div', {}, el('b', {}, exAll ? 'شرح الشيخ (يراه المعتمر أيضاً بزر «شرح الشيخ»):' : 'شرح الشيخ (لك فقط — لا يراه المعتمر):'), paras(cur.slide.explain)) : null,
    cur.slide.notes?.trim() ? el('div', { style: { marginTop: '8px' } }, el('b', {}, 'ملاحظات:'), paras(cur.slide.notes)) : null].filter(Boolean);
  ui.notes.replaceChildren(...(notes.length ? notes : [el('span.muted', {}, 'لا توجد ملاحظات لهذه الشريحة.')]));
  status(); timerView();
}

// الجوال: المنصة تملأ ما بين الشريط العلوي وأزرار التنقل (عمودياً أو بالعرض)
const isPhone = () => innerWidth < 760 || innerHeight < 520;
function sizeStage() {
  const phone = isPhone();
  document.body.classList.toggle('sh-phone', phone);
  if (!phone) { ui.stage.style.height = ''; return; }
  const top = ui.stage.getBoundingClientRect().top + scrollY;
  const ctrl = ui.prev.parentElement.getBoundingClientRect().height;
  ui.stage.style.height = Math.max(180, Math.floor(innerHeight - top - ctrl - 4)) + 'px';
}

// سطر الموضع: ضخم في الوضع اليدوي ليعلنه الشيخ بصوته
function posLine() {
  const list = flatSlides(findChapter(S.pack, S.pos.ch));
  const cur = list[S.pos.no - 1];
  const total = stepCount(cur.slide);
  const manual = S.manual || !S.room?.live || S.pubState === 'fail';
  ui.pos.className = 'sh-pos' + (manual ? ' huge' : '');
  ui.pos.replaceChildren(`شريحة ${S.pos.no} من ${list.length}`, manual ? el('br') : ' · ', total ? `خطوة ${S.pos.step} من ${total}` : 'بلا خطوات',
    manual ? el('div', { style: { fontSize: '.4em' } }, 'أعلن هذا الرقم للمعتمرين') : el('span.small', {}, ' — ' + (cur.slide.title || cur.section.title)));
}

function move(dir) {
  const list = flatSlides(findChapter(S.pack, S.pos.ch));
  const total = stepCount(list[S.pos.no - 1].slide);
  let anim = null;
  if (dir > 0) {
    if (S.pos.step < total) { anim = S.pos.step; S.pos.step++; }
    else if (S.pos.no < list.length) { S.pos.no++; S.pos.step = 0; }
    else return;
  } else {
    if (S.pos.step > 0) S.pos.step--;
    else if (S.pos.no > 1) { S.pos.no--; S.pos.step = stepCount(list[S.pos.no - 1].slide); }
    else return;
  }
  draw(anim);
  publishSoon();
}

function toggleBroadcast() {
  S.broadcast = !S.broadcast;
  store.set('sh.broadcast', S.broadcast);
  toast(S.broadcast ? 'البث مفعّل: شاشات المعتمرين تتبعك' : 'تصفح خاص: شاشات المعتمرين لن تتحرك');
  status();
  if (S.broadcast) publishSoon(true);
}

function toggleHidden() { S.hidden = !S.hidden; draw(); publishSoon(true); }

function status() {
  if (!ui.stat) return;
  ui.bcast.textContent = S.broadcast ? '📡 بث' : '🔒 تصفح خاص';
  ui.bcast.className = 'btn' + (S.broadcast ? ' teal' : ' blue');
  ui.hide.textContent = S.hidden ? 'إظهار الشاشة' : 'إخفاء الشاشة مؤقتاً';
  let cls = 'stat', txt;
  if (S.manual || !S.room?.live) { cls += ' bad'; txt = 'الوضع اليدوي'; }
  else if (!S.broadcast) { cls += ' priv'; txt = 'المعتمرون ثابتون'; }
  else if (S.pubState === 'fail') { cls += ' bad'; txt = 'لم يصل — يعاد الإرسال'; }
  else if (S.pubState === 'sending') txt = 'يُرسل…';
  else txt = 'وصل للمعتمرين ✓';
  ui.stat.className = cls; ui.stat.textContent = txt;
  ui.banner.replaceChildren(S.room?.live && !S.manual && S.pubState === 'fail'
    ? el('div.banner', {}, 'المتابعة التلقائية غير متاحة الآن (ضعف الشبكة). أعلن رقم الشريحة والخطوة بصوتك، وسيُعاد الإرسال تلقائياً.') : '');
}

// عرض الوقت: الباب والقسم الحاليان مقارنةً بالوقت المحدد
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function timerView() {
  if (!ui.timer || !T.data || !S.pos) return;
  const ch = findChapter(S.pack, S.pos.ch); const x = flatSlides(ch)[S.pos.no - 1];
  const c = T.data.ch[ch.id] || { s: 0, sec: {} }; const sc = c.sec?.[x.section.id] || { s: 0 };
  const line = (label, s, m) => el('div.trow' + (m && s > m * 60 ? '.over' : ''), {}, el('span', {}, label), el('b', { dir: 'ltr' }, mmss(s) + (m ? ` / ${m}:00` : '')));
  ui.timer.replaceChildren(
    line('الباب: ' + ch.title, c.s, ch.minutes),
    line('القسم: ' + x.section.title, sc.s, x.section.minutes),
    line('مجموع هذا العرض', T.data.total, 0),
    (ch.minutes && c.s > ch.minutes * 60) ? el('p.pending', {}, 'تجاوزت الوقت المحدد للباب') : null);
}

// ---------- البث ----------
function currentState() {
  const list = flatSlides(findChapter(S.pack, S.pos.ch));
  const cur = list[S.pos.no - 1];
  return { pv: S.pack.version, ch: S.pos.ch, s: cur.slide.id, n: S.pos.no, k: S.pos.step, m: S.hidden ? 'hide' : 'show' };
}

function publishSoon(now = false) {
  if (S.manual || !S.room?.live || !S.broadcast) return;
  clearTimeout(S.pubTimer);
  S.pubTimer = setTimeout(publish, now ? 0 : 350);
}

async function publish() {
  if (S.manual || !S.room?.live || !S.broadcast) return;
  const st = currentState();
  const sig = JSON.stringify(st);
  if (sig === S.lastSent && S.pubState === 'ok') return;
  S.pubState = 'sending'; status();
  try {
    await rpc('um_publish', { ...auth(), p_state: st });
    S.lastSent = sig; S.pubRetry = 0; S.pubState = 'ok';
    if (sig !== JSON.stringify(currentState())) publishSoon(true);
  } catch (e) {
    if (e.code === 'UM_NOT_LIVE') {
      // انتهى العرض تلقائياً (خمول طويل) أو أنهاه المشرف: يُستأنف بجلسة جديدة
      try { const r = await rpc('um_start', auth()); S.room = r; T.start(r.session); return publish(); } catch { /* يُعاد */ }
    }
    if (e.code === 'UM_BAD_PIN') { T.stop(); store.del('sh.cred'); S.cred = null; viewLogin('تغيّر الرقم السري أو أُلغيت الغرفة. ادخل من جديد.'); return; }
    S.pubState = 'fail';
    S.pubRetry = Math.min(S.pubRetry + 1, 5);
    clearTimeout(S.pubTimer);
    S.pubTimer = setTimeout(publish, 1500 * 2 ** S.pubRetry);
  }
  posLine(); status();
}
addEventListener('online', () => publishSoon(true));

addEventListener('keydown', e => {
  if (!ui.stage?.isConnected || e.target.closest('input, textarea, select') || $('dialog[open]') || $('.cover')) return;
  if (['ArrowLeft', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); move(1); }
  else if (['ArrowRight', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); move(-1); }
  else if (e.key === 'b' || e.key === 'B' || e.key === '.') toggleHidden();
});
let rz;
addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (ui.stage?.isConnected) draw(); }, 150); });

// ---------- الإقلاع ----------
async function boot() {
  applyPrefs();
  registerSW();
  try { S.pack = await loadPack(); }
  catch (e) { app.replaceChildren(el('main', {}, el('div.banner', {}, 'تعذّر تحميل الدرس: ' + e.message))); return; }
  await fontsReady;
  onFontsChanged(() => { if (ui.stage?.isConnected) draw(); });
  if (!relayConfigured() || !S.cred) return viewLogin();
  try {
    S.room = await rpc('um_sheikh_login', auth());
    if (S.room.live && S.pos && findChapter(S.pack, S.pos.ch)) { T.start(S.room.session); presenter(); publishSoon(true); return; }
    viewHome();
  } catch (e) {
    if (e.network) { viewLogin('لا يوجد اتصال الآن. يمكنك العرض بالوضع اليدوي.'); return; }
    store.del('sh.cred'); S.cred = null; viewLogin(e.message);
  }
}
boot();
