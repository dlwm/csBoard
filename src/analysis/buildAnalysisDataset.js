// Builds the merged, filterable analysis dataset from one or more cached Demos.
import { ECONOMY_CATEGORIES } from './constants.js';

const MAP_UNITS_TO_METERS = 0.0254;
const AIRBURST_UTILITY_KINDS = new Set(['smoke', 'flash', 'he', 'decoy']);

const playerAppearsInDemo = (entry, playerName) => entry.analysisRows.some((snapshot) => (
  snapshot.players.some((player) => player.name === playerName)
));

export function getAnalysisDemosForPlayer(demos, playerName) {
  return playerName ? demos.filter((entry) => playerAppearsInDemo(entry, playerName)) : [];
}

function toWorldPosition(record, eventPrefix = '') {
  const x = Number(record?.[`${eventPrefix}X`] ?? record?.x);
  const y = Number(record?.[`${eventPrefix}Y`] ?? record?.y);
  const z = Number(record?.[`${eventPrefix}Z`] ?? record?.z);
  return [x, y, z].every(Number.isFinite)
    ? { x: y * MAP_UNITS_TO_METERS, y: z * MAP_UNITS_TO_METERS, z: x * MAP_UNITS_TO_METERS }
    : null;
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
      id: `${entry.id}:${round.round}`,
      startTick: round.startTick,
      endTick: roundEndEvent?.tick ?? round.endTick,
      plantTick: plantEvent?.tick ?? null,
      tickRate: entry.data.demo?.tickRate || 64,
      economyMatchup: matchup,
      side,
    }];
  }));
}

function appendAnalysisRows(rows, entry, rounds, roundMetadata, playerName, shift) {
  entry.analysisRows.forEach((snapshot) => {
    const round = rounds.find((candidate) => snapshot.tick >= candidate.startTick && snapshot.tick <= candidate.endTick);
    if (!round) return;
    const metadata = roundMetadata.get(round.round);
    rows.push({
      ...snapshot,
      tick: snapshot.tick + shift,
      players: snapshot.players.filter((player) => player.name === playerName),
      analysisRound: {
        ...metadata,
        startTick: metadata.startTick + shift,
        endTick: metadata.endTick + shift,
        plantTick: Number.isFinite(metadata.plantTick) ? metadata.plantTick + shift : null,
      },
    });
  });
}

function appendUtilityEvents(utilities, entry, rounds, roundMetadata, playerName, buildGrenadeSegments) {
  rounds.forEach((round) => {
    const metadata = roundMetadata.get(round.round);
    const grenadeData = entry.analysisRoundGrenades?.[round.round] || { projectiles: [], throwSnapshots: [] };
    buildGrenadeSegments(
      grenadeData.projectiles,
      entry.data.events || [],
      grenadeData.throwSnapshots,
      round,
      entry.data.demo?.tickRate || 64,
    ).forEach((segment) => {
      if (segment.throwEvent?.user_name !== playerName || !metadata?.side) return;
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
        },
      });
    });
  });
}

function appendDeathEvents(deaths, entry, rounds, roundMetadata) {
  deaths.push(...(entry.data.events || []).filter((event) => event.event_name === 'player_death').map((event) => {
    const round = rounds.find((candidate) => event.tick >= candidate.startTick && event.tick <= candidate.endTick);
    return {
      ...event,
      analysisDemoId: entry.id,
      analysisEconomyMatchup: round ? roundMetadata.get(round.round)?.economyMatchup : 'UNKNOWN:UNKNOWN',
    };
  }));
}

export function buildAnalysisDataset({ demos, playerName, getRoundEconomy, buildGrenadeSegments }) {
  const rows = [];
  const deaths = [];
  const utilities = [];
  let cursor = 0;

  demos.forEach((entry) => {
    const rounds = entry.data.rounds || [];
    const sourceStart = rounds.length ? Math.min(...rounds.map((round) => round.startTick)) : 0;
    const sourceEnd = Math.max(...rounds.map((round) => round.endTick), sourceStart);
    const shift = cursor - sourceStart;
    const roundMetadata = buildRoundMetadata(entry, rounds, playerName, getRoundEconomy);

    appendAnalysisRows(rows, entry, rounds, roundMetadata, playerName, shift);
    appendUtilityEvents(utilities, entry, rounds, roundMetadata, playerName, buildGrenadeSegments);
    appendDeathEvents(deaths, entry, rounds, roundMetadata);
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
