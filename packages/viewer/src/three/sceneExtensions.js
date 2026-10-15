import { createSceneObjectAttachments } from './sceneObjects.js';
import { Group } from 'three';
import { ViewerError } from '../core/controller.js';

// Each host extension owns its resources; the viewer owns attachment and lifetime.
// 中文：宿主释放自己的材质/几何/监听器，视图库管理分组挂载与生命周期。
export function createSceneExtensions({ scene, camera, canvas, origin, controller, surfaceQueries = {}, onChange = () => {}, reportError = () => {} }) {
  const entries = new Map();
  let disposed = false;
  const report = error => { try { reportError(error); } catch { /* An observer cannot stop rendering. */ } };
  function mount(id, setup) {
    if (disposed) throw new ViewerError('disposed', 'Viewer is disposed');
    if (typeof id !== 'string' || !id.trim() || typeof setup !== 'function') throw new ViewerError('invalid_argument', 'Scene extension requires a nonempty ID and setup function');
    if (entries.has(id)) throw new ViewerError('extension_exists', `Scene extension already mounted: ${id}`);
    const group = new Group(); group.name = `extension:${id}`;
    const abort = new canvas.ownerDocument.defaultView.AbortController(), unsubscribers = new Set();
    const attachments = createSceneObjectAttachments(group, onChange);
    let hooks, active = true;
    const remove = () => {
      if (!active) return; active = false; entries.delete(id); abort.abort();
      for (const unsubscribe of unsubscribers) unsubscribe(); unsubscribers.clear();
      attachments.dispose();
      group.removeFromParent(); onChange();
      try { hooks?.dispose?.(); } catch (error) { report(error); }
      group.clear(); // Shared assets are never implicitly disposed.
    };
    scene.add(group);
    entries.set(id, { remove, update: timestamp => { if (active && hooks?.update) { hooks.update(timestamp); onChange(); } } });
    onChange();
    try {
      hooks = setup(Object.freeze({ ...surfaceQueries, group, camera, canvas, origin: Object.freeze([...origin]), signal: abort.signal,
        pickSurface(pointer) {
          if (!active) throw new ViewerError('disposed', 'Scene extension is disposed');
          return surfaceQueries.pickSurface(pointer);
        },
        projectSource(position) {
          if (!active) throw new ViewerError('disposed', 'Scene extension is disposed');
          return surfaceQueries.projectSource(position);
        },
        addObject(object, options) {
          if (!active) throw new ViewerError('disposed', 'Scene extension is disposed');
          return attachments.add(object, options);
        },
        on(type, listener) {
          if (!active) throw new ViewerError('disposed', 'Scene extension is disposed');
          const unsubscribe = controller.on(type, listener); unsubscribers.add(unsubscribe);
          return () => { unsubscribers.delete(unsubscribe); unsubscribe(); };
        },
        execute(command, context) {
          if (!active) throw new ViewerError('disposed', 'Scene extension is disposed');
          return controller.execute(command, context);
        },
      }));
      if (hooks != null && (typeof hooks !== 'object' || typeof hooks.then === 'function'
        || ['update', 'dispose'].some(key => hooks[key] != null && typeof hooks[key] !== 'function'))) throw new ViewerError('invalid_argument', 'Extension setup must synchronously return optional update/dispose functions');
    } catch (error) { remove(); throw error; }
    return remove;
  }
  return { mount,
    update(timestamp) {
      for (const entry of [...entries.values()]) {
        try { entry.update(timestamp); } catch (error) { entry.remove(); report(error); }
      }
    },
    dispose() { if (disposed) return; disposed = true; for (const entry of [...entries.values()]) entry.remove(); },
  };
}
