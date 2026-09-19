import { publishRoomFrames } from './roomFrames.js';
import { readRoomWorkspace } from './roomWorkspace.js';
import { localize, translate } from '../i18n.js';
import { emptyWorkspace, frameWorkspace, normalizeFrames } from './workspace.js';

// Owns observers, presence and remote scene application for exactly one connection.
// The returned disposer releases this connection before another room is opened.
export function connectRoom({ doc, provider, roomCode, getPorts }) {
    let appliedWorkspace = '';
    getPorts().attach(doc, provider);
    const room = doc.getMap('room');
    const points = doc.getMap('points');
    const paths = doc.getMap('paths');
    const utilities = doc.getMap('utilities');
    const grenades = doc.getMap('grenades');
    const framesMap = doc.getMap('frames');
    const activeFrameMap = doc.getMap('activeFrame');
    const brushes = doc.getMap('brushes');
    const awareness = provider.awareness;
    const knownUsers = new Map();
    let presenceEventId = 0;
    getPorts().events.activity([]);
    const syncPresence = ({ added = [], removed = [] } = {}) => {
      const states = awareness.getStates();
      const joined = added.filter((clientId) => clientId !== doc.clientID).map((clientId) => states.get(clientId)?.user?.name).filter(Boolean);
      const left = removed.filter((clientId) => clientId !== doc.clientID).map((clientId) => knownUsers.get(clientId)?.name).filter(Boolean);
      const users = [...states.entries()].map(([clientId, state]) => state.user ? { clientId, ...state.user, current: clientId === doc.clientID } : null).filter(Boolean).sort((first, second) => Number(second.owner) - Number(first.owner) || first.name.localeCompare(second.name));
      knownUsers.clear();
      users.forEach((user) => knownUsers.set(user.clientId, user));
      getPorts().events.users(users);
      const events = [...joined.map((name) => localize(getPorts().context().language, { zh: `${name} 已加入房间`, en: `${name} joined the room`, ru: `${name} вошёл в комнату` })), ...left.map((name) => localize(getPorts().context().language, { zh: `${name} 已退出房间`, en: `${name} left the room`, ru: `${name} вышел из комнаты` }))];
      if (events.length) getPorts().events.activity((current) => [...current, ...events.map((text) => ({ id: presenceEventId += 1, text }))].slice(-5));
    };
    awareness.on('change', syncPresence);
    awareness.setLocalStateField('user', { name: getPorts().context().name, owner: getPorts().context().owner });
    syncPresence();
    let synced = false;
    const frameSwitchTransactions = new WeakSet();
    const applySharedWorkspace = () => {
      const normalizedShared = readRoomWorkspace(doc);
      const serialized = JSON.stringify(normalizedShared);
      if (serialized === appliedWorkspace) return;
      appliedWorkspace = serialized;
      getPorts().scene()?.restoreWorkspaceState?.(normalizedShared, false);
    };
    let appliedRevision = -1;
    const tr = (key, values) => translate(getPorts().context().language, key, values);
    const apply = (_event, transaction) => {
      if (transaction?.local) return;
      if (room.get('closed')) { getPorts().events.notice(tr('roomDestroyed')); getPorts().leave(); return; }
      const revision = Number(room.get('revision') || 0);
      const map = room.get('mapName');
      if (map && map !== getPorts().context().mapName && !getPorts().context().owner) getPorts().changeMap(map);
      if (revision !== appliedRevision) { appliedRevision = revision; appliedWorkspace = ''; }
      const remoteActiveId = activeFrameMap.get('id');
      const switchingFrame = remoteActiveId && remoteActiveId !== getPorts().frames.read().activeFrameId && framesMap.has(remoteActiveId);
      if (switchingFrame && transaction) frameSwitchTransactions.add(transaction);
      if (!switchingFrame && !frameSwitchTransactions.has(transaction)) applySharedWorkspace();
      getPorts().events.status(`${tr('joinedRoom')} ${roomCode}`);
    };
    provider.on('status', ({ status }) => { getPorts().events.status(status === 'connected' ? `${tr('room')} ${roomCode} ${tr('connected')} · ${getPorts().context().name}` : `${tr('room')} ${status === 'disconnected' ? tr('disconnected') : tr('connecting')}...`); });
    provider.on('sync', (isSynced) => {
      synced = isSynced;
      if (!isSynced) return;
      if (getPorts().context().owner && room.get('workspaceInitialized') !== true) {
        const seedState = getPorts().seed.read();
        const seed = seedState?.workspace || frameWorkspace(getPorts().scene()?.getWorkspaceState?.());
        const cameraSlots = seedState?.cameraSlots || getPorts().scene()?.getWorkspaceState?.().cameraSlots || [];
        doc.transact(() => { room.set('mapName', getPorts().context().mapName); room.set('cameraSlots', cameraSlots); room.set('closed', false); room.set('workspaceInitialized', true); });
        publishRoomFrames(doc, getPorts().frames.read().frames, getPorts().frames.read().activeFrameId, seed);
        getPorts().seed.clear();
      }
      apply();
    });
    room.observe(apply); points.observe(apply); paths.observe(apply); utilities.observe(apply); grenades.observe(apply); apply();
    const applyFrames = (_event, transaction) => {
      if (transaction?.local) return;
      const order = room.get('frameOrder') || [];
      const orderIndex = new Map(order.map((id, index) => [id, index]));
      const remote = normalizeFrames([...framesMap.values()]).sort((left, right) => (orderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER));
      if (!remote.length) return;
      const desiredId = framesMap.has(activeFrameMap.get('id')) ? activeFrameMap.get('id') : remote[0].id;
      const changedFrame = desiredId !== getPorts().frames.read().activeFrameId;
      if (changedFrame && transaction) frameSwitchTransactions.add(transaction);
      getPorts().frames.replace(remote, desiredId);
      if (changedFrame) {
        const selected = remote.find((frame) => frame.id === desiredId);
        getPorts().scene()?.smoothRestoreFrame?.(selected?.workspace || emptyWorkspace(), false, null, true);
      }
    };
    const applyBrushes = () => {
      if (!synced) return;
      getPorts().scene()?.applyLiveBrushData?.([...brushes.values()]);
    };
    framesMap.observe(applyFrames); activeFrameMap.observe(applyFrames); applyFrames();
    brushes.observe(applyBrushes); applyBrushes();
    return () => { room.unobserve(apply); points.unobserve(apply); paths.unobserve(apply); utilities.unobserve(apply); grenades.unobserve(apply); framesMap.unobserve(applyFrames); activeFrameMap.unobserve(applyFrames); brushes.unobserve(applyBrushes); awareness.off('change', syncPresence); provider.destroy(); doc.destroy(); getPorts().events.users([]); getPorts().detach(doc); };
}
