import { createVoiceScheduler, createVoiceTimeline } from './voiceTimeline.js';
import { ViewerError } from '../core/controller.js';

// Decoding is cancellable host work. Generation checks reject late results even
// if a decoder ignores abort. 解码由宿主注入；过期结果不能进入下一回合。
export function validateVoiceConfiguration(changes, base = { enabled: true, muted: true, volume: .7, side: 'all' }) {
  const allowed = ['enabled', 'muted', 'volume', 'side'], next = { ...base, ...changes };
  if (!changes || typeof changes !== 'object' || Array.isArray(changes) || Object.keys(changes).some(key => !allowed.includes(key))
    || ['enabled', 'muted'].some(key => typeof next[key] !== 'boolean') || !Number.isFinite(next.volume) || next.volume < 0 || next.volume > 1 || !['all', 'T', 'CT'].includes(next.side)) throw new ViewerError('invalid_argument', 'Voice options require booleans, volume 0–1 and side all/T/CT');
  return next;
}

export function createVoicePlaybackController({ driver = null, decode = null, resolveSide, emit = () => {}, setTimer = setInterval, clearTimer = clearInterval, maxPcmBytes = 128 * 1024 ** 2 } = {}) {
  if ((driver == null) !== (decode == null) || (decode != null && typeof decode !== 'function')) throw new ViewerError('invalid_argument', 'Voice decoder and driver must be supplied together');
  if (!Number.isFinite(maxPcmBytes) || maxPcmBytes <= 0) throw new ViewerError('invalid_argument', 'Voice PCM budget must be positive');
  let disposed = false, generation = 0, abort = null, scheduler = null, frames = [], rate = 64, capability = 'unknown';
  let status = 'unknown', error = null, tick = 0, playing = false, speed = 1, timeline = createVoiceTimeline({ tickRate: rate }), speakingIds = [], signature = null;
  let options = { enabled: true, muted: true, volume: .7, side: 'all' };
  const state = () => ({ ...options, status, capability, error: error ? { ...error } : null, speakingIds: [...speakingIds], frameCount: frames.length, clipCount: scheduler?.getState().clipCount || 0, audioReady: driver?.isReady ? Boolean(driver.isReady()) : null });
  const publish = () => { if (disposed) return; const value = state(), next = JSON.stringify(value); if (next === signature) return; signature = next; emit('voice.state', value); };
  const cancelDecode = () => { generation++; abort?.abort(); abort = null; };
  const decoded = () => ['ready', 'partial', 'limited'].includes(status);
  const syncScheduler = () => {
    scheduler?.update(tick);
    scheduler?.configure({ ...options, enabled: options.enabled && decoded(), playing, speed });
  };
  const fail = reason => { status = 'error'; error = { code: reason?.code || 'voice_failed', message: String(reason?.message || reason).slice(0, 1024) }; try { scheduler?.configure({ playing: false, enabled: false }); } catch {} try { driver?.stopAll(); } catch {} publish(); };
  const startDecode = () => {
    if (disposed || abort || decoded() || !options.enabled || options.muted || options.volume === 0 || !frames.length || !driver || !decode || status === 'error') return;
    const controller = new AbortController(), request = ++generation; abort = controller; status = 'loading'; error = null; publish();
    const input = frames, inputRate = rate;
    Promise.resolve().then(() => { controller.signal.throwIfAborted(); return decode(input, { signal: controller.signal, tickRate: inputRate, maxPcmBytes }); }).then(result => {
      if (disposed || request !== generation || controller.signal.aborted) return;
      if (!result || !Array.isArray(result.clips)) throw new ViewerError('invalid_voice', 'Voice decoder must return PCM clips');
      scheduler.setClips(result.clips);
      status = result.limited ? 'limited' : result.skipped ? 'partial' : 'ready'; abort = null; syncScheduler(); publish();
    }).catch(reason => { if (disposed || request !== generation || controller.signal.aborted) return; abort = null; fail(reason); });
  };
  const timer = driver ? setTimer(() => { if (disposed) return; try { scheduler?.pump(); publish(); } catch (reason) { fail(reason); } }, 25) : null;
  const check = () => { if (disposed) throw new ViewerError('disposed', 'Voice controller is disposed'); };
  return Object.freeze({
    getState: state,
    setTracks(values, { tickRate = 64, status: sourceStatus = 'unknown' } = {}) {
      check();
      if (!Array.isArray(values) || !Number.isFinite(tickRate) || tickRate <= 0 || !['available', 'empty', 'unknown', 'unsupported'].includes(sourceStatus)) throw new ViewerError('invalid_voice', 'Voice tracks require an array, positive tick rate and valid capability');
      cancelDecode(); scheduler?.dispose(); scheduler = null;
      frames = values || []; rate = tickRate; capability = sourceStatus; speakingIds = []; error = null;
      timeline = createVoiceTimeline({ frames, tickRate: rate });
      if (driver) scheduler = createVoiceScheduler({ driver, tickRate: rate, resolveSide, maxPcmBytes });
      status = sourceStatus === 'unknown' || sourceStatus === 'unsupported' ? sourceStatus : !frames.length ? 'empty' : !driver ? 'unsupported' : 'idle';
      syncScheduler(); startDecode(); publish();
    },
    configure(changes) {
      check(); const next = validateVoiceConfiguration(changes, options);
      options = next; speakingIds = [...timeline.speakingAt(tick, options.enabled && playing)].sort();
      if (!options.enabled || options.muted || options.volume === 0) {
        cancelDecode(); scheduler?.setClips([]); if (frames.length && driver) status = 'idle';
      }
      syncScheduler(); startDecode(); publish();
    },
    sync({ tick: nextTick, playing: nextPlaying, speed: nextSpeed = 1, discontinuity = false }) {
      check();
      if (!Number.isFinite(nextTick) || typeof nextPlaying !== 'boolean' || !Number.isFinite(nextSpeed) || nextSpeed < .1 || nextSpeed > 8) throw new ViewerError('invalid_argument', 'Voice sync requires a finite tick, playing flag and speed .1–8');
      tick = nextTick; playing = nextPlaying; speed = nextSpeed;
      speakingIds = [...timeline.speakingAt(tick, options.enabled && playing)].sort();
      try { syncScheduler(); if (discontinuity) scheduler?.update(tick, { discontinuity: true }); } catch (reason) { fail(reason); }
      publish();
    },
    dispose() { if (disposed) return; disposed = true; cancelDecode(); if (timer != null) clearTimer(timer); scheduler?.dispose(); scheduler = null; frames = []; speakingIds = []; timeline = null; },
  });
}
