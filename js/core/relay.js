// عميل المرحّل (Supabase RPC عبر PostgREST) — بلا مكتبات خارجية
import config from '../../config.js';

const ERR = {
  UM_ROOM_NOT_FOUND: 'لا توجد غرفة قائمة بهذا الرقم. تأكد من الرقم الذي أعلنه الشيخ.',
  UM_ROOM_ENDED: 'انتهت هذه الغرفة.',
  UM_TOO_MANY: 'محاولات كثيرة خاطئة. انتظر ربع ساعة ثم حاول مرة أخرى.',
  UM_BAD_PIN: 'رقم الغرفة أو الرقم السري غير صحيح.',
  UM_NOT_LIVE: 'لم يبدأ العرض بعد.',
  UM_RATE: 'طلبات كثيرة في وقت قصير. سيُعاد الإرسال تلقائياً.',
  UM_STATE_TOO_BIG: 'حالة العرض أكبر من المسموح.',
  UM_BAD_ADMIN: 'كلمة سر المشرف غير صحيحة.',
  UM_NO_CODES: 'لا توجد أرقام غرف متاحة الآن. حاول بعد قليل.',
  UM_BAD_INPUT: 'بيانات غير صالحة.',
};

export class RelayError extends Error {
  constructor(code, message, network = false) { super(message); this.code = code; this.network = network; }
}

export const relayConfigured = () => Boolean(config.relayUrl && config.relayAnonKey);
// المفتاح العام الجديد (sb_publishable_…) يُرسل في apikey وحده؛ والمفتاح القديم (anon، يبدأ بـ eyJ) يُرسل أيضاً في Authorization
export function relayHeaders() {
  const k = String(config.relayAnonKey || '').trim();
  return { apikey: k, ...(k.startsWith('eyJ') ? { Authorization: `Bearer ${k}` } : {}), 'Content-Type': 'application/json' };
}

export async function rpc(fn, args = {}, { timeout = 9000 } = {}) {
  if (!relayConfigured()) throw new RelayError('UM_OFF', 'المتابعة التلقائية غير مضبوطة', true);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  let r;
  try {
    r = await fetch(`${config.relayUrl.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST', signal: ctl.signal, cache: 'no-store',
      headers: relayHeaders(),
      body: JSON.stringify(args),
    });
  } catch (e) {
    throw new RelayError('UM_NET', 'تعذّر الاتصال بالخادم', true);
  } finally { clearTimeout(t); }
  let data = null;
  try { data = await r.json(); } catch { /* رد فارغ */ }
  if (!r.ok) {
    const code = (data?.message || '').match(/UM_[A-Z_]+/)?.[0] || 'UM_SERVER';
    throw new RelayError(code, ERR[code] || 'خطأ في الخادم، حاول لاحقاً', r.status >= 500 || r.status === 404);
  }
  // الأخطاء المتوقعة تعود من الدوال بصيغة {"error": "UM_..."}
  if (data && typeof data === 'object' && data.error) throw new RelayError(data.error, ERR[data.error] || 'خطأ غير متوقع');
  return data;
}

/**
 * متابعة الغرفة: um_poll كل 4 ثوانٍ تقريباً (± عشوائي)، يتوقف عند إخفاء الصفحة، ويزيد الفاصل عند الأخطاء
 * onState({seq, state, ended}) ، onHealth(ok:boolean, err)
 */
export function startPolling(code, { onState, onHealth, since = 0 } = {}) {
  const base = config.pollMs || 4000;
  let seq = since, timer = null, stopped = false, fails = 0, inflight = false;
  const jitter = ms => ms + (Math.random() * 0.4 - 0.2) * ms;
  const next = () => {
    clearTimeout(timer);
    if (stopped || document.hidden) return;
    const wait = fails ? Math.min(30000, base * 2 ** fails) : base;
    timer = setTimeout(tick, jitter(wait));
  };
  async function tick() {
    if (stopped || inflight) return;
    inflight = true;
    try {
      const res = await rpc('um_poll', { p_code: code, p_since: seq });
      fails = 0;
      onHealth?.(true);
      if (res?.gone) { onState?.(res); stopped = true; return; }
      if (res && res.seq > seq) { seq = res.seq; onState?.(res); }
    } catch (e) {
      fails = Math.min(fails + 1, 4);
      onHealth?.(false, e);
    } finally { inflight = false; next(); }
  }
  const vis = () => { if (!document.hidden) { tick(); } else clearTimeout(timer); };
  document.addEventListener('visibilitychange', vis);
  addEventListener('online', vis);
  tick();
  return {
    stop() { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', vis); removeEventListener('online', vis); },
    now: () => tick(),
  };
}
