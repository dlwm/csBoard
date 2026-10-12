// Round boundaries are game semantics, shared by all parser adapters.
export function buildRounds(events, tickRate = 64) {
  const starts = events.filter((event) => event.event_name === 'round_start');
  const ends = events.filter((event) => event.event_name === 'round_end');
  return starts.map((start, index) => {
    const nextStart = starts[index + 1];
    const playableStart = events.find((event) => event.event_name === 'round_freeze_end' && event.tick > start.tick && (!nextStart || event.tick < nextStart.tick));
    const startTick = playableStart?.tick ?? start.tick;
    const end = ends.find((candidate) => candidate.tick > startTick && (!nextStart || candidate.tick < nextStart.tick));
    const bufferedEnd = end ? end.tick + tickRate * 3 : startTick;
    return { sourceRound: start.round ?? null, freezeStartTick: start.tick, startTick, endTick: nextStart ? Math.min(bufferedEnd, nextStart.tick - 1) : bufferedEnd, winner: end?.winner ?? null, reason: end?.reason ?? null, timeSeconds: startTick / tickRate };
  }).filter((round) => round.endTick > round.startTick).map((round, index) => ({ ...round, round: index + 1 }));
}
