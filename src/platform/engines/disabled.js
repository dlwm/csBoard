// A capability boundary, not a hidden WASM parser. No workers/files are opened.
export function createDisabledEngine() {
  return Object.freeze({
    id: 'disabled', execution: 'disabled', input: 'file',
    concurrency: () => 0,
    start() { throw new Error('Demo parsing is unavailable in mobile H5'); },
  });
}
