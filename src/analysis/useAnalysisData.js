// Lazily loads analysis payloads only while the Analysis panel is active.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCachedDemo, getCachedDemoRound } from '../demoCache.js';
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
    Promise.all(candidates.map((metadata) => getCachedDemo(metadata.id).catch(() => null))).then(async (entries) => {
      if (cancelled) return;
      const compatible = entries.filter((entry) => (
        entry?.data?.cacheSchemaVersion === cacheSchemaVersion
        && entry.data.demo.map === mapName
        && entry.analysisRows?.length
      )).sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
      const available = await Promise.all(compatible.map(async (entry) => {
        const roundGrenades = {};
        await Promise.all((entry.data.rounds || []).map(async (round) => {
          const cachedRound = await getCachedDemoRound(entry.id, round.round).catch(() => null);
          roundGrenades[round.round] = {
            projectiles: cachedRound?.projectiles || [],
            throwSnapshots: cachedRound?.throwSnapshots || [],
            smokeVoxelFrames: cachedRound?.smokeVoxelFrames || [],
            infernoFrames: cachedRound?.infernoFrames || [],
          };
        }));
        return { ...entry, analysisRoundGrenades: roundGrenades };
      }));
      if (cancelled) return;
      // Index names once; selection changes should not rescan every snapshot in every Demo.
      const indexed = available.map((entry) => ({
        ...entry,
        analysisPlayerNames: [...new Set(entry.analysisRows.flatMap((snapshot) => snapshot.players.map((player) => player.name)).filter(Boolean))],
      }));
      setDemos(indexed);
      setPlayers([...new Set(indexed.flatMap((entry) => entry.analysisPlayerNames))].sort((left, right) => left.localeCompare(right)));
      loadedKeyRef.current = loadKey;
      setStatus('');
    }).catch(() => {
      if (!cancelled) setStatus(localize(language, { zh: '分析数据读取失败', en: 'Failed to load analysis data', ru: 'Не удалось загрузить данные аналитики' }));
    }).finally(() => {
      if (!cancelled) setPlayersLoading(false);
    });
    return () => { cancelled = true; };
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
