// Select once at startup: rotating or connecting a mouse must not enable parsing.
export function isMobileBrowser(device = globalThis.navigator) {
  if (!device) return false;
  return Boolean(device.userAgentData?.mobile)
    || /Android|iPhone|iPad|iPod/i.test(device.userAgent || '')
    || (/Mac/i.test(device.platform || '') && device.maxTouchPoints > 1);
}

export function createWebShell() {
  const mobile = isMobileBrowser();
  const portrait = mobile ? globalThis.matchMedia?.('(orientation: portrait)') : null;
  return Object.freeze({
    id: 'web', kind: 'web', mobile, demoParsing: !mobile,
    chooseFiles: event => mobile
      ? Promise.reject(new Error('Demo parsing is unavailable in mobile H5'))
      : Promise.resolve(Array.from(event?.target?.files || [])),
    resources: null, maintenance: null, ai: null,
    presentation: portrait ? {
      current: async () => !portrait.matches,
      subscribe(callback) {
        const update = () => callback(!portrait.matches);
        portrait.addEventListener('change', update);
        return () => portrait.removeEventListener('change', update);
      },
    } : null,
    backgroundParsing: false,
  });
}
