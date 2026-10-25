import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_TIMING_OPTIONS } from './timingDistribution.js';

const EMPTY = Object.freeze({ rows: [], diagnostics: {}, demoCount: 0, roundCount: 0, economyAvailability: { own: [], opponent: [] } });
export default function useTimingDistribution({ active, demos, players, mapName, schema, flags, side, compute, navigate }) {
  const [revision, setRevision] = useState(0);
  const [options, setOptions] = useState(DEFAULT_TIMING_OPTIONS), [measure, setMeasure] = useState('events');
  const [state, setState] = useState({ key: '', result: EMPTY, loading: false, error: '' });
  const [selection, setSelection] = useState(null), [navigation, setNavigation] = useState({ loading: false, error: '' });
  const navigateRef = useRef(navigate); navigateRef.current = navigate;
  const controllerRef = useRef(null);
  const key = JSON.stringify([revision, active, demos.map(demo => [demo.id, demo.updatedAt]), players, mapName, schema, flags.utilityKinds, flags.economyOwn, flags.economyOpponent, side, options]);
  const enabled = active && demos.length > 0 && players.length > 0;
  useEffect(() => {
    controllerRef.current?.abort(); setNavigation({ loading: false, error: '' }); setSelection(null);
    if (!enabled) return;
    const controller = new AbortController();
    setState({ key, result: EMPTY, loading: true, error: '' });
    const timer = setTimeout(() => {
      compute('analysis.timing', { ids: demos.map(demo => demo.id), players, mapName, schema, side, options,
        flags: { utilityKinds: flags.utilityKinds, economyOwn: flags.economyOwn, economyOpponent: flags.economyOpponent } }, { signal: controller.signal })
        .then(result => { if (!controller.signal.aborted) setState({ key, result, loading: false, error: '' }); })
        .catch(error => { if (!controller.signal.aborted) setState({ key, result: EMPTY, loading: false, error: error.message }); });
    }, 160);
    return () => { clearTimeout(timer); controller.abort(); controllerRef.current?.abort(); };
  }, [key, enabled, compute]);
  const result = enabled && state.key === key ? state.result : EMPTY;
  const selected = useMemo(() => {
    if (selection?.key !== key) return null;
    const row = result.rows.find(row => row.id === selection.rowId), bin = row?.bins[selection.index];
    return row && bin ? { row, bin } : null;
  }, [result, selection, key]);
  return { ready: enabled, retry: () => setRevision(value => value + 1), result, options, setOptions, measure, setMeasure, selected, navigation,
    loading: enabled && (state.key !== key || state.loading), error: state.key === key ? state.error : '',
    select: (rowId, index) => setSelection({ key, rowId, index }),
    async replay(evidence) {
      controllerRef.current?.abort(); const controller = new AbortController(); controllerRef.current = controller;
      setNavigation({ loading: true, error: '' });
      try { await navigateRef.current({ ...evidence, leadSeconds: 2 }, { signal: controller.signal }); if (!controller.signal.aborted) setNavigation({ loading: false, error: '' }); }
      catch (error) { if (!controller.signal.aborted) setNavigation({ loading: false, error: error.message }); }
    } };
}
