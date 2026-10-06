// Compatibility at the broadcast wire boundary only. Playback and persistence
// use Recording; old rooms/archives retain their demoData field on the wire.
// 旧字段仅保留在演播协议边界，界面和持久化统一使用 Recording。
import { buildRecording, serializeRecording, deserializeRecording, splitRecordingPayload } from '../demo/recordingArchive.js';

export function buildBroadcastArchive(options) {
  const recording = buildRecording(options);
  if (!recording) return null;
  const { data, ...metadata } = recording;
  return { ...metadata, demoData: data };
}
export function serializeBroadcastArchive(recording) {
  if (!recording.data) return serializeRecording(recording);
  const { data, ...metadata } = recording;
  return serializeRecording({ ...metadata, demoData: data });
}
export const deserializeBroadcastArchive = deserializeRecording;
export const splitBroadcastPayload = splitRecordingPayload;
