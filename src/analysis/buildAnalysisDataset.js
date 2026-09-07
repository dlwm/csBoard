// Builds the merged, filterable analysis dataset from one or more cached Demos.
import { ECONOMY_CATEGORIES } from './constants.js';
import { buildDemoGrenadeSegments } from '../demo/grenades.js';

const MAP_UNITS_TO_METERS = 0.0254;
const AIRBURST_UTILITY_KINDS = new Set(['smoke', 'flash', 'he', 'decoy']);

const playerAppearsInDemo = (entry, playerName) => entry.analysisRows.some((snapshot) => (
  snapshot.players.some((player) => player.name === playerName)
));

export function getAnalysisDemosForPlayers(demos, playerNames) {
  if (!playerNames?.length) return [];
  const selected = new Set(playerNames);
  return demos.filter((entry) => entry.analysisPlayerNames
    ? entry.analysisPlayerNames.some((name) => selected.has(name))
    : playerNames.some((name) => playerAppearsInDemo(entry, name)));
}

// Kept for callers that still need the single-player form.
export const getAnalysisDemosForPlayer = (demos, playerName) => getAnalysisDemosForPlayers(demos, playerName ? [playerName] : []);

function toWorldPosition(record, eventPrefix = '') {
  const x = Number(record?.[`${eventPrefix}X`] ?? record?.x);
  const y = Number(record?.[`${eventPrefix}Y`] ?? record?.y);
  const z = Number(record?.[`${eventPrefix}Z`] ?? record?.z);
  return [x, y, z].every(Number.isFinite)
    ? { x: y * MAP_UNITS_TO_METERS, y: z * MAP_UNITS_TO_METERS, z: x * MAP_UNITS_TO_METERS }
    : null;
}

function findRoundAtTick(rounds, tick) {
  let low = 0;
  let high = rounds.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const round = rounds[middle];
    if (tick < round.startTick) high = middle - 1;
    else if (tick > round.endTick) low = middle + 1;
    else return round;
  }
  return null;
}

function buildRoundMetadata(entry, rounds, playerName, getRoundEconomy) {
  return new Map(rounds.map((round) => {
    const player = entry.analysisRows.find((snapshot) => (
      snapshot.tick >= round.startTick
      && snapshot.tick <= round.endTick
      && snapshot.players.some((candidate) => candidate.name === playerName)
    ))?.players.find((candidate) => candidate.name === playerName);
    const side = player?.team === 2 ? 'T' : player?.team === 3 ? 'CT' : null;
    const economy = getRoundEconomy(round, entry.data.roundData?.find((item) => item.round === round.round));
    const matchup = side ? `${economy[side].label}:${economy[side === 'T' ? 'CT' : 'T'].label}` : 'UNKNOWN:UNKNOWN';
    const roundEndEvent = entry.data.events?.find((event) => (
      event.event_name === 'round_end' && event.tick >= round.startTick && event.tick <= round.endTick
    ));
    const plantEvent = entry.data.events?.find((event) => (
      event.event_name === 'bomb_planted'
      && event.tick >= round.startTick
      && event.tick <= (roundEndEvent?.tick ?? round.endTick)
    ));
    return [round.round, {
      // A player-specific id keeps economy and side metadata independent in multi-select mode.
      id: `${entry.id}:${round.round}:${playerName}`,
      playerName,
      startTick: round.startTick,
      endTick: roundEndEvent?.tick ?? round.endTick,
      plantTick: plantEvent?.tick ?? null,
      tickRate: entry.data.demo?.tickRate || 64,
      economyMatchup: matchup,
      side,
    }];
  }));
}

function appendAnalysisRows(rows, entry, rounds, roundMetadataByPlayer, selectedPlayers, shift) {
  entry.analysisRows.forEach((snapshot) => {
    const round = findRoundAtTick(rounds, snapshot.tick);
    if (!round) return;
    snapshot.players.forEach((player) => {
      if (!selectedPlayers.has(player.name)) return;
      const metadata = roundMetadataByPlayer.get(player.name)?.get(round.round);
      if (!metadata?.side) return;
      rows.push({
        ...snapshot,
        tick: snapshot.tick + shift,
        players: [player],
        analysisRound: {
          ...metadata,
          startTick: metadata.startTick + shift,
          endTick: metadata.endTick + shift,
          plantTick: Number.isFinite(metadata.plantTick) ? metadata.plantTick + shift : null,
        },
      });
    });
  });
}

