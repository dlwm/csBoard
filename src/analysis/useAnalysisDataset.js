import { useEffect, useState } from 'react';
import { getPlatform } from '../platform/index.js';
const EMPTY = { rows: [], deaths: [], utilities: [] };

export default function useAnalysisDataset(demos, players, active) {
  const [state, setState] = useState({ data: EMPTY, loading: false, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    if (!active || !demos.length || !players.length) {
      setState({ data: EMPTY, loading: false, error: '' });
      return;
    }
    setState({ data: EMPTY, loading: true, error: '' });
    getPlatform().compute('analysis.query', { ids: demos.map(entry => entry.id), players }, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setState({ data, loading: false, error: '' }); })
      .catch(error => { if (!controller.signal.aborted) setState({ data: EMPTY, loading: false, error: error.message }); });
    return () => controller.abort();
  }, [demos, players, active]);
  return state;
}
