// Host binding for the long-lived scene; lifecycle belongs to the React owner.
// 场景借用接口，不拥有音频协调器/权限，不导入解码器或偏好存储。
import { ViewerError } from '../../../packages/viewer/src/core/controller.js';
let binding = null;
const listeners = new Set();
export function attachVoiceRuntime(value) { binding = value; return () => { if (binding === value) binding = null; }; }
export function getVoiceRuntimeState() { return binding?.controller.getState() || null; }
export function configureVoiceRuntime(changes) {
  if (!binding) throw new ViewerError('not_ready', 'Voice playback is not ready');
  return binding.configure(changes);
}
export function publishVoiceRuntime(type, state) { for (const listener of listeners) { try { listener(type, state); } catch {} } }
export function subscribeVoiceRuntime(listener) { listeners.add(listener); return () => listeners.delete(listener); }