function appendUtilityEvents(utilities, entry, rounds, roundMetadataByPlayer, selectedPlayers, buildGrenadeSegments) {
  rounds.forEach((round) => {
    const grenadeData = entry.analysisRoundGrenades?.[round.round] || { projectiles: [], throwSnapshots: [] };
    buildGrenadeSegments(
      grenadeData.projectiles,
      entry.data.events || [],
      grenadeData.throwSnapshots,
      round,
      entry.data.demo?.tickRate || 64,
    ).forEach((segment) => {
      const playerName = segment.throwEvent?.user_name;
      if (!selectedPlayers.has(playerName)) return;
      const metadata = roundMetadataByPlayer.get(playerName)?.get(round.round);
      if (!metadata?.side) return;
      const throwPosition = toWorldPosition(segment.throwEvent, 'user_');
      const projectilePath = segment.projectiles.map((record) => toWorldPosition(record)).filter(Boolean);
      const landing = AIRBURST_UTILITY_KINDS.has(segment.kind)
        ? projectilePath.at(-1) || toWorldPosition(segment.landing)
        : toWorldPosition(segment.landing) || projectilePath.at(-1) || null;
      if (!throwPosition || !landing) return;
      utilities.push({
        id: `${entry.id}:${round.round}:${segment.id}`,
        kind: segment.kind,
        side: metadata.side,
        economyMatchup: metadata.economyMatchup,
        throwPosition,
        landing,
        projectiles: projectilePath,
        segment,
        source: {
          fileName: entry.data.demo?.fileName || entry.fileName || 'Demo',
          round: round.round,
          tickRate: entry.data.demo?.tickRate || 64,
          smokeVoxelFrames: grenadeData.smokeVoxelFrames || [],
        },
      });
    });
  });
}

function appendDeathEvents(deaths, entry, rounds, roundMetadataByPlayer) {
  deaths.push(...(entry.data.events || []).filter((event) => event.event_name === 'player_death').map((event) => {
    const round = findRoundAtTick(rounds, event.tick);
    const economyByPlayer = Object.fromEntries([...roundMetadataByPlayer].map(([name, metadata]) => (
      [name, round ? metadata.get(round.round)?.economyMatchup : 'UNKNOWN:UNKNOWN']
    )));
    return {
      ...event,
      analysisDemoId: entry.id,
      analysisEconomyByPlayer: economyByPlayer,
      analysisEconomyMatchup: Object.values(economyByPlayer)[0] || 'UNKNOWN:UNKNOWN',
    };
  }));
}

export function buildAnalysisDataset({ demos, selectedPlayers, playerName, getRoundEconomy }) {
  const rows = [];
  const deaths = [];
  const utilities = [];
  const playerNames = selectedPlayers?.length ? selectedPlayers : playerName ? [playerName] : [];
  const selected = new Set(playerNames);
  let cursor = 0;

  demos.forEach((entry) => {
    const rounds = entry.data.rounds || [];
    const sourceStart = rounds.length ? Math.min(...rounds.map((round) => round.startTick)) : 0;
    const sourceEnd = Math.max(...rounds.map((round) => round.endTick), sourceStart);
    const shift = cursor - sourceStart;
    const roundMetadataByPlayer = new Map();
    playerNames.forEach((name) => {
      if (entry.analysisPlayerNames && !entry.analysisPlayerNames.includes(name)) return;
      const roundMetadata = buildRoundMetadata(entry, rounds, name, getRoundEconomy);
      roundMetadataByPlayer.set(name, roundMetadata);
    });
    appendAnalysisRows(rows, entry, rounds, roundMetadataByPlayer, selected, shift);
    appendUtilityEvents(utilities, entry, rounds, roundMetadataByPlayer, selected, buildDemoGrenadeSegments);
    appendDeathEvents(deaths, entry, rounds, roundMetadataByPlayer);
    cursor += Math.max(256, sourceEnd - sourceStart + 256);
  });

  return { rows: rows.sort((left, right) => left.tick - right.tick), deaths, utilities };
}

export function getAnalysisEconomyAvailability(rows) {
  return rows.reduce((available, snapshot) => {
    const [own, opponent] = String(snapshot.analysisRound?.economyMatchup || '').split(':');
    if (ECONOMY_CATEGORIES.includes(own)) available.own.add(own);
    if (ECONOMY_CATEGORIES.includes(opponent)) available.opponent.add(opponent);
    return available;
  }, { own: new Set(), opponent: new Set() });
}
