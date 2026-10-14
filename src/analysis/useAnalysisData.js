// Lazily loads analysis payloads only while the Analysis panel is active.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPlatform } from '../platform/index.js';
import { getAnalysisDemosForPlayers } from './buildAnalysisDataset.js';
import { translate } from '../i18n.js';

export default function useAnalysisData({ active, cachedDemos, cachedDemosLoading, mapName, language, cacheSchemaVersion }) {
  const [demos, setDemos] = useState([]);
  const [players, setPlayers] = useState([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playerQuery, setPlayerQuery] = useState('');
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [selectedDemoIds, setSelectedDemoIds] = useState([]);
  const [status, setStatus] = useState('');
  const loadedKeyRef = useRef('');
  const catalogueKey = useMemo(() => `${mapName}|${cachedDemos.filter(entry => entry.rawMap === mapName).map(entry => `${entry.id}:${entry.updatedAt || ''}`).sort().join('|')}`, [cachedDemos, mapName]);

  useEffect(() => {
    if (!active) {
      setPlayersLoading(false);
      return undefined;
    }
    // Ignore stale IndexedDB results after a panel/map change.
    let cancelled = false;
    if (cachedDemosLoading) {
      setPlayersLoading(true);
      return undefined;
    }
    const candidates = cachedDemos.filter((entry) => entry.rawMap === mapName);
    const loadKey = catalogueKey;
    if (loadedKeyRef.current === loadKey) {
      setPlayersLoading(false);
      return undefined;
    }
    setDemos([]);
    setPlayers([]);
    setPlayerQuery('');
    setSelectedPlayers([]);
    setSelectedDemoIds([]);
    if (!candidates.length) {
      loadedKeyRef.current = loadKey;
      setStatus('');
      setPlayersLoading(false);
      return undefined;
    }
    setPlayersLoading(true);
    setStatus("analysis.analysisData.loadingAnalysisDataForThisMap");
    const controller = new AbortController();
    getPlatform().compute('analysis.catalog', { ids: candidates.map(entry => entry.id), map: mapName, schema: cacheSchemaVersion }, { signal: controller.signal }).then(indexed => {
      if (cancelled) return;
      setDemos(indexed);
      setPlayers([...new Set(indexed.flatMap((entry) => entry.analysisPlayerNames))].sort((left, right) => left.localeCompare(right)));
      loadedKeyRef.current = loadKey;
      setStatus('');
    }).catch(() => {
      if (!cancelled) setStatus("analysis.analysisData.failedToLoadAnalysisData");
    }).finally(() => {
      if (!cancelled) setPlayersLoading(false);
    });
    return () => { cancelled = true; controller.abort(); };
  }, [active, cachedDemos, cachedDemosLoading, mapName, cacheSchemaVersion, catalogueKey]);

  const playerName = selectedPlayers[0] || '';
  const demosForPlayers = useMemo(() => getAnalysisDemosForPlayers(demos, selectedPlayers), [demos, selectedPlayers]);
  const selectedDemos = useMemo(() => demosForPlayers.filter((entry) => selectedDemoIds.includes(entry.id)), [demosForPlayers, selectedDemoIds]);
  const togglePlayer = useCallback((name) => {
    if (!name) return;
    const adding = !selectedPlayers.includes(name);
    const next = adding ? [...selectedPlayers, name] : selectedPlayers.filter((player) => player !== name);
    const available = getAnalysisDemosForPlayers(demos, next);
    setSelectedPlayers(next);
    setSelectedDemoIds((currentIds) => {
      if (!next.length) return [];
      const availableIds = new Set(available.map((entry) => entry.id));
      const preserved = currentIds.filter((id) => availableIds.has(id));
      if (!selectedPlayers.length) return available.slice(0, 3).map((entry) => entry.id);
      if (adding && !preserved.some((id) => demos.find((entry) => entry.id === id)?.analysisPlayerNames.includes(name))) {
        const newestMatch = available.find((entry) => entry.analysisPlayerNames.includes(name) && !preserved.includes(entry.id));
        if (newestMatch) return [...preserved, newestMatch.id];
      }
      return preserved.length ? preserved : available.slice(0, 3).map((entry) => entry.id);
    });
  }, [demos, selectedPlayers]);
  // Batch selection must publish one query, not race multiple toggle closures.
  // 批量选择一次发布；不循环调用 toggle，避免旧闭包覆盖选手和 Demo 范围。
  const selectPlayers = useCallback(names => {
    const known = new Set(players), next = [...new Set(names)].filter(name => known.has(name));
    const available = getAnalysisDemosForPlayers(demos, next);
    setSelectedPlayers(next); setPlayerQuery('');
    setSelectedDemoIds(current => {
      if (!next.length) return [];
      const ids = current.filter(id => available.some(entry => entry.id === id));
      if (!ids.length) ids.push(...available.slice(0, 3).map(entry => entry.id));
      for (const name of next) if (!ids.some(id => available.find(entry => entry.id === id)?.analysisPlayerNames.includes(name))) {
        const entry = available.find(entry => entry.analysisPlayerNames.includes(name));
        if (entry && !ids.includes(entry.id)) ids.push(entry.id);
      }
      return ids;
    });
  }, [demos, players]);
  const clearPlayers = useCallback(() => {
    setSelectedPlayers([]);
    setSelectedDemoIds([]);
    setPlayerQuery('');
  }, []);

  return {
    clearPlayers,
    selectPlayers,
    catalogueKey,
    catalogueReady: active && !cachedDemosLoading && !playersLoading && loadedKeyRef.current === catalogueKey,
    demosForPlayers,
    playerName,
    playerQuery,
    players,
    playersLoading,
    togglePlayer,
    selectedDemoIds,
    selectedDemos,
    selectedPlayers,
    setPlayerQuery,
    setSelectedDemoIds,
    setStatus,
    status: translate(language, status),
  };
}
