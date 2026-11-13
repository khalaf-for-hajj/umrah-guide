// منشئ عناصر صغير

// replaceChildren الأصلية تكتب null نصاً؛ نتجاهل القيم الفارغة كما يفعل el()
if (!Element.prototype.__umSafe) {
  const orig = Element.prototype.replaceChildren;
  Element.prototype.replaceChildren = function (...kids) { return orig.apply(this, kids.flat(Infinity).filter(k => k != null && k !== false)); };
  Element.prototype.__umSafe = true;
}
export function el(tag, attrs = {}, ...kids) {
  const [t, ...cls] = tag.split('.');
  const n = document.createElement(t || 'div');
  if (cls.length) n.className = cls.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className += (n.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (v === true) n.setAttribute(k, '');
    else n.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// فقرات من نص متعدد الأسطر
export function paras(text, cls = '') {
  return String(text ?? '').split('\n').filter(l => l.trim() !== '').map(l => el('p' + (cls ? '.' + cls : ''), {}, l));
}

// رسالة عابرة أسفل الشاشة
export function toast(msg, ms = 3200) {
  let host = $('#toasts');
  if (!host) { host = el('div.toasts', { id: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(host); }
  const t = el('div.toast', {}, msg);
  host.append(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

// تنسيق التاريخ بتوقيت الرياض
export function fmtDate(iso, withTime = false) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
      timeZone: 'Asia/Riyadh', year: 'numeric', month: 'short', day: 'numeric',
      ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    }).format(new Date(iso));
  } catch { return iso; }
}

export function download(name, blobOrText, type = 'application/json') {
  const blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type });
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
