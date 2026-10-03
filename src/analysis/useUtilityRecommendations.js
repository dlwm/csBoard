import { useEffect, useMemo, useState } from 'react';
import { getPlatform } from '../platform/index.js';
const EMPTY = [];
export default function useUtilityRecommendations({ data, flags, side, active, datasetLoading, formulas }) {
  const [state, setState] = useState({ key: null, groups: EMPTY, loading: false, error: '' });
  const filterKey = JSON.stringify([flags.utilityKinds, flags.economyOwn, flags.economyOpponent, side, formulas]);
  const request = useMemo(() => ({ data, filterKey, active }), [data, filterKey, active]);
  useEffect(() => {
    if (!active || datasetLoading || !data.utilities.length) return;
    const controller = new AbortController();
    setState({ key: request, groups: EMPTY, loading: true, error: '' });
    const timer = setTimeout(() => {
      const utilities = data.utilities.map(utility => ({ id: utility.id,
        occurrenceId: JSON.stringify([utility.source.demoIdentity || utility.source.demoId, utility.source.round, utility.segment.throwTick,
          utility.segment.throwEvent.user_steamid || utility.segment.throwEvent.user_name, utility.kind]), flightTime: Number.isFinite(utility.segment.effectTick) && Number.isFinite(utility.segment.throwTick) ? Math.max(0, (utility.segment.effectTick - utility.segment.throwTick) / (utility.source.tickRate || 64)) : null, kind: utility.kind, side: utility.side,
        economyMatchup: utility.economyMatchup, throwPosition: utility.throwPosition, landing: utility.landing,
        projectiles: utility.projectiles, source: { demoId: utility.source.demoIdentity || utility.source.demoId, round: utility.source.round } }));
      getPlatform().compute('analysis.recommendations', { ids: [], utilities, flags: {
        utilityKinds: flags.utilityKinds, economyOwn: flags.economyOwn, economyOpponent: flags.economyOpponent }, side, formulas }, { signal: controller.signal })
        .then(groups => { if (!controller.signal.aborted) setState({ key: request, groups, loading: false, error: '' }); })
        .catch(error => { if (!controller.signal.aborted) setState({ key: request, groups: EMPTY, loading: false, error: error.message }); });
    }, 80);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [request, datasetLoading]);
  if (!active) return { groups: EMPTY, loading: false, error: '' };
  if (datasetLoading) return { groups: EMPTY, loading: true, error: '' };
  if (!data.utilities.length) return { groups: EMPTY, loading: false, error: '' };
  return state.key === request ? state : { groups: EMPTY, loading: true, error: '' };
}
