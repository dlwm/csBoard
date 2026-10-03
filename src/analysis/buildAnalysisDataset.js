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
  const coordinates = ['X', 'Y', 'Z'].map(axis => record?.[`${eventPrefix}${axis}`] ?? record?.[axis.toLowerCase()]);
  if (coordinates.some(value => value == null)) return null;
  const [x, y, z] = coordinates.map(Number);
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

// Scan snapshots/events once per Demo instead of once per player per round.
function indexRoundMetadata(entry, rounds, selectedPlayers, getRoundEconomy) {
  const selected = new Set(selectedPlayers);
  const firstPlayers = new Map(rounds.map(round => [round.round, new Map()]));
  for (const snapshot of entry.analysisRows) {
    const round = findRoundAtTick(rounds, snapshot.tick);
    if (!round) continue;
    const players = firstPlayers.get(round.round);
    for (const player of snapshot.players) {
      if (selected.has(player.name) && !players.has(player.name)) players.set(player.name, player);
    }
  }
  const eventsByRound = new Map();
  for (const event of entry.data.events || []) {
    if (event.event_name !== 'round_end' && event.event_name !== 'bomb_planted') continue;
    const round = findRoundAtTick(rounds, event.tick);
    if (!round) continue;
    const events = eventsByRound.get(round.round) || {};
    if (!events[event.event_name]) events[event.event_name] = event;
    eventsByRound.set(round.round, events);
  }
  const roundData = new Map((entry.data.roundData || []).map(data => [data.round, data]));
  return new Map(rounds.map(round => [round.round, {
    players: firstPlayers.get(round.round),
    economy: getRoundEconomy(round, roundData.get(round.round)),
    events: eventsByRound.get(round.round) || {},
  }]));
}

function buildRoundMetadata(entry, rounds, playerName, index) {
  return new Map(rounds.map(round => {
    const { players, economy, events } = index.get(round.round);
    const player = players.get(playerName);
    const side = player?.team === 2 ? 'T' : player?.team === 3 ? 'CT' : null;
    const endTick = events.round_end?.tick ?? round.endTick;
    const plantTick = events.bomb_planted?.tick;
    return [round.round, {
      id: `${entry.id}:${round.round}:${playerName}`,
      demoId: entry.id,
      fileName: entry.data.demo?.fileName || entry.fileName || 'Demo',
      roundNumber: round.round,
      playerName,
      startTick: round.startTick,
      endTick,
      plantTick: Number.isFinite(plantTick) && plantTick <= endTick ? plantTick : null,
      tickRate: entry.data.demo?.tickRate || 64,
      economyMatchup: side ? `${economy[side].label}:${economy[side === 'T' ? 'CT' : 'T'].label}` : 'UNKNOWN:UNKNOWN',
      side,
    }];
  }));
}

function appendAnalysisRows(rows, entry, rounds, roundMetadataByPlayer, selectedPlayers, shift) {
  const shiftedMetadata = new Map();
  entry.analysisRows.forEach((snapshot) => {
    const round = findRoundAtTick(rounds, snapshot.tick);
    if (!round) return;
    snapshot.players.forEach((player) => {
      if (!selectedPlayers.has(player.name)) return;
      const metadata = roundMetadataByPlayer.get(player.name)?.get(round.round);
      if (!metadata?.side) return;
      let analysisRound = shiftedMetadata.get(metadata.id);
      if (!analysisRound) {
        analysisRound = { ...metadata, startTick: metadata.startTick + shift,
          endTick: metadata.endTick + shift,
          plantTick: Number.isFinite(metadata.plantTick) ? metadata.plantTick + shift : null };
        shiftedMetadata.set(metadata.id, analysisRound);
      }
      rows.push({ ...snapshot, tick: snapshot.tick + shift, players: [player], analysisRound });
    });
  });
}

