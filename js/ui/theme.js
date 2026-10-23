import { getSetting, setSetting } from '../core/storage.js';

const KEY = 'theme';

/** @returns {'light'|'dark'} */
export function initTheme() {
  const saved = getSetting(KEY, null);
  let theme = saved === 'light' || saved === 'dark' ? saved : null;
  if (!theme) {
    theme = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  applyTheme(theme);
  return theme;
}

/** @param {'light'|'dark'} theme */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  setSetting(KEY, theme);
}

/** @param {'light'|'dark'} current @returns {'light'|'dark'} */
export function toggleTheme(current) {
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}
