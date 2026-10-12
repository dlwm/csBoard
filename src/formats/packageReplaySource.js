import { openPackage, REPLAY_PROFILE_VERSION } from './packageIO.js';
import { createReplayDataSource, REPLAY_TRACKS } from '../../packages/viewer/src/data/replaySource.js';

// Direct replay-profile reader for library hosts. No CSBoard storage, parser or
// application payload is needed. V3 remains handled by the ingestion adapter.
// 独立宿主直接读取 replay profile；v3 仍由已有导入适配器转换，不伪称完整回放。
export async function openReplayPackageSource(bytes, { signal } = {}) {
  let reader = await openPackage(bytes, { signal });
  if (reader.manifest.schemaVersion !== REPLAY_PROFILE_VERSION) throw new Error('Direct replay requires the replay profile; import v3 with its existing adapter');
  const { manifest } = reader, { files } = manifest;
  const metadata = await reader.readJSON(files.metadata, 'replayMetadata');
  const players = await reader.readJSON(files.players, 'replayPlayers');
  let events = null, closed = false;
  return createReplayDataSource({
    metadata: { name: metadata.name, mapName: manifest.mapName, kind: manifest.kind, tickRate: manifest.tickRate, sampleRate: manifest.sampleRate, coordinates: { space: 'source', axes: 'XYZ', unit: 'inch' } },
    segments: manifest.segments.map(segment => ({ ...segment, activeStartTick: segment.activeStartTick ?? segment.startTick, kind: manifest.kind })),
    readPlayers: () => players,
    async loadSegment(segment, { signal: segmentSignal }) {
      segmentSignal.throwIfAborted();
      if (closed) throw new Error('Replay package disposed');
      const value = await reader.readJSON(segment.file, 'replaySegment');
      segmentSignal.throwIfAborted();
      if (value.id !== segment.id) throw new Error('Replay segment identity differs from manifest');
      const capabilities = Object.fromEntries(REPLAY_TRACKS.map(track => {
        const rows = value[track];
        const declared = manifest.capabilities[{ frames: 'replay', preparationFrames: 'inputs', smokeFrames: 'smokeVoxels', fireFrames: 'fireAreas', voiceFrames: 'voice' }[track] || track];
        return [track, { status: track === 'events' ? 'available' : rows?.length ? 'available' : declared?.status === 'unknown' || declared?.status === 'unavailable' ? 'unknown' : declared?.status === 'unsupported' ? 'unsupported' : Array.isArray(rows) ? 'empty' : 'unknown' }];
      }));
      return { capabilities,
        async *readTrack(track, { startTick, endTick, batchSize, signal: trackSignal }) {
          if (track === 'events' && !events) { const loaded = await reader.readJSON(files.events, 'replayEvents'); trackSignal.throwIfAborted(); events = loaded; }
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
    dispose() { closed = true; events = null; reader = null; },
  });
}
