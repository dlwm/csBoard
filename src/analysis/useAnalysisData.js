// Lazily loads analysis payloads only while the Analysis panel is active.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCachedDemo, getCachedDemoRound } from '../demoCache.js';
import { getAnalysisDemosForPlayer } from './buildAnalysisDataset.js';

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
    setStatus(language === 'zh' ? '正在读取本地图的分析数据…' : 'Loading analysis data for this map...');
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
          };
        }));
        return { ...entry, analysisRoundGrenades: roundGrenades };
      }));
      if (cancelled) return;
      setDemos(available);
      setPlayers([...new Set(available.flatMap((entry) => entry.analysisRows.flatMap((snapshot) => (
        snapshot.players.map((player) => player.name)
      ))).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
      loadedKeyRef.current = loadKey;
      setStatus('');
    }).catch(() => {
      if (!cancelled) setStatus(language === 'zh' ? '分析数据读取失败' : 'Failed to load analysis data');
    }).finally(() => {
      if (!cancelled) setPlayersLoading(false);
    });
    return () => { cancelled = true; };
  }, [active, cachedDemos, cachedDemosLoading, mapName, language, cacheSchemaVersion]);

  const playerName = selectedPlayers[0] || '';
  const demosForPlayer = useMemo(() => getAnalysisDemosForPlayer(demos, playerName), [demos, playerName]);
  const selectedDemos = useMemo(() => demosForPlayer.filter((entry) => selectedDemoIds.includes(entry.id)), [demosForPlayer, selectedDemoIds]);
  const selectPlayer = useCallback((name) => {
    const matches = getAnalysisDemosForPlayer(demos, name);
    setSelectedPlayers(name ? [name] : []);
    setSelectedDemoIds(matches.slice(0, 3).map((entry) => entry.id));
  }, [demos]);

  return {
    demosForPlayer,
    playerName,
    playerQuery,
    players,
    playersLoading,
    selectPlayer,
    selectedDemoIds,
    selectedDemos,
    selectedPlayers,
    setPlayerQuery,
    setSelectedDemoIds,
    status,
  };
}
