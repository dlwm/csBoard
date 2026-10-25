import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_COMBINATION_OPTIONS, COMBINATION_POLICY } from './utilityCombinations.js';
import { utilityMatchesFilters } from './utilityFilters.js';

const EMPTY = [];
export default function useUtilityCombinations({ data, flags, side, active, datasetLoading, compute, navigate }) {
  const [options, setOptions] = useState(DEFAULT_COMBINATION_OPTIONS);
  const [state, setState] = useState({ groups: EMPTY, diagnostics: {}, loading: false, error: '' });
  const [focusedId, setFocusedId] = useState('');
  const [navigation, setNavigation] = useState({ loading: false, error: '' });
  const callbacks = useRef(navigate); callbacks.current = navigate;
  const navigationRef = useRef(null);
  const filterKey = JSON.stringify([flags.utilityKinds, flags.economyOwn, flags.economyOpponent, side, options]);
  const request = useMemo(() => ({ data, active, filterKey }), [data, active, filterKey]);
  useEffect(() => {
    navigationRef.current?.abort(); setNavigation({ loading: false, error: '' }); setFocusedId('');
    if (!active || datasetLoading || !data.utilities.length) return;
    const controller = new AbortController();
    setState({ key: request, groups: EMPTY, diagnostics: {}, loading: true, error: '' });
    const timer = setTimeout(() => {
      const filtered = data.utilities.filter(utility => utilityMatchesFilters(utility, flags, side)).sort((a, b) => a.id.localeCompare(b.id));
      const utilities = filtered.slice(0, COMBINATION_POLICY.maxUtilities).map(utility => ({
        id: utility.id, kind: utility.kind, side: utility.side, economyMatchup: utility.economyMatchup,
        occurrenceId: JSON.stringify([utility.source.demoIdentity || utility.source.demoId, utility.source.round, utility.segment.throwTick, utility.segment.throwEvent.user_steamid || utility.segment.throwEvent.user_name, utility.kind]),
        thrower: utility.segment.throwEvent.user_name,
        throwSeconds: utility.segment.throwTick / (utility.source.tickRate || 64),
        effectSeconds: Number.isFinite(utility.segment.effectTick) ? utility.segment.effectTick / (utility.source.tickRate || 64) : null,
        throwPosition: utility.throwPosition, landing: utility.landing, projectiles: utility.projectiles,
        source: { demoId: utility.source.demoId, demoIdentity: utility.source.demoIdentity, fileName: utility.source.fileName,
          round: utility.source.round, tickRate: utility.source.tickRate || 64 } }));
      compute('analysis.combinations', { ids: [], utilities, flags: { utilityKinds: flags.utilityKinds,
        economyOwn: flags.economyOwn, economyOpponent: flags.economyOpponent }, side, options,
        inputOmitted: Math.max(0, filtered.length - utilities.length) }, { signal: controller.signal })
        .then(result => { if (!controller.signal.aborted) setState({ ...result, key: request, loading: false, error: '' }); })
        .catch(error => { if (!controller.signal.aborted) setState({ key: request, groups: EMPTY, diagnostics: {}, loading: false, error: error.message }); });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); navigationRef.current?.abort(); };
  }, [request, datasetLoading, compute]);
  const visible = !active || !data.utilities.length ? { groups: EMPTY, diagnostics: {}, loading: false, error: '' }
    : datasetLoading || state.key !== request ? { groups: EMPTY, diagnostics: {}, loading: true, error: '' } : state;
  return { ...visible, options, setOptions, focusedId, setFocusedId, navigation,
    focusedGroup: visible.groups.find(group => group.id === focusedId) || null,
    async replay(occurrence) {
      navigationRef.current?.abort(); const controller = new AbortController(); navigationRef.current = controller;
      setNavigation({ loading: true, error: '' });
      try { await callbacks.current(occurrence, { signal: controller.signal }); if (!controller.signal.aborted) setNavigation({ loading: false, error: '' }); }
      catch (error) { if (!controller.signal.aborted) setNavigation({ loading: false, error: error.message }); }
    } };
}
