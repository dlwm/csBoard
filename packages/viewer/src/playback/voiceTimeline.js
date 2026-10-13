const sideOf = value => value === 2 || value === 'T' ? 'T' : value === 3 || value === 'CT' ? 'CT' : 'unknown';
export function voiceSideMatches(side, filter) {
  if (!['all', 'T', 'CT'].includes(filter)) throw new TypeError('Voice filter must be all, T or CT');
  return filter === 'all' || sideOf(side) === filter;
}
// Speaking is observed activity, independent of mute and side filtering.
// 讲话标记反映录像活动，不因静音或阵营过滤而消失。
export function createVoiceTimeline({ frames = [], tickRate } = {}) {
  if (!Number.isFinite(tickRate) || tickRate <= 0) throw new TypeError('Voice timeline requires a positive tick rate');
  const rows = frames.filter(row => Number.isFinite(row.tick) && typeof row.playerId === 'string' && row.playerId && Number.isFinite(row.durationSeconds) && row.durationSeconds >= 0)
    .map(row => ({ tick: row.tick, playerId: row.playerId, end: row.tick + (row.durationSeconds + .12) * tickRate })).sort((a, b) => a.tick - b.tick);
  let maxEnd = -Infinity; for (const row of rows) { maxEnd = Math.max(maxEnd, row.end); row.maxEnd = maxEnd; }
  return { speakingAt(tick, active = true) {
    const ids = new Set(); if (!active || !Number.isFinite(tick)) return ids;
    let lo = 0, hi = rows.length; while (lo < hi) { const mid = (lo + hi) >>> 1; if (rows[mid].tick <= tick) lo = mid + 1; else hi = mid; }
    for (let index = lo - 1; index >= 0 && rows[index].maxEnd >= tick; index--) if (rows[index].end >= tick) ids.add(rows[index].playerId);
    return ids;
  } };
}

// Audio-clock scheduler; all hardware/decoding is injected. Times are seconds.
// 共用音频时钟，不按 UI 帧重建起点；设备与解码由宿主注入。
export function createVoiceScheduler({ driver, tickRate, lookAheadSeconds = .8, startupSeconds = .04, driftSeconds = .25, maxPcmBytes = 128 * 1024 ** 2, resolveSide = () => 'unknown' } = {}) {
  if (!driver || ['now', 'schedule', 'stopAll', 'setVolume'].some(key => typeof driver[key] !== 'function')) throw new TypeError('Voice driver requires now/schedule/stopAll/setVolume');
  if (![tickRate, lookAheadSeconds, driftSeconds, maxPcmBytes].every(value => Number.isFinite(value) && value > 0) || !Number.isFinite(startupSeconds) || startupSeconds < 0) throw new TypeError('Invalid voice scheduling budget');
  let clips = [], prefixEnd = [], index = 0, anchor = null, disposed = false;
  let options = { enabled: false, playing: false, muted: true, volume: .7, side: 'all', speed: 1 }, currentTick = 0;
  const stop = () => { driver.stopAll(); anchor = null; };
  const audible = () => options.enabled && options.playing && !options.muted && options.volume > 0;
  const seek = tick => {
    stop(); currentTick = tick;
    if (!audible()) return;
    anchor = { tick, time: driver.now() + startupSeconds };
    let lo = 0, hi = prefixEnd.length; while (lo < hi) { const mid = (lo + hi) >>> 1; if (prefixEnd[mid] > tick) hi = mid; else lo = mid + 1; } index = lo;
  };
  const check = () => { if (disposed) throw new Error('Voice scheduler is disposed'); };
  return Object.freeze({
    setClips(values) {
      check(); if (!Array.isArray(values)) throw new TypeError('Voice clips must be an array');
      let bytes = 0;
      const next = values.map(clip => {
        if (!Number.isFinite(clip.tick) || typeof clip.playerId !== 'string' || !clip.playerId || !(clip.samples instanceof Float32Array) || !Number.isFinite(clip.sampleRate) || clip.sampleRate <= 0) throw new TypeError('Invalid PCM voice clip');
        bytes += clip.samples.byteLength; if (bytes > maxPcmBytes) throw new RangeError('Voice PCM budget exceeded');
        return { ...clip, endTick: clip.tick + clip.samples.length / clip.sampleRate * tickRate };
      }).sort((a, b) => a.tick - b.tick);
      clips = next; let end = -Infinity; prefixEnd = next.map(clip => end = Math.max(end, clip.endTick)); seek(currentTick);
    },
    configure(changes) {
      check(); const allowed = ['enabled', 'playing', 'muted', 'volume', 'side', 'speed'];
      if (Object.keys(changes).some(key => !allowed.includes(key))) throw new TypeError('Unknown voice option');
      const next = { ...options, ...changes };
      if (['enabled', 'playing', 'muted'].some(key => typeof next[key] !== 'boolean') || !Number.isFinite(next.volume) || next.volume < 0 || next.volume > 1 || !Number.isFinite(next.speed) || next.speed < .1 || next.speed > 8) throw new TypeError('Invalid voice options');
      voiceSideMatches('unknown', next.side);
      const restart = ['enabled', 'playing', 'muted', 'side', 'speed'].some(key => next[key] !== options[key]) || (next.volume > 0) !== (options.volume > 0);
      options = next; driver.setVolume(next.volume); if (restart) seek(currentTick);
    },
    update(tick, { discontinuity = false } = {}) {
      check(); if (!Number.isFinite(tick)) throw new TypeError('Voice tick must be finite');
      currentTick = tick;
      if (!audible() || (driver.isReady && !driver.isReady())) { if (anchor) stop(); return; }
      if (!anchor || discontinuity || Math.abs(anchor.tick + Math.max(0, driver.now() - anchor.time) * tickRate * options.speed - tick) > tickRate * driftSeconds) seek(tick);
    },
    pump() {
      if (disposed || !anchor || !audible()) return;
      if (driver.isReady && !driver.isReady()) { stop(); return; }
      const now = driver.now();
      while (index < clips.length) {
        const clip = clips[index], start = anchor.time + (clip.tick - anchor.tick) / (tickRate * options.speed);
        if (start > now + lookAheadSeconds) break; index++;
        if (!voiceSideMatches(clip.side ?? resolveSide(clip.playerId), options.side)) continue;
        const offsetSeconds = Math.max(0, now - start) * options.speed;
        if (offsetSeconds >= clip.samples.length / clip.sampleRate) continue;
        driver.schedule(clip, { whenSeconds: Math.max(now, start), offsetSeconds, speed: options.speed });
      }
    },
    getState() { return { ...options, clipCount: clips.length, queuedThrough: index, anchored: Boolean(anchor) }; },
    dispose() { if (disposed) return; stop(); disposed = true; clips = []; prefixEnd = []; },
  });
}
