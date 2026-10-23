import { ECONOMY_CATEGORIES } from './constants.js';

// All matching uses scene-axis WORLD metres, never scene-local offsets or the
// concatenated analysis playback clock. 中文：米制世界坐标；回放证据保留原始 tick。
export const KD_RECOMMENDATION_POLICY = Object.freeze({
  radius: 8, minRadius: 3, maxRadius: 20, heightTolerance: 2.5,
  eyeHeight: 1.5, smokeSearchRadius: 8, fireRadius: 5, heRadius: 6, flashSearchRadius: 24, flashMatchRadius: 4, blindTickTolerance: 2,
  maxInteractions: 128, maxCandidates: 3000, maxDetailedGroups: 12, maxResults: 8,
});
export const finitePoint = point => point && [point.x, point.y, point.z].every(Number.isFinite);
export const worldPoint = values => ({ x: values[1] * .0254, y: values[2] * .0254, z: values[0] * .0254 });
const eventPoint = (event, prefix) => {
  const values = ['X', 'Y', 'Z'].map(axis => event[`${prefix}_${axis}`]);
  return values.every(value => value != null && Number.isFinite(Number(value))) ? worldPoint(values.map(Number)) : null;
};

// Shared by heat rendering and hotspot selection, so the four KD layer switches,
// player selection, side and economy mean the same thing in both paths.
export function buildKDAnchors({ deaths = [], selectedPlayers = [], flags, side = 'ALL', analysisEnabled = true }) {
  const selected = new Set(selectedPlayers), anchors = [];
  const matches = (event, prefix) => {
    const matchup = event.analysisEconomyByPlayer?.[event[`${prefix}_name`]] || event.analysisEconomyMatchup;
    const [own, opponent] = String(matchup || '').split(':');
    return (!analysisEnabled || selected.has(event[`${prefix}_name`])
      && (flags.economyOwn || ECONOMY_CATEGORIES).includes(own)
      && (flags.economyOpponent || ECONOMY_CATEGORIES).includes(opponent))
      && (side === 'ALL' || Number(event[`${prefix}_team_num`]) === (side === 'T' ? 2 : 3));
  };
  for (const [index, event] of deaths.entries()) {
    const attacker = eventPoint(event, 'attacker'), victim = eventPoint(event, 'user');
    const eventId = JSON.stringify([event.analysisDemoId || '', event.analysisRound, event.tick,
      event.user_steamid || event.user_name, event.attacker_steamid || event.attacker_name, index]);
    const push = (kind, anchor, own, enemy, prefix) => {
      if (!flags[kind] || !anchor || !matches(event, prefix)) return;
      const ownTeam = Number(event[`${prefix}_team_num`]), opponentTeam = Number(event[`${prefix === 'user' ? 'attacker' : 'user'}_team_num`]);
      anchors.push({ eventId, kind, anchor, own, enemy,
        side: ownTeam === 2 ? 'T' : ownTeam === 3 ? 'CT' : null,
        hostile: [2, 3].includes(ownTeam) && [2, 3].includes(opponentTeam) && ownTeam !== opponentTeam,
        phase: Number.isFinite(event.analysisRoundStartTick)
          ? Number.isFinite(event.analysisPlantTick) && event.tick >= event.analysisPlantTick ? 'post'
            : event.tick - event.analysisRoundStartTick < (event.analysisTickRate || 64) * (flags.areaEarlySeconds || 30) ? 'early' : 'mid'
          : null,
        economyMatchup: event.analysisEconomyByPlayer?.[event[`${prefix}_name`]] || event.analysisEconomyMatchup,
        source: { demoId: event.analysisDemoId, fileName: event.analysisFileName, round: event.analysisRound,
          tick: event.tick, player: event[`${prefix}_name`] },
      });
    };
    push('killerHeat', attacker, attacker, victim, 'attacker');
    push('targetHeat', victim, attacker, victim, 'attacker');
    push('victimHeat', victim, victim, attacker, 'user');
    push('opponentHeat', attacker, victim, attacker, 'user');
  }
  return anchors;
}

export function selectKDHotspot(anchors, hotspot, radius = KD_RECOMMENDATION_POLICY.radius) {
  if (!finitePoint(hotspot?.position)) return { interactions: [], total: 0 };
  const point = hotspot.position, seen = new Set();
  const nearby = anchors.filter(anchor => anchor.hostile && finitePoint(anchor.own) && finitePoint(anchor.enemy)
    && anchor.source.demoId && Number.isFinite(anchor.source.round) && Number.isFinite(anchor.source.tick)
    && (!hotspot.kind || anchor.kind === hotspot.kind)
    && Math.abs(anchor.anchor.y - point.y) <= KD_RECOMMENDATION_POLICY.heightTolerance
    && Math.hypot(anchor.anchor.x - point.x, anchor.anchor.z - point.z) <= radius)
    .sort((a, b) => Math.hypot(a.anchor.x - point.x, a.anchor.z - point.z) - Math.hypot(b.anchor.x - point.x, b.anchor.z - point.z) || a.eventId.localeCompare(b.eventId))
    .filter(anchor => { const key = `${anchor.eventId}:${anchor.side}`; if (seen.has(key)) return false; seen.add(key); return true; });
  return { interactions: nearby.slice(0, KD_RECOMMENDATION_POLICY.maxInteractions), total: new Set(nearby.map(item => item.eventId)).size };
}
