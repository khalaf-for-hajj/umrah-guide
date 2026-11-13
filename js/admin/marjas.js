// إدارة قائمة المراجع وطريقة تحديد مرجع المعتمر
import { el, toast } from '../core/dom.js';
import { uid, flatSlides } from '../core/pack.js';
import { confirmBox } from '../core/ui.js';
import { A, changed, logChange } from './state.js';

/** يضيف مرجعاً باسم يكتبه المشرف، ويعيده (أو null) */
export function addMarja(name = prompt('اسم المرجع (مثل: الخامنئي)')) {
  name = String(name || '').replace(/^\s*(السيد|سماحة)\s+/, '').trim();
  if (!name) return null;
  const s = A.pack.settings;
  if (s.marjas.some(m => m.name === name)) { toast('هذا المرجع موجود'); return null; }
  const m = { id: uid('m'), name, aliases: [name] };
  s.marjas.push(m);
  logChange({ where: 'الإعدادات', field: 'إضافة مرجع', before: '', after: name });
  changed(); toast('أُضيف المرجع: ' + name);
  return m;
}

// عدد الأقوال المكتوبة لمرجع في الدرس كله
function usage(id) {
  let n = 0;
  for (const ch of A.pack.chapters) for (const x of flatSlides(ch)) for (const st of x.slide.steps) for (const b of st.blocks) {
    n += (b.opinions || []).filter(o => o.marja === id).length;
    n += (b.marjaCaptions?.[id] || []).filter(t => t?.trim()).length;
  }
  return n;
}

const MODES = [['ask', 'يسأل التطبيق المعتمر عن مرجعه (يرى أقوال مرجعه فقط)'], ['all', 'لا يُسأل المعتمر، وتظهر له أقوال كل المراجع']];

/** بطاقة الإعدادات: طريقة تحديد المرجع + قائمة المراجع (إضافة، تعديل، حذف، ترتيب) */
export function marjaCard(refresh) {
  const s = A.pack.settings;
  s.marjaMode = s.marjaMode || 'ask';
  const modeSel = el('select', { 'aria-label': 'طريقة تحديد مرجع المعتمر', onchange: e => {
    const before = s.marjaMode; s.marjaMode = e.target.value;
    logChange({ where: 'الإعدادات', field: 'طريقة تحديد المرجع', before, after: s.marjaMode }); changed(); refresh();
  } }, [...MODES, ...s.marjas.map(m => [m.id, `لا يُسأل المعتمر، ويرى أقوال السيد ${m.name} فقط`])].map(([v, t]) => el('option', { value: v, selected: s.marjaMode === v ? true : null }, t)));
  const newName = el('input', { type: 'text', placeholder: 'اسم المرجع الجديد', 'aria-label': 'اسم المرجع الجديد', onkeydown: e => { if (e.key === 'Enter') add(); } });
  const add = () => { if (addMarja(newName.value)) refresh(); };
  const row = (m, i) => el('div.row.marja-row', {},
    el('input', { type: 'text', value: m.name, 'aria-label': 'اسم المرجع', onchange: e => { const before = m.name; m.name = e.target.value.trim() || before; logChange({ where: 'الإعدادات', field: 'اسم مرجع', before, after: m.name }); changed(); } }),
    el('input', { type: 'text', value: (m.aliases || []).join('، '), style: { flex: 1 }, title: 'أسماء بديلة يستعملها الاستيراد للتعرف على الأقوال', 'aria-label': 'الأسماء البديلة', onchange: e => { m.aliases = e.target.value.split(/[،,]/).map(x => x.trim()).filter(Boolean); changed(); } }),
    el('span.small', {}, `${usage(m.id)} قولاً`),
    el('button.tool', { type: 'button', title: 'تقديم', disabled: i === 0 ? true : null, onclick: () => { s.marjas.splice(i - 1, 0, s.marjas.splice(i, 1)[0]); changed(); refresh(); } }, '↑'),
    el('button.tool', { type: 'button', title: 'حذف', onclick: async () => {
      const n = usage(m.id);
      if (!await confirmBox(`حذف المرجع «${m.name}»؟` + (n ? ` له ${n} قولاً في الدرس ستُحذف معه.` : ''), 'حذف')) return;
      for (const ch of A.pack.chapters) for (const x of flatSlides(ch)) for (const st of x.slide.steps) for (const b of st.blocks) {
        if (b.opinions) b.opinions = b.opinions.filter(o => o.marja !== m.id);
        if (b.marjaCaptions) delete b.marjaCaptions[m.id];
      }
      s.marjas = s.marjas.filter(x => x !== m);
      if (s.marjaMode === m.id) s.marjaMode = 'ask';
      logChange({ where: 'الإعدادات', field: 'حذف مرجع', before: m.name, after: '' }); changed(); refresh();
    } }, '🗑'));
  return el('section.card', {}, el('h3', {}, 'المراجع'),
    el('label.fld', {}, el('span', {}, 'مرجع المعتمر'), modeSel),
    el('p.small', {}, s.marjaMode === 'ask' ? 'عند أول دخول يختار المعتمر مرجعه من القائمة، ويمكنه تغييره من الإعدادات.' : 'لن يظهر للمعتمر سؤال المرجع ولا خيار المرجع في الإعدادات.'),
    el('p.small', {}, 'الأسماء تظهر للمعتمر عند اختيار المرجع وفوق أقواله. «الأسماء البديلة» يستعملها الاستيراد للتعرف على الأقوال (مفصولة بفواصل). وبعد إضافة مرجع تظهر خانته في «قول مرجع» وعبارات الرسوم في المحرر.'),
    ...s.marjas.map(row),
    el('div.row', {}, newName, el('button.btn.ghost', { type: 'button', onclick: add }, '+ إضافة مرجع')));
}
