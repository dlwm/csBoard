// A Capacitor entry supplies native services after registering its plugins.
// No Electron marker, user-agent detection or child process is required.
export function createCapacitorHost(services = {}) {
  return Object.freeze({
    id: 'capacitor', kind: 'mobile', mobile: true,
    nativeFilePicker: typeof services.chooseDemos === 'function',
    chooseFiles: (event, input) => input === 'native' ? services.chooseDemos()
      : Promise.resolve(Array.from(event?.target?.files || [])),
    resources: services.resources || null, maintenance: services.maintenance || null,
    presentation: services.presentation || null, ai: services.ai || null,
    // A native thread does not grant unrestricted OS background execution.
    backgroundParsing: services.backgroundParsing === true,
    releaseFiles: services.releaseFiles,
  });
}
