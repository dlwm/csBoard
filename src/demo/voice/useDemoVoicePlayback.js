import { useEffect, useMemo, useRef, useState } from 'react';
import { useVoiceSettings, voiceAudioContext } from './settings.js';

const EMPTY = [];
export default function useDemoVoicePlayback({ frames = EMPTY, tick, tickRate = 64, playing, enabled, summary }) {
  const { muted, volume } = useVoiceSettings();
  const [decoded, setDecoded] = useState(null);
  const [status, setStatus] = useState('');
  const runtime = useRef({ sources: new Set(), scheduled: new Set(), anchor: null, gain: null, index: 0 });
  const audible = enabled && !muted && volume > 0;
  const stop = () => {
    const state = runtime.current;
    for (const source of state.sources) { source.onended = null; try { source.stop(); } catch { /* already ended */ } source.disconnect(); }
    state.sources.clear(); state.scheduled.clear(); state.anchor = null;
  };
  useEffect(() => {
    setDecoded(null); setStatus(''); stop();
    if (!audible) return undefined;
    if (!frames.length) { setStatus(summary?.skipped ? 'unsupported' : summary?.frames === 0 ? 'empty' : ''); return undefined; }
    setStatus('loading');
    let cancelled = false;
    const worker = new Worker(new URL('./decodeWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (cancelled) return;
      if (data.error) { setStatus('error'); return; }
      setDecoded({ frames, clips: data.clips });
      setStatus(data.limited || summary?.limited ? 'limited' : data.skipped || summary?.skipped ? 'partial' : '');
      worker.terminate();
    };
    worker.onerror = () => { if (!cancelled) setStatus('error'); worker.terminate(); };
    worker.postMessage({ frames, tickRate });
    return () => { cancelled = true; worker.terminate(); };
  }, [frames, tickRate, audible, summary]);
  useEffect(() => {
    const context = voiceAudioContext();
    const state = runtime.current;
    if (!context || !audible || !playing || decoded?.frames !== frames) { stop(); return; }
    if (!state.gain) { state.gain = context.createGain(); state.gain.connect(context.destination); }
    state.gain.gain.setValueAtTime(volume, context.currentTime);
    const anchor = state.anchor;
    const expected = anchor ? anchor.tick + (context.currentTime - anchor.time) * tickRate : NaN;
    if (!anchor || Math.abs(expected - tick) > tickRate * 0.15) {
      stop();
      state.anchor = { tick, time: context.currentTime };
      const next = decoded.clips.findIndex(clip => clip.tick + clip.samples.length / clip.sampleRate * tickRate > tick);
      state.index = next < 0 ? decoded.clips.length : next;
    }
    // Schedule a short horizon. Pause, seeking and map changes stop every queued source.
    // 提前调度 0.4 秒，暂停、跳转和地图切换时取消所有已排队声音。
    while (state.index < decoded.clips.length) {
      const index = state.index;
      const clip = decoded.clips[index];
      if (clip.tick > tick + tickRate * 0.4) break;
      state.index++;
      const duration = clip.samples.length / clip.sampleRate;
      const delay = (clip.tick - tick) / tickRate;
      if (delay + duration <= 0 || state.scheduled.has(index)) continue;
      state.scheduled.add(index);
      const buffer = context.createBuffer(1, clip.samples.length, clip.sampleRate);
      buffer.copyToChannel(clip.samples, 0);
      const source = context.createBufferSource(); source.buffer = buffer; source.connect(state.gain);
      state.sources.add(source);
      source.onended = () => { state.sources.delete(source); state.scheduled.delete(index); source.disconnect(); };
      source.start(context.currentTime + Math.max(0, delay), Math.max(0, -delay));
    }
  }, [decoded, frames, tick, tickRate, playing, audible, volume]);
  useEffect(() => () => { stop(); runtime.current.gain?.disconnect(); }, []);
  const speakingIds = useMemo(() => {
    const ids = new Set();
    if (enabled && playing) {
      // A packet is at most 120 ms. Search a short window, not the entire round.
      // Opus 包最长 120 毫秒，通过二分定位小窗口，避免每次画帧扫描全回合。
      let low = 0, high = frames.length;
      const start = tick - tickRate * 0.24;
      while (low < high) { const middle = (low + high) >>> 1; if (frames[middle].tick < start) low = middle + 1; else high = middle; }
      for (let index = low; index < frames.length && frames[index].tick <= tick; index++) {
        const frame = frames[index];
        if (frame.tick + (frame.duration + 0.12) * tickRate >= tick) { if (frame.steamid !== '0') ids.add(frame.steamid); if (frame.name) ids.add(frame.name); }
      }
    }
    return ids;
  }, [frames, tick, tickRate, enabled, playing]);
  return { speakingIds, status: enabled ? status : '' };
}
