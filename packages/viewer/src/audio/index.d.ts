export { createVoiceScheduler, createVoiceTimeline, voiceSideMatches } from '../playback/index.js';
export type { VoiceClip, VoiceDriver, VoicePlaybackOptions } from '../playback/index.js';
export function createWebAudioVoiceDriver(options: { getContext: () => AudioContext | null | undefined }): import('../playback/index.js').VoiceDriver & { getState(): { activeSources: number; contextState: string }; dispose(): void };

export { createVoicePlaybackController } from '../playback/index.js';
export type { VoiceDecoder, VoiceDecodeResult, VoiceState } from '../playback/index.js';
