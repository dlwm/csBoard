export const REPLAY_SOURCE_VERSION: '0.1';
export type ReplayTrack = 'frames' | 'preparationFrames' | 'events' | 'projectiles' | 'smokeFrames' | 'fireFrames' | 'voiceFrames';
export const REPLAY_TRACKS: readonly ReplayTrack[];
export interface ReplayMetadata { name: string; mapName: string; kind: string; tickRate: number; sampleRate?: number | null; coordinates: { space: 'source'; axes: 'XYZ'; unit: 'inch' }; [key: string]: unknown }
export interface ReplaySegment { id: string; startTick: number; activeStartTick: number; endTick: number; sourceRound?: number | null; kind?: string; [key: string]: unknown }
/** Neutral replay-profile rows. Source positions/yaw/pitch retain source units. */
export interface ReplayRow { tick: number; [key: string]: unknown }
export interface TrackQuery { startTick?: number; endTick?: number; batchSize?: number; signal?: AbortSignal }
export interface TrackCapability { status: 'available' | 'empty' | 'unknown' | 'unsupported'; reason?: string }
export interface ReplayPlayer { id: string; name: string; steamId: string | null; [key: string]: unknown }
export interface SegmentLease {
  readonly descriptor: Readonly<ReplaySegment>;
  getCapabilities(): Partial<Record<ReplayTrack, TrackCapability>>;
  readTrack(track: ReplayTrack, query?: TrackQuery): AsyncIterable<ReplayRow[]>;
  /** Transitional host extension; not a neutral replay track. */
  getExtension(name: string): unknown;
  dispose(): void;
}
export interface ReplayDataSource {
  readonly apiVersion: string;
  getMetadata(): ReplayMetadata;
  listSegments(): ReplaySegment[];
  listPlayers(): ReplayPlayer[];
  openSegment(query: { segmentId: string; signal?: AbortSignal }): Promise<SegmentLease>;
  dispose(): void;
}
export function createReplayDataSource(options: { metadata: ReplayMetadata; segments: ReplaySegment[]; readPlayers?: () => ReplayPlayer[]; loadSegment: (segment: ReplaySegment, options: { signal: AbortSignal }) => Promise<{ capabilities: Partial<Record<ReplayTrack, TrackCapability>>; readTrack(track: ReplayTrack, query: Required<Omit<TrackQuery, 'signal'>> & { signal: AbortSignal }): AsyncIterable<ReplayRow[]>; extensions?: Record<string, unknown>; dispose?: () => void }>; dispose?: () => void }): ReplayDataSource;
