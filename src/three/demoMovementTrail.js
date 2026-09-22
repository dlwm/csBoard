const WINDOW_TICKS = 24;
const FIRST_PUFF_AGE = 8;
const PUFF_INTERVAL_TICKS = 7;
const PUFF_COUNT = 8;

const distance2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const validPosition = (player) => player?.hasPosition !== false && [player?.position?.x, player?.position?.y, player?.position?.z].every(Number.isFinite);

function positionAt(records, tick) {
  if (tick < records[0].tick || tick > records.at(-1).tick) return null;
  for (let index = 1; index < records.length; index += 1) {
    const after = records[index];
    if (after.tick < tick) continue;
    const before = records[index - 1];
    const fraction = before.tick === after.tick ? 0 : (tick - before.tick) / (after.tick - before.tick);
    return {
      x: before.position.x + (after.position.x - before.position.x) * fraction,
      y: before.position.y + (after.position.y - before.position.y) * fraction,
      z: before.position.z + (after.position.z - before.position.z) * fraction,
    };
  }
  return records.at(-1).position;
}

export function runningTrailSamples(snapshots, playerName, currentTick) {
  const earliestTick = currentTick - FIRST_PUFF_AGE - (PUFF_COUNT - 1) * PUFF_INTERVAL_TICKS - WINDOW_TICKS;
  const records = snapshots.filter((snapshot) => snapshot.tick >= earliestTick && snapshot.tick <= currentTick)
    .map((snapshot) => ({ tick: snapshot.tick, player: snapshot.players?.find((candidate) => candidate.name === playerName) }))
    .filter(({ player }) => validPosition(player))
    .map(({ tick, player }) => ({ tick, position: player.position }));
  if (records.length < 2) return [];

  const result = [];
  for (let index = PUFF_COUNT - 1; index >= 0; index -= 1) {
    const tick = currentTick - FIRST_PUFF_AGE - index * PUFF_INTERVAL_TICKS;
    const start = positionAt(records, tick - WINDOW_TICKS);
    const end = positionAt(records, tick);
    if (!start || !end) continue;
    const netDistance = distance2D(start, end);
    const path = records.filter((record) => record.tick > tick - WINDOW_TICKS && record.tick < tick).map((record) => record.position);
    const pathDistance = [start, ...path, end].reduce((sum, position, pointIndex, points) => pointIndex ? sum + distance2D(points[pointIndex - 1], position) : 0, 0);
    // Net progress rejects strafing in place; path efficiency rejects tight reversals.
    if (netDistance < 0.8 || netDistance > 3.6 || netDistance / Math.max(pathDistance, 0.001) < 0.68) continue;
    if (result.length && distance2D(result.at(-1).position, end) < 0.18) continue;
    result.push({ tick, position: end, strength: Math.min(1, Math.max(0.3, netDistance / 1.8)) });
  }
  return result;
}
