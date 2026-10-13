// Opt-in desktop automation transports the public viewer contract unchanged.
// 仅隔离开发实例启用；不读 React 私有状态，不新增原生权限或命令旁路。
let attached, unsubscribe;
export function attachViewerAutomation(viewer) {
  if (attached === viewer) return;
  unsubscribe?.();
  attached = viewer;
  const events = [];
  unsubscribe = viewer.on('*', event => {
    events.push(event);
    if (events.length > 256) events.shift();
  });
  globalThis.csboardAutomation = Object.freeze({
    getContract: () => viewer.getContract(),
    getCapabilities: () => viewer.getCapabilities(),
    getState: () => viewer.getState(),
    getWorkspace: () => viewer.getWorkspace(),
    execute: (command, context = {}) => viewer.execute(command, { ...context, origin: 'automation' }),
    drainEvents: () => events.splice(0),
  });
}
