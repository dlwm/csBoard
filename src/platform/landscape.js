import { preferences } from './preferences.js';
import { localize, normalizeLanguage } from '../i18n.js';
import { installMobileViewport } from './mobileViewport.js';

// Shared orientation gate for native and H5; actual orientation locks belong to the shell.
export function installLandscapeNotice() {
  installMobileViewport();
  document.documentElement.setAttribute('data-landscape-only', '');
  const portrait = window.matchMedia('(orientation: portrait)');
  const notice = document.createElement('div');
  notice.className = 'mobile-orientation-notice';
  notice.setAttribute('role', 'status');
  document.body.appendChild(notice);
  const update = () => {
    let language = 'en';
    try { language = normalizeLanguage(preferences.getItem('csboard-language')); } catch { /* Storage may be unavailable. */ }
    notice.textContent = localize(language, {
      zh: '请横屏使用 CSBoard', en: 'Rotate your device to use CSBoard', ru: 'Поверните устройство для работы с CSBoard',
    });
    document.getElementById('root').inert = portrait.matches;
  };
  update();
  portrait.addEventListener('change', update);
  return portrait;
}
