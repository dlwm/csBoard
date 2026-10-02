export function createElectronShell(bridge) {
  if (!bridge?.isDesktop || !bridge.native) throw new Error('Desktop native bridge unavailable');
  return Object.freeze({
    id: 'electron', kind: 'desktop', mobile: false, nativeFilePicker: true,
    chooseFiles: (event, input) => input === 'native' ? bridge.native.chooseDemos()
      : Promise.resolve(Array.from(event?.target?.files || [])),
    resources: bridge.resources, maintenance: bridge.maintenance,
    presentation: bridge.presentation, ai: bridge.ai,
    backgroundParsing: true,
  });
}
