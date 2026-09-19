import { useRef, useState, useSyncExternalStore } from 'react';
import { createFrameSession } from './frameSession.js';

// Stable session commands call the latest application adapters, never stale room closures.
export default function useFrameSession(ports) {
  const latest = useRef(ports);
  latest.current = ports;
  const [session] = useState(() => createFrameSession({
    getBoard: () => latest.current.getBoard(),
    flushCollabSave: () => latest.current.flushCollabSave(),
    cancelPendingSave: () => latest.current.cancelPendingSave(),
    persistActiveArchiveFrames: (...args) => latest.current.persistActiveArchiveFrames(...args),
    publishFramesToRoom: (...args) => latest.current.publishFramesToRoom(...args),
  }));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return { ...session, ...state };
}
