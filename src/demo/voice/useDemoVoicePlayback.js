import { useEffect, useMemo, useRef, useState } from 'react';
import { useVoiceSettings, voiceAudioContext } from './settings.js';

const EMPTY = [];
export default function useDemoVoicePlayback({ frames = EMPTY, tick, tickRate = 64, playing, enabled, summary }) {
  const { muted, volume } = useVoiceSettings();
  const [decoded, setDecoded] = useState(null);
  const [status, setStatus] = useState('');
  const runtime = useRef({ sources: new Set(), anchor: null, gain: null, index: 0 });
  const audible = enabled && !muted && volume > 0;
  const stop = () => {
    const state = runtime.current;
    for (const source of state.sources) { source.onended = null; try { source.stop(); } catch { /* already ended */ } source.disconnect(); }
    state.sources.clear(); state.anchor = null;
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
  const currentTick = useRef(tick);
  currentTick.current = tick;
  useEffect(() => {
    const context = voiceAudioContext();
    const state = runtime.current;
    if (!context || !audible || !playing || decoded?.frames !== frames) { stop(); return undefined; }
    if (!state.gain) { state.gain = context.createGain(); state.gain.connect(context.destination); }
    const seek = () => {
      stop();
      // One clock for the entire playback, with a small startup buffer. Never
      // calculate each packet's start against a newly rendered UI frame.
      // 整段播放共用音频时钟，预留 40ms 启动缓冲，避免界面帧抖动造成包间断续。
      state.anchor = { tick: currentTick.current, time: context.currentTime + 0.04 };
      const next = decoded.clips.findIndex(clip => clip.tick + clip.samples.length / clip.sampleRate * tickRate > currentTick.current);
      state.index = next < 0 ? decoded.clips.length : next;
    };
    seek();
    const schedule = () => {
      const anchor = state.anchor;
      if (!anchor) return;
      while (state.index < decoded.clips.length) {
        const clip = decoded.clips[state.index];
        const start = anchor.time + (clip.tick - anchor.tick) / tickRate;
        if (start > context.currentTime + 0.8) break;
        state.index++;
        const offset = Math.max(0, context.currentTime - start);
        if (offset >= clip.samples.length / clip.sampleRate) continue;
        const buffer = context.createBuffer(1, clip.samples.length, clip.sampleRate);
        buffer.copyToChannel(clip.samples, 0);
        const source = context.createBufferSource(); source.buffer = buffer; source.connect(state.gain);
        state.sources.add(source);
        source.onended = () => { state.sources.delete(source); source.disconnect(); };
        source.start(Math.max(context.currentTime, start), offset);
      }
    };
    schedule();
    // Independent of React/3D paints; Web Audio owns all queued start times.
    // 调度不依赖 React/3D 刷新，暂停和跳转仍立即取消已排队声音。
    const timer = setInterval(schedule, 25);
    state.seek = seek;
    return () => { clearInterval(timer); state.seek = null; stop(); };
  }, [decoded, frames, tickRate, playing, audible]);
  useEffect(() => {
    const context = voiceAudioContext();
    const state = runtime.current;
    if (context && state.anchor) {
      const expected = state.anchor.tick + Math.max(0, context.currentTime - state.anchor.time) * tickRate;
      // Normal paint delays must not restart audio. Only a real timeline jump
      // or prolonged clock drift requires resynchronization.
      // 普通刷新延迟不重启声音；明显跳转或长期漂移才重新同步。
      if (Math.abs(expected - tick) > tickRate * 0.25) state.seek?.();
    }
  }, [tick, tickRate]);
  useEffect(() => {
    const context = voiceAudioContext();
    if (context && runtime.current.gain) runtime.current.gain.gain.setTargetAtTime(volume, context.currentTime, 0.01);
  }, [volume, decoded, audible]);
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