function appendUtilityEvents(utilities, entry, rounds, roundMetadataByPlayer, selectedPlayers, buildGrenadeSegments, includeReplay, diagnostics) {
  const selectedThrows = (entry.data.events || []).filter(event => event.event_name === 'grenade_thrown' && selectedPlayers.has(event.user_name) && rounds.some(round => event.tick >= (round.contextStartTick ?? round.startTick) && event.tick <= round.endTick));
  diagnostics.throwEvents += selectedThrows.length;
  const matchedThrows = new Set();
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
      matchedThrows.add(segment.throwEvent);
      if (!metadata?.side) { diagnostics.missingSide += 1; return; }
      const throwPosition = toWorldPosition(segment.throwEvent, 'user_');
      const projectilePath = [];
      for (const record of segment.projectiles) {
        const point = toWorldPosition(record);
        if (!point) continue;
        const previous = projectilePath.at(-1);
        // Resting grenades can repeat the same position for thousands of ticks.
        // Keep every moving point; identical positions add no trajectory geometry.
        if (!previous || point.x !== previous.x || point.y !== previous.y || point.z !== previous.z) projectilePath.push(point);
      }
      const landing = AIRBURST_UTILITY_KINDS.has(segment.kind)
        ? projectilePath.at(-1) || toWorldPosition(segment.landing)
        : toWorldPosition(segment.landing) || projectilePath.at(-1) || null;
      if (!throwPosition || !landing) { diagnostics.missingPosition += 1; return; }
      utilities.push({
        id: `${entry.id}:${round.round}:${segment.id}`,
        kind: segment.kind,
        side: metadata.side,
        economyMatchup: metadata.economyMatchup,
        throwPosition,
        landing,
        projectiles: projectilePath,
        segment: includeReplay ? segment : { ...segment, projectiles: [], snapshots: [] },
        source: {
          demoId: entry.id,
          demoIdentity: JSON.stringify([entry.data.demo?.fileName || entry.fileName, entry.data.demo?.bytes, entry.data.demo?.maxTick]),
          fileName: entry.data.demo?.fileName || entry.fileName || 'Demo',
          round: round.round,
          tickRate: entry.data.demo?.tickRate || 64,
          smokeVoxelFrames: includeReplay && segment.kind === 'smoke' ? (grenadeData.smokeVoxelFrames || []).filter(frame =>
            (Number(frame.entityId) === Number(segment.entityId) || Number(frame.entityId) === Number(segment.landing?.entityid))) : [],
          infernoFrames: includeReplay && segment.kind === 'fire' ? (grenadeData.infernoFrames || []).filter(frame =>
            (Number(frame.entityId) === Number(segment.entityId) || Number(frame.entityId) === Number(segment.landing?.entityid))) : [],
        },
      });
    });
  });
  diagnostics.unmatchedThrows += selectedThrows.filter(event => !matchedThrows.has(event)).length;
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
      analysisFileName: entry.data.demo?.fileName || entry.fileName || 'Demo',
      analysisRound: round?.round ?? null,
      analysisEconomyByPlayer: economyByPlayer,
      analysisEconomyMatchup: Object.values(economyByPlayer)[0] || 'UNKNOWN:UNKNOWN',
    };
  }));
}

export function buildAnalysisDataset({ demos, selectedPlayers, playerName, getRoundEconomy, includeUtilities = true, includeReplay = true }) {
  const rows = [];
  const deaths = [];
  const utilities = [];
  const utilityDiagnostics = { throwEvents: 0, unmatchedThrows: 0, missingPosition: 0, missingSide: 0 };
  const playerNames = selectedPlayers?.length ? selectedPlayers : playerName ? [playerName] : [];
  const selected = new Set(playerNames);
  let cursor = 0;

  demos.forEach((entry) => {
    const rounds = entry.data.rounds || [];
    const sourceStart = rounds.length ? Math.min(...rounds.map((round) => round.startTick)) : 0;
    const sourceEnd = Math.max(...rounds.map((round) => round.endTick), sourceStart);
    const shift = cursor - sourceStart;
    const roundMetadataByPlayer = new Map();
    const metadataIndex = indexRoundMetadata(entry, rounds, playerNames, getRoundEconomy);
    playerNames.forEach((name) => {
      if (entry.analysisPlayerNames && !entry.analysisPlayerNames.includes(name)) return;
      const roundMetadata = buildRoundMetadata(entry, rounds, name, metadataIndex);
      roundMetadataByPlayer.set(name, roundMetadata);
    });
    appendAnalysisRows(rows, entry, rounds, roundMetadataByPlayer, selected, shift);
    if (includeUtilities) appendUtilityEvents(utilities, entry, rounds, roundMetadataByPlayer, selected, buildDemoGrenadeSegments, includeReplay, utilityDiagnostics);
    appendDeathEvents(deaths, entry, rounds, roundMetadataByPlayer);
    cursor += Math.max(256, sourceEnd - sourceStart + 256);
  });

  return { rows: rows.sort((left, right) => left.tick - right.tick), deaths, utilities, utilityDiagnostics };
}

export function getAnalysisEconomyAvailability(rows) {
  return rows.reduce((available, snapshot) => {
    const [own, opponent] = String(snapshot.analysisRound?.economyMatchup || '').split(':');
    if (ECONOMY_CATEGORIES.includes(own)) available.own.add(own);
    if (ECONOMY_CATEGORIES.includes(opponent)) available.opponent.add(opponent);
    return available;
  }, { own: new Set(), opponent: new Set() });
}
