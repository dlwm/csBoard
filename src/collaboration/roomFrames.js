// Publish one coherent frame revision; unchanged entries avoid redundant Yjs updates.
export function publishRoomFrames(doc, next, nextActiveId, workspaceForRoom = null) {
    if (!doc) return;
    const framesMap = doc.getMap('frames');
    const activeMap = doc.getMap('activeFrame');
    const room = doc.getMap('room');
    const points = doc.getMap('points');
    const paths = doc.getMap('paths');
    const utilities = doc.getMap('utilities');
    const grenades = doc.getMap('grenades');
    const brushes = doc.getMap('brushes');
    const syncMap = (map, entries, keyOf) => {
      const known = new Set(entries.map(keyOf));
      map.forEach((_, id) => { if (!known.has(id)) map.delete(id); });
      entries.forEach((entry) => { const id = keyOf(entry); if (JSON.stringify(map.get(id)) !== JSON.stringify(entry)) map.set(id, entry); });
    };
    doc.transact(() => {
      const known = new Set(next.map((frame) => frame.id));
      framesMap.forEach((_, id) => { if (!known.has(id)) framesMap.delete(id); });
      next.forEach((frame) => { if (JSON.stringify(framesMap.get(frame.id)) !== JSON.stringify(frame)) framesMap.set(frame.id, frame); });
      const frameOrder = next.map((frame) => frame.id);
      if (JSON.stringify(room.get('frameOrder') || []) !== JSON.stringify(frameOrder)) room.set('frameOrder', frameOrder);
      if (activeMap.get('id') !== nextActiveId) activeMap.set('id', nextActiveId);
      if (workspaceForRoom) {
        room.set('workspaceInitialized', true);
        syncMap(points, workspaceForRoom.points || [], (point) => point.id);
        syncMap(paths, [], (path) => path.join(':'));
        syncMap(utilities, workspaceForRoom.collabUtilities || [], (utility) => utility.id);
        syncMap(grenades, workspaceForRoom.grenades || [], (grenade) => grenade.id);
        syncMap(brushes, workspaceForRoom.brushStrokes || [], (brush) => brush.id);
      }
    });
}
