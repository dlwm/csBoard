import { ViewerError } from './controller.js';

// Shared commands own argument semantics and events; hosts own rendering,
// loading and persistence. 中文：命令语义共用，加载、绘制和存储由宿主端口负责。
export function createModelCommands({ readStyle, applyStyle, setVisible, setObjects, unload, notify }) {
  return {
    'model.style': changes => {
      for (const key of ['opacity', 'range']) if (changes[key] != null && (!Number.isFinite(changes[key]) || changes[key] < 0 || changes[key] > 1)) throw new ViewerError('invalid_argument', `${key} must be between 0 and 1`);
      if (changes.focus != null && !['full', 'pointer', 'camera'].includes(changes.focus)) throw new ViewerError('invalid_argument', 'Unknown model focus');
      const style = { ...readStyle(), ...changes };
      applyStyle(style);
      notify('model.style', style, { changed: true });
    },
    'model.visibility': ({ visible }) => {
      if (typeof visible !== 'boolean') throw new ViewerError('invalid_argument', 'visible must be a boolean');
      setVisible(visible);
      notify('model.visibility', { visible }, { changed: true });
    },
    ...(setObjects ? { 'model.objectsVisibility': args => { setObjects(args); notify('model.objectsChanged', args, { changed: true }); } } : {}),
    ...(unload ? { 'model.unload': () => { unload(); notify('model.visibility', { visible: false }, { changed: true }); } } : {}),
  };
}
