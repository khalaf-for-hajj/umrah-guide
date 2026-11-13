// مشغّل صوت واحد للتطبيق: يشغّل مقطعاً من ملف (آية من السورة) بسرعة محددة ويتوقف عند نهايته.
// عنصر واحد يبقى حياً حتى لا ينقطع الصوت إذا أُعيد رسم الشريحة.
let audio = null, raf = 0, done = null, curSrc = '';

function stopLoop() { cancelAnimationFrame(raf); raf = 0; }
function finish() {
  stopLoop();
  const d = done; done = null;
  if (d) d();
}

export function stopAudio() {
  if (audio && !audio.paused) audio.pause();
  finish();
}
export const isPlaying = () => Boolean(audio && !audio.paused);

/** يشغّل المقطع [start, end] بالثواني (end فارغ = حتى نهاية الملف). يعيد وعداً يتحقق عند انتهاء المقطع أو إيقافه. */
export async function playSegment(src, start = 0, end = null, { rate = 1 } = {}) {
  stopAudio();
  if (!audio) { audio = new Audio(); audio.preload = 'auto'; audio.addEventListener('ended', finish); }
  if (curSrc !== src) { audio.src = src; curSrc = src; }
  if (audio.readyState < 1) await new Promise((res, rej) => {
    const ok = () => { audio.removeEventListener('error', bad); res(); };
    const bad = () => { audio.removeEventListener('loadedmetadata', ok); rej(new Error('تعذّر تحميل ملف الصوت')); };
    audio.addEventListener('loadedmetadata', ok, { once: true });
    audio.addEventListener('error', bad, { once: true });
    audio.load();
  });
  const s0 = Number(start) || 0, e0 = end === '' || end == null ? null : Number(end);
  audio.currentTime = s0;
  audio.playbackRate = rate;
  const p = new Promise(res => { done = res; });
  await audio.play();
  const tick = () => {
    if (e0 != null && audio.currentTime >= e0) { audio.pause(); finish(); return; }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return p;
}

/** يشغّل ملفاً كاملاً (تسجيل المعتمر مثلاً) */
export function playFile(src, opts) { return playSegment(src, 0, null, opts); }
