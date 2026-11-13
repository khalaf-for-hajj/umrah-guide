// شاشة المعتمر: الدخول للغرفة، متابعة الشيخ على منصة عرض تملأ شاشة الجوال (عمودياً)، التصفح الحر، فهرس المسائل، الإعدادات، التحميل بلا إنترنت
import './core/blocks-builtin.js';
import { el, $, toast, fmtDate, paras } from './core/dom.js';
import { store } from './core/store.js';
import { loadPack, flatSlides, findChapter, publishedChapters, stepCount, AUDIENCE, explainFor, pilgrimMarja, askingMarja } from './core/pack.js';
import { renderSlide, blockSearchText } from './core/render.js';
import { drawStage, playerShell, fontsReady, onFontsChanged } from './core/stage.js';
import { mountTrainer, hasAyahs } from './recite.js';
import { normalizeSearch, toLatinDigits } from './core/arabic.js';
import { rpc, startPolling, relayConfigured } from './core/relay.js';
import { registerSW, downloadLesson, isLessonCached } from './core/offline.js';
import { enableDeterrents } from './core/deter.js';
import { sheikhTitle, applyPrefs, modal, footer, showTerms, askMarja, marjaChooser, seg, confirmBox } from './core/ui.js';

const S = {
  pack: null,
  pos: null,          // { ch, no, step }
  room: null,         // { code, sheikh, bus }
  live: false,        // هل الشيخ يعرض الآن؟
  roomState: null,    // آخر حالة من الشيخ
  detached: false,    // يتصفح وحده داخل الغرفة
  poller: null,
  relayFails: 0,
  cached: false,
};

const app = $('#app');
const ctx = () => ({
  viewer: 'pilgrim', marja: pilgrimMarja(S.pack.settings, store.get('marja')), marjas: S.pack.settings.marjas,
  resolveMedia: src => 'content/' + src, dataSaver: dataSaver(), explainDefault: S.pack.settings.explainFor,
});
const explainOK = slide => Boolean(slide.explain?.trim()) && explainFor(S.pack, slide) === 'all';
const dataSaver = () => store.get('dataSaver', Boolean(navigator.connection?.saveData));
const audience = () => store.get('audience', 'all');
const viewMode = () => store.get('viewMode') === 'list' ? 'list' : 'screen'; // screen (شاشة كاملة) | list
const inRoom = () => Boolean(S.room);
const following = () => inRoom() && S.live && !S.detached && S.roomState?.ch;
const relayDown = () => inRoom() && (!relayConfigured() || S.relayFails >= 2);

// ---------- الهيكل ----------
const ui = {};
function shell() {
  ui.bar = el('header.appbar', {},
    el('img.mark', { src: 'assets/img/logo-mark.jpg', alt: 'شعار حملة الخلف' }),
    el('div.title', {}, el('b', {}, S.pack.settings.appName), el('span', {}, S.pack.settings.org)),
    el('button.iconbtn', { type: 'button', 'aria-label': 'الرئيسية', title: 'الرئيسية', onclick: () => go('#/') }, '🏠'),
    el('button.iconbtn', { type: 'button', 'aria-label': 'فهرس المسائل', title: 'فهرس المسائل', onclick: () => go('#/search') }, '🔎'),
    el('button.iconbtn', { type: 'button', 'aria-label': 'الإعدادات', title: 'الإعدادات', onclick: () => go('#/settings') }, '⚙️'));
  ui.net = el('div.netbar', { role: 'status', 'aria-live': 'polite' });
  ui.banners = el('div', { 'aria-live': 'polite' });
  ui.main = el('main', { id: 'main' });
  ui.nav = el('div');
  ui.foot = footer(S.pack.settings, () => showTerms(S.pack.settings, false));
  ui.page = el('div.page', {}, ui.bar, ui.net, ui.banners, ui.main, ui.nav, ui.foot);
  ui.player = null;
  app.replaceChildren(ui.page);
  netStatus();
}

function netStatus() {
  if (!ui.net) return;
  const on = navigator.onLine;
  ui.net.className = 'netbar' + (on ? '' : ' off');
  const parts = [on ? 'متصل بالإنترنت' : 'بلا إنترنت — الدرس يعمل من جهازك'];
  if (S.cached) parts.push('الدرس محمّل ✓');
  if (inRoom()) parts.push(relayDown() ? 'المتابعة متوقفة' : `غرفة ${S.room.code}`);
  ui.net.replaceChildren(el('span.dot'), el('span', {}, parts.join(' · ')));
}

