// سجل أنواع الكتل (registry): لإضافة نوع جديد يكفي استدعاء registerBlock من ملف صغير
// كل نوع يعرّف:
//   label    : اسمه بالعربية في المحرر
//   create() : القيم الافتراضية لكتلة جديدة
//   render(block, ctx) : يعيد عنصر DOM للعرض (ctx.viewer = 'pilgrim' | 'sheikh' | 'editor')
//   fields   : حقول التحرير العامة [{ key, label, kind: text|textarea|select|number|checkbox|image|audio|youtube|opinions, options }]
//   searchText(block) : نص يدخل في فهرس المسائل (اختياري)
//   media(block)      : ملفات يجب تحميلها مع الدرس (اختياري)

const registry = new Map();

export function registerBlock(type, def) {
  if (!def?.render) throw new Error('نوع كتلة بلا render: ' + type);
  registry.set(type, { type, fields: [], create: () => ({}), searchText: () => '', media: () => [], ...def });
}

export function blockType(type) { return registry.get(type); }
export function blockTypes() { return [...registry.values()]; }

// كتلة نوعها غير معروف (من حزمة أحدث): لا تكسر العرض
export function renderUnknown(block) {
  const d = document.createElement('div');
  d.className = 'blk unknown';
  d.textContent = 'محتوى يحتاج تحديث التطبيق';
  return d;
}
