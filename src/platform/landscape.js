import { localize, normalizeLanguage } from '../i18n.js';

// Shared orientation gate for native and H5; actual orientation locks belong to the shell.
export function installLandscapeNotice() {
  document.documentElement.setAttribute('data-landscape-only', '');
  const portrait = window.matchMedia('(orientation: portrait)');
  const notice = document.createElement('div');
  notice.className = 'mobile-orientation-notice';
  notice.setAttribute('role', 'status');
  document.body.appendChild(notice);
  const update = () => {
    let language = 'en';
    try { language = normalizeLanguage(localStorage.getItem('csboard-language')); } catch { /* Storage may be unavailable. */ }
    notice.textContent = localize(language, {
      zh: '请横屏使用 CSBoard', en: 'Rotate your device to use CSBoard', ru: 'Поверните устройство для работы с CSBoard',
    });
    document.getElementById('root').inert = portrait.matches;
  };
  update();
  portrait.addEventListener('change', update);
  return portrait;
}
