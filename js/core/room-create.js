// «إنشاء غرفة» من شاشة دخول الشيخ: يظهر فقط إذا سمح به المشرف من «الشيوخ والغرف».
// يكتب الشيخ اسمه (والباص اختيارياً)، فيحصل على رقم غرفة ورقم سري جديدين ويدخل بهما مباشرة.
import { el, toast } from './dom.js';
import { modal } from './ui.js';
import { rpc, relayConfigured } from './relay.js';
import { store } from './store.js';

/** هل يسمح المشرف بإنشاء الغرف؟ (لا يرمي خطأ: بلا اتصال = لا) */
export async function selfCreateAllowed() {
  if (!relayConfigured()) return false;
  try { return Boolean((await rpc('um_self_status', {}, { timeout: 6000 }))?.allowed); } catch { return false; }
}

/** نافذة إنشاء الغرفة؛ تعيد { code, pin } بعد الإنشاء وحفظ بيانات الدخول على الجهاز، أو null عند الإلغاء */
export async function createRoomDialog() {
  const name = el('input', { type: 'text', maxlength: 80, placeholder: 'مثال: الشيخ حسن الهودار', 'aria-label': 'اسم الشيخ' });
  const bus = el('input', { type: 'text', maxlength: 60, placeholder: 'مثال: الباص 3 (اختياري)', 'aria-label': 'الباص' });
  const msg = el('p.pending');
  let made = null;
  setTimeout(() => name.focus(), 50);
  await modal('إنشاء غرفة جديدة', el('div', { style: { display: 'grid', gap: '8px' } },
    el('p.small', {}, 'تحصل على رقم غرفة تعلنه للمعتمرين، ورقم سري تدخل به أنت.'),
    el('label', {}, 'اسم الشيخ'), name,
    el('label', {}, 'الباص أو المجموعة'), bus, msg), [
    { label: 'إنشاء الغرفة', onClick: async close => {
      const n = name.value.trim();
      if (n.length < 2) { msg.textContent = 'اكتب اسم الشيخ'; name.focus(); return; }
      msg.textContent = 'جارٍ الإنشاء…';
      try { made = await rpc('um_self_create', { p_sheikh: n, p_bus: bus.value.trim() }); close(1); }
      catch (e) { msg.textContent = e.message; }
    } },
    { label: 'إلغاء', value: 0, cls: 'ghost' },
  ]);
  if (!made) return null;
  const cred = { code: made.code, pin: made.pin };
  store.set('sh.cred', cred);
  const text = `${made.sheikh}${made.bus ? ' — ' + made.bus : ''}\nرقم الغرفة (للمعتمرين): ${made.code}\nالرقم السري (لك وحدك): ${made.pin}`;
  const box = (label, v) => el('div.card.center', { style: { margin: 0, padding: '10px' } }, el('div.small', {}, label), el('div', { dir: 'ltr', style: { fontSize: '2em', fontWeight: 800, letterSpacing: '.15em' } }, v));
  await modal('أُنشئت غرفتك', el('div', { style: { display: 'grid', gap: '10px' } },
    box('رقم الغرفة — أعلنه للمعتمرين', made.code),
    box('الرقم السري — لك وحدك', made.pin),
    el('p.small', {}, 'احفظ الرقم السري (صوّر الشاشة أو انسخه)، تحتاجه إذا دخلت من جهاز آخر. يبقى هذا الجهاز مسجلاً في غرفتك.'),
    el('button.btn.ghost.block', { type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(text); toast('نُسخت بيانات الغرفة'); } catch { toast('انسخها يدوياً'); } } }, 'نسخ بيانات الغرفة')),
  [{ label: 'دخول إلى غرفتي', value: 1 }], { dismissible: false });
  return cred;
}
