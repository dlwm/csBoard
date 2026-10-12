import type { ReplayDataSource, ReplaySegment, ReplayTrack, ReplayPlayer, TrackCapability, ReplayRow } from '../data/replaySource.js';
export interface ReplayPlayerState { playerId: string; position: [number, number, number] | null; side: 'T' | 'CT' | 'spectator' | 'unknown'; alive: boolean | null; yaw: number | null; pitch: number | null; crouchAmount: number | null; [key: string]: unknown }
export interface ReplayFrame { tick: number; timeSeconds?: number; players: ReplayPlayerState[] }
export interface PlaybackState { status: 'empty' | 'loading' | 'ready' | 'error'; playing: boolean; tick: number; speed: number; segment: ReplaySegment | null; error: { code: string; message: string } | null; capabilities: Partial<Record<ReplayTrack, TrackCapability>>; trackCounts: Partial<Record<ReplayTrack, number>> }
export function createReplayController(options?: {
  onFrame?: (frame: ReplayFrame | null, context: { tick: number; tickRate: number; roster: ReplayPlayer[] }) => void;
  onTracks?: (tracks: Partial<Record<ReplayTrack, ReplayRow[]>>, context: { tickRate: number; segment?: ReplaySegment; roster?: ReplayPlayer[] }) => void;
  emit?: (type: string, state: PlaybackState) => void; now?: () => number; maxBytes?: number; maxRows?: number; yieldControl?: () => Promise<void>;
}): {
  getState(): PlaybackState; setSource(source: ReplayDataSource | null): void;
  openSegment(segmentId: string, options?: { signal?: AbortSignal; tracks?: ReplayTrack[] }): Promise<PlaybackState>;
  play(): void; pause(): void; seek(tick: number): void; setSpeed(speed: number): void; update(timestamp?: number): void; dispose(): void;
};
export function frameWindow<T extends { tick: number }>(frames: T[], tick: number): { before: T; after: T; beforeIndex: number; afterIndex: number; amount: number } | null;
export function interpolatePosition(from: number[] | null, to: number[] | null, amount: number, options?: { unitsPerMetre?: number; respawn?: boolean }): number[] | null;
export function interpolateReplayFrame(frames: ReplayFrame[], tick: number, tickRate: number): ReplayFrame | null;
export function lerpAngleDegrees(from: number, to: number, amount: number): number;
export function startPlaybackClock(advance: (seconds: number) => void, options?: { delayMs?: number; hz?: number }): () => void;

export interface ReloadState { startTick: number; endTick: number; weapon: string; evidence: 'event' | 'ammo'; estimatedStart: boolean; estimatedEnd: boolean; progress: number }
export interface FlashPresentation { remainingSeconds: number | null; progress: number | null; strength: number | null; opacity: number | null }
export interface IndexedPlayerEvent { id?: string; type: string; tick: number; playerId: string; weapon?: string | null; damageHealth?: number | null; health?: number | null; cost?: number | null; sold?: boolean | null; hitGroup?: number | string | null }
export interface PlayerTimeline {
  readonly tickRate: number;
  getReloads(): Map<string, Omit<ReloadState, 'progress'>[]>;
  reloadAt(id: string, tick: number): ReloadState | null;
  balanceAt(id: string, tick: number): { delta: number; tick: number } | null;
  latest(id: string, type: string, tick: number, seconds: number): IndexedPlayerEvent | null;
  purchasesAt(id: string, tick: number, round?: { startTick?: number; freezeStartTick?: number }): { delta: number; ticks: number[]; opening: boolean };
  flashAt(id: string, tick: number): { remaining: number; initial: number; sourceStartTick: number } | null;
}
export function createPlayerTimeline<P = ReplayPlayerState, E = ReplayRow>(options: { frames?: { tick: number; players: P[] }[]; events?: E[]; tickRate: number; readPlayer?: (player: P) => { id: string; weapon?: string | null; ammo?: number | null; money?: number | null; flashDuration?: number | null }; readEvent?: (event: E) => IndexedPlayerEvent }): PlayerTimeline;
export function delayedPlayerHealth(health: number | null, hurt: { health?: number | null; damageHealth?: number | null } | null, ageSeconds: number): number | null;
export function flashPresentation(value: { remaining: number | null; initial?: number | null; maxAlpha?: number | null }): FlashPresentation;
export function weaponAnimation(reload: { progress: number } | null, firing: boolean | null, kind?: string): { reloadDrop: number; recoil: number };

