import { useEffect, useMemo, useRef, useState } from 'react';
import { buildKDAnchors, selectKDHotspot, KD_RECOMMENDATION_POLICY as policy, finitePoint } from './kdHotspots.js';

const EMPTY = Object.freeze({ groups: [], utilities: [], diagnostics: {} });
export default function useKDRecommendations({ active, mapName, demos, players, data, datasetLoading, flags, side, compute, navigate }) {
  const [selection, setSelection] = useState(null), [radius, setRadius] = useState(policy.radius);
  const [state, setState] = useState({ key: '', result: EMPTY, loading: false, error: '' });
  const [focusedId, setFocusedId] = useState('');
  const [navigation, setNavigation] = useState({ loading: false, error: '' });
  const navigationRequest = useRef(null);
  const filterKey = JSON.stringify([flags.killerHeat, flags.victimHeat, flags.targetHeat, flags.opponentHeat, flags.economyOwn, flags.economyOpponent, flags.areaEarlySeconds]);
  const scope = JSON.stringify([active, mapName, demos.map(item => [item.id, item.updatedAt]), players, side, filterKey]);
  const currentScope = useRef(scope); currentScope.current = scope;
  const hotspot = selection?.scope === scope ? selection.hotspot : null;
  const anchors = useMemo(() => active ? buildKDAnchors({ deaths: data.deaths, selectedPlayers: players, flags, side }) : [], [active, data, scope]);
  const selected = useMemo(() => selectKDHotspot(anchors, hotspot, radius), [anchors, hotspot, radius]);
  const kindKey = JSON.stringify(flags.utilityKinds);
  const key = JSON.stringify([scope, hotspot, radius, kindKey, selected.interactions]);
  const canQuery = active && !datasetLoading && hotspot && selected.interactions.length > 0;
  useEffect(() => {
    setFocusedId('');
    if (!canQuery) return;
    const controller = new AbortController();
    setState({ key, result: EMPTY, loading: true, error: '' });
    const timer = setTimeout(() => {
      compute('analysis.kdRecommendations', { ids: demos.map(item => item.id), mapName,
        interactions: selected.interactions, flags: { utilityKinds: flags.utilityKinds,
          economyOwn: flags.economyOwn, economyOpponent: flags.economyOpponent, areaEarlySeconds: flags.areaEarlySeconds } }, { signal: controller.signal })
        .then(result => { if (!controller.signal.aborted) setState({ key, result, loading: false, error: '' }); })
        .catch(error => { if (!controller.signal.aborted) setState({ key, result: EMPTY, loading: false, error: error.message }); });
    }, 120);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, canQuery, compute]);
  const effective = canQuery && state.key === key ? state : { result: EMPTY, loading: Boolean(canQuery), error: '' };
  const suggestions = useMemo(() => {
    if (!active) return [];
    const buckets = new Map();
    for (const item of anchors) {
      if (!item.hostile || !finitePoint(item.own) || !finitePoint(item.enemy)) continue;
      const p = item.anchor, key = `${Math.floor(p.x / radius)}:${Math.floor(p.y / policy.heightTolerance)}:${Math.floor(p.z / radius)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(item);
    }
    return [...buckets].map(([id, items]) => {
      const centre = items.reduce((p, item) => ({ x: p.x + item.anchor.x / items.length, y: p.y + item.anchor.y / items.length, z: p.z + item.anchor.z / items.length }), { x: 0, y: 0, z: 0 });
      const representative = items.reduce((best, item) => Math.hypot(item.anchor.x - centre.x, item.anchor.y - centre.y, item.anchor.z - centre.z)
        < Math.hypot(best.anchor.x - centre.x, best.anchor.y - centre.y, best.anchor.z - centre.z) ? item : best);
      return { id, position: representative.anchor, count: new Set(items.map(item => item.eventId)).size };
    }).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)).filter((item, index, all) => !all.slice(0, index).some(other =>
      Math.abs(item.position.y - other.position.y) <= policy.heightTolerance && Math.hypot(item.position.x - other.position.x, item.position.z - other.position.z) < radius)).slice(0, 5);
  }, [anchors, radius, active]);
  const select = value => {
    if (!active || !finitePoint(value?.position)) return;
    setSelection({ scope: currentScope.current, hotspot: { position: { ...value.position }, kind: value.kind || null } });
  };
  useEffect(() => {
    setNavigation({ loading: false, error: '' });
    return () => { navigationRequest.current?.abort(); navigationRequest.current = null; };
  }, [key]);
  const openEvidence = async item => {
    navigationRequest.current?.abort();
    const controller = new AbortController(); navigationRequest.current = controller;
    setNavigation({ loading: true, error: '' });
    try {
      await navigate(item, { signal: controller.signal });
      if (!controller.signal.aborted) setNavigation({ loading: false, error: '' });
    } catch (error) { if (!controller.signal.aborted) setNavigation({ loading: false, error: error.message }); }
    finally { if (navigationRequest.current === controller) navigationRequest.current = null; }
  };
  return { ...effective.result, loading: effective.loading, error: effective.error, hotspot, radius,
    setRadius: value => setRadius(Math.max(policy.minRadius, Math.min(policy.maxRadius, Number(value) || policy.radius))),
    select, clear: () => setSelection(null), suggestions, focusedId, setFocusedId,
    interactions: selected.interactions, totalInteractions: selected.total, sampledInteractions: new Set(selected.interactions.map(item => item.eventId)).size,
    queryKey: key, focusedGroup: effective.result.groups.find(group => group.id === focusedId) || null, navigation, openEvidence };
}
