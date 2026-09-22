import { effectEndTick, HE_SMOKE_CLEAR_SECONDS, isEffectStartEvent } from '../demo/effectLifetime.js';
import { buildDemoGrenadeSegments } from '../demo/grenades.js';

const tickOf = (entry) => Number(entry?.tick);

function sliceTicks(entries, startTick, endTick) {
  return (entries || []).filter((entry) => tickOf(entry) >= startTick && tickOf(entry) <= endTick);
}

function sliceSnapshots(snapshots, startTick, endTick) {
  const inside = sliceTicks(snapshots, startTick, endTick);
  const before = [...(snapshots || [])].reverse().find((snapshot) => tickOf(snapshot) < startTick);
  const after = (snapshots || []).find((snapshot) => tickOf(snapshot) > endTick);
  return [before, ...inside, after].filter(Boolean).filter((snapshot, index, list) => index === 0 || snapshot.tick !== list[index - 1].tick);
}

function entityKey(entry) {
  const value = entry?.entityId ?? entry?.entity_id ?? entry?.grenade_entity_id;
  return value == null ? '' : String(value);
}

function sliceStateFrames(entries, startTick, endTick) {
  const inside = sliceTicks(entries, startTick, endTick);
  const latestBefore = new Map();
  (entries || []).forEach((entry) => {
    const key = entityKey(entry);
    if (!key || tickOf(entry) >= startTick) return;
    const previous = latestBefore.get(key);
    if (!previous || tickOf(entry) > tickOf(previous)) latestBefore.set(key, entry);
  });
  return [...latestBefore.values(), ...inside].sort((left, right) => tickOf(left) - tickOf(right));
}

function sliceEvents(events, startTick, endTick, tickRate) {
  const all = events || [];
  const kept = new Set(sliceTicks(all, startTick, endTick));
  // A clip may begin while smoke/fire is already active. Keep its birth and
  // expiry as hidden replay context so lifetime and deformation remain exact.
  all.filter((event) => isEffectStartEvent(event) && tickOf(event) < startTick && effectEndTick(event, all) >= startTick).forEach((start) => {
    kept.add(start);
    const endTick = effectEndTick(start, all);
    all.filter((event) => tickOf(event) === endTick).forEach((event) => kept.add(event));
  });
  // A recent HE must survive clipping when its temporary smoke opening spans the first playable tick.
  all.filter((event) => event.event_name === 'hegrenade_detonate' && tickOf(event) < startTick
    && tickOf(event) + HE_SMOKE_CLEAR_SECONDS * tickRate > startTick).forEach((event) => kept.add(event));
  return [...kept].sort((left, right) => tickOf(left) - tickOf(right));
}

// A broadcast archive is deliberately one immutable Demo interval, never a frame collection.
export function buildBroadcastArchive({ id, name, demoData, round, roundData, startTick, endTick, now = new Date().toISOString() }) {
  if (!demoData?.demo || !round || !roundData || !name?.trim()) return null;
  const start = Math.max(Number(round.startTick), Math.min(Number(startTick), Number(endTick)));
  const end = Math.min(Number(round.endTick), Math.max(Number(startTick), Number(endTick)));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const tickRate = demoData.demo.tickRate || 64;
  const allEvents = demoData.events || [];
  const utilitySegments = buildDemoGrenadeSegments(roundData.projectiles, allEvents, roundData.snapshots, round, tickRate)
    .filter((segment) => segment.throwTick <= end && (segment.effectTick >= start || (segment.landing && effectEndTick(segment.landing, allEvents) >= start)));
  // Keep only throws intersecting this clip, including the pre-roll needed to
  // select and save an effect that was already burning or smoking at clip start.
  const contextEvents = new Set(sliceEvents(allEvents, start, end, tickRate));
  utilitySegments.forEach((segment) => { contextEvents.add(segment.throwEvent); if (segment.landing) contextEvents.add(segment.landing); });
  const events = [...contextEvents].sort((left, right) => tickOf(left) - tickOf(right));
  const contextStartTick = utilitySegments.reduce((earliest, segment) => Math.min(earliest, segment.throwTick), start);
  const clippedRound = { ...round, startTick: start, contextStartTick, endTick: end, freezeStartTick: Math.max(start, Number(round.freezeStartTick) || start) };
  const snapshots = sliceSnapshots(roundData.snapshots, start, end);
  const isUtilityPreRoll = (snapshot) => utilitySegments.some((segment) => snapshot.tick >= segment.throwTick - tickRate * 2 && snapshot.tick <= segment.effectTick && snapshot.tick < start);
  const contextSnapshots = (roundData.snapshots || []).filter(isUtilityPreRoll);
  const replaySnapshots = [...new Set([...contextSnapshots, ...snapshots])].sort((left, right) => tickOf(left) - tickOf(right));
  const replayThrowSnapshots = [...new Set([...(roundData.throwSnapshots || []).filter(isUtilityPreRoll), ...sliceTicks(roundData.throwSnapshots, start, end)])].sort((left, right) => tickOf(left) - tickOf(right));
  const contextProjectiles = new Set(utilitySegments.flatMap((segment) => segment.projectiles));
  const clippedRoundData = {
    round: clippedRound.round,
    snapshots: replaySnapshots,
    throwSnapshots: replayThrowSnapshots,
    projectiles: [...new Set([...sliceTicks(roundData.projectiles, start, end), ...contextProjectiles])].sort((left, right) => tickOf(left) - tickOf(right)),
    smokeVoxelFrames: sliceStateFrames(roundData.smokeVoxelFrames, start, end),
    infernoFrames: sliceStateFrames(roundData.infernoFrames, start, end),
  };
  const archiveId = id || `broadcast-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  return {
    id: archiveId,
    name: name.trim(),
    mapName: demoData.demo.map,
    createdAt: now,
    savedAt: now,
    startTick: start,
    endTick: end,
    demoData: {
      ...demoData,
      demo: { ...demoData.demo, fileName: `${demoData.demo.fileName} · ${name.trim()}`, maxTick: end },
      rounds: [clippedRound],
      roundData: [{ round: clippedRound.round, snapshots: snapshots.slice(0, 1) }],
      events,
    },
    roundData: clippedRoundData,
  };
}

const typedArrayNames = new Set(['Uint8Array', 'Uint16Array', 'Uint32Array', 'Int8Array', 'Int16Array', 'Int32Array', 'Float32Array', 'Float64Array']);

export function serializeBroadcastArchive(archive) {
  return JSON.stringify(archive, (_key, value) => ArrayBuffer.isView(value)
    ? { __csboardTypedArray: value.constructor.name, values: Array.from(value) }
    : value);
}

export function deserializeBroadcastArchive(serialized) {
  return JSON.parse(serialized, (_key, value) => {
    if (!value?.__csboardTypedArray || !typedArrayNames.has(value.__csboardTypedArray) || !Array.isArray(value.values)) return value;
    const Constructor = globalThis[value.__csboardTypedArray];
    return Constructor.from(value.values);
  });
}

export function splitBroadcastPayload(serialized, chunkSize = 128 * 1024) {
  const chunks = [];
  for (let offset = 0; offset < serialized.length; offset += chunkSize) chunks.push(serialized.slice(offset, offset + chunkSize));
  return chunks;
}
