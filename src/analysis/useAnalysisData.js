// Lazily loads analysis payloads only while the Analysis panel is active.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPlatform } from '../platform/index.js';
import { getAnalysisDemosForPlayers } from './buildAnalysisDataset.js';
import { localize } from '../i18n.js';

export default function useAnalysisData({ active, cachedDemos, cachedDemosLoading, mapName, language, cacheSchemaVersion }) {
  const [demos, setDemos] = useState([]);
  const [players, setPlayers] = useState([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playerQuery, setPlayerQuery] = useState('');
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [selectedDemoIds, setSelectedDemoIds] = useState([]);
  const [status, setStatus] = useState('');
  const loadedKeyRef = useRef('');

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
    const loadKey = `${mapName}|${candidates.map((entry) => `${entry.id}:${entry.updatedAt || ''}`).sort().join('|')}`;
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
    setStatus(localize(language, { zh: '正在读取本地图的分析数据…', en: 'Loading analysis data for this map...', ru: 'Загрузка данных аналитики для этой карты…' }));
    const controller = new AbortController();
    getPlatform().compute('analysis.catalog', { ids: candidates.map(entry => entry.id), map: mapName, schema: cacheSchemaVersion }, { signal: controller.signal }).then(indexed => {
      if (cancelled) return;
      setDemos(indexed);
      setPlayers([...new Set(indexed.flatMap((entry) => entry.analysisPlayerNames))].sort((left, right) => left.localeCompare(right)));
      loadedKeyRef.current = loadKey;
      setStatus('');
    }).catch(() => {
      if (!cancelled) setStatus(localize(language, { zh: '分析数据读取失败', en: 'Failed to load analysis data', ru: 'Не удалось загрузить данные аналитики' }));
    }).finally(() => {
      if (!cancelled) setPlayersLoading(false);
    });
    return () => { cancelled = true; controller.abort(); };
  }, [active, cachedDemos, cachedDemosLoading, mapName, language, cacheSchemaVersion]);

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
  const clearPlayers = useCallback(() => {
    setSelectedPlayers([]);
    setSelectedDemoIds([]);
    setPlayerQuery('');
  }, []);

  return {
    clearPlayers,
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
    status,
  };
}
