import { attachViewerAutomation } from './viewerAutomation.js';
export function createElectronHost(bridge) {
  if (!bridge?.isDesktop || !bridge.native) throw new Error('Desktop native bridge unavailable');
  return Object.freeze({
    id: 'electron', kind: 'desktop', mobile: false, nativeFilePicker: true,
    chooseFiles: (event, input) => input === 'native' ? bridge.native.chooseDemos()
      : Promise.resolve(Array.from(event?.target?.files || [])),
    resources: bridge.resources, maintenance: bridge.maintenance, updates: bridge.updates,
    // Hidden QA windows still render; ordinary desktop visibility stays unchanged.
    presentation: bridge.automation ? { current: async () => true, subscribe: () => () => {} } : bridge.presentation, ai: bridge.ai,
    automation: bridge.automation ? { attachViewer: attachViewerAutomation } : null,
    backgroundParsing: true,
  });
}
