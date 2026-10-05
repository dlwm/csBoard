import { useEffect, useState } from 'react';
import { getPlatform } from '../platform/index.js';

export default function useDesktopUpdateState() {
  const api = getPlatform().updates;
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!api) return undefined;
    let alive = true;
    const accept = value => { if (alive) setState(previous => !previous || value.revision >= previous.revision ? value : previous); };
    const off = api.subscribe(accept);
    api.status().then(accept).catch(error => { if (alive) setError(error.message); });
    return () => { alive = false; off(); };
  }, [api]);
  return { api, state, error };
}
