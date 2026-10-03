import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { createMobileShell } from '../shells/mobile.js';
import { startApplication } from '../../bootstrap.js';
import { createNativeCache } from '../native/cache.js';
import { createNativeRecords } from '../native/records.js';
import { browserRecords } from '../browser/records.js';
import { createMobileNativeEngine } from '../engines/mobileNative.js';
import { PARSER_ENGINE } from '../../app/config.js';
import { installLandscapeNotice } from '../landscape.js';

export async function startMobileApplication() {
  if (!Capacitor.isNativePlatform()) throw new Error('Mobile build requires the Capacitor application shell');
  document.documentElement.dataset.appShell = 'capacitor';
  const portrait = installLandscapeNotice();
  if (!Capacitor.isPluginAvailable('CSBoardCore')) throw new Error('Mobile native services are missing; rebuild the application');
  const plugin = registerPlugin('CSBoardCore');
  const backend = { storage: async (method, args = {}) => {
    const { result } = await plugin.storage({ method, arguments: JSON.stringify(args) });
    return JSON.parse(result);
  } };
  const cache = createNativeCache(backend, {
    migrate: async () => {},
    readEncoded: (id, round) => backend.storage(round == null ? 'cache.get' : 'cache.round', round == null ? { id } : { id, round }),
  });
  const storage = { id: 'sqlite', owner: backend, cache, records: createNativeRecords(backend, browserRecords) };
  // Static native configuration also locks orientation. Keep this request for
  // supported tablets; OS windowing policies may still override the lock.
  await ScreenOrientation.lock({ orientation: 'landscape' }).catch(error => console.warn('Orientation lock unavailable', error));
  let pickingFiles = false;
  const presentationUpdates = new Set();
  const presentation = {
    current: async () => (await App.getState()).isActive && !portrait.matches && !pickingFiles,
    subscribe(callback) {
      let disposed = false, handle, active = true;
      const changed = () => callback(active && !portrait.matches && !pickingFiles);
      presentationUpdates.add(changed);
      portrait.addEventListener('change', changed);
      App.addListener('appStateChange', state => { active = state.isActive; changed(); }).then(value => {
        if (disposed) value.remove(); else handle = value;
      });
      return () => { disposed = true; presentationUpdates.delete(changed); handle?.remove(); portrait.removeEventListener('change', changed); };
    },
  };
  const shell = createMobileShell({ presentation,
    chooseDemos: async () => {
      if (pickingFiles) return [];
      pickingFiles = true;
      for (const update of presentationUpdates) update();
      try {
        // Stop the render loop and yield a frame before UIKit presents Files.
        await new Promise(resolve => requestAnimationFrame(resolve));
        return (await plugin.chooseDemos()).files;
      } finally {
        pickingFiles = false;
        for (const update of presentationUpdates) update();
      }
    },
    releaseFiles: files => plugin.releaseSources({ sourceIds: files.map(file => file.nativeId).filter(Boolean) }),
  });
  const parser = PARSER_ENGINE === 'wasm' ? 'wasm' : createMobileNativeEngine(plugin, cache);
  await startApplication({ shell, parser, storage });
}