// تنبيهات أعلى الصفحة (في غير وضع العرض)
function banners() {
  const out = [];
  if (versionMismatch()) out.push(el('div.banner', {}, 'الشيخ يعرض نسخة أحدث من الدرس.', el('button.btn.block', { type: 'button', onclick: updateLesson }, 'حدّث الدرس')));
  if (relayDown()) out.push(el('div.banner', {}, 'المتابعة التلقائية غير متاحة الآن. استمع للشيخ واذهب إلى رقم الشريحة الذي يعلنه.', manualGo()));
  else if (inRoom() && !S.live) out.push(el('div.banner.info', {}, `أنت في غرفة ${sheikhTitle(S.room.sheikh)}. لم يبدأ العرض بعد، وستتبعه تلقائياً حين يبدأ. يمكنك التصفح حتى ذلك الحين.`));
  ui.banners.replaceChildren(...out);
  netStatus();
  if (ui.player) playerBar();
}
const versionMismatch = () => inRoom() && S.live && S.roomState?.pv && S.roomState.pv !== S.pack.version;

function manualGo(compact = false) {
  const inp = el('input', { type: 'text', inputmode: 'numeric', placeholder: 'رقم', 'aria-label': 'رقم الشريحة', maxlength: 3 });
  const goNo = () => {
    const n = parseInt(toLatinDigits(inp.value), 10);
    const ch = S.pos?.ch || S.roomState?.ch || publishedChapters(S.pack)[0]?.id;
    const list = flatSlides(findChapter(S.pack, ch));
    if (!n || n < 1 || n > list.length) return toast('رقم الشريحة غير موجود في هذا الباب');
    S.detached = true;
    openSlide(ch, n, stepCount(list[n - 1].slide));
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') goNo(); });
  return el(compact ? 'span.row' : 'div.manual', {}, el('div.row', {}, inp, el('button.btn', { type: 'button', onclick: goNo }, 'اذهب إلى شريحة رقم')));
}

// ---------- التوجيه ----------
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [view, a, b] = h.split('/');
  if (S.trainer && view !== 'recite') { S.trainer.destroy(); S.trainer = null; ui.page.hidden = false; }
  if (view === 'v') return viewSlide(a, Number(b) || 1);
  if (view === 'recite') return viewRecite(a);
  // الخروج من العرض إلى الرئيسية أو قائمة الشرائح أو البحث أثناء المتابعة = تصفح وحده حتى يضغط «تابِع الشيخ»
  if (following()) S.detached = true;
  closePlayer();
  ui.nav.replaceChildren();
  if (view === 'ch') return viewChapter(a);
  if (view === 'search') return viewSearch();
  if (view === 'settings') return viewSettings();
  return viewHome();
}

// ---------- برنامج التدريب على القراءة ----------
function viewRecite(chId) {
  const ch = findChapter(S.pack, chId);
  if (!ch || !hasAyahs(ch)) return viewHome();
  if (following()) S.detached = true;
  closePlayer();
  if (S.trainer) S.trainer.destroy();
  ui.page.hidden = true;
  const back = S.pos?.ch === ch.id ? `#/v/${ch.id}/${S.pos.no}` : `#/ch/${ch.id}`;
  S.trainer = mountTrainer({ chapter: ch, resolveMedia: m => 'content/' + m, host: app, onClose: () => { S.trainer = null; ui.page.hidden = false; go(back); } });
}
// زر «برنامج التدريب» داخل شريحة
addEventListener('um:recite', () => {
  const ch = (S.pos && findChapter(S.pack, S.pos.ch)) || S.pack.chapters.find(hasAyahs);
  if (ch && hasAyahs(ch)) go('#/recite/' + ch.id);
});

// ---------- الرئيسية ----------
function viewHome() {
  const chapters = publishedChapters(S.pack);
  const code = el('input.code-input', {
    id: 'room-code', type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: 4, placeholder: '----', 'aria-describedby': 'room-help',
    oninput: e => { e.target.value = toLatinDigits(e.target.value).replace(/\D/g, '').slice(0, 4); },
    onkeydown: e => { if (e.key === 'Enter') join(code.value); },
  });
  const roomCard = inRoom()
    ? el('section.card', {},
      el('h3', {}, `أنت في غرفة ${sheikhTitle(S.room.sheikh)}`),
      el('p.muted', {}, [S.room.bus, 'رقم الغرفة ' + S.room.code].filter(Boolean).join(' — ')),
      el('p', {}, !S.live ? 'لم يبدأ العرض بعد.' : S.detached ? 'العرض جارٍ الآن، وأنت تتصفح وحدك. اضغط «تابِع الشيخ» للعودة إلى موضعه.' : 'العرض جارٍ الآن.'),
      el('div.row', {},
        el('button.btn.big.teal.grow', { type: 'button', onclick: backToSheikh, disabled: S.live ? null : true }, 'تابِع الشيخ'),
        el('button.btn.danger', { type: 'button', onclick: async () => { if (await confirmBox('هل تريد مغادرة الغرفة؟')) leaveRoom(); } }, 'مغادرة')))
    : el('section.card.join', {},
      el('label', { for: 'room-code' }, 'رقم الغرفة'),
      code,
      el('p.small', { id: 'room-help' }, 'اكتب الرقم المكوّن من 4 أرقام الذي يعلنه الشيخ في الباص.'),
      el('button.btn.huge.block', { type: 'button', onclick: () => join(code.value) }, 'ادخل الغرفة'));
  ui.main.replaceChildren(
    el('img.hero-logo', { src: 'assets/img/logo-full.png', alt: 'حملة الخلف للحج والعمرة' }),
    roomCard,
    el('h2.page-title', {}, 'الأبواب'),
    chapters.length ? el('div.chapters', {}, chapters.map(ch => {
      const n = flatSlides(ch).length;
      return el('button.chapter-btn', { type: 'button', onclick: () => go('#/ch/' + ch.id) },
        el('span', {}, ch.title, el('span.n', {}, `${n} شريحة`)), el('span.arrow', { 'aria-hidden': 'true' }, '‹'));
    })) : el('p.muted', {}, 'لا توجد أبواب منشورة بعد.'),
    el('div.row', { style: { marginTop: '16px' } },
      el('button.btn.ghost.big.grow', { type: 'button', onclick: () => go('#/search') }, '🔎 فهرس المسائل'),
      el('button.btn.ghost.big.grow', { type: 'button', onclick: () => go('#/settings') }, '⚙️ الإعدادات')),
    el('div.center', { style: { marginTop: '22px' } }, el('button.linkbtn', { type: 'button', onclick: sheikhLogin }, '🔑 دخول الشيخ')),
  );
}

