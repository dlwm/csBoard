import { openPackage, REPLAY_PROFILE_VERSION } from './packageReader.js';
import { DemoFormatError } from './errors.js';
import { createReplayDataSource, REPLAY_TRACKS } from '../data/replaySource.js';

// Read standard replay rows without converting to CSBoard cache fields.
// 直接读取标准回放轨道，不转换为应用缓存字段；v3 统计包不冒充完整回放。
export async function openReplayPackageSource(bytes, { signal } = {}) {
  let reader = await openPackage(bytes, { signal });
  if (reader.manifest.schemaVersion !== REPLAY_PROFILE_VERSION) {
    reader.dispose();
    throw new DemoFormatError('unsupported_profile', 'Direct playback requires cs2-demo-format/replay/0.1; v3 statistics packages require a host adapter');
  }
  const { manifest } = reader, { files } = manifest;
  let metadata, players;
  try {
    metadata = await reader.readJSON(files.metadata, 'replayMetadata');
    players = await reader.readJSON(files.players, 'replayPlayers');
  } catch (error) { reader.dispose(); throw error; }
  let events = null, closed = false;
  return createReplayDataSource({
    metadata: { name: metadata.name, mapName: manifest.mapName, kind: manifest.kind, tickRate: manifest.tickRate, sampleRate: manifest.sampleRate, coordinates: { space: 'source', axes: 'XYZ', unit: 'inch' } },
    segments: manifest.segments.map(segment => ({ ...segment, activeStartTick: segment.activeStartTick ?? segment.startTick, kind: manifest.kind })),
    readPlayers: () => players,
    async loadSegment(segment, { signal: segmentSignal }) {
      segmentSignal.throwIfAborted();
      if (closed) throw new Error('Replay package disposed');
      const value = await reader.readJSON(segment.file, 'replaySegment', { signal: segmentSignal });
      segmentSignal.throwIfAborted();
      if (value.id !== segment.id) throw new Error('Replay segment identity differs from manifest');
      const capabilities = Object.fromEntries(REPLAY_TRACKS.map(track => {
        const rows = value[track];
        const declared = manifest.capabilities[{ frames: 'replay', preparationFrames: 'inputs', smokeFrames: 'smokeVoxels', fireFrames: 'fireAreas', voiceFrames: 'voice' }[track] || track];
        return [track, { status: track === 'events' ? 'available' : rows?.length ? 'available' : declared?.status === 'unknown' || declared?.status === 'unavailable' ? 'unknown' : declared?.status === 'unsupported' ? 'unsupported' : Array.isArray(rows) ? 'empty' : 'unknown' }];
      }));
      return { capabilities,
        async *readTrack(track, { startTick, endTick, batchSize, signal: trackSignal }) {
          if (track === 'events' && !events) { const loaded = await reader.readJSON(files.events, 'replayEvents', { signal: trackSignal }); trackSignal.throwIfAborted(); events = loaded; }
          let batch = [];
          for (const row of track === 'events' ? events : value[track] || []) {
            trackSignal.throwIfAborted();
            if (row.tick < startTick || row.tick > endTick) continue;
            batch.push(row); if (batch.length === batchSize) { yield batch; batch = []; }
          }
          if (batch.length) yield batch;
        },
      };
    },
    dispose() { closed = true; events = null; reader.dispose(); reader = null; },
  });
}