export interface BombEvent { type: string; tick: number; position?: [number, number, number] | null; hasKit?: boolean | null }
export interface BombState { status: 'unknown' | 'carried' | 'dropped' | 'planted' | 'defused' | 'exploded' | 'ended'; event: BombEvent | null; plant: BombEvent | null; terminal: BombEvent | null; nextPickup: BombEvent | null; position: [number, number, number] | null; countdownSeconds: number | null; defuseProgress: number | null; defuse: BombEvent | null; timerEstimated: boolean; defuseDurationEstimated: boolean | null }
export function createBombTimeline(options: { events?: unknown[]; tickRate: number; timerSeconds?: number; readEvent?: (event: any) => BombEvent | null }): { tickRate: number; timerTicks: number; at(tick: number): BombState };

export function createDirectorTimeline(options?: { events?: unknown[]; readEvent?: (event: any) => ({ type: string; tick: number; position?: [number, number, number] | null; [key: string]: unknown }) | null }): { at(tick: number, mode?: 'follow' | 'fixed' | 'chase'): { type: string; tick: number; position: [number, number, number] | null; [key: string]: unknown } | null };

export interface VoiceClip { tick: number; playerId: string; side?: 'T' | 'CT' | 'unknown' | number | null; samples: Float32Array; sampleRate: number }
export interface VoiceDriver { isReady?(): boolean; now(): number; schedule(clip: VoiceClip, options: { whenSeconds: number; offsetSeconds: number; speed: number }): void; stopAll(): void; setVolume(volume: number): void }
export interface VoicePlaybackOptions { enabled?: boolean; playing?: boolean; muted?: boolean; volume?: number; side?: 'all' | 'T' | 'CT'; speed?: number }
export function voiceSideMatches(side: unknown, filter: 'all' | 'T' | 'CT'): boolean;
export function createVoiceTimeline(options: { frames?: { tick: number; playerId: string; durationSeconds: number }[]; tickRate: number }): { speakingAt(tick: number, active?: boolean): Set<string> };
export function createVoiceScheduler(options: { driver: VoiceDriver; tickRate: number; lookAheadSeconds?: number; startupSeconds?: number; driftSeconds?: number; maxPcmBytes?: number; resolveSide?: (id: string) => unknown }): { setClips(clips: VoiceClip[]): void; configure(options: VoicePlaybackOptions): void; update(tick: number, options?: { discontinuity?: boolean }): void; pump(): void; getState(): Required<VoicePlaybackOptions> & { clipCount: number; queuedThrough: number; anchored: boolean }; dispose(): void };


export interface VoiceDecodeResult { clips: VoiceClip[]; skipped?: number; limited?: boolean }
export type VoiceDecoder = (frames: import('../data/replaySource.js').ReplayRow[], options: { signal: AbortSignal; tickRate: number; maxPcmBytes: number }) => VoiceDecodeResult | Promise<VoiceDecodeResult>;
export interface VoiceState { enabled: boolean; muted: boolean; volume: number; side: 'all' | 'T' | 'CT'; status: 'unknown' | 'unsupported' | 'empty' | 'idle' | 'loading' | 'ready' | 'partial' | 'limited' | 'error'; capability: 'unknown' | 'unsupported' | 'empty' | 'available'; error: { code: string; message: string } | null; speakingIds: string[]; frameCount: number; clipCount: number; audioReady: boolean | null }
export function createVoicePlaybackController(options?: { driver?: VoiceDriver | null; decode?: VoiceDecoder | null; resolveSide?: (id: string) => unknown; emit?: (type: string, state: VoiceState) => void; setTimer?: typeof setInterval; clearTimer?: typeof clearInterval; maxPcmBytes?: number }): { getState(): VoiceState; setTracks(frames: import('../data/replaySource.js').ReplayRow[], context?: { tickRate?: number; status?: VoiceState['capability'] }): void; configure(options: Pick<VoicePlaybackOptions, 'enabled' | 'muted' | 'volume' | 'side'>): void; sync(context: { tick: number; playing: boolean; speed?: number; discontinuity?: boolean }): void; dispose(): void };
