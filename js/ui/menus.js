let activeMenu = null;

/**
 * Show a lightweight context menu at viewport coordinates.
 * @param {{label:string, action:()=>void, danger?:boolean, disabled?:boolean}[]} items
 * @param {number} x
 * @param {number} y
 */
export function showContextMenu(items, x, y) {
  hideContextMenu();
  const menu = document.createElement('div');
  menu.className = 'ctxmenu';
  menu.setAttribute('role', 'menu');
  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ctxmenu__item';
    btn.textContent = item.label;
    if (item.danger) btn.classList.add('ctxmenu__item--danger');
    btn.disabled = Boolean(item.disabled);
    btn.addEventListener('click', () => {
      hideContextMenu();
      item.action();
    });
    menu.appendChild(btn);
  }
  document.body.appendChild(menu);

  const rect = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 8);
  const top = Math.min(y, window.innerHeight - rect.height - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;

  activeMenu = menu;
  const onDown = (e) => {
    if (!menu.contains(e.target)) hideContextMenu();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') hideContextMenu();
  };
  setTimeout(() => {
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
  }, 0);
  menu._cleanup = () => {
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
  };
}

export function hideContextMenu() {
  if (!activeMenu) return;
  activeMenu._cleanup?.();
  activeMenu.remove();
  activeMenu = null;
}
