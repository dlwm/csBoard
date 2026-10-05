import { useRef } from 'react';
import { createCommandRegistry } from '../app/commandRegistry.js';

// Stable command identities read current frame/scene ports on every execution.
// 稳定命令始终读取当前帧与场景，避免菜单切换后仍调用旧闭包。
export default function useWorkspaceCommands(ports) {
  const latest = useRef(ports), registry = useRef(null);
  latest.current = ports;
  if (!registry.current) {
    const frame = action => args => {
      if (!latest.current.canEditFrames()) throw new Error('Frame editing is unavailable');
      return latest.current.frames[action](args.id);
    };
    const board = name => args => {
      const commands = latest.current.board()?.commands;
      if (!commands) throw new Error('Board is not ready');
      return commands.execute(name, args);
    };
    registry.current = createCommandRegistry({
      'frame.create': frame('create'), 'frame.duplicate': frame('duplicate'), 'frame.switch': frame('switch'), 'frame.delete': frame('delete'),
      ...Object.fromEntries(['board.apply', 'board.clear', 'board.undo', 'board.redo', 'player.rename', 'player.team', 'utility.add', 'utility.remove',
        'camera.save', 'camera.restore', 'camera.focusPlayer', 'camera.focusUtility', 'camera.focusPlacedUtility', 'camera.endPreview', 'camera.reset'].map(name => [name, board(name)])),
    });
  }
  return registry.current;
}
