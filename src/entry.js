import { startApplication } from './bootstrap.js';
import { getShell } from './platform/index.js';
import { installLandscapeNotice } from './platform/landscape.js';

if (import.meta.env.CSBOARD_APP_SHELL === 'capacitor') {
  import('./platform/mobile/start.js').then(({ startMobileApplication }) => startMobileApplication());
} else {
  if (getShell().mobile) installLandscapeNotice();
  startApplication();
}
