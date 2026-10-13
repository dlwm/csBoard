import { ViewerError } from '../core/controller.js';

export const REPLAY_SOURCE_VERSION = '0.1';
export const REPLAY_TRACKS = Object.freeze(['frames', 'preparationFrames', 'events', 'projectiles', 'smokeFrames', 'fireFrames', 'voiceFrames']);
const fail = (code, message) => { throw new ViewerError(code, message); };
const aborted = signal => { if (signal?.aborted) throw signal.reason || new ViewerError('cancelled', 'Replay read cancelled'); };
const clone = value => structuredClone(value);
const validateKeys = (value, allowed) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid_query', 'Query must be an object');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('invalid_query', `Unknown query field ${key}`);
};
// Metadata is eager; track data is lazy and owned by a segment lease.
// 目录不读取回合载荷；宿主提供存储/网络读取，租约关闭后禁止继续读取轨道。
export function createReplayDataSource({ metadata, segments, loadSegment, readPlayers = () => metadata.players || [], dispose: releaseSource = () => {} }) {
  if (!metadata || !Number.isFinite(metadata.tickRate) || metadata.tickRate <= 0 || !Array.isArray(segments) || typeof loadSegment !== 'function') fail('invalid_source', 'Replay requires metadata, segments and a loader');
  const catalogue = clone(segments), info = clone(metadata), ids = new Set();
  for (const segment of catalogue) {
    if (typeof segment.id !== 'string' || !segment.id || ids.has(segment.id) || ![segment.startTick, segment.activeStartTick, segment.endTick].every(Number.isFinite) || segment.startTick > segment.activeStartTick || segment.activeStartTick > segment.endTick) fail('invalid_segment', 'Segments require unique IDs and ordered tick bounds');
    ids.add(segment.id);
  }
  const sourceAbort = new AbortController(), leases = new Set();
  let disposed = false;
  const check = signal => { if (disposed) fail('disposed', 'Replay source has been disposed'); aborted(signal); };
  return Object.freeze({
    apiVersion: REPLAY_SOURCE_VERSION,
    getMetadata() { check(); return clone(info); },
    listSegments() { check(); return clone(catalogue); },
    listPlayers() { check(); return clone(readPlayers()); },
    async openSegment(query = {}) {
      validateKeys(query, ['segmentId', 'signal']); check(query.signal);
      const descriptor = catalogue.find(segment => segment.id === query.segmentId);
      if (!descriptor) fail('unknown_segment', `Unknown segment ${query.segmentId}`);
      const signal = query.signal ? AbortSignal.any([query.signal, sourceAbort.signal]) : sourceAbort.signal;
      let port = await loadSegment(clone(descriptor), { signal });
      try { check(signal); } catch (error) { port?.dispose?.(); throw error; }
      if (!port || typeof port.readTrack !== 'function') { port?.dispose?.(); fail('invalid_loader', 'Segment loader must return a track reader'); }
      let closed = false;
      const close = () => { if (closed) return; closed = true; leases.delete(lease); port.dispose?.(); port = null; };
      const checkLease = signal => { check(signal); if (closed) fail('disposed', 'Segment lease has been closed'); };
      const lease = Object.freeze({
        descriptor: Object.freeze(clone(descriptor)),
        getCapabilities() { checkLease(); return clone(port.capabilities || {}); },
        // Host-specific compatibility ports are explicitly namespaced. They are
        // not standard tracks and must not be serialized into exchange files.
        // 命名空间扩展只用于宿主迁移，不属于交换格式或通用渲染数据。
        getExtension(name) { checkLease(); return port.extensions?.[name]; },
        async *readTrack(track, options = {}) {
          validateKeys(options, ['startTick', 'endTick', 'batchSize', 'signal']); checkLease(options.signal);
          if (!REPLAY_TRACKS.includes(track)) fail('unknown_track', `Unknown replay track ${track}`);
          const startTick = options.startTick ?? descriptor.startTick, endTick = options.endTick ?? descriptor.endTick;
          const batchSize = options.batchSize ?? 256;
          if (![startTick, endTick].every(Number.isFinite) || startTick > endTick || startTick < descriptor.startTick || endTick > descriptor.endTick || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 4096) fail('invalid_query', 'Tick range must fit the segment; batchSize must be 1–4096');
          const status = port.capabilities?.[track]?.status;
          if (!['available', 'empty'].includes(status)) fail('track_unavailable', `Track ${track} is ${status || 'undeclared'}`);
          const trackSignal = options.signal ? AbortSignal.any([options.signal, signal]) : signal;
          if (status === 'empty') return;
          const iterable = port.readTrack(track, { startTick, endTick, batchSize, signal: trackSignal });
          let previousTick = -Infinity;
          for await (const batch of iterable) {
            checkLease(trackSignal);
            if (!Array.isArray(batch) || batch.length > batchSize || batch.some(row => !Number.isFinite(row.tick) || row.tick < startTick || row.tick > endTick)) fail('invalid_track', 'Track reader returned an invalid batch or tick range');
            for (const row of batch) { if (row.tick < previousTick) fail('invalid_track', 'Track ticks must be ordered'); previousTick = row.tick; }
            yield batch;
          }
          checkLease(trackSignal);
        },
        dispose: close,
      });
      leases.add(lease); return lease;
    },
    dispose() { if (disposed) return; disposed = true; sourceAbort.abort(new ViewerError('disposed', 'Replay source has been disposed')); for (const lease of [...leases]) lease.dispose(); releaseSource(); },
  });
}
