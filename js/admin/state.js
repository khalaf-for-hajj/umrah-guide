// حالة المحرر: نسخة العمل في IndexedDB مع حفظ تلقائي، والصور المرفوعة، وسجل التعديلات
import { idb, store } from '../core/store.js';
import { loadPack, migrate, flatSlides } from '../core/pack.js';

const db = idb('um-admin', ['kv', 'media']);
export const A = {
  pack: null,   // نسخة العمل
  base: null,   // لقطة الأساس (للمقارنة عند تصدير التصحيحات)
  log: [],      // سجل التعديلات
  urls: new Map(),
  savedAt: null,
  listeners: new Set(),
};

export async function loadWork() {
  const saved = await db.get('kv', 'pack').catch(() => null);
  if (saved) {
    A.pack = migrate(saved);
    A.base = (await db.get('kv', 'base')) || structuredClone(saved);
    A.log = (await db.get('kv', 'log')) || [];
  } else {
    A.pack = await loadPack('content/pack.json', { cache: 'reload' });
    A.base = structuredClone(A.pack);
    A.log = [];
    await persist();
  }
  return A.pack;
}

/** استبدال نسخة العمل (مثل البدء من الحزمة المنشورة) */
export async function replaceWork(pack, { resetBase = true } = {}) {
  A.pack = migrate(pack);
  if (resetBase) A.base = structuredClone(A.pack);
  await persist();
  emit();
}

let timer = null;
export function changed() {
  clearTimeout(timer);
  timer = setTimeout(persist, 400);
  emit();
}
async function persist() {
  try {
    await db.put('kv', 'pack', A.pack);
    await db.put('kv', 'base', A.base);
    await db.put('kv', 'log', A.log);
    A.savedAt = new Date();
  } catch (e) { console.error(e); A.savedAt = null; }
  emit('saved');
}
export const flush = () => { clearTimeout(timer); return persist(); };
export function onChange(fn) { A.listeners.add(fn); return () => A.listeners.delete(fn); }
function emit(kind = 'change') { for (const f of A.listeners) try { f(kind); } catch (e) { console.error(e); } }

export const reviewer = () => store.get('reviewer', '');
export const setReviewer = v => store.set('reviewer', v);

export function logChange(entry) {
  A.log.push({ at: new Date().toISOString(), by: reviewer() || 'المشرف', ...entry });
  if (A.log.length > 3000) A.log.splice(0, A.log.length - 3000);
}

// ---------- الوسائط ----------
export async function putMedia(path, blob) {
  await db.put('media', path, blob);
  A.urls.delete(path);
}
export async function getMediaBlob(path) {
  const b = await db.get('media', path).catch(() => null);
  if (b) return b;
  const r = await fetch('content/' + path);
  if (!r.ok) throw new Error('ملف مفقود: ' + path);
  return r.blob();
}
export async function preloadMediaUrls() {
  for (const k of await db.keys('media').catch(() => [])) {
    if (!A.urls.has(k)) A.urls.set(k, URL.createObjectURL(await db.get('media', k)));
  }
}
export function resolveMedia(path) { return A.urls.get(path) || 'content/' + path; }
export async function clearAll() { await db.clear('kv'); await db.clear('media'); }

// ---------- البحث في الحزمة ----------
export function locateSlide(id, pack = A.pack) {
  for (const ch of pack.chapters) for (const sec of ch.sections) {
    const i = sec.slides.findIndex(s => s.id === id);
    if (i >= 0) return { ch, sec, slide: sec.slides[i], index: i, no: flatSlides(ch).findIndex(x => x.slide.id === id) + 1 };
  }
  return null;
}
export function locateBlock(slide, bid) {
  for (let k = 0; k < slide.steps.length; k++) {
    const i = slide.steps[k].blocks.findIndex(b => b.id === bid);
    if (i >= 0) return { step: k, index: i, block: slide.steps[k].blocks[i] };
  }
  return null;
}
