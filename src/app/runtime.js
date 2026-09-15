// Use the desktop preload marker, not the URL or user agent: the local server
// can also be opened in a normal browser, where AI features must stay hidden.
export function isDesktopRuntime() {
  return globalThis.window?.csboardDesktop?.isDesktop === true;
}
