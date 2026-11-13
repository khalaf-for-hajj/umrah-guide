// عناصر واجهة مشتركة: النوافذ، التذييل، المظهر، الشروط، اختيار المرجع
import { el, paras } from './dom.js';
import { store } from './store.js';

export function applyPrefs() {
  const root = document.documentElement;
  const fs = store.get('fontScale', 1.1);
  root.style.setProperty('--fs', String(fs));
  const theme = store.get('theme', 'auto');
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#111819' : '#a87b1e');
}

/** نافذة حوارية بسيطة. يعيد Promise بقيمة الإغلاق */
export function modal(title, body, actions = [], { dismissible = true } = {}) {
  return new Promise(resolve => {
    const d = el('dialog.modal', { 'aria-label': title });
    const close = v => { d.close(); d.remove(); resolve(v); };
    d.append(
      el('div.m-head', {}, title),
      el('div.m-body', {}, body),
      actions.length ? el('div.m-foot', {}, actions.map(a => el('button.btn.big.block' + (a.cls ? '.' + a.cls : ''), { type: 'button', onclick: () => a.onClick ? a.onClick(close) : close(a.value) }, a.label))) : null,
    );
    d.addEventListener('cancel', e => { if (!dismissible) e.preventDefault(); else close(null); });
    document.body.append(d);
    d.showModal();
  });
}

export function confirmBox(msg, yes = 'نعم', no = 'لا') {
  return modal('تأكيد', el('p', {}, msg), [{ label: yes, value: true }, { label: no, value: false, cls: 'ghost' }]);
}

export function footer(settings, onTerms) {
  return el('footer.foot', {},
    el('p.disc', {}, settings.disclaimer),
    el('p', {}, settings.copyright),
    onTerms ? el('p', {}, el('button', { type: 'button', onclick: onTerms }, 'شروط الاستخدام')) : null);
}

export async function showTerms(settings, mustAccept) {
  const body = el('div', {}, paras(settings.terms));
  if (mustAccept) {
    await modal('شروط الاستخدام', body, [{ label: 'أوافق على الشروط', value: true }], { dismissible: false });
    store.set('termsAccepted', new Date().toISOString());
  } else {
    await modal('شروط الاستخدام', body, [{ label: 'إغلاق', value: true }]);
  }
}

export const MARJA_OTHER = 'other';

export function marjaChooser(settings, current, onPick) {
  const opts = [...settings.marjas.map(m => ({ id: m.id, name: m.name })), { id: MARJA_OTHER, name: 'آخر أو لا أدري' }];
  const wrap = el('div', { role: 'group', 'aria-label': 'اختر مرجعك' });
  const draw = (cur) => wrap.replaceChildren(...opts.map(o => el('button.choice', {
    type: 'button', 'aria-pressed': String(cur === o.id), onclick: () => { draw(o.id); onPick(o.id); },
  }, o.id === MARJA_OTHER ? o.name : 'السيد ' + o.name, el('span.tick', {}, '✓'))));
  draw(current);
  return wrap;
}

export async function askMarja(settings) {
  let picked = store.get('marja');
  const body = el('div', {},
    el('p', {}, 'اختر مرجع تقليدك مرة واحدة، فتظهر لك أقواله في المسائل. يُحفظ اختيارك على جهازك فقط، ويمكنك تغييره من الإعدادات.'),
    el('p.small', {}, 'من اختار «آخر أو لا أدري» يرى الأقوال كلها.'),
    marjaChooser(settings, picked, id => { picked = id; }));
  await modal('مرجع التقليد', body, [{
    label: 'متابعة', onClick: close => { if (!picked) return; store.set('marja', picked); close(picked); },
  }], { dismissible: false });
  return picked;
}

export function seg(options, current, onPick, label) {
  const w = el('div.seg', { role: 'group', 'aria-label': label || '' });
  const draw = cur => w.replaceChildren(...options.map(([v, t]) => el('button', { type: 'button', 'aria-pressed': String(cur === v), onclick: () => { draw(v); onPick(v); } }, t)));
  draw(current);
  return w;
}

// «الشيخ فلان» دون تكرار اللقب إن كان في الاسم
export const sheikhTitle = n => { const t = String(n || '').trim(); return /^(الشيخ|شيخ|السيد|سماحة|الأستاذ)\s/.test(t) ? t : 'الشيخ ' + t; };
