// Context permissions/ownership belong to the host. Each driver owns only its
// gain node and scheduled sources. 上下文由宿主创建/解锁，驱动不 close 它。
export function createWebAudioVoiceDriver({ getContext } = {}) {
  if (typeof getContext !== 'function') throw new TypeError('Audio context getter is required');
  const sources = new Set(); let gain = null, context = null, volume = .7, disposed = false;
  const stopAll = () => { for (const source of sources) { source.onended = null; try { source.stop(); } catch {} source.disconnect(); } sources.clear(); };
  const ensure = () => {
    if (disposed) throw new Error('Audio driver is disposed');
    const next = getContext(); if (!next) return null;
    if (next !== context) { stopAll(); gain?.disconnect(); context = next; gain = context.createGain(); gain.connect(context.destination); gain.gain.value = volume; }
    return context;
  };
  return Object.freeze({
    isReady() { return !disposed && getContext()?.state === 'running'; },
    now() { return getContext()?.currentTime || 0; },
    setVolume(value) { if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeError('Voice volume must be 0–1'); if (value === volume) return; volume = value; if (gain && context) gain.gain.setTargetAtTime(value, context.currentTime, .01); },
    stopAll,
    schedule(clip, { whenSeconds, offsetSeconds, speed }) {
      const audio = ensure(); if (!audio || audio.state !== 'running') return;
      const buffer = audio.createBuffer(1, clip.samples.length, clip.sampleRate); buffer.copyToChannel(clip.samples, 0);
      const source = audio.createBufferSource(); source.buffer = buffer; source.playbackRate.value = speed; source.connect(gain); sources.add(source);
      source.onended = () => { sources.delete(source); source.disconnect(); };
      try { source.start(whenSeconds, offsetSeconds); } catch (error) { sources.delete(source); source.disconnect(); throw error; }
    },
    getState() { return { activeSources: sources.size, contextState: getContext()?.state || 'unavailable' }; },
    dispose() { if (disposed) return; stopAll(); gain?.disconnect(); gain = null; context = null; disposed = true; },
  });
}
