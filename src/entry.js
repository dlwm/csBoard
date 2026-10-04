import { startApplication } from './bootstrap.js';
import { getHost } from './platform/index.js';
import { installLandscapeNotice } from './platform/landscape.js';

if (import.meta.env.CSBOARD_APP_SHELL === 'capacitor') {
  import('./platform/assembly/capacitor.js').then(({ startMobileApplication }) => startMobileApplication());
} else {
  if (getHost().mobile) installLandscapeNotice();
  startApplication();
}
