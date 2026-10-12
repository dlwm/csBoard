import { REPLAY_TRACKS } from '../data/replaySource.js';
import { ViewerError } from '../core/controller.js';
import { interpolateReplayFrame } from './interpolation.js';

// Playback owns only the selected segment's tracks; its source is host-owned.
// 只持有选中片段；时钟、回调和数据源均可注入，不连接 UI、存储或解析器。
export function createReplayController({ onFrame = () => {}, onTracks = () => {}, emit = () => {}, now = () => performance.now(), maxBytes = 128 * 1024 ** 2, maxRows = 500000, yieldControl = () => new Promise(resolve => setTimeout(resolve, 0)) } = {}) {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0 || !Number.isInteger(maxRows) || maxRows <= 0) throw new TypeError('Playback budgets must be positive');
  let source = null, lease = null, abort = null, generation = 0, disposed = false, tracks = {}, roster = [], rate = 64, previous = 0, lastNotice = -Infinity;
  let state = { status: 'empty', playing: false, tick: 0, speed: 1, segment: null, error: null, capabilities: {}, trackCounts: {} };
  const check = () => { if (disposed) throw new ViewerError('disposed', 'Playback has been disposed'); };
  const snapshot = () => structuredClone(state);
  const notify = type => emit(type, snapshot());
  const render = () => onFrame(interpolateReplayFrame(tracks.frames, state.tick, rate), { tick: state.tick, tickRate: rate, roster });
  const cancel = () => { generation++; abort?.abort(); abort = null; lease?.dispose(); lease = null; };
  const clear = () => { tracks = {}; roster = []; onTracks(tracks, { tickRate: rate }); onFrame(null, { tick: 0, tickRate: rate, roster }); };
  return Object.freeze({
    getState() { check(); return snapshot(); },
    setSource(value) { check(); if (value && ['getMetadata', 'listSegments', 'listPlayers', 'openSegment'].some(key => typeof value[key] !== 'function')) throw new ViewerError('invalid_source', 'Replay source must implement the public data source interface'); cancel(); source = value; clear(); state = { ...state, status: 'empty', playing: false, tick: 0, segment: null, error: null, capabilities: {}, trackCounts: {} }; notify('playback.source'); },
    async openSegment(segmentId, { signal, tracks: requested = ['frames', 'events', 'projectiles', 'smokeFrames', 'fireFrames'] } = {}) {
      check(); if (!Array.isArray(requested) || requested.some(track => !REPLAY_TRACKS.includes(track))) throw new ViewerError('unknown_track', 'Requested playback tracks must use public track names'); if (!source) throw new ViewerError('missing_source', 'Attach a replay source first');
      cancel(); clear();
      const request = generation, controller = new AbortController(); abort = controller;
      const readSignal = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
      state = { ...state, status: 'loading', playing: false, segment: null, error: null, capabilities: {}, trackCounts: {} }; notify('playback.loading');
      let opened;
      try {
        const descriptor = source.listSegments().find(segment => segment.id === segmentId);
        if (!descriptor) throw new ViewerError('unknown_segment', `Unknown segment ${segmentId}`);
        rate = source.getMetadata().tickRate;
        opened = await source.openSegment({ segmentId, signal: readSignal });
        const capabilities = opened.getCapabilities(), loaded = {}; let bytes = 0, rows = 0, batches = 0;
        for (const track of new Set(['frames', ...requested])) {
          if (capabilities[track]?.status !== 'available') {
            if (track === 'frames') throw new ViewerError('missing_frames', 'Selected segment has no available player frames');
            continue;
          }
          const values = [];
          for await (const batch of opened.readTrack(track, { signal: readSignal })) {
            if (track === 'frames') for (const frame of batch) {
              if (!Array.isArray(frame.players) || frame.players.length > 256 || new Set(frame.players.map(player => player.playerId)).size !== frame.players.length || frame.players.some(player => typeof player.playerId !== 'string' || !player.playerId || (player.position != null && (!Array.isArray(player.position) || player.position.length !== 3 || !player.position.every(Number.isFinite))))) throw new ViewerError('invalid_frame', 'Player frames require unique identities and finite Source positions');
            }
            rows += batch.length; bytes += JSON.stringify(batch).length * 2;
            if (rows > maxRows || bytes > maxBytes) throw new ViewerError('playback_budget', 'Selected replay segment exceeds the playback budget');
            values.push(...batch);
            // Yield to input/abort events; promise-only iteration can monopolize
            // the browser microtask queue while normalizing a large segment.
            // 定期让出主线程，取消/拖动事件才有机会到达，不只让出微任务。
            if (++batches % 16 === 0) { await yieldControl(); readSignal.throwIfAborted(); }
          }
          loaded[track] = values;
        }
        readSignal.throwIfAborted(); check();
        if (request !== generation) throw new ViewerError('cancelled', 'Playback selection changed');
        if (!loaded.frames?.length) throw new ViewerError('missing_frames', 'Selected segment has no player frames');
        tracks = loaded; roster = source.listPlayers(); lease = opened;
        state = { ...state, status: 'ready', segment: descriptor, tick: descriptor.activeStartTick, capabilities, error: null, trackCounts: Object.fromEntries(Object.entries(tracks).map(([track, values]) => [track, values.length])) };
        onTracks(tracks, { tickRate: rate, segment: descriptor, roster }); render(); notify('playback.ready'); return snapshot();
      } catch (error) {
        opened?.dispose();
        if (!disposed && request === generation) { if (lease === opened) lease = null; try { clear(); } catch {} state = { ...state, status: 'error', playing: false, error: { code: readSignal.aborted ? 'cancelled' : error.code || 'load_failed', message: error.message || String(error) } }; notify(readSignal.aborted ? 'playback.cancelled' : 'playback.failed'); }
        throw error;
      } finally { if (abort === controller) abort = null; }
    },
    play() { check(); if (state.status !== 'ready') throw new ViewerError('not_ready', 'Replay is not ready'); if (state.tick >= state.segment.endTick) state.tick = state.segment.activeStartTick; state.playing = true; previous = now(); notify('playback.play'); },
    pause() { check(); state.playing = false; notify('playback.pause'); },
    seek(tick) { check(); if (!state.segment || state.status !== 'ready') throw new ViewerError('not_ready', 'Replay is not ready'); if (!Number.isFinite(tick)) throw new ViewerError('invalid_argument', 'Tick must be finite'); state.tick = Math.max(state.segment.startTick, Math.min(state.segment.endTick, tick)); previous = now(); render(); notify('playback.seek'); },
    setSpeed(speed) { check(); if (!Number.isFinite(speed) || speed < .1 || speed > 8) throw new ViewerError('invalid_argument', 'Playback speed must be 0.1–8'); state.speed = speed; previous = now(); notify('playback.speed'); },
    update(timestamp = now()) { if (disposed || !state.playing) return; if (!Number.isFinite(timestamp)) throw new ViewerError('invalid_argument', 'Playback timestamp must be finite'); const elapsed = Math.max(0, timestamp - previous) / 1000; previous = timestamp; state.tick = Math.min(state.segment.endTick, state.tick + elapsed * rate * state.speed); render(); if (timestamp - lastNotice >= 100) { lastNotice = timestamp; notify('playback.time'); } if (state.tick >= state.segment.endTick) { state.playing = false; notify('playback.ended'); } },
    dispose() { if (disposed) return; disposed = true; cancel(); source = null; clear(); },
  });
}