// دخول الشيخ من الرابط نفسه: رقم الغرفة والرقم السري
async function sheikhLogin() {
  if (!relayConfigured()) { location.href = 'sheikh.html'; return; }
  const code = el('input.code-input', { type: 'text', inputmode: 'numeric', maxlength: 4, placeholder: 'رقم الغرفة', 'aria-label': 'رقم الغرفة', style: { fontSize: '1.6em', letterSpacing: '.2em' } });
  const pin = el('input.code-input', { type: 'password', inputmode: 'numeric', maxlength: 6, placeholder: 'الرقم السري', 'aria-label': 'الرقم السري', autocomplete: 'off', style: { fontSize: '1.6em', letterSpacing: '.2em' } });
  const msg = el('p.pending');
  await modal('دخول الشيخ', el('div', { style: { display: 'grid', gap: '10px' } }, el('p', {}, 'اكتب رقم غرفتك والرقم السري المطبوع لك.'), code, pin, msg), [
    { label: 'دخول', onClick: async close => {
      const c = toLatinDigits(code.value).replace(/\D/g, ''), p = toLatinDigits(pin.value).replace(/\D/g, '');
      try { await rpc('um_sheikh_login', { p_code: c, p_pin: p }); store.set('sh.cred', { code: c, pin: p }); close(1); location.href = 'sheikh.html'; }
      catch (e) { msg.textContent = e.message; }
    } },
    { label: 'إلغاء', value: 0, cls: 'ghost' },
  ]);
}

// ---------- الباب ----------
function visibleFor(slide) { const a = audience(); return a === 'all' || slide.audience === 'all' || slide.audience === a; }

function viewChapter(chId) {
  const ch = findChapter(S.pack, chId);
  if (!ch || ch.status !== 'published') return viewHome();
  const list = flatSlides(ch);
  const filt = audience();
  ui.main.replaceChildren(
    el('h2.page-title', {}, ch.title),
    filt !== 'all' ? el('p.small', {}, `التصفية: ${AUDIENCE[filt]} — غيّرها من الإعدادات`) : null,
    el('button.btn.big.block', { type: 'button', onclick: () => openSlide(ch.id, firstVisible(list), 0) }, 'ابدأ من أول الباب'),
    hasAyahs(ch) ? el('button.btn.big.block.teal', { type: 'button', onclick: () => go('#/recite/' + ch.id), style: { marginTop: '10px' } }, '🎧 برنامج التدريب على القراءة') : null,
    ...ch.sections.map(sec => {
      const items = list.filter(x => x.section === sec && visibleFor(x.slide));
      if (!items.length) return null;
      return el('section.card', {}, el('h3', {}, sec.title),
        el('ul.sec-list', {}, items.map(x => el('li', {}, el('button', { type: 'button', onclick: () => openSlide(ch.id, x.no, 0) },
          el('span.no', {}, x.no), el('span', {}, slideLabel(x.slide)))))));
    }));
}
const firstVisible = list => (list.find(x => visibleFor(x.slide)) || list[0])?.no || 1;

function slideLabel(s) {
  const first = s.steps.flatMap(st => st.blocks).find(b => b.type !== 'image' && !b.internal && (b.text || b.q || b.shared));
  const extra = first ? (first.text || first.q || first.shared || '').split('\n')[0].slice(0, 50) : '';
  if (s.title?.trim()) return extra && extra !== s.title ? `${s.title} — ${extra}` : s.title;
  return extra || 'شريحة';
}

