// Only this module reads the isolated preload marker. URLs and UA are not capabilities.
export const desktopBridge = () => globalThis.window?.csboardDesktop?.isDesktop === true ? globalThis.window.csboardDesktop : null;
