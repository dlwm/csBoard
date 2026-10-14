import { preferences } from './preferences.js';
import { translate, normalizeLanguage, LANGUAGE_CHANGED_EVENT } from '../i18n.js';
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
    notice.textContent = translate(language, "view.landscape.rotateYourDeviceToUseCsboard");
    document.getElementById('root').inert = portrait.matches;
  };
  update();
  portrait.addEventListener('change', update);
  window.addEventListener(LANGUAGE_CHANGED_EVENT, update);
  return portrait;
}
