// Bounded, deterministic evidence queries. AI explains these results; it does
// not calculate statistics or infer visibility/causality from event proximity.
// 有界证据查询：统计由代码计算；时间相邻不代表因果或视线可达。
const eventNames = new Set(['player_death', 'player_hurt', 'player_blind', 'grenade_thrown', 'bomb_planted', 'bomb_defused', 'bomb_exploded', 'round_end']);
export async function queryAssistantEvidence(cache, args) {
  const invalid = () => { throw Object.assign(new Error('Invalid assistant evidence query'), { code: 'invalid_arguments' }); };
  if (!args || !Array.isArray(args.ids) || args.ids.length > 64 || args.ids.some(id => typeof id !== 'string' || id.length > 1024)) invalid();
  if (args.players != null && (!Array.isArray(args.players) || args.players.length > 64 || args.players.some(name => typeof name !== 'string' || name.length > 200))) invalid();
  if (args.eventTypes != null && (!Array.isArray(args.eventTypes) || args.eventTypes.length > 8 || args.eventTypes.some(name => !eventNames.has(name)))) invalid();
  for (const [key, maximum] of [['round', 10000], ['offset', Number.MAX_SAFE_INTEGER], ['limit', 40]]) if (args[key] != null && (!Number.isInteger(args[key]) || args[key] < (key === 'limit' ? 1 : 0) || args[key] > maximum)) invalid();
  const ids = [...new Set(args.ids)];
  const demos = [], events = [], players = new Map();
  const diagnostics = { requestedDemos: ids.length, loadedDemos: 0, missingDemoIds: [], processedDemoIds: ids.slice(0, 8), omittedDemoIds: ids.slice(8), scope: 'selected demos, players, round and event types; UI side/economy/position filters are NOT applied', positionSamplingUsed: false };
  for (const id of ids.slice(0, 8)) {
    const entry = await cache.getCachedDemo(id);
    if (!entry?.data?.demo || !Array.isArray(entry.data.rounds)) { diagnostics.missingDemoIds.push(id); continue; }
    diagnostics.loadedDemos++;
    const data = entry.data, rate = data.demo.tickRate || 64;
    const rounds = data.rounds.filter(round => args.round == null || round.round === args.round);
    demos.push({ demoId: id, fileName: data.demo.fileName, map: data.demo.map, tickRate: rate, rounds: rounds.map(({ round, startTick, freezeStartTick, endTick }) => ({ round, startTick, freezeStartTick, endTick })) });
    const selected = new Set(args.players || []);
    for (const [eventIndex, event] of (data.events || []).entries()) {
      if (!eventNames.has(event.event_name) || (args.eventTypes?.length && !args.eventTypes.includes(event.event_name))) continue;
      const round = rounds.find(round => event.tick >= (round.freezeStartTick ?? round.startTick) && event.tick <= round.endTick);
      if (!round || (selected.size && ![event.user_name, event.attacker_name, event.assister_name].some(name => selected.has(name)))) continue;
      const key = `${id}:${round.round}:${event.tick}:${eventIndex}`;
      events.push({ id: key, demoId: id, fileName: data.demo.fileName, round: round.round, tick: event.tick, secondsFromRoundStart: Math.round((event.tick - round.startTick) / rate * 100) / 100,
        type: event.event_name, player: event.user_name || null, attacker: event.attacker_name || null, assister: event.assister_name || null,
        weapon: event.weapon || null, headshot: event.headshot ?? null, damage: event.dmg_health ?? null, blindDuration: event.blind_duration ?? null,
        winner: event.winner ?? null, reason: event.reason ?? null });
      const record = name => { if (!name || (selected.size && !selected.has(name))) return null; if (!players.has(name)) players.set(name, { name, kills: 0, deaths: 0, assists: 0, recordedHealthDamage: 0, throws: 0 }); return players.get(name); };
      if (event.event_name === 'player_death') { const victim = record(event.user_name); if (victim) victim.deaths++; if (event.attacker_name !== event.user_name) { const killer = record(event.attacker_name); if (killer) killer.kills++; } const assist = record(event.assister_name); if (assist) assist.assists++; }
      if (event.event_name === 'player_hurt') { const attacker = record(event.attacker_name); if (attacker) attacker.recordedHealthDamage += Math.max(0, Number(event.dmg_health) || 0); }
      if (event.event_name === 'grenade_thrown') { const thrower = record(event.user_name); if (thrower) thrower.throws++; }
    }
  }
  events.sort((a, b) => a.demoId.localeCompare(b.demoId) || a.tick - b.tick);
  const offset = args.offset || 0, limit = args.limit || 30;
  return { demos, diagnostics, statistics: [...players.values()].sort((a, b) => b.kills - a.kills || a.name.localeCompare(b.name)),
    statisticsScope: 'counts over the filtered event set, not ratings or a causal assessment; names may collide across demos',
    evidence: events.slice(offset, offset + limit), total: events.length, nextOffset: offset + limit < events.length ? offset + limit : null,
    limitations: ['Counts include recorded friendly kills; damage is recorded health damage, not ADR. UI side/economy/position filters are not applied.', 'Missing fields remain null.', 'No line-of-sight, cover, trade eligibility or win causality is verified.', 'Event absence alone does not prove the action never occurred.'] };
}
