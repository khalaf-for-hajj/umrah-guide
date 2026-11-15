// الشيوخ والغرف: رفع القائمة من إكسل، النقل بين الباصات، رحلة جديدة، طباعة البطاقات (رقم الغرفة والرقم السري)،
// رسالة قروب الواتساب، وتقرير وقت الشرح في نهاية الرحلة
import { el, toast, fmtDate, download } from '../core/dom.js';
import { rpc, relayConfigured } from '../core/relay.js';
import { confirmBox, modal } from '../core/ui.js';
import { normalizeSearch } from '../core/arabic.js';
import { A } from './state.js';
import config from '../../config.js';

const pass = () => { try { return sessionStorage.getItem('um.adminPass') || ''; } catch { return ''; } };
const setPass = v => { try { sessionStorage.setItem('um.adminPass', v); } catch { /* تجاهل */ } };
const siteLink = () => {
  const b = config.siteUrl?.trim() || location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
  return b.endsWith('/') ? b : b + '/';
};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mins = s => Math.round((s || 0) / 60);

let D = null; // آخر بيانات من المرحّل

export async function sheikhsTab(host) {
  if (!relayConfigured()) {
    host.replaceChildren(el('section.card', {}, el('h3', {}, 'المرحّل غير مضبوط'),
      el('p', {}, 'لم تُضبط بيانات Supabase في ملف config.js بعد. اتبع خطوات README ثم أعد تحميل الصفحة. يعمل التطبيق حتى ذلك الحين بالوضع اليدوي.')));
    return;
  }
  const pInp = el('input', { type: 'password', value: pass(), placeholder: 'كلمة سر المشرف', autocomplete: 'current-password', onkeydown: e => { if (e.key === 'Enter') load(); } });
  const body = el('div');
  async function load() {
    setPass(pInp.value);
    body.replaceChildren(el('div.spinner'));
    try { D = await rpc('um_admin_list', { p_pass: pass() }); }
    catch (e) { body.replaceChildren(el('div.banner', {}, e.message)); return; }
    render();
  }
  const call = async (fn, args) => {
    try { const r = await rpc(fn, { p_pass: pass(), ...args }); if (r.rooms) D.rooms = r.rooms; return r; }
    catch (e) { toast(e.message); throw e; }
  };

  function render() {
    body.replaceChildren(
      el('section.card', {}, el('h3', {}, `الرحلة الحالية: ${D.trip_name || '—'}`),
        el('p.small', {}, `${D.rooms.length} غرفة — ${D.rooms.filter(r => r.live).length} تعرض الآن. لكل شيخ غرفة ثابتة طوال الرحلة: رقم الغرفة يعلنه للمعتمرين، والرقم السري يدخل به من الرابط نفسه («دخول الشيخ» أسفل الصفحة الرئيسية).`),
        el('div.row', {},
          el('button.btn', { type: 'button', onclick: printCards }, '🖨 طباعة بطاقات الشيوخ'),
          el('button.btn.teal', { type: 'button', onclick: groupMessage }, 'رسالة قروب الواتساب'),
          el('button.btn.ghost', { type: 'button', onclick: () => document.getElementById('time-report')?.scrollIntoView({ behavior: 'smooth' }) }, 'تقرير الوقت ↓'))),
      selfCard(),
      uploadCard(),
      roomsCard(),
      reportCard(),
      el('section.card', {}, el('h3', {}, 'الإغلاق التلقائي'),
        el('div.row', {}, el('span', {}, 'يُغلق العرض بعد'), (() => { const i = el('input', { type: 'number', min: 1, max: 72, value: D.idle_hours, style: { width: '90px' } }); i.addEventListener('change', async () => { await call('um_admin_set_idle_hours', { p_hours: Number(i.value) }); toast('حُفظ'); }); return i; })(), el('span', {}, 'ساعة بلا نشاط من الشيخ'))),
    );
  }

  // ---------- السماح للشيوخ بإنشاء غرفهم ----------
  function selfCard() {
    const on = Boolean(D.self_create);
    const mine = D.rooms.filter(r => r.self_made).length;
    const set = async v => { await call('um_admin_set_self_create', { p_on: v }); D.self_create = v; toast(v ? 'فُتح إنشاء الغرف' : 'أُغلق إنشاء الغرف'); render(); };
    return el('section.card', {}, el('h3', {}, 'إنشاء الغرف من شاشة الشيخ'),
      el('p.small', {}, 'عند الفتح يظهر زر «+ إنشاء غرفة جديدة» في «دخول الشيخ»: يكتب الشيخ اسمه فيحصل على رقم غرفة ورقم سري ويبدأ العرض مباشرة. عند الإغلاق يختفي الزر، وتبقى الغرف التي أُنشئت تعمل حتى تحذفها أو تعطّلها.'),
      el('div.row', {},
        el('span', {}, 'الحالة: ', el('b', { style: { color: on ? 'var(--teal)' : 'var(--red)' } }, on ? 'مفتوح' : 'مغلق')),
        on ? el('button.btn.danger', { type: 'button', onclick: () => set(false) }, 'أغلق إنشاء الغرف')
          : el('button.btn.teal', { type: 'button', onclick: () => set(true) }, 'افتح إنشاء الغرف'),
        mine ? el('span.small', {}, `أنشأ الشيوخ ${mine} غرفة (معلّمة بـ «أنشأها الشيخ» في الجدول).`) : null));
  }

  // ---------- رفع القائمة من إكسل ----------
  function uploadCard() {
    const preview = el('div');
    const file = el('input', { type: 'file', accept: '.xlsx,.xls,.csv', onchange: async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const rows = await readSheet(f);
        if (!rows.length) throw new Error('لم أجد أسماء في الملف');
        showPreview(rows);
      } catch (err) { preview.replaceChildren(el('div.banner', {}, 'تعذّرت قراءة الملف: ' + err.message)); }
    } });
    function showPreview(rows) {
      const trip = el('input', { type: 'text', placeholder: 'اسم الرحلة (مثل: عمرة رجب 1448)', value: '', style: { minWidth: '260px' } });
      preview.replaceChildren(
        el('p', {}, `وجدت ${rows.length} شيخاً:`),
        el('div.logtable', {}, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, 'اسم الشيخ'), el('th', {}, 'الباص'))),
          el('tbody', {}, rows.map((r, i) => el('tr', {}, el('td', {}, i + 1), el('td', {}, r.sheikh), el('td', {}, r.bus)))))),
        el('div.row', { style: { marginTop: '10px' } },
          el('button.btn', { type: 'button', onclick: async () => { await call('um_admin_import', { p_rows: rows, p_replace: false }); toast(`أُضيف ${rows.length} شيخاً`); render(); } }, 'أضفهم إلى القائمة الحالية')),
        el('div.card', { style: { marginTop: '10px', borderColor: 'var(--red)' } },
          el('b', {}, 'رحلة جديدة: '), el('span.small', {}, 'تُحذف الأسماء والغرف وتقرير الوقت الحالي، وتُرفع هذه القائمة بأرقام غرف وأرقام سرية جديدة. نزّل تقرير الوقت قبلها.'),
          el('div.row', { style: { marginTop: '8px' } }, trip,
            el('button.btn.danger', { type: 'button', onclick: async () => {
              if (!(await confirmBox(`بدء رحلة جديدة؟ ستُحذف ${D.rooms.length} غرفة وتقرير الوقت الحالي نهائياً.`, 'نعم، رحلة جديدة', 'تراجع'))) return;
              await call('um_admin_import', { p_rows: rows, p_replace: true, p_trip: trip.value.trim() || null });
              D = await rpc('um_admin_list', { p_pass: pass() });
              toast('بدأت رحلة جديدة'); render();
            } }, 'احذف القائمة الحالية وارفع هذه'))));
    }
    return el('section.card', {}, el('h3', {}, 'رفع قائمة الشيوخ من إكسل'),
      el('p.small', {}, 'ملف إكسل (أو CSV) فيه عمودان: «اسم الشيخ» و«الباص». الصف الأول عناوين.'),
      el('div.row', {}, file, el('button.btn.ghost', { type: 'button', onclick: template }, 'تنزيل نموذج إكسل')),
      preview);
  }

  // ---------- جدول الغرف ----------
  function roomsCard() {
    const buses = [...new Set(D.rooms.map(r => r.bus).filter(Boolean))];
    const dl = el('datalist', { id: 'buses' }, buses.map(b => el('option', { value: b })));
    const nS = el('input', { type: 'text', placeholder: 'اسم الشيخ' }), nB = el('input', { type: 'text', placeholder: 'الباص', list: 'buses' });
    return el('section.card', {}, el('h3', {}, `الشيوخ والغرف (${D.rooms.length})`), dl,
      el('p.small', {}, 'لنقل شيخ إلى باص آخر غيّر خانة الباص ثم «حفظ» — يبقى رقم غرفته ورقمه السري كما هما.'),
      el('div.logtable', {}, el('table', {}, el('thead', {}, el('tr', {}, ['#', 'الشيخ', 'الباص', 'رقم الغرفة', 'الرقم السري', 'الحالة', ''].map(h => el('th', {}, h)))),
        el('tbody', {}, D.rooms.map((r, i) => {
          const s = el('input', { type: 'text', value: r.sheikh, style: { minWidth: '150px' } });
          const b = el('input', { type: 'text', value: r.bus, list: 'buses', style: { width: '110px' } });
          const pin = el('span', { dir: 'ltr', style: { fontWeight: 800, letterSpacing: '.1em' } }, '••••••');
          let shown = false;
          return el('tr', { style: r.active ? {} : { opacity: .5 } },
            el('td', {}, i + 1), el('td', {}, s, r.self_made ? el('div.small', { style: { color: 'var(--teal)' } }, 'أنشأها الشيخ') : null), el('td', {}, b),
            el('td', {}, el('b', { dir: 'ltr', style: { fontSize: '1.2em' } }, r.code)),
            el('td', {}, pin, ' ', el('button.tool', { type: 'button', onclick: () => { shown = !shown; pin.textContent = shown ? r.pin : '••••••'; } }, '👁')),
            el('td', {}, !r.active ? 'معطّلة' : r.live ? `🟢 يعرض${r.state?.n ? ' — شريحة ' + r.state.n : ''}` : '—'),
            el('td', {}, el('div.row', {},
              el('button.tool', { type: 'button', onclick: async () => { await call('um_admin_update_room', { p_code: r.code, p_sheikh: s.value, p_bus: b.value, p_active: r.active }); toast('حُفظ'); render(); } }, 'حفظ'),
              el('button.tool', { type: 'button', onclick: async () => { if (await confirmBox(`رقم سري جديد لغرفة ${r.code}؟ يبطل القديم فوراً، فاطبع بطاقته من جديد.`)) { await call('um_admin_regen_pin', { p_code: r.code }); render(); } } }, 'رقم سري جديد'),
              r.live ? el('button.tool', { type: 'button', onclick: async () => { if (await confirmBox(`إنهاء عرض غرفة ${r.code}؟`)) { await call('um_admin_end_session', { p_code: r.code }); render(); } } }, 'إنهاء العرض') : null,
              el('button.tool', { type: 'button', onclick: async () => { await call('um_admin_update_room', { p_code: r.code, p_sheikh: r.sheikh, p_bus: r.bus, p_active: !r.active }); render(); } }, r.active ? 'تعطيل' : 'تفعيل'),
              el('button.tool.danger', { type: 'button', onclick: async () => { if (await confirmBox(`حذف غرفة ${r.code} (${r.sheikh})؟`)) { await call('um_admin_delete_room', { p_code: r.code }); render(); } } }, 'حذف'))));
        })))),
      el('div.row', { style: { marginTop: '10px' } }, nS, nB,
        el('button.btn', { type: 'button', onclick: async () => {
          if (!nS.value.trim()) return toast('اكتب اسم الشيخ');
          await call('um_admin_import', { p_rows: [{ sheikh: nS.value.trim(), bus: nB.value.trim() }], p_replace: false }); render();
        } }, '+ إضافة شيخ')));
  }

  // ---------- تقرير الوقت ----------
  function reportCard() {
    const R = buildReport();
    const over = (s, m) => m && s > m * 60;
    return el('section.card', { id: 'time-report' }, el('h3', {}, 'تقرير وقت الشرح'),
      el('p.small', {}, 'يُحسب الوقت على جهاز الشيخ أثناء العرض (والعرض ظاهر)، لكل باب وقسم، ويُقارن بالدقائق المحددة في المحرر. الأحمر = تجاوز.'),
      el('div.row', {},
        el('button.btn', { type: 'button', onclick: () => exportReport(R) }, 'تنزيل التقرير (إكسل)'),
        el('button.btn.ghost', { type: 'button', onclick: () => printReport(R) }, 'طباعة التقرير'),
        el('button.btn.ghost', { type: 'button', onclick: load }, 'تحديث'),
        R.length ? el('button.btn.danger', { type: 'button', onclick: async () => {
          if (!(await confirmBox('مسح تقرير وقت الشرح نهائياً؟ نزّل التقرير (إكسل) قبل المسح إن احتجته. العروض الجارية الآن لا تُمسح.', 'نعم، امسح التقرير', 'تراجع'))) return;
          const r = await call('um_admin_clear_report', {}); toast(`مُسح التقرير (${r.deleted} عرض)`); load();
        } }, '🗑 مسح التقرير') : null),
      R.length ? el('div.logtable', { style: { marginTop: '10px' } }, el('table', {},
        el('thead', {}, el('tr', {}, ['الشيخ', 'الباص', 'الغرفة', 'العروض', 'مدة الشرح', 'تفصيل الأبواب'].map(h => el('th', {}, h)))),
        el('tbody', {}, R.map(x => el('tr', {},
          el('td', {}, x.sheikh), el('td', {}, x.bus), el('td', { dir: 'ltr' }, x.code), el('td', {}, x.sessions.length),
          el('td', {}, el('b', {}, mins(x.total) + ' د')),
          el('td', {}, Object.values(x.ch).map(c => el('div', { style: { color: over(c.s, c.m) ? 'var(--red)' : '' } },
            el('b', {}, `${c.t}: ${mins(c.s)} د${c.m ? ' من ' + c.m : ''}${over(c.s, c.m) ? ' ⚠ تجاوز ' + (mins(c.s) - c.m) + ' د' : ''}`),
            el('div.small', {}, Object.values(c.sec).map(s => `${s.t}: ${mins(s.s)}${s.m ? '/' + s.m : ''} د`).join(' · '))))))))))
        : el('p.muted', {}, 'لا توجد عروض مسجّلة في هذه الرحلة بعد.'));
  }

  host.replaceChildren(
    el('section.card', {}, el('h3', {}, 'الدخول'), el('p.small', {}, 'كلمة سر المشرف التي ضبطتها في Supabase (لا تُحفظ إلا في هذه الجلسة).'),
      el('div.row', {}, pInp, el('button.btn', { type: 'button', onclick: load }, 'عرض الشيوخ والغرف'))),
    body);
  if (pass()) load();
}

