// فتح «كتاب الشيخ» من نسخة العمل في المحرر (يقرأ الكتاب الحزمة والصور من هذه النافذة)
import { A, resolveMedia } from './state.js';
import { toast } from '../core/dom.js';

export function openBook(chId = 'all') {
  window.__umBook = { pack: A.pack, ch: chId, resolveMedia };
  const w = window.open(`book.html?src=admin&ch=${encodeURIComponent(chId)}`, '_blank');
  if (!w) toast('اسمح للمتصفح بفتح النوافذ المنبثقة لهذا الموقع ثم أعد المحاولة');
}
