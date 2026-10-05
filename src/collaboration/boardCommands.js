import { createCommandRegistry } from '../app/commandRegistry.js';

export const BOARD_EDIT_COMMANDS = Object.freeze(['board.apply', 'board.clear', 'board.undo', 'board.redo', 'player.rename', 'player.team', 'utility.add', 'utility.remove']);

export function createBoardCommands(ports) {
  const id = value => { if (typeof value !== 'string' || !value) throw new TypeError('Object ID is required'); return value; };
  const slot = value => { if (!Number.isInteger(value) || value < 0 || value > 9) throw new TypeError('Camera slot must be 0–9'); return value; };
  return createCommandRegistry({
    'board.apply': ({ snapshot }) => { if (!snapshot || typeof snapshot !== 'object') throw new TypeError('Board snapshot is required'); return ports.apply(snapshot); },
    'board.clear': () => ports.clear(), 'board.undo': () => ports.undo(), 'board.redo': () => ports.redo(),
    'player.rename': ({ id: playerId, name }) => { if (typeof name !== 'string' || !name.trim()) throw new TypeError('Player name is required'); return ports.rename(id(playerId), name); },
    'player.team': ({ id: playerId, team }) => { if (!['T', 'CT'].includes(team)) throw new TypeError('Team must be T or CT'); return ports.setTeam(id(playerId), team); },
    'utility.add': ({ note }) => { if (!note?.id || !Array.isArray(note.position)) throw new TypeError('Saved utility is required'); return ports.addUtility(note); },
    'utility.remove': ({ id: utilityId }) => ports.removeUtility(id(utilityId)),
    'camera.save': ({ slot: index }) => ports.saveCamera(slot(index)),
    'camera.restore': ({ slot: index }) => ports.restoreCamera(slot(index)),
    'camera.focusPlayer': ({ id: playerId }) => ports.focusPlayer(id(playerId)),
    'camera.focusPlacedUtility': ({ id: utilityId }) => ports.focusPlacedUtility(id(utilityId)),
    'camera.focusUtility': ({ note }) => ports.focusUtility(note),
    'camera.endPreview': () => ports.endPreview(), 'camera.reset': () => ports.resetCamera(),
  }, { before: name => { if (BOARD_EDIT_COMMANDS.includes(name) && !ports.isEditable()) throw new Error('Tactical editing is unavailable'); } });
}