// قراءة ملف إكسل/CSV: يتعرف على عمودي «الشيخ» و«الباص» من العناوين
async function readSheet(file) {
  if (!globalThis.XLSX) throw new Error('مكتبة إكسل غير محمّلة');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: '' });
  if (!aoa.length) return [];
  const head = aoa[0].map(h => normalizeSearch(String(h)));
  let si = head.findIndex(h => /شيخ|اسم|name|sheikh/.test(h));
  let bi = head.findIndex(h => /باص|حافل|bus|سياره/.test(h));
  let start = 1;
  if (si < 0 && bi < 0) { si = 0; bi = 1; start = 0; }
  if (si < 0) si = bi === 0 ? 1 : 0;
  if (bi < 0) bi = si === 0 ? 1 : 0;
  return aoa.slice(start).map(r => ({ sheikh: String(r[si] ?? '').trim(), bus: String(r[bi] ?? '').trim() })).filter(r => r.sheikh);
}

function template() {
  const ws = XLSX.utils.aoa_to_sheet([['اسم الشيخ', 'الباص'], ['الشيخ حسن الهودار', 'الباص 1'], ['الشيخ …', 'الباص 2']]);
  ws['!cols'] = [{ wch: 30 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, 'الشيوخ');
  XLSX.writeFile(wb, 'نموذج-الشيوخ.xlsx');
}

// ---------- البطاقات ورسالة القروب ----------
function printCards() {
  const link = siteLink();
  const rooms = D.rooms.filter(r => r.active);
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>بطاقات الشيوخ</title><base href="${esc(location.href.replace(/[^/]*$/, ''))}">
<style>
@font-face{font-family:Tajawal;src:url(assets/fonts/tajawal-arabic-400-normal.woff2) format('woff2')}
@font-face{font-family:Tajawal;font-weight:800;src:url(assets/fonts/tajawal-arabic-800-normal.woff2) format('woff2')}
@page{size:A4;margin:10mm} body{font-family:Tajawal,Tahoma,sans-serif;margin:0;color:#111}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
.card{border:2px dashed #a87b1e;border-radius:10px;padding:5mm;break-inside:avoid;text-align:center}
.card img{width:22mm;height:22mm;object-fit:contain}
.name{font-size:15pt;font-weight:800;color:#23558f}.bus{font-size:11pt;color:#555}
.k{display:flex;justify-content:space-around;margin:3mm 0}.k div{border:1.5px solid #a87b1e;border-radius:8px;padding:2mm 4mm}
.k small{display:block;font-size:9pt;color:#7a5a14}.k b{font-size:22pt;letter-spacing:2px;direction:ltr;display:block}
.how{font-size:9pt;text-align:start;color:#333;line-height:1.6}.link{direction:ltr;font-size:9pt;color:#23558f}
</style></head><body><div class="grid">
${rooms.map(r => `<div class="card"><img src="assets/img/logo-full.png" alt="">
<div class="name">${esc(r.sheikh)}</div><div class="bus">${esc(r.bus)}</div>
<div class="k"><div><small>رقم الغرفة (يُعلن للمعتمرين)</small><b>${esc(r.code)}</b></div><div><small>الرقم السري (لك وحدك)</small><b>${esc(r.pin)}</b></div></div>
<div class="how">١- افتح رابط الدليل: <span class="link">${esc(link)}</span><br>٢- اضغط «دخول الشيخ» أسفل الصفحة، واكتب رقم الغرفة والرقم السري.<br>٣- اضغط «ابدأ العرض» وأعلن رقم الغرفة للمعتمرين.</div></div>`).join('')}
</div><script>window.onload=()=>setTimeout(()=>print(),300)<\/script></body></html>`;
  const w = open('', '_blank');
  if (!w) return toast('اسمح بالنوافذ المنبثقة للطباعة');
  w.document.open(); w.document.write(html); w.document.close();
}

function groupMessage() {
  const rooms = D.rooms.filter(r => r.active);
  const byBus = [...rooms].sort((a, b) => a.bus.localeCompare(b.bus, 'ar', { numeric: true }));
  const text = `السلام عليكم ورحمة الله\n«${A.pack?.settings.appName || 'الدليل التفاعلي للمعتمر'}» — ${A.pack?.settings.org || ''}\nالرابط: ${siteLink()}\n\nأرقام الغرف:\n${byBus.map(r => `• ${r.bus || '—'}: الشيخ ${r.sheikh} — غرفة ${r.code}`).join('\n')}\n\nللمعتمر: افتح الرابط واكتب رقم غرفة شيخك.\nللشيخ: «دخول الشيخ» أسفل الصفحة برقم غرفتك والرقم السري المطبوع لك.`;
  modal('رسالة قروب الواتساب', el('div', {},
    el('p.small', {}, 'لا تحتوي الرسالة على الأرقام السرية.'),
    el('textarea', { rows: 12, readonly: true, style: { width: '100%' } }, text),
    el('div.row', {},
      el('button.btn', { type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(text); toast('نُسخت الرسالة'); } catch { toast('انسخها يدوياً'); } } }, 'نسخ'),
      el('a.btn.teal', { href: 'https://wa.me/?text=' + encodeURIComponent(text), target: '_blank', rel: 'noopener' }, 'افتح في واتساب'))),
  [{ label: 'إغلاق', value: 1 }]);
}

// ---------- تقرير الوقت ----------
function buildReport() {
  const chMin = id => A.pack?.chapters.find(c => c.id === id)?.minutes;
  const secMin = (cid, sid) => A.pack?.chapters.find(c => c.id === cid)?.sections.find(s => s.id === sid)?.minutes;
  const by = new Map();
  for (const s of D.sessions || []) {
    const key = s.code + '|' + s.sheikh;
    const x = by.get(key) || { sheikh: s.sheikh, bus: s.bus, code: s.code, sessions: [], total: 0, ch: {} };
    const end = new Date(s.ended_at || s.last_activity), start = new Date(s.started_at);
    x.sessions.push({ start: s.started_at, end: s.ended_at, open: !s.ended_at, dur: Math.max(0, (end - start) / 1000), talk: s.stats?.total || 0 });
    x.total += s.stats?.total || 0;
    for (const [cid, c] of Object.entries(s.stats?.ch || {})) {
      const t = x.ch[cid] ??= { t: c.t, m: chMin(cid) ?? c.m, s: 0, sec: {} };
      t.s += c.s || 0;
      for (const [sid, sc] of Object.entries(c.sec || {})) {
        const u = t.sec[sid] ??= { t: sc.t, m: secMin(cid, sid) ?? sc.m, s: 0 };
        u.s += sc.s || 0;
      }
    }
    by.set(key, x);
  }
  return [...by.values()].sort((a, b) => a.bus.localeCompare(b.bus, 'ar', { numeric: true }));
}

function exportReport(R) {
  if (!globalThis.XLSX) return toast('مكتبة إكسل غير محمّلة');
  const over = (s, m) => (m && s > m * 60 ? 'نعم' : '');
  const sum = [['الشيخ', 'الباص', 'الغرفة', 'عدد العروض', 'مدة الشرح (دقيقة)', 'الباب', 'الدقائق المستخدمة', 'الدقائق المحددة', 'تجاوز؟', 'مقدار التجاوز (دقيقة)']];
  const sec = [['الشيخ', 'الباص', 'الباب', 'القسم', 'الدقائق المستخدمة', 'الدقائق المحددة', 'تجاوز؟']];
  const ses = [['الشيخ', 'الباص', 'الغرفة', 'بدأ', 'انتهى', 'مدة الجلسة (دقيقة)', 'وقت الشرح (دقيقة)']];
  for (const x of R) {
    const chs = Object.values(x.ch);
    if (!chs.length) sum.push([x.sheikh, x.bus, x.code, x.sessions.length, mins(x.total), '', '', '', '', '']);
    for (const c of chs) {
      sum.push([x.sheikh, x.bus, x.code, x.sessions.length, mins(x.total), c.t, mins(c.s), c.m || '', over(c.s, c.m), c.m && c.s > c.m * 60 ? mins(c.s) - c.m : '']);
      for (const s of Object.values(c.sec)) sec.push([x.sheikh, x.bus, c.t, s.t, mins(s.s), s.m || '', over(s.s, s.m)]);
    }
    for (const s of x.sessions) ses.push([x.sheikh, x.bus, x.code, fmtDate(s.start, true), s.end ? fmtDate(s.end, true) : 'لم يُنهِه الشيخ', mins(s.dur), mins(s.talk)]);
  }
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  for (const [name, aoa] of [['الملخص', sum], ['الأقسام', sec], ['العروض', ses]]) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = aoa[0].map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, `تقرير-وقت-الشرح-${(D.trip_name || 'الرحلة').replace(/\s+/g, '-')}.xlsx`);
}

function printReport(R) {
  const over = (s, m) => m && s > m * 60;
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير وقت الشرح</title><base href="${esc(location.href.replace(/[^/]*$/, ''))}">
<style>@font-face{font-family:Tajawal;src:url(assets/fonts/tajawal-arabic-400-normal.woff2) format('woff2')}
@font-face{font-family:Tajawal;font-weight:800;src:url(assets/fonts/tajawal-arabic-800-normal.woff2) format('woff2')}
@page{size:A4;margin:12mm} body{font-family:Tajawal,Tahoma,sans-serif;font-size:11pt;color:#111}
h1{font-size:16pt;color:#a87b1e;margin:0 0 4mm} table{border-collapse:collapse;width:100%} th,td{border:1px solid #bbb;padding:2mm;vertical-align:top;text-align:start}
th{background:#f6ecd6} .over{color:#b3261e;font-weight:800} small{color:#555}</style></head><body>
<h1>تقرير وقت الشرح — ${esc(D.trip_name || '')}</h1><p><small>طُبع ${esc(fmtDate(new Date().toISOString(), true))}</small></p>
<table><thead><tr><th>الشيخ</th><th>الباص</th><th>العروض</th><th>مدة الشرح</th><th>الأبواب والأقسام (المستخدم / المحدد بالدقائق)</th></tr></thead><tbody>
${R.map(x => `<tr><td>${esc(x.sheikh)}</td><td>${esc(x.bus)}</td><td>${x.sessions.length}</td><td><b>${mins(x.total)} د</b></td><td>${Object.values(x.ch).map(c => `<div class="${over(c.s, c.m) ? 'over' : ''}"><b>${esc(c.t)}: ${mins(c.s)}${c.m ? ' / ' + c.m : ''}${over(c.s, c.m) ? ' — تجاوز ' + (mins(c.s) - c.m) + ' د' : ''}</b></div><small>${Object.values(c.sec).map(s => `<span class="${over(s.s, s.m) ? 'over' : ''}">${esc(s.t)}: ${mins(s.s)}${s.m ? '/' + s.m : ''}</span>`).join(' · ')}</small>`).join('')}</td></tr>`).join('')}
</tbody></table><script>window.onload=()=>setTimeout(()=>print(),300)<\/script></body></html>`;
  const w = open('', '_blank');
  if (!w) return toast('اسمح بالنوافذ المنبثقة للطباعة');
  w.document.open(); w.document.write(html); w.document.close();
}
