import { useEffect, useRef, useState } from 'react';
import { addArchiveFolder, assignArchiveItem, emptyArchiveFolders, moveArchiveNode, normalizeArchiveFolders, removeArchiveFolder, unassignArchiveItem } from './archiveFolders.js';
import { loadArchiveFolders, storeArchiveFolders } from './persistentStore.js';

// Folder placement is small metadata; moving an item must not rewrite its large replay payload.
export default function useArchiveFolders(kind, onWriteError) {
  const [state, setState] = useState(emptyArchiveFolders);
  const stateRef = useRef(state);
  const errorRef = useRef(onWriteError);
  const writeRef = useRef(Promise.resolve());
  const loadRef = useRef(null);
  errorRef.current = onWriteError;

  const ensureLoaded = () => {
    if (!loadRef.current) loadRef.current = loadArchiveFolders(kind).then((stored) => {
      const next = normalizeArchiveFolders(stored);
      stateRef.current = next;
      setState(next);
    }).catch((error) => { loadRef.current = null; throw error; });
    return loadRef.current;
  };
  const persist = async (next) => {
    if (next === stateRef.current) return true;
    stateRef.current = next;
    setState(next);
    const write = writeRef.current.catch(() => {}).then(() => storeArchiveFolders(kind, next));
    writeRef.current = write;
    try { await write; return true; }
    catch (error) { console.error(`${kind} folders storage`, error); errorRef.current?.(); return false; }
  };

  useEffect(() => { ensureLoaded().catch((error) => { console.error(`${kind} folders load`, error); errorRef.current?.(); }); }, [kind]);
  const mutate = async (update) => {
    try { await ensureLoaded(); return persist(update(stateRef.current)); }
    catch (error) { console.error(`${kind} folders load`, error); errorRef.current?.(); return false; }
  };

  return {
    state, stateRef,
    create: (name, parentId, items) => mutate((current) => addArchiveFolder(current, name, parentId, items)),
    remove: (id, items) => mutate((current) => removeArchiveFolder(current, id, items)),
    move: (items, source, target, position) => mutate((current) => moveArchiveNode(current, items, source, target, position)),
    assign: (id, folderId, items) => mutate((current) => assignArchiveItem(current, id, folderId, items)),
    unassign: (id) => mutate((current) => unassignArchiveItem(current, id)),
  };
}
