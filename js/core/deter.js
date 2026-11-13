// روادع النسخ: تعطيل القائمة السياقية وتحديد النص والسحب — روادع لا حماية مطلقة
export function enableDeterrents() {
  document.body.classList.add('nocopy');
  const allowed = t => t?.closest?.('input, textarea, [contenteditable]');
  document.addEventListener('contextmenu', e => { if (!allowed(e.target)) e.preventDefault(); });
  document.addEventListener('copy', e => { if (!allowed(e.target)) e.preventDefault(); });
  document.addEventListener('cut', e => { if (!allowed(e.target)) e.preventDefault(); });
  document.addEventListener('dragstart', e => { if (e.target?.tagName === 'IMG') e.preventDefault(); });
  document.addEventListener('selectstart', e => { if (!allowed(e.target)) e.preventDefault(); });
}
