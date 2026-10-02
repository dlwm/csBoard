import { useEffect, useState } from 'react';
import { getPlatform } from '../platform/index.js';
const EMPTY = { rows: [], deaths: [], utilities: [] };

export default function useAnalysisDataset(demos, players, active, includeUtilities = true) {
  const [state, setState] = useState({ data: EMPTY, loading: false, error: '' });
  // Metadata changes invalidate the request even if IDs stay the same.
  const demoKey = JSON.stringify(demos.map(entry => [entry.id, entry.updatedAt]));
  const playerKey = JSON.stringify(players);
  useEffect(() => {
    const controller = new AbortController();
    const ids = JSON.parse(demoKey).map(([id]) => id);
    const selectedPlayers = JSON.parse(playerKey);
    if (!active || !ids.length || !selectedPlayers.length) {
      setState({ data: EMPTY, loading: false, error: '' });
      return;
    }
    // Clear old results so the scene never attributes them to the new selection.
    setState({ data: EMPTY, loading: true, error: '' });
    const timer = setTimeout(() => {
      getPlatform().compute('analysis.query', { ids, players: selectedPlayers, includeUtilities }, { signal: controller.signal })
        .then(data => { if (!controller.signal.aborted) setState({ data, loading: false, error: '' }); })
        .catch(error => { if (!controller.signal.aborted) setState({ data: EMPTY, loading: false, error: error.message }); });
    }, 120);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [demoKey, playerKey, active, includeUtilities]);
  return state;
}
