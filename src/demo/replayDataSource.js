import { createReplayDataSource, REPLAY_TRACKS } from '../../packages/viewer/src/data/replaySource.js';
import { createCsboardReplayProducer } from '../formats/replayAdapter.js';

const fieldByTrack = { frames: 'snapshots', preparationFrames: 'throwSnapshots', events: 'events', projectiles: 'projectiles', smokeFrames: 'smokeVoxelFrames', fireFrames: 'infernoFrames', voiceFrames: 'voiceFrames' };
const trackCapability = (track, rows, payload, data) => {
  if (rows.length) return { status: 'available' };
  const declared = data.demo.formatCapabilities?.[{ frames: 'replay', preparationFrames: 'inputs', smokeFrames: 'smokeVoxels', fireFrames: 'fireAreas', voiceFrames: 'voice' }[track] || track];
  if (declared?.status === 'unavailable') return { status: 'unknown', reason: declared.reason || 'not-provided' };
  if (declared?.status === 'unsupported' || declared?.status === 'unknown') return declared;
  return { status: track === 'events' || Object.hasOwn(payload, fieldByTrack[track]) ? 'empty' : 'unknown' };
};
// Raw .dem and exchange imports share this cache-backed source after ingestion.
// Independently saved recordings use the same source with an inline loader.
// 原始 Demo/交换包解析导入后共用缓存驱动；自制片段仅替换读取端口。
export function createRuntimeReplaySource({ data, cacheId = '', inlineData = null, readRound }) {
  if (!data?.demo || !Array.isArray(data.rounds)) throw new TypeError('Replay metadata is required');
  let cachedId = null, cachedPayload = null, queue = Promise.resolve(), disposed = false;
  const segments = data.rounds.map(round => ({ id: `segment-${round.round}`, sourceRound: round.sourceRound ?? (data.demo.kind === 'recording' ? null : round.round), startTick: round.freezeStartTick ?? round.startTick, activeStartTick: round.startTick, endTick: round.endTick, kind: data.demo.kind === 'recording' ? 'recording' : 'match' }));
  const roundsById = new Map(data.rounds.map(round => [`segment-${round.round}`, round]));
  const producer = createCsboardReplayProducer(data);
  const eventIds = new Map((data.events || []).map((event, index) => [event, `event-${index}`]));
  producer.encodeFrames((data.roundData || []).flatMap(round => round.snapshots || []).slice(0, 24));
  const source = createReplayDataSource({
    readPlayers: () => [...producer.players.values()],
    metadata: { name: data.demo.fileName || '', mapName: data.demo.map || '', kind: data.demo.kind || 'match', tickRate: data.demo.tickRate || 64, sampleRate: data.demo.sampleRate ?? null, coordinates: { space: 'source', axes: 'XYZ', unit: 'inch' } },
    segments,
    async loadSegment(segment, { signal }) {
      const round = roundsById.get(segment.id);
      // Serial reads prevent abandoned round switches from decoding several
      // full payloads simultaneously. Retain at most one cached payload here.
      // 串行读取且仅缓存一个回合；新选择取消后不启动排队的旧读取。
      const operation = queue.catch(() => {}).then(async () => {
        signal.throwIfAborted();
        if (disposed) throw new Error('Replay source disposed');
        let payload;
        if (inlineData && Number(inlineData.round) === Number(round.round)) payload = inlineData;
        else if (cachedId === segment.id) payload = cachedPayload;
        else payload = await readRound(cacheId, round.round);
        signal.throwIfAborted();
        if (!payload?.snapshots?.length) throw new Error(`Replay segment ${segment.id} is missing`);
        cachedId = segment.id; cachedPayload = payload;
        return payload;
      });
      queue = operation;
      const payload = await operation;
      const rowsOf = track => track === 'events' ? (data.events || []).filter(row => row.tick >= segment.startTick && row.tick <= segment.endTick) : payload[fieldByTrack[track]] || [];
      const capabilities = Object.fromEntries(REPLAY_TRACKS.map(track => [track, trackCapability(track, rowsOf(track), payload, data)]));
      return {
        capabilities,
        extensions: { 'csboard.runtime': { getPayload: () => payload } },
        async *readTrack(track, { startTick, endTick, batchSize, signal }) {
          const rows = rowsOf(track);
          let batch = [];
          const encode = values => {
            if (track === 'frames' || track === 'preparationFrames') return producer.encodeFrames(values);
            if (track === 'events') {
              const encoder = createCsboardReplayProducer({ ...data, events: values });
              const events = encoder.events().map((event, index) => ({ ...event, id: eventIds.get(values[index]) }));
              for (const [id, player] of encoder.players) if (!producer.players.has(id)) producer.players.set(id, player);
              return events;
            }
            // Reuse the exchange adapter's neutral field conversion per batch,
            // never encode/duplicate an entire segment merely to read one track.
            const encoded = producer.encodeSegment(round, { snapshots: [payload.snapshots[0]], [fieldByTrack[track]]: values });
            return encoded[track];
          };
          for (const row of rows) {
            signal.throwIfAborted();
            if (row.tick < startTick || row.tick > endTick) continue;
            batch.push(row);
            if (batch.length === batchSize) { yield encode(batch); batch = []; }
          }
          if (batch.length) { signal.throwIfAborted(); yield encode(batch); }
        },
      };
    },
    dispose() { disposed = true; cachedPayload = null; cachedId = null; },
  });
  return source;
}
