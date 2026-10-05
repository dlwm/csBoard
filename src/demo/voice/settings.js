import { useSyncExternalStore } from 'react';
import { preferences } from '../../platform/preferences.js';

// Always start muted. Only volume is persistent; voice never starts on launch.
// 每次启动默认静音，仅记住音量；用户主动开启后才创建音频上下文。
let state;
const listeners = new Set();
let context;
const snapshot = () => {
  if (!state) {
    const saved = Number(preferences.getItem('csboard-voice-volume') ?? 0.7);
    state = { muted: true, volume: Number.isFinite(saved) ? Math.max(0, Math.min(1, saved)) : 0.7 };
  }
  return state;
};
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export function useVoiceSettings() { return useSyncExternalStore(subscribe, snapshot); }
export function setVoiceSettings(changes) {
  state = { ...snapshot(), ...changes };
  if ('volume' in changes) {
    state.volume = Math.max(0, Math.min(1, Number(changes.volume) || 0));
    preferences.setItem('csboard-voice-volume', String(state.volume));
  }
  listeners.forEach(listener => listener());
}
export function voiceAudioContext() { return context; }
export function unlockVoiceAudio() {
  const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContext) return Promise.reject(new Error('Audio playback is unavailable'));
  context ??= new AudioContext();
  return context.resume();
}
