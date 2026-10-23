import { grenadeKind } from '../demo/grenades.js';
import { createAnalysisUtilityBuilder } from './buildAnalysisDataset.js';
import { buildUtilityRecommendations } from './utilityRecommendations.js';
import { roundEconomy } from '../demo/economy.js';
import { isRecording } from '../demo/recordings.js';
import { KD_RECOMMENDATION_POLICY as policy, finitePoint, worldPoint } from './kdHotspots.js';
import { coarseKDMatch, matchKDUtility } from './kdUtilityMatching.js';

// Metadata-only spatial prefilter. Missing effect coordinates keep the round
// eligible; absence is not evidence that it contains no useful throw.
function roundCouldMatch(events, round, kinds, interactions) {
  const scoped = events.filter(event => event.tick >= (round.contextStartTick ?? round.startTick) && event.tick <= round.endTick);
  const required = new Set(scoped.filter(event => event.event_name === 'grenade_thrown').map(event => grenadeKind(event.weapon)).filter(kind => kinds.includes(kind)));
  const landingKinds = { smokegrenade_detonate: 'smoke', inferno_startburn: 'fire', hegrenade_detonate: 'he', flashbang_detonate: 'flash' };
  for (const kind of required) {
    const landings = scoped.filter(event => landingKinds[event.event_name] === kind && [event.x, event.y, event.z].every(Number.isFinite));
    if (!landings.length) return true;
    for (const landing of landings) {
      const point = worldPoint([landing.x, landing.y, landing.z]);
      for (const side of ['T', 'CT']) if (coarseKDMatch({ kind, side, landing: point, throwPosition: point }, interactions) > 0) return true;
    }
  }
  return false;
}

// Require a recorded detonation, matching thrower, hostile victim, positive
// duration and a two-tick event window. Never infer blindness from distance.
function recordedBlinds(utility, byTick) {
  const thrower = utility.segment.throwEvent, detonation = utility.segment.landing;
  if (detonation?.event_name !== 'flashbang_detonate' || !Number.isFinite(detonation.tick)) return [];
  const found = new Map();
  for (let tick = detonation.tick - policy.blindTickTolerance; tick <= detonation.tick + policy.blindTickTolerance; tick++) {
    for (const event of byTick.get(tick) || []) {
      const ownerMatches = thrower.user_steamid && event.attacker_steamid
        ? String(thrower.user_steamid) === String(event.attacker_steamid)
        : Boolean(thrower.user_name && thrower.user_name === event.attacker_name);
      const team = Number(event.user_team_num), duration = Number(event.blind_duration);
      if (!ownerMatches || ![2, 3].includes(team) || (team === 2 ? 'T' : 'CT') === utility.side
        || !Number.isFinite(duration) || duration <= 0 || ![event.user_X, event.user_Y, event.user_Z].every(Number.isFinite)) continue;
      const key = event.user_steamid || event.user_name;
      if (!key) continue;
      const previous = found.get(String(key));
      if (!previous || duration > previous.duration) found.set(String(key), {
        position: worldPoint([event.user_X, event.user_Y, event.user_Z]), duration, tick: event.tick,
      });
    }
  }
  return [...found.values()];
}

