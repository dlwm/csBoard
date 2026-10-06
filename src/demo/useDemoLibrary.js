import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createDemoLibrary } from './library.js';

export default function useDemoLibrary({ cache, schema, enabled, onError }) {
  const library = useMemo(() => createDemoLibrary(cache, schema), [cache, schema]);
  const [state, setState] = useState({ entries: [], loading: enabled });
  const ownership = useRef({ disposed: false, catalogue: 0, selection: 0 });
  const errorHandler = useRef(onError);
  errorHandler.current = onError;
  const refresh = useCallback(async () => {
    if (!enabled) { setState({ entries: [], loading: false }); return; }
    const revision = ++ownership.current.catalogue;
    setState(state => ({ ...state, loading: true }));
    const ownsRequest = () => !ownership.current.disposed && revision === ownership.current.catalogue;
    try {
      const entries = await library.list();
      if (ownsRequest()) setState({ entries, loading: false });
    } catch (error) {
      if (ownsRequest()) { setState(state => ({ ...state, loading: false })); errorHandler.current?.(error); }
    }
  }, [library, enabled]);
  useEffect(() => {
    ownership.current.disposed = false;
    refresh();
    return () => { ownership.current.disposed = true; ownership.current.catalogue++; ownership.current.selection++; };
  }, [refresh]);
  const open = useCallback(async id => {
    const revision = ++ownership.current.selection;
    const entry = await library.open(id);
    if (!entry) await refresh();
    return !ownership.current.disposed && revision === ownership.current.selection ? entry : undefined;
  }, [library, refresh]);
  const remove = useCallback(async id => { await library.remove(id); await refresh(); }, [library, refresh]);
  return { ...state, refresh, open, remove, cancelSelection: () => { ownership.current.selection++; } };
}
