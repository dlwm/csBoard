import { buildDemoGrenadeSegments } from '../demo/grenades.js';
import { DEMO_CACHE_SCHEMA_VERSION } from '../demo/cacheSchema.js';
import { buildSavedThrowNote } from './savedThrow.js';

// Rebuild a saved note from its exact original throw, never a similarly named
// player/grenade. The caller retains the user's title, ID and folder assignment.
// 按原 Demo、地图、回合、tick 与投掷者找回记录；不拿相似道具替换旧速记。
export async function recoverRecordedReplay(cache, args) {
  const catalogue = await cache.listCachedDemos();
  const exact = catalogue.filter(entry => entry.map === args.map && args.ids.includes(entry.id));
  const candidates = exact.length ? exact : catalogue.filter(entry => entry.map === args.map && entry.fileName === args.fileName);
  if (!candidates.length) throw new Error('replay_source_missing');
  // Sample rates may differ for one source; different source identities with the
  // same filename must not silently replace an old note. 文件名相同不代表同一录像。
  if (!exact.length && new Set(candidates.map(entry => entry.id.replace(/^(recording\|)?\d+hz\|/, '$1'))).size > 1) throw new Error('replay_source_ambiguous');
  let metadata, entry;
  for (const candidate of candidates.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))) {
    const cached = await cache.getCachedDemo(candidate.id);
    if (cached?.data?.cacheSchemaVersion === DEMO_CACHE_SCHEMA_VERSION) { metadata = candidate; entry = cached; break; }
  }
  if (!entry) throw new Error('replay_reparse_required');
  const round = entry.data.rounds.find(round => round.round === args.round && args.tick >= round.startTick && args.tick <= round.endTick);
  const data = round && await cache.getCachedDemoRound(metadata.id, round.round);
  if (!data) throw new Error('replay_reparse_required');
  const segments = buildDemoGrenadeSegments(data.projectiles, entry.data.events, data.throwSnapshots, round, entry.data.demo.tickRate || 64);
  const matches = segments.filter(segment => segment.throwTick === args.tick && segment.kind === args.kind
    && (args.throwerId ? String(segment.throwEvent.user_steamid || '') === args.throwerId : segment.throwEvent.user_name === args.thrower));
  if (matches.length !== 1) throw new Error('replay_throw_missing');
  const note = buildSavedThrowNote({ mapName: args.map, segment: matches[0], source: {
    demoId: metadata.id, fileName: entry.data.demo.fileName, round: round.round, tickRate: entry.data.demo.tickRate || 64,
    smokeVoxelFrames: data.smokeVoxelFrames, infernoFrames: data.infernoFrames,
  } });
  if (!note) throw new Error('replay_throw_missing');
  return note;
}
