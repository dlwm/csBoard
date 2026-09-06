// Aggregates KD, area-time, and utility events into render-ready spatial cells.
import { ANALYSIS_AREA_PHASES, ANALYSIS_UTILITY_COLORS, ANALYSIS_UTILITY_KINDS, ECONOMY_CATEGORIES } from './constants.js';

const MAP_UNITS_TO_METERS = 0.0254;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export default function buildHeatCells({
  analysisEnabled,
  flags,
  selectedPlayers,
  side,
  analysisUtilities,
  analysisRows,
  analysisDeaths,
  heatDeaths,
  modelCenter,
}) {
  const selected = new Set(selectedPlayers);
  const economyMatches = (matchup) => {
    const [own, opponent] = String(matchup || '').split(':');
    return (flags.economyOwn || ECONOMY_CATEGORIES).includes(own)
      && (flags.economyOpponent || ECONOMY_CATEGORIES).includes(opponent);
  };
  const areaMode = analysisEnabled && flags.analysisMetric === 'area';
  const utilityMode = analysisEnabled && flags.analysisMetric === 'utility';
  const globalHeat = areaMode || ((flags.analysisMetric === 'kd' || utilityMode) && flags.heatStyle === 'global');
  const cells = new Map();
  const addWorld = (kind, worldX, worldY, worldZ, color, amount = 1, utilityId = '') => {
    const cellKey = `${globalHeat ? 'global' : kind}-${Math.round(worldX / 1.2)}-${Math.round(worldY / 0.5)}-${Math.round(worldZ / 1.2)}${!globalHeat && utilityId ? `-${utilityId}` : ''}`;
    const value = cells.get(cellKey) || {
      kind,
      x: worldX,
      y: worldY,
      z: worldZ,
      count: 0,
      color,
      kinds: {},
      utilityId,
    };
    value.count += amount;
    value.kinds[kind] = (value.kinds[kind] || 0) + amount;
    cells.set(cellKey, value);
  };
  const addEvent = (kind, x, y, z, color) => {
    if (x == null || y == null || z == null) return;
    addWorld(
      kind,
      y * MAP_UNITS_TO_METERS - modelCenter.x,
      z * MAP_UNITS_TO_METERS - modelCenter.y,
      x * MAP_UNITS_TO_METERS - modelCenter.z,
      color,
    );
  };

  if (utilityMode) {
    analysisUtilities.forEach((utility) => {
      if (!(flags.utilityKinds || ANALYSIS_UTILITY_KINDS).includes(utility.kind) || !economyMatches(utility.economyMatchup)) return;
      if (side !== 'ALL' && utility.side !== side) return;
      const color = ANALYSIS_UTILITY_COLORS[utility.kind] || '#c9f76b';
      if (globalHeat) {
        if (flags.utilityLanding !== false && utility.landing) addWorld(`utility-${utility.kind}`, utility.landing.x - modelCenter.x, utility.landing.y - modelCenter.y, utility.landing.z - modelCenter.z, color);
        return;
      }
      if (flags.utilityThrow !== false && utility.throwPosition) addWorld(`utilityThrow-${utility.kind}`, utility.throwPosition.x - modelCenter.x, utility.throwPosition.y - modelCenter.y, utility.throwPosition.z - modelCenter.z, '#d8e6d3', 1, utility.id);
      if (flags.utilityLanding !== false && utility.landing) addWorld(`utility-${utility.kind}`, utility.landing.x - modelCenter.x, utility.landing.y - modelCenter.y, utility.landing.z - modelCenter.z, color, 1, utility.id);
    });
  } else if (areaMode) {
    // Rows from multiple players interleave by tick, so duration must be measured within each player-round track.
    const rowsByRound = new Map();
    analysisRows.forEach((snapshot) => {
      const id = snapshot.analysisRound?.id;
      if (!id) return;
      if (!rowsByRound.has(id)) rowsByRound.set(id, []);
      rowsByRound.get(id).push(snapshot);
    });
    rowsByRound.forEach((roundRows) => roundRows.forEach((snapshot, index) => {
      const player = snapshot.players.find((candidate) => selected.has(candidate.name));
      const next = roundRows[index + 1];
      if (!player || player.health <= 0 || !next || !economyMatches(snapshot.analysisRound?.economyMatchup)) return;
      const elapsedTicks = snapshot.tick - snapshot.analysisRound.startTick;
      const postPlant = Number.isFinite(snapshot.analysisRound.plantTick) && snapshot.tick >= snapshot.analysisRound.plantTick;
      const earlySeconds = clamp(Number(flags.areaEarlySeconds) || 30, 10, 90);
      const phase = postPlant ? 'post' : elapsedTicks < (snapshot.analysisRound.tickRate || 64) * earlySeconds ? 'early' : 'mid';
      if (!(flags.areaPhases || ANALYSIS_AREA_PHASES).includes(phase)) return;
      const playerSide = player.team === 2 ? 'T' : 'CT';
      if (side !== 'ALL' && playerSide !== side) return;
      if (snapshot.tick >= snapshot.analysisRound.endTick) return;
      const seconds = clamp((Math.min(next.tick, snapshot.analysisRound.endTick) - snapshot.tick) / 64, 0, 0.75);
      if (seconds > 0) addWorld('areaHeat', player.position.x - modelCenter.x, player.position.y - modelCenter.y, player.position.z - modelCenter.z, '#ff6b47', seconds);
    }));
  } else {
    const deaths = analysisEnabled ? analysisDeaths : heatDeaths;
    deaths.forEach((event) => {
      const requiredTeam = side === 'T' ? 2 : side === 'CT' ? 3 : null;
      const attackerEconomy = event.analysisEconomyByPlayer?.[event.attacker_name] || event.analysisEconomyMatchup;
      const victimEconomy = event.analysisEconomyByPlayer?.[event.user_name] || event.analysisEconomyMatchup;
      const selectedAttacker = (!analysisEnabled || selected.has(event.attacker_name) && economyMatches(attackerEconomy)) && (requiredTeam == null || Number(event.attacker_team_num) === requiredTeam);
      const selectedVictim = (!analysisEnabled || selected.has(event.user_name) && economyMatches(victimEconomy)) && (requiredTeam == null || Number(event.user_team_num) === requiredTeam);
      if (flags.killerHeat && selectedAttacker) addEvent('killerHeat', event.attacker_X, event.attacker_Y, event.attacker_Z, '#ffb347');
      if (flags.targetHeat && selectedAttacker) addEvent('targetHeat', event.user_X, event.user_Y, event.user_Z, '#ff6b6b');
      if (flags.victimHeat && selectedVictim) addEvent('victimHeat', event.user_X, event.user_Y, event.user_Z, '#5da9ff');
      if (flags.opponentHeat && selectedVictim) addEvent('opponentHeat', event.attacker_X, event.attacker_Y, event.attacker_Z, '#c58cff');
    });
  }

  return { areaMode, utilityMode, globalHeat, cells };
}
