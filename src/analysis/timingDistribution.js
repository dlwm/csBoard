import { grenadeKind } from '../demo/grenades.js';
import { roundEconomy } from '../demo/economy.js';
import { isRecording } from '../demo/recordings.js';
import { ANALYSIS_UTILITY_KINDS, ECONOMY_CATEGORIES } from './constants.js';

export const TIMING_POLICY = Object.freeze({ maxDemos: 64, maxEvents: 200000, evidencePerCell: 40 });
export const DEFAULT_TIMING_OPTIONS = Object.freeze({ binSeconds: 10, endSeconds: 180 });
const landings = { smokegrenade_detonate: 'smoke', flashbang_detonate: 'flash', inferno_startburn: 'fire', hegrenade_detonate: 'he', decoy_started: 'decoy' };
const invalid = () => { throw Object.assign(new Error('Invalid timing distribution query'), { code: 'invalid_arguments' }); };

// Aggregate original source ticks, never the concatenated multi-Demo animation clock.
// 以每回合冻结结束为零点；计数与回合支持数分别保留，不换算成胜率。
// Only metadata/events are read: no trajectories, voxel payloads or round reads.
export async function queryTimingDistribution(cache, args) {
  if (!args || !Array.isArray(args.ids) || args.ids.length > TIMING_POLICY.maxDemos || args.ids.some(id => typeof id !== 'string' || id.length > 1024)
    || !Array.isArray(args.players) || args.players.length > 640 || args.players.some(name => typeof name !== 'string' || name.length > 256)
    || typeof args.mapName !== 'string' || args.mapName.length > 128 || !Number.isInteger(args.schema)
    || !['ALL', 'T', 'CT'].includes(args.side)) return invalid();
  const { binSeconds, endSeconds } = { ...DEFAULT_TIMING_OPTIONS, ...args.options };
  if (![5, 10, 15].includes(binSeconds) || ![60, 120, 180, 300].includes(endSeconds)) return invalid();
  const flags = args.flags || {};
  for (const [key, allowed] of [['utilityKinds', ANALYSIS_UTILITY_KINDS], ['economyOwn', ECONOMY_CATEGORIES], ['economyOpponent', ECONOMY_CATEGORIES]]) {
    if (!Array.isArray(flags[key]) || flags[key].some(value => !allowed.includes(value))) return invalid();
  }
  const selected = new Set(args.players), rows = new Map(), seenDemos = new Set(), supportingRounds = new Set();
  const economyOwn = new Set(), economyOpponent = new Set();
  const diagnostics = { missingDemos: 0, duplicateDemos: 0, missingTeams: 0, missingEconomy: 0, unknownOpener: 0, outsideRange: 0, evidenceLimited: false, eventBudget: false };
  let scannedEvents = 0, loadedDemos = 0;
  if (!selected.size || !args.ids.length) return { rows: [], options: { binSeconds, endSeconds }, roundCount: 0, demoCount: 0, diagnostics, economyAvailability: { own: [], opponent: [] } };
  for (const id of [...new Set(args.ids)]) {
    const entry = await cache.getCachedDemo(id), data = entry?.data;
    if (!data?.demo || !Array.isArray(data.events) || !Array.isArray(data.rounds) || isRecording(entry) || data.demo.map !== args.mapName || data.cacheSchemaVersion !== args.schema) { diagnostics.missingDemos++; continue; }
    const identity = JSON.stringify([data.demo.fileName, data.demo.bytes, data.demo.maxTick, data.demo.map]);
    if (seenDemos.has(identity)) { diagnostics.duplicateDemos++; continue; } seenDemos.add(identity);
    const tickRate = data.demo.tickRate;
    if (!Number.isFinite(tickRate) || tickRate <= 0) { diagnostics.missingDemos++; continue; }
    loadedDemos++;
    const metadata = new Map((data.roundData || []).map(round => [round.round, round]));
    const events = (data.events || []).filter(event => Number.isFinite(event.tick) && (event.event_name === 'grenade_thrown' || event.event_name === 'player_death' || event.event_name === 'round_end' || landings[event.event_name])).sort((a, b) => a.tick - b.tick);
    const rounds = (data.rounds || []).map(round => ({ ...round, economy: roundEconomy(round, metadata.get(round.round)),
      teams: new Map((metadata.get(round.round)?.snapshots?.[0]?.players || []).map(player => [player.name, player.team])) }));
    const eventsByRound = new Map(rounds.map(round => [round.round, []]));
    let roundIndex = 0;
    for (const event of events) {
      while (roundIndex < rounds.length && event.tick > rounds[roundIndex].endTick) roundIndex++;
      const round = rounds[roundIndex];
      if (round && event.tick >= round.startTick) eventsByRound.get(round.round).push(event);
    }
    for (const round of rounds) {
      const roundKey = `${identity}:${round.round}`, roundEvents = eventsByRound.get(round.round);
      const endTick = roundEvents.find(event => event.event_name === 'round_end')?.tick ?? round.endTick;
      const participantTeam = (event, prefix) => Number(event[`${prefix}_team_num`] ?? round.teams.get(event[`${prefix}_name`]));
      let firstCombatDeath = null;
      for (const event of roundEvents) {
        if (event.tick > endTick || event.event_name !== 'player_death' || !event.attacker_name) continue;
        const attacker = participantTeam(event, 'attacker'), victim = participantTeam(event, 'user');
        if (![2, 3].includes(attacker) || ![2, 3].includes(victim)) { diagnostics.unknownOpener++; break; }
        if (attacker !== victim) { firstCombatDeath = event; break; }
      }
      const append = (event, rowId, prefix, kind = null) => {
        const player = event[`${prefix}_name`];
        if (!selected.has(player)) return;
        const team = participantTeam(event, prefix);
        if (![2, 3].includes(team)) { diagnostics.missingTeams++; return; }
        const side = team === 2 ? 'T' : 'CT';
        if (args.side !== 'ALL' && args.side !== side) return;
        const own = round.economy[side].label, opponent = round.economy[side === 'T' ? 'CT' : 'T'].label;
        economyOwn.add(own); economyOpponent.add(opponent);
        if (!ECONOMY_CATEGORIES.includes(own) || !ECONOMY_CATEGORIES.includes(opponent)) { diagnostics.missingEconomy++; return; }
        if (!flags.economyOwn.includes(own) || !flags.economyOpponent.includes(opponent) || kind && !flags.utilityKinds.includes(kind)) return;
        const seconds = (event.tick - round.startTick) / tickRate;
        if (seconds < 0 || event.tick > endTick) return;
        supportingRounds.add(roundKey);
        if (seconds >= endSeconds) { diagnostics.outsideRange++; return; }
        if (!rows.has(rowId)) rows.set(rowId, { id: rowId, kind,
          bins: Array.from({ length: Math.ceil(endSeconds / binSeconds) }, (_, index) => ({ index, start: index * binSeconds, end: Math.min(endSeconds, (index + 1) * binSeconds), count: 0, rounds: new Set(), evidence: [] })) });
        const bin = rows.get(rowId).bins[Math.floor(seconds / binSeconds)];
        bin.count++; bin.rounds.add(roundKey);
        if (bin.evidence.length < TIMING_POLICY.evidencePerCell) bin.evidence.push({ demoId: id, fileName: data.demo.fileName, round: round.round,
          tick: event.tick, seconds, player, side, kind, weapon: event.weapon || '', type: event.event_name });
        else diagnostics.evidenceLimited = true;
      };
      for (const event of roundEvents) {
        if (++scannedEvents > TIMING_POLICY.maxEvents) { diagnostics.eventBudget = true; break; }
        if (event.event_name === 'grenade_thrown') {
          const kind = grenadeKind(event.weapon);
          if (ANALYSIS_UTILITY_KINDS.includes(kind)) append(event, `throw:${kind}`, 'user', kind);
        } else if (landings[event.event_name]) append(event, `effect:${landings[event.event_name]}`, 'user', landings[event.event_name]);
        else if (event.event_name === 'player_death') {
          if ([2, 3].includes(participantTeam(event, 'attacker')) && [2, 3].includes(participantTeam(event, 'user')) && participantTeam(event, 'attacker') !== participantTeam(event, 'user')) append(event, 'kill', 'attacker');
          append(event, 'death', 'user');
          if (event === firstCombatDeath) { append(event, 'firstKill', 'attacker'); append(event, 'firstDeath', 'user'); }
        }
      }
      if (diagnostics.eventBudget) break;
    }
    if (diagnostics.eventBudget) break;
  }
  const order = [...ANALYSIS_UTILITY_KINDS.flatMap(kind => [`throw:${kind}`, `effect:${kind}`]), 'kill', 'death', 'firstKill', 'firstDeath'];
  return { options: { binSeconds, endSeconds }, demoCount: loadedDemos, roundCount: supportingRounds.size,
    economyAvailability: { own: [...economyOwn], opponent: [...economyOpponent] }, diagnostics,
    rows: [...rows.values()].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)).map(row => ({ ...row,
      bins: row.bins.map(bin => ({ ...bin, rounds: bin.rounds.size })) })) };
}