// ---------- عرض الشريحة ----------
// byUser: تنقّل من المعتمر نفسه (قائمة الشرائح، البحث، التالي/السابق) = يتصفح وحده ولا يسحبه الشيخ
function openSlide(chId, no, step, byUser = true) {
  if (byUser && following()) S.detached = true;
  S.pos = { ch: chId, no, step };
  const h = `#/v/${chId}/${no}`;
  if (location.hash !== h) { S._internalNav = true; location.hash = h; } else drawSlide();
}

function viewSlide(chId, no) {
  if (S._internalNav) S._internalNav = false;
  else if (following()) S.detached = true; // تنقّل يدوي (رابط/رجوع) داخل الغرفة
  if (!S.pos || S.pos.ch !== chId || S.pos.no !== no) S.pos = { ch: chId, no, step: 0 };
  drawSlide();
}

function current() {
  const ch = findChapter(S.pack, S.pos?.ch);
  const list = ch ? flatSlides(ch) : [];
  return { ch, list, cur: list[(S.pos?.no || 1) - 1] };
}

function drawSlide(animateFrom = null) {
  const { ch, list, cur } = current();
  if (!cur) { closePlayer(); ui.main.replaceChildren(el('p', {}, 'هذه الشريحة غير موجودة في نسختك من الدرس.'), el('button.btn', { type: 'button', onclick: updateLesson }, 'حدّث الدرس')); return; }
  S.pos.step = Math.min(S.pos.step, stepCount(cur.slide));
  document.title = `${cur.slide.title || cur.section.title} — ${S.pack.settings.appName}`;
  if (viewMode() === 'list') return drawList(ch, list, cur, animateFrom);
  openPlayer();
  playerBar(); // الأشرطة أولاً حتى تُقاس مساحة المنصة الصحيحة
  const r = drawStage(ui.stage, cur.slide, ctx(), { step: S.pos.step, animateFrom, fallbackTitle: cur.section.title, onRelayout: () => drawSlide() });
  S.page = r?.pages > 1 ? r : null;
  playerBar();
}

// وضع القائمة العمودية (اختياري من الإعدادات)
function drawList(ch, list, cur, animateFrom) {
  closePlayer();
  const total = stepCount(cur.slide);
  const slide = renderSlide(cur.slide, ctx(), { step: S.pos.step, animateFrom });
  if (!cur.slide.title) slide.querySelector('.slide-title').textContent = cur.section.title;
  ui.main.replaceChildren(slide);
  const fresh = slide.querySelectorAll('.blk.reveal');
  if (fresh.length) fresh[fresh.length - 1].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  else if (animateFrom == null) scrollTo({ top: 0 });
  const prev = el('button.btn.big.ghost', { type: 'button', onclick: () => step(-1) }, '▶ السابق');
  const next = el('button.btn.big', { type: 'button', onclick: () => step(1) }, 'التالي ◀');
  prev.disabled = S.pos.no === 1 && S.pos.step === 0;
  next.disabled = S.pos.no === list.length && S.pos.step >= total;
  ui.nav.replaceChildren(el('nav.navbar', { 'aria-label': 'التنقل بين الشرائح' },
    followStrip(),
    el('div.pos', { 'aria-live': 'polite' }, `شريحة ${S.pos.no} من ${list.length}` + (total ? ` · خطوة ${S.pos.step} من ${total}` : ''), el('span.sec', {}, `${ch.title} — ${cur.section.title}`)),
    el('div.nav-row', {}, prev, next)));
}

function followStrip() {
  if (!inRoom() || !S.live) return null;
  if (following()) return el('div.follow-strip', {}, el('span.dot'), el('span.grow', {}, `تتابع ${sheikhTitle(S.room.sheikh)}`));
  return el('button.btn.teal', { type: 'button', onclick: backToSheikh }, '↩ العودة إلى موضع الشيخ');
}

// ---------- مشغّل العرض (شاشة كاملة) ----------
function openPlayer() {
  if (ui.player) return;
  const { root, bar, stage, nav } = playerShell();
  ui.player = root; ui.pbar = bar; ui.stage = stage; ui.pnav = nav; ui.pnote = el('div');
  root.insertBefore(ui.pnote, stage);
  ui.page.hidden = true;
  app.append(root);
}
function closePlayer() {
  if (!ui.player) return;
  ui.player.remove(); ui.player = null;
  ui.page.hidden = false;
}

