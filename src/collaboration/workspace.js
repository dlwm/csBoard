export const emptyWorkspace = () => ({ points: [], paths: [], grenades: [], collabUtilities: [], brushStrokes: [] });

// Camera state belongs to an archive/room; tactical frames only own editable scene content.
export const frameWorkspace = (workspace) => {
  const { camera: _camera, cameraSlots: _cameraSlots, ...frame } = workspace || emptyWorkspace();
  return frame;
};

export const normalizeCollabWorkspace = (workspace) => {
  const frame = frameWorkspace(workspace);
  const legacyPathPointIds = new Set((frame.paths || []).flatMap((path) => Array.isArray(path) ? path : path.pointIds || []));
  const usedNames = new Set();
  const stableHexName = (value) => {
    let hash = 0;
    for (const character of String(value || 'player')) hash = ((hash * 31) + character.charCodeAt(0)) & 0xfff;
    for (let offset = 0; offset < 0x1000; offset += 1) {
      const candidate = ((hash + offset) & 0xfff).toString(16).toUpperCase().padStart(3, '0');
      if (!usedNames.has(candidate.toLowerCase())) return candidate;
    }
    return 'FFF';
  };
  const points = (frame.points || []).filter((point) => !legacyPathPointIds.has(point.id)).map((point, index) => {
    let name = String(point.name || point.playerName || '').trim();
    if (!name || usedNames.has(name.toLowerCase())) name = stableHexName(point.id || index);
    usedNames.add(name.toLowerCase());
    let pitch = Number(point.pitch);
    if (!Number.isFinite(pitch)) {
      const [x = 0, y = 0.15, z = -1] = point.aimTarget || [];
      pitch = -Math.atan2(y - 0.15, Math.max(0.001, Math.hypot(x, z)));
    }
    return { ...point, kind: 'player', name, weapon: point.weapon || 'ak47', crouched: Boolean(point.crouched), pitch };
  });
  const collabUtilities = (frame.collabUtilities || []).map((item, index) => ({ ...item, id: item.id || `imported-${item.noteId || index}` }));
  return { ...frame, points, paths: [], collabUtilities };
};

const createFrameId = () => `frame-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

export const normalizeFrames = (input, fallbackWorkspace = null) => {
  const source = Array.isArray(input) ? input : [];
  const ids = new Set();
  const normalized = source.filter((frame) => frame && typeof frame === 'object').map((frame) => {
    let id = typeof frame.id === 'string' && frame.id ? frame.id : '';
    if (!id || ids.has(id)) id = createFrameId();
    ids.add(id);
    return { id, workspace: normalizeCollabWorkspace(frame.workspace || emptyWorkspace()) };
  });
  if (!normalized.length && fallbackWorkspace) normalized.push({ id: createFrameId(), workspace: normalizeCollabWorkspace(fallbackWorkspace) });
  return normalized;
};
