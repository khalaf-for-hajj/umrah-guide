// كتلة «آية»: نص الآية مشكولاً، ورقمها، وتنبيهات النطق، ومقطعها من صوت السورة.
// وكتلة «برنامج التدريب على القراءة»: زر يفتح شاشة التدريب (الاستماع والترديد والتسجيل والمقارنة).
import { registerBlock } from './blocks.js';
import { el, paras } from './dom.js';
import { playSegment, stopAudio } from './audio.js';

const AR = '٠١٢٣٤٥٦٧٨٩';
export const arNum = n => String(n).replace(/\d/g, d => AR[d]);
export const ayahHasAudio = b => Boolean(b.audio) && b.start !== '' && b.start != null && b.end !== '' && b.end != null && Number(b.end) > Number(b.start);

registerBlock('ayah', {
  label: 'آية (للتدريب على القراءة)',
  create: () => ({ no: '', text: '', tips: [], audio: '', start: '', end: '' }),
  fields: [
    { key: 'no', label: 'رقم الآية', kind: 'number' },
    { key: 'text', label: 'نص الآية مشكولاً (يُنقل من المصحف بدقة)', kind: 'textarea' },
    { key: 'tips', label: 'تنبيهات النطق (سطر لكل تنبيه)', kind: 'lines' },
    { key: 'audio', label: 'ملف صوت السورة (أو الآية)', kind: 'audio' },
    { key: 'start', label: 'بداية الآية في الملف (ثانية)', kind: 'number' },
    { key: 'end', label: 'نهاية الآية في الملف (ثانية)', kind: 'number' },
    { key: '_segment', label: '🎚 أداة تقسيم صوت السورة على الآيات', kind: 'action', action: 'segment-audio' },
  ],
  render(b, ctx) {
    const play = ayahHasAudio(b) ? el('button.btn.teal.ay-play', { type: 'button', onclick: async e => {
      const btn = e.currentTarget;
      if (btn.dataset.on) { stopAudio(); return; }
      btn.dataset.on = '1'; btn.textContent = '⏸ إيقاف';
      try { await playSegment(ctx.resolveMedia ? ctx.resolveMedia(b.audio) : b.audio, b.start, b.end); }
      catch { /* لا صوت */ }
      delete btn.dataset.on; btn.textContent = '▶ استمع للآية';
    } }, '▶ استمع للآية') : null;
    return el('div.blk.ayah', { dataset: { no: b.no } },
      el('div.ay-text', { lang: 'ar' }, b.text, b.no ? el('span.ay-no', { 'aria-label': 'الآية ' + b.no }, ` ﴿${arNum(b.no)}﴾`) : null),
      play,
      (b.tips || []).length ? el('ul.ay-tips', {}, b.tips.map(t => el('li', {}, t))) : null);
  },
  media: b => (b.audio ? [b.audio] : []),
  searchText: b => [b.text, ...(b.tips || [])].join(' '),
});

registerBlock('recite', {
  label: 'زر برنامج التدريب على القراءة',
  create: () => ({ title: 'التدريب على قراءة السورة', note: '' }),
  fields: [
    { key: 'title', label: 'عنوان الزر', kind: 'text' },
    { key: 'note', label: 'شرح قصير تحت الزر', kind: 'textarea' },
  ],
  render(b, ctx) {
    return el('div.blk.recite', {},
      el('button.btn.big.ay-open', { type: 'button', onclick: () => window.dispatchEvent(new CustomEvent('um:recite')) }, '🎧 ' + (b.title || 'التدريب على القراءة')),
      b.note ? el('div.small', {}, paras(b.note)) : null,
      ctx.viewer === 'sheikh' ? el('div.small.muted', {}, 'يفتحه المعتمر من جواله.') : null);
  },
  searchText: b => [b.title, b.note].join(' '),
});