function playerBar() {
  if (!ui.player) return;
  const { ch, list, cur } = current();
  if (!cur) return;
  const total = stepCount(cur.slide);
  const atStart = S.pos.no === 1 && S.pos.step === 0, atEnd = S.pos.no === list.length && S.pos.step >= total;
  const back = inRoom() && S.live && !following() && S.roomState?.ch;
  // لا يُعاد بناء الأزرار إلا إذا تغيّر ما فيها: إعادة بنائها مع كل حركة للشيخ قد تُضيّع لمسة المعتمر على الزر
  const sig = JSON.stringify([ch.id, cur.slide.id, S.pos.no, S.pos.step, S.page?.page, S.page?.pages, Boolean(following()), Boolean(back), explainOK(cur.slide), versionMismatch(), relayDown(), list.length]);
  if (ui.player.dataset.sig === sig) return;
  ui.player.dataset.sig = sig;
  // الشريط العلوي: رجوع، العنوان والموضع، حالة المتابعة
  ui.pbar.replaceChildren(
    el('button.pl-x', { type: 'button', onclick: () => go(inRoom() ? '#/' : '#/ch/' + ch.id), 'aria-label': 'رجوع', title: 'رجوع' }, '✕'),
    el('div.ttl', { 'aria-live': 'polite' }, el('b', {}, cur.slide.title || cur.section.title),
      el('span', {}, `شريحة ${S.pos.no} من ${list.length}` + (total ? ` · خطوة ${S.pos.step} من ${total}` : '') + (S.page ? ` · صفحة ${S.page.page}/${S.page.pages}` : ''))),
    following() ? el('div.follow-strip', { title: 'تتابع الشيخ' }, el('span.dot'), el('span', {}, 'مع الشيخ')) : null,
  );
  // الشريط السفلي: أزرار كبيرة في متناول الإبهام (الضغط عليها أثناء المتابعة = تصفح وحده)
  const extra = [
    explainOK(cur.slide) ? el('button.btn.teal', { type: 'button', onclick: () => showExplain(cur) }, '📖 شرح الشيخ') : null,
    back ? el('button.btn.teal', { type: 'button', onclick: backToSheikh }, '↩ موضع الشيخ') : null,
  ].filter(Boolean);
  ui.pnav.replaceChildren(
    extra.length ? el('div.pl-extra', {}, ...extra) : '',
    el('div.pl-main', {},
      el('button.btn.ghost', { type: 'button', onclick: () => step(-1), disabled: atStart ? true : null, 'aria-label': 'السابق' }, '▶ السابق'),
      el('button.btn', { type: 'button', onclick: () => step(1), disabled: atEnd ? true : null, 'aria-label': 'التالي' }, 'التالي ◀')));
  const notes = [];
  if (versionMismatch()) notes.push(el('div.pl-note', {}, 'الشيخ يعرض نسخة أحدث من الدرس', el('button.btn', { type: 'button', onclick: updateLesson }, 'حدّث الدرس')));
  if (relayDown()) notes.push(el('div.pl-note', {}, 'المتابعة التلقائية متوقفة — استمع للشيخ:', manualGo(true)));
  ui.pnote.replaceChildren(...notes);
}

function showExplain(cur) {
  const d = modal('شرح الشيخ', el('div', {}, paras(cur.slide.explain)), [{ label: 'إغلاق', value: 1 }]);
  document.querySelector('dialog.modal:last-of-type')?.classList.add('ex-sheet');
  return d;
}

function step(dir) {
  if (following()) S.detached = true;
  const { ch, list, cur } = current();
  const total = stepCount(cur.slide);
  if (dir > 0) {
    if (S.pos.step < total) { S.pos.step++; return drawSlide(S.pos.step - 1); }
    let n = S.pos.no + 1;
    while (n <= list.length && !visibleFor(list[n - 1].slide)) n++;
    if (n > list.length) return;
    return openSlide(ch.id, n, 0);
  }
  if (S.pos.step > 0) { S.pos.step--; return drawSlide(); }
  let n = S.pos.no - 1;
  while (n >= 1 && !visibleFor(list[n - 1].slide)) n--;
  if (n < 1) return;
  openSlide(ch.id, n, stepCount(list[n - 1].slide));
}

addEventListener('keydown', e => {
  if (!location.hash.startsWith('#/v/') || e.target.closest('input, textarea') || $('dialog[open]')) return;
  if (['ArrowLeft', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); step(1); }
  if (['ArrowRight', 'PageUp'].includes(e.key)) { e.preventDefault(); step(-1); }
});
let rz;
addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (ui.player) drawSlide(); }, 150); });

