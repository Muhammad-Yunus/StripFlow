/** @param {string} message @param {'info'|'ok'|'error'} [kind] */
export function toast(message, kind = 'info') {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.dataset.kind = kind;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(4px)';
    el.style.transition = 'opacity 160ms, transform 160ms';
    setTimeout(() => el.remove(), 190);
  }, 2600);
}
