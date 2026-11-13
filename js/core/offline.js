// تحميل الدرس للعمل بلا إنترنت + تسجيل عامل الخدمة
import { store } from './store.js';
import { slideMedia } from './render.js';
import { publishedChapters } from './pack.js';

export function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
}

export function lessonFiles(pack, chapters = publishedChapters(pack)) {
  const set = new Set(['content/pack.json']);
  for (const ch of chapters) for (const sec of ch.sections) for (const s of sec.slides) for (const m of slideMedia(s)) set.add('content/' + m);
  return [...set];
}

/** يحمّل الحزمة وكل ملفاتها إلى المخزن مع مؤشر تقدم */
export async function downloadLesson(pack, onProgress = () => {}) {
  if (!('caches' in self)) throw new Error('المتصفح لا يدعم التحميل بلا إنترنت');
  const files = lessonFiles(pack);
  const cache = await caches.open('um-content');
  let done = 0, failed = 0;
  onProgress(0, files.length);
  // تحميل متوازٍ محدود (3 ملفات معاً) يناسب الشبكة الضعيفة
  const queue = [...files];
  async function worker() {
    while (queue.length) {
      const f = queue.shift();
      try {
        const res = await fetch(f, { cache: 'reload' });
        if (!res.ok) throw new Error(res.status);
        await cache.put(f, res);
      } catch { failed++; }
      onProgress(++done, files.length);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  if (failed) throw new Error(`تعذّر تحميل ${failed} من ${files.length} ملفاً. حاول مرة أخرى عند تحسن الشبكة.`);
  store.set('downloaded', { version: pack.version, at: new Date().toISOString(), files: files.length });
  return files.length;
}

export async function isLessonCached(pack) {
  try {
    const d = store.get('downloaded');
    if (!d || d.version !== pack.version) return false;
    const cache = await caches.open('um-content');
    for (const f of lessonFiles(pack)) if (!(await cache.match(f))) return false;
    return true;
  } catch { return false; }
}