// ---------- الغرفة ----------
async function join(raw) {
  const code = toLatinDigits(raw || '').replace(/\D/g, '');
  if (code.length !== 4) return toast('رقم الغرفة 4 أرقام');
  if (!relayConfigured()) {
    await modal('المتابعة التلقائية غير متاحة', el('p', {}, 'لم تُفعَّل المتابعة التلقائية بعد. اختر الباب واتبع رقم الشريحة الذي يعلنه الشيخ بصوته.'), [{ label: 'حسناً', value: 1 }]);
    S.room = { code, sheikh: '', bus: '' };
    store.set('room', S.room);
    banners();
    return go('#/');
  }
  let info;
  try { info = await rpc('um_join', { p_code: code }); }
  catch (e) { return modal('تعذّر الدخول', el('p', {}, e.message), [{ label: 'حسناً', value: 1 }]); }
  const ok = await modal('تأكيد الغرفة', el('div', {},
    el('p', { style: { fontSize: '1.2em', fontWeight: 800 } }, `غرفة ${sheikhTitle(info.sheikh)}`),
    info.bus ? el('p.muted', {}, info.bus) : null,
    el('p', {}, 'هل هذا شيخك؟')),
  [{ label: 'نعم، تابِع الشيخ', value: true, cls: 'teal' }, { label: 'لا، رقم خاطئ', value: false, cls: 'ghost' }]);
  if (!ok) return;
  enterRoom({ code, sheikh: info.sheikh, bus: info.bus }, info);
}

function enterRoom(room, info, resumed = false) {
  S.room = room; store.set('room', room);
  S.detached = false; S.relayFails = 0;
  S.live = Boolean(info?.live);
  S.roomState = info?.state && Object.keys(info.state).length ? info.state : null;
  S.poller?.stop();
  S.poller = startPolling(room.code, { since: info?.seq || 0, onState: onRoomState, onHealth: onRelayHealth });
  banners();
  if (following()) applyRoomState(true); else if (!resumed) go('#/');
}

function onRoomState(res) {
  if (res.gone) return roomGone();
  if (res.sheikh) { S.room.sheikh = res.sheikh; S.room.bus = res.bus; store.set('room', S.room); }
  const wasLive = S.live;
  S.live = Boolean(res.live);
  if (!S.live) {
    S.roomState = null;
    if (wasLive) { hiddenCover(false); toast('انتهى عرض الشيخ. يمكنك التصفح بحرية.', 5000); }
    banners();
    if (ui.player) playerBar();
    return;
  }
  if (!wasLive) { S.detached = false; toast('بدأ الشيخ العرض', 3000); }
  if ('state' in res) S.roomState = res.state && Object.keys(res.state).length ? res.state : null;
  applyRoomState();
}

function onRelayHealth(ok) {
  const before = S.relayFails >= 2;
  S.relayFails = ok ? 0 : S.relayFails + 1;
  if (before !== (S.relayFails >= 2)) banners(); else netStatus();
}

function applyRoomState(force = false) {
  banners();
  const st = S.roomState;
  hiddenCover(following() && st?.m === 'hide');
  if (!following() && !force) return;
  if (!st?.ch) return;
  const ch = findChapter(S.pack, st.ch);
  if (!ch) return;
  const list = flatSlides(ch);
  let idx = list.findIndex(x => x.slide.id === st.s);
  if (idx < 0) idx = Math.min(list.length, Math.max(1, st.n || 1)) - 1;
  const no = idx + 1;
  const same = S.pos && S.pos.ch === ch.id && S.pos.no === no && location.hash.startsWith('#/v/');
  const prevStep = S.pos?.step ?? 0;
  S.pos = { ch: ch.id, no, step: st.k || 0 };
  if (same) drawSlide(st.k > prevStep ? prevStep : null);
  else openSlide(ch.id, no, st.k || 0, false);
}

function backToSheikh() {
  S.detached = false;
  if (S.live && S.roomState?.ch) applyRoomState(true);
  else toast('لم يبدأ الشيخ العرض بعد');
  S.poller?.now();
}

function hiddenCover(on) {
  let c = $('#cover');
  if (on && !c) {
    c = el('div.cover', { id: 'cover', role: 'dialog', 'aria-label': 'العرض مخفي' },
      el('div', {}, el('img', { src: 'assets/img/logo-full.png', alt: '' }),
        el('p.msg', {}, 'أخفى الشيخ العرض مؤقتاً'), el('p.muted', {}, 'استمع إلى الشيخ، وسيعود العرض تلقائياً.'),
        el('button.btn.ghost', { type: 'button', style: { marginTop: '14px' }, onclick: () => { S.detached = true; hiddenCover(false); drawSlide(); } }, 'تصفح وحدي')));
    document.body.append(c);
  } else if (!on && c) c.remove();
}

function forgetRoom() {
  S.poller?.stop(); S.poller = null;
  S.room = null; S.roomState = null; S.detached = false; S.live = false;
  store.del('room');
  hiddenCover(false);
  banners();
}
function roomGone() {
  forgetRoom();
  modal('انتهت الغرفة', el('p', {}, 'هذه الغرفة لم تعد قائمة. يمكنك تصفح الدرس بحرية.'), [{ label: 'حسناً', value: 1 }]);
  if (ui.player) playerBar();
}
function leaveRoom() { forgetRoom(); go('#/'); }

