export const ROOT_FOLDER_ID = 'root';
export const emptyArchiveFolders = () => ({ folders: [], items: {} });

export function normalizeArchiveFolders(raw) {
  if (!raw || !Array.isArray(raw.folders) || !raw.items || typeof raw.items !== 'object') return emptyArchiveFolders();
  const seenIds = new Set();
  const folders = raw.folders.filter((folder) => {
    if (!folder?.id || folder.id === ROOT_FOLDER_ID || typeof folder.name !== 'string' || seenIds.has(folder.id)) return false;
    seenIds.add(folder.id);
    return true;
  });
  const ids = new Set(folders.map((folder) => folder.id));
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  return {
    folders: folders.map((folder) => {
      let parentId = ids.has(folder.parentId) ? folder.parentId : ROOT_FOLDER_ID;
      const ancestors = new Set([folder.id]);
      let ancestor = parentId;
      while (ancestor !== ROOT_FOLDER_ID) {
        if (ancestors.has(ancestor)) { parentId = ROOT_FOLDER_ID; break; }
        ancestors.add(ancestor);
        ancestor = byId.get(ancestor)?.parentId || ROOT_FOLDER_ID;
      }
      return { ...folder, parentId };
    }),
    items: { ...raw.items },
  };
}

export function folderOptions(state) {
  const result = [{ id: ROOT_FOLDER_ID, label: 'Root', depth: 0 }];
  const visit = (parentId, depth, seen) => {
    state.folders.filter((folder) => folder.parentId === parentId).sort((a, b) => (a.order || 0) - (b.order || 0)).forEach((folder) => {
      if (seen.has(folder.id)) return;
      result.push({ id: folder.id, label: folder.name, depth });
      visit(folder.id, depth + 1, new Set([...seen, folder.id]));
    });
  };
  visit(ROOT_FOLDER_ID, 1, new Set());
  return result;
}

export function folderChildren(state, items, parentId) {
  const ids = new Set(state.folders.map((folder) => folder.id));
  const folders = state.folders.filter((folder) => folder.parentId === parentId).map((folder) => ({ type: 'folder', id: folder.id, order: folder.order || 0, value: folder }));
  const entries = items.filter((item) => {
    const folderId = state.items[item.id]?.folderId;
    return (ids.has(folderId) ? folderId : ROOT_FOLDER_ID) === parentId;
  }).map((item, index) => ({ type: 'item', id: item.id, order: Number.isFinite(state.items[item.id]?.order) ? state.items[item.id].order : index, value: item }));
  return [...folders, ...entries].sort((a, b) => a.order - b.order || (a.type === 'folder' ? -1 : 1));
}

const rewriteSiblings = (state, siblings, parentId) => {
  const folders = state.folders.map((folder) => {
    const index = siblings.findIndex((entry) => entry.type === 'folder' && entry.id === folder.id);
    return index < 0 ? folder : { ...folder, parentId, order: index };
  });
  const placements = { ...state.items };
  siblings.forEach((entry, index) => {
    if (entry.type === 'item') placements[entry.id] = { folderId: parentId, order: index };
  });
  return { folders, items: placements };
};

export function addArchiveFolder(state, name, parentId, items, id = globalThis.crypto?.randomUUID?.() || `folder-${Date.now()}-${Math.random().toString(16).slice(2)}`) {
  const cleanName = name.trim();
  if (!cleanName || id === ROOT_FOLDER_ID || state.folders.some((folder) => folder.id === id)) return state;
  const parent = parentId === ROOT_FOLDER_ID || state.folders.some((folder) => folder.id === parentId) ? parentId : ROOT_FOLDER_ID;
  const order = folderChildren(state, items, parent).length;
  return { ...state, folders: [...state.folders, { id, name: cleanName, parentId: parent, order }] };
}

export function assignArchiveItem(state, itemId, folderId, items) {
  const parent = folderId === ROOT_FOLDER_ID || state.folders.some((folder) => folder.id === folderId) ? folderId : ROOT_FOLDER_ID;
  return { ...state, items: { ...state.items, [itemId]: { folderId: parent, order: folderChildren(state, items, parent).length } } };
}

export function unassignArchiveItem(state, itemId) {
  if (!state.items[itemId]) return state;
  const placements = { ...state.items };
  delete placements[itemId];
  return { ...state, items: placements };
}

export function removeArchiveFolder(state, folderId, items) {
  const folder = state.folders.find((entry) => entry.id === folderId);
  if (!folder) return state;
  const parentId = folder.parentId;
  const siblings = folderChildren(state, items, parentId).filter((entry) => !(entry.type === 'folder' && entry.id === folderId));
  const children = folderChildren(state, items, folderId);
  const next = rewriteSiblings({ ...state, folders: state.folders.filter((entry) => entry.id !== folderId) }, [...siblings, ...children], parentId);
  return next;
}

export function moveArchiveNode(state, items, source, target, position = 'inside') {
  if (!source || !target || (source.type === target.type && source.id === target.id)) return state;
  const sourceFolder = source.type === 'folder' ? state.folders.find((folder) => folder.id === source.id) : null;
  if (source.type === 'folder' && !sourceFolder || source.type === 'item' && !items.some((item) => item.id === source.id)) return state;
  const validFolder = (id) => state.folders.some((folder) => folder.id === id) ? id : ROOT_FOLDER_ID;
  const sourceParent = sourceFolder?.parentId || validFolder(state.items[source.id]?.folderId);
  const targetFolder = target.type === 'folder' ? state.folders.find((folder) => folder.id === target.id) : null;
  const targetParent = target.id === ROOT_FOLDER_ID ? ROOT_FOLDER_ID : targetFolder
    ? position === 'inside' ? target.id : targetFolder.parentId
    : validFolder(state.items[target.id]?.folderId);
  if (sourceFolder) {
    let ancestor = targetParent;
    const visited = new Set();
    while (ancestor !== ROOT_FOLDER_ID) {
      if (ancestor === source.id || visited.has(ancestor)) return state;
      visited.add(ancestor);
      ancestor = state.folders.find((folder) => folder.id === ancestor)?.parentId || ROOT_FOLDER_ID;
    }
  }
  const from = folderChildren(state, items, sourceParent).filter((entry) => !(entry.type === source.type && entry.id === source.id));
  const to = sourceParent === targetParent ? from : folderChildren(state, items, targetParent);
  const node = sourceFolder ? { type: 'folder', id: source.id, value: sourceFolder } : { type: 'item', id: source.id, value: items.find((item) => item.id === source.id) };
  const targetIndex = to.findIndex((entry) => entry.type === target.type && entry.id === target.id);
  const index = target.id === ROOT_FOLDER_ID || position === 'inside' || targetIndex < 0 ? to.length : targetIndex + (position === 'after' ? 1 : 0);
  const arranged = [...to];
  arranged.splice(index, 0, node);
  let next = sourceParent === targetParent ? state : rewriteSiblings(state, from, sourceParent);
  next = rewriteSiblings(next, arranged, targetParent);
  return next;
}