// Runs beside the existing cache in a Worker/native compute process. Full
// round payloads and effect volumes never enter React; reads are sequential.
export async function queryKDRecommendations(cache, args) {
  const invalid = () => { throw Object.assign(new Error('Invalid KD recommendation query'), { code: 'invalid_arguments' }); };
  if (!args || !Array.isArray(args.ids) || args.ids.length > 64 || args.ids.some(id => typeof id !== 'string' || id.length > 1024)
    || typeof args.mapName !== 'string' || !Array.isArray(args.interactions) || args.interactions.length > policy.maxInteractions
    || !args.flags || !Array.isArray(args.flags.utilityKinds)) invalid();
  const ids = [...new Set(args.ids)];
  if (args.interactions.some(item => !finitePoint(item?.own) || !finitePoint(item?.enemy) || !['T', 'CT'].includes(item.side)
    || typeof item.eventId !== 'string' || item.eventId.length > 4096 || !ids.includes(item.source?.demoId)
    || !Number.isInteger(item.source.round) || !Number.isFinite(item.source.tick))) invalid();
  const interactions = args.interactions;
  const diagnostics = { loadedDemos: 0, missingDemos: 0, missingRounds: 0, omittedCandidates: 0, omittedGroups: 0, missingSmokeVolumes: 0, missingBlindEvidence: 0 };
  const utilities = [], seen = new Set();
  const flags = { ...args.flags, utilityKinds: args.flags.utilityKinds.filter(kind => ['smoke', 'fire', 'he', 'flash'].includes(kind)) };
  if (!flags.utilityKinds.length || !interactions.length) return { groups: [], utilities: [], diagnostics, candidateCount: 0, frequentGroupCount: 0 };
  for (const id of ids) {
    const entry = await cache.getCachedDemo(id);
    if (!entry?.data || !Array.isArray(entry.data.rounds) || !entry.analysisRows?.length || entry.data.demo?.map !== args.mapName || isRecording(entry)) { diagnostics.missingDemos++; continue; }
    diagnostics.loadedDemos++;
    const blinds = new Map();
    for (const event of entry.data.events || []) if (event.event_name === 'player_blind' && Number.isFinite(event.tick)) {
      if (!blinds.has(event.tick)) blinds.set(event.tick, []);
      blinds.get(event.tick).push(event);
    }
    const names = entry.analysisPlayerNames || [...new Set((entry.analysisRows || []).flatMap(row => row.players.map(player => player.name)))];
    const build = createAnalysisUtilityBuilder(entry, names, roundEconomy, { earlySeconds: flags.areaEarlySeconds });
    for (const round of entry.data.rounds || []) {
      if (!roundCouldMatch(entry.data.events || [], round, flags.utilityKinds, interactions)) continue;
      const data = await cache.getCachedDemoRound(id, round.round);
      if (!data) { diagnostics.missingRounds++; continue; }
      for (const utility of build(round, { projectiles: data.projectiles || [], throwSnapshots: [] })) {
        if (!flags.utilityKinds.includes(utility.kind)) continue;
        if (utility.kind === 'flash') {
          utility.blindEvidence = recordedBlinds(utility, blinds);
          if (!utility.blindEvidence.length) { if (coarseKDMatch(utility, interactions) > 0) diagnostics.missingBlindEvidence++; continue; }
        }
        const coarsePriority = coarseKDMatch(utility, interactions);
        if (coarsePriority <= 0) continue;
        const occurrenceId = JSON.stringify([utility.source.demoIdentity || utility.source.demoId, utility.source.round,
          utility.segment.throwTick, utility.segment.throwEvent.user_steamid || utility.segment.throwEvent.user_name, utility.kind]);
        if (seen.has(occurrenceId)) continue;
        seen.add(occurrenceId);
        if (utilities.length >= policy.maxCandidates) { diagnostics.omittedCandidates++; continue; }
        utilities.push({ ...utility, occurrenceId, coarsePriority,
          flightTime: Math.max(0, (utility.segment.effectTick - utility.segment.throwTick) / utility.source.tickRate) });
      }
    }
  }
  // Frequency is measured within the same side/round phase. Cross-demo source
  // identity remains attached; never join using the concatenated playback tick.
  const cohorts = new Map();
  for (const utility of utilities) {
    const key = `${utility.side}:${utility.phase}`;
    if (!cohorts.has(key)) cohorts.set(key, []);
    cohorts.get(key).push(utility);
  }
  const index = new Map(utilities.map(utility => [utility.id, utility]));
  const frequent = [...cohorts.values()].flatMap(values => buildUtilityRecommendations({ utilities: values, flags, side: 'ALL' }));
  frequent.sort((a, b) => index.get(b.representativeId).coarsePriority - index.get(a.representativeId).coarsePriority || b.count - a.count || a.id.localeCompare(b.id));
  diagnostics.omittedGroups = Math.max(0, frequent.length - policy.maxDetailedGroups);
  const roundCache = new Map(), groups = [];
  for (const group of frequent.slice(0, policy.maxDetailedGroups)) {
    const utility = index.get(group.representativeId);
    let data;
    if (['smoke', 'fire'].includes(utility.kind)) {
      const key = `${utility.source.demoId}:${utility.source.round}`;
      data = roundCache.get(key);
      if (!data) {
        const payload = await cache.getCachedDemoRound(utility.source.demoId, utility.source.round);
        data = { smokeVoxelFrames: payload?.smokeVoxelFrames || [], infernoFrames: payload?.infernoFrames || [] };
        roundCache.set(key, data);
        if (roundCache.size > 2) roundCache.delete(roundCache.keys().next().value);
      }
    }
    const match = matchKDUtility(utility, interactions, data);
    if (match?.unavailable) {
      if (match.unavailable === 'smoke_voxels') diagnostics.missingSmokeVolumes++;
      else diagnostics.missingBlindEvidence++;
      continue;
    }
    if (!match) continue;
    groups.push({ ...group, ...match });
  }
  groups.sort((a, b) => b.matchScore - a.matchScore || b.count - a.count || a.id.localeCompare(b.id));
  const result = groups.slice(0, policy.maxResults);
  return { groups: result, utilities: result.map(group => index.get(group.representativeId)), diagnostics,
    candidateCount: utilities.length, frequentGroupCount: frequent.length };
}