async function resumeRoom() {
  const saved = store.get('room');
  if (!saved?.code) return;
  if (!relayConfigured()) { S.room = saved; banners(); return; }
  try {
    const info = await rpc('um_join', { p_code: saved.code });
    enterRoom({ code: saved.code, sheikh: info.sheikh, bus: info.bus }, info, true);
  } catch (e) {
    if (e.network) { S.relayFails = 2; enterRoom(saved, null, true); return; }
    store.del('room');
    modal('انتهت الغرفة', el('p', {}, 'الغرفة التي كنت فيها لم تعد قائمة. يمكنك التصفح بحرية أو الدخول لغرفة جديدة.'), [{ label: 'حسناً', value: 1 }]);
  }
}

// ---------- فهرس المسائل ----------
let INDEX = null;
function buildIndex() {
  INDEX = [];
  for (const ch of publishedChapters(S.pack)) for (const x of flatSlides(ch)) {
    const titleN = normalizeSearch(x.slide.title + ' ' + x.section.title);
    for (const st of x.slide.steps) for (const b of st.blocks) {
      if (b.internal) continue;
      const t = blockSearchText(b);
      if (!t.trim()) continue;
      INDEX.push({ ch, x, text: t, norm: normalizeSearch(t) + ' ' + titleN, type: b.type });
    }
    if (explainOK(x.slide)) INDEX.push({ ch, x, text: x.slide.explain, norm: normalizeSearch(x.slide.explain) + ' ' + titleN, type: 'explain' });
  }
}
function hlRegex(tokens) {
  const cls = { 'ا': '[اأإآٱ]', 'ي': '[يىئ]', 'ه': '[هة]', 'و': '[وؤ]' };
  const parts = tokens.map(t => [...t].map(c => (cls[c] || c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('[\\u064B-\\u065F\\u0670\\u0640]*'));
  return new RegExp('(' + parts.join('|') + ')', 'g');
}
function highlight(text, re) {
  const out = []; let last = 0;
  text.replace(re, (m, _g, i) => { out.push(text.slice(last, i), el('mark', {}, m)); last = i + m.length; return m; });
  out.push(text.slice(last));
  return out;
}

function viewSearch() {
  if (!INDEX) buildIndex();
  const results = el('div', { 'aria-live': 'polite' });
  const inp = el('input.search-input', { type: 'search', placeholder: 'ابحث: كمامة، نظارة، الشك في الأشواط…', 'aria-label': 'ابحث في المسائل' });
  const run = () => {
    const q = normalizeSearch(inp.value);
    if (q.length < 2) { results.replaceChildren(el('p.muted', {}, 'اكتب كلمة أو كلمتين. البحث يعمل بلا إنترنت.')); return; }
    const toks = q.split(' ').filter(Boolean);
    const hits = INDEX.filter(e => toks.every(t => e.norm.includes(t)) && visibleFor(e.x.slide));
    const rank = t => ({ qa: 0, ruling: 0, text: 1, nass: 1, explain: 2 }[t] ?? 3);
    hits.sort((a, b) => rank(a.type) - rank(b.type));
    const re = hlRegex(toks);
    results.replaceChildren(
      el('p.small', {}, hits.length ? `${hits.length} نتيجة` : 'لا توجد نتائج. جرّب كلمة أخرى.'),
      ...hits.slice(0, 60).map(e => el('button.result', { type: 'button', onclick: () => { if (following()) S.detached = true; openSlide(e.ch.id, e.x.no, stepCount(e.x.slide)); } },
        el('div.r-where', {}, `${e.ch.title} — ${e.x.section.title} — شريحة ${e.x.no}`),
        el('div.r-text', {}, highlight(e.text.replace(/\n/g, ' ').slice(0, 220), re)))));
  };
  inp.addEventListener('input', run);
  ui.main.replaceChildren(el('h2.page-title', {}, 'فهرس المسائل'), inp, el('div', { style: { height: '12px' } }), results);
  run();
  inp.focus();
}

// ---------- الإعدادات ----------
function viewSettings() {
  const set = (k, v) => { store.set(k, v); applyPrefs(); };
  const prog = el('div.progress', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, el('i'));
  const progTxt = el('p.small', {}, S.cached ? `الدرس محمّل على جهازك ✓ (${fmtDate(store.get('downloaded')?.at, true)})` : 'لم يُحمّل الدرس بعد. حمّله وأنت متصل ليعمل بلا إنترنت.');
  const dl = el('button.btn.big.block.teal', { type: 'button', onclick: async () => {
    dl.disabled = true;
    try {
      await downloadLesson(S.pack, (d, t) => { const p = Math.round(100 * d / t); prog.firstChild.style.width = p + '%'; prog.setAttribute('aria-valuenow', p); progTxt.textContent = `جارٍ التحميل… ${d} من ${t}`; });
      S.cached = true; progTxt.textContent = 'اكتمل التحميل ✓ الدرس يعمل الآن بلا إنترنت'; netStatus();
    } catch (e) { progTxt.textContent = e.message; }
    dl.disabled = false;
  } }, S.cached ? 'أعد تحميل الدرس' : 'حمّل الدرس');
  const fsNow = () => `${Math.round(store.get('fontScale', 1.1) * 100)}%`;
  const fsLbl = el('span', {}, fsNow());
  const bump = d => { const v = Math.min(1.8, Math.max(0.85, +(store.get('fontScale', 1.1) + d).toFixed(2))); set('fontScale', v); fsLbl.textContent = fsNow(); };
  ui.main.replaceChildren(
    el('h2.page-title', {}, 'الإعدادات'),
    el('section.card', {},
      el('div.setting', {}, el('b', {}, 'طريقة عرض الشرائح'),
        el('p.small', {}, '«شاشة كاملة» تعرض الشريحة كلها على شاشة الجوال دون تمرير (الأفضل عند متابعة الشيخ). «قائمة» تعرضها بخط كبير مع التمرير.'),
        seg([['screen', 'شاشة كاملة'], ['list', 'قائمة بخط كبير']], viewMode(), v => store.set('viewMode', v), 'طريقة العرض')),
      el('div.setting', {}, el('b', {}, 'حجم الخط (في القوائم وطريقة القائمة)'),
        el('div.row', {}, el('button.btn.big', { type: 'button', onclick: () => bump(-0.1), 'aria-label': 'تصغير الخط' }, 'أ−'), el('span.grow.center', {}, fsLbl), el('button.btn.big', { type: 'button', onclick: () => bump(0.1), 'aria-label': 'تكبير الخط' }, 'أ+'))),
      el('div.setting', {}, el('b', {}, 'المظهر'), seg([['light', 'فاتح'], ['dark', 'داكن'], ['auto', 'تلقائي']], store.get('theme', 'auto'), v => set('theme', v), 'المظهر')),
      askingMarja(S.pack.settings) ? el('div.setting', {}, el('b', {}, 'مرجع التقليد'), marjaChooser(S.pack.settings, store.get('marja'), id => { store.set('marja', id); toast('حُفظ المرجع'); })) : null,
      el('div.setting', {}, el('b', {}, 'محرمات الرجال والنساء'), el('p.small', {}, 'اختر ما يُعرض لك عند التصفح وفي البحث.'), seg([['all', 'الكل'], ['men', 'رجال'], ['women', 'نساء']], audience(), v => { store.set('audience', v); INDEX = null; }, 'التصفية')),
      el('div.setting', {}, el('b', {}, 'توفير البيانات'), el('p.small', {}, 'يمنع تشغيل الفيديو على جوالك لتوفير الباقة.'), seg([[true, 'مفعّل'], [false, 'معطّل']], dataSaver(), v => store.set('dataSaver', v), 'توفير البيانات'))),
    el('section.card', {}, el('h3', {}, 'الدرس بلا إنترنت'), progTxt, prog, el('div', { style: { height: '10px' } }), dl,
      el('p.small', { style: { marginTop: '8px' } }, `نسخة الدرس: ${S.pack.version}`),
      el('button.btn.ghost.block', { type: 'button', style: { marginTop: '8px' }, onclick: updateLesson }, 'تحقق من تحديث الدرس')),
    el('section.card', {}, el('button.btn.ghost.block', { type: 'button', onclick: () => showTerms(S.pack.settings, false) }, 'شروط الاستخدام')),
  );
}

async function updateLesson() {
  if (!navigator.onLine) return toast('تحتاج اتصالاً بالإنترنت لتحديث الدرس');
  toast('جارٍ تحديث الدرس…');
  try {
    const fresh = await loadPack('content/pack.json', { cache: 'reload' });
    if (store.get('downloaded')) await downloadLesson(fresh, () => {});
    location.reload();
  } catch (e) { toast('تعذّر التحديث: ' + e.message); }
}

// ---------- الإقلاع ----------
async function boot() {
  applyPrefs();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyPrefs);
  enableDeterrents();
  registerSW();
  try { S.pack = await loadPack(); }
  catch (e) {
    app.replaceChildren(el('main', {}, el('img.hero-logo', { src: 'assets/img/logo-full.png', alt: 'حملة الخلف' }),
      el('div.banner', {}, 'تعذّر تحميل الدرس. تحقق من الاتصال ثم أعد المحاولة.', el('button.btn.block', { type: 'button', onclick: () => location.reload() }, 'أعد المحاولة'))));
    return;
  }
  shell();
  addEventListener('online', netStatus); addEventListener('offline', netStatus);
  addEventListener('hashchange', route);
  isLessonCached(S.pack).then(v => { S.cached = v; netStatus(); });
  await fontsReady;
  onFontsChanged(() => { if (ui.player) drawSlide(); });
  if (!store.get('termsAccepted')) await showTerms(S.pack.settings, true);
  if (askingMarja(S.pack.settings) && !store.get('marja')) await askMarja(S.pack.settings);
  route();
  resumeRoom();
}
boot();
