/** Experimental execution API. Independent of application and package versions. */
export const PARSER_API_VERSION: '0.1';
export type FrameProfile = 'replay' | 'analysis' | 'preparation';
export const FRAME_PROFILE_NAMES: readonly FrameProfile[];
export interface ParserInfo {
  id: string;
  adapterVersion: string;
  execution?: string;
  sourceRevision?: string;
  sourceFormat?: string;
  apiVersion?: string;
}
export interface ParserPart { readonly id: string; readonly byteLength: number }
export interface ParserCapability { readonly supported: boolean | null; readonly reason?: string; readonly eventTypes?: readonly string[] }
export type ParserCapabilities = Readonly<Record<string, ParserCapability>>;
export interface SourcePoint { x: number; y: number; z: number }
export interface PlayerIdentity { steamid: string | null; name: string | null }
export interface EventObservation {
  type: string;
  tick: number;
  actor: PlayerIdentity | null;
  target: PlayerIdentity | null;
  assistant: PlayerIdentity | null;
  position: SourcePoint | null;
  positionRole: 'actor' | 'target' | 'effect' | 'unknown';
  weapon: string | null;
  damageHealth: number | null;
  /** Extra event facts; adapters preserve current application event payloads. */
  attributes: Readonly<Record<string, unknown>>;
}
export interface PlayerObservation {
  id: string; steamId: string | null;
  /** Compatibility alias for source identity, which can also represent a bot. */
  name: string; steamid: string; userId: number | null;
  /** Source world units, not renderer coordinates. Null axes mean unobserved. */
  raw: { x: number | null; y: number | null; z: number | null };
  hasPosition: boolean;
  team: number | null; side: 'T' | 'CT' | '';
  health: number | null; armor: number | null; alive: boolean | null;
  pitch: number | null; yaw: number | null; duckAmount: number | null;
  isAirborne: boolean | null; walking: boolean | null;
  activeWeapon: string | null; activeWeaponAmmo: number | null;
  inventory: string[] | null; hasC4: boolean | null; hasHelmet: boolean | null; hasDefuser: boolean | null;
  flashDuration: number | null; flashMaxAlpha: number | null; scoped: boolean | null;
  placeName: string | null; defusing: boolean | null;
  balance: number | null; cashSpentThisRound: number | null; roundStartEquipValue: number | null; currentEquipValue: number | null;
  score: number | null;
  /** Input fields must not be interpreted as observations when false. */
  inputAvailable: boolean;
  movement: Array<'FORWARD' | 'BACK' | 'LEFT' | 'RIGHT'>;
  jump: boolean | null; fire: boolean | null; secondaryFire: boolean | null;
  grenadePinPulled: boolean | null; grenadeThrowStrength: number | null;
}
export interface PlayerSample { tick: number; player: PlayerObservation }
export interface ProjectileFrame {
  tick: number; entity_id: number | string; grenade_type: string;
  x: number; y: number; z: number;
  thrower_steamid: string; thrower_name: string;
  initial_velocity?: number[];
  [key: string]: unknown;
}
export interface SmokeFrame { tick: number; entityId: number | string; origin: number[]; seq: number; voxels: Uint16Array }
export interface FireFrame { tick: number; entityId: number | string; seq: number; lifetime: number; cells: Float32Array }
export type UtilityObservation =
  | { kind: 'projectile'; frame: ProjectileFrame }
  | { kind: 'smoke'; frame: SmokeFrame }
  | { kind: 'fire'; frame: FireFrame }
  | { kind: 'throw'; tick: number; steamid: string; type: string; state: { strength: number | null; jumpThrow: boolean | null; throwTime: number | null } };
export interface VoiceFrame { codec: 'opus'; tick: number; steamid: string; name: string; team: number; duration: number; data: string }
export interface VoiceBatch { frames: VoiceFrame[]; summary: { skipped?: number; limited?: boolean } }
export interface ParserMetadata {
  mapName: string; tickRate: number; firstTick: number; lastTick: number;
  broadcast: boolean | null; standardRoster: boolean | null;
  patch?: string | null; versionGuid?: string | null; versionName?: string | null; fileStamp?: string | null;
  serverName?: string | null; clientName?: string | null;
  producerFields: Readonly<Record<string, unknown>>;
}
export interface DemoSegment { id: string; sourceRound: number | null; startTick: number; activeStartTick: number; endTick: number; winner: number | null; reason: string | number | null }
export interface Progress { phase: string; completed: number; total: number }
export interface Query {
  /** May be omitted only for a single-part source. All ticks are part-local. */
  partId?: string;
  signal?: AbortSignal;
  onProgress?: (progress: Progress) => void;
}
export interface EventQuery extends Query { types?: string[]; startTick?: number; endTick?: number; batchSize?: number }
export interface FrameQuery extends Query {
  profile?: FrameProfile;
  ticks?: Iterable<number>;
  startTick?: number; endTick?: number; tickStep?: number;
  /** Source identities: Steam IDs or parser-provided stable bot IDs. */
  players?: string[] | null;
  /** Maximum requested ticks per batch, not maximum number of player rows. */
  batchSize?: number;
}
export interface PreparationQuery extends Query {
  ticks?: Iterable<number>;
  startTick?: number; endTick?: number; tickStep?: number;
  profiles?: FrameProfile[];
  throws?: Array<{ tick: number; steamid: string; name: string; startTick: number }>;
}
export interface ParserSession {
  readonly info: ParserInfo;
  readonly parts: readonly ParserPart[];
  readonly capabilities: ParserCapabilities;
  getMetadata(query?: Query): Promise<ParserMetadata>;
  listSegments(query?: Query & { kind?: 'match' | 'recording' }): Promise<DemoSegment[]>;
  readEvents(query?: EventQuery): AsyncIterable<EventObservation[]>;
  readFrames(query: FrameQuery): AsyncIterable<PlayerSample[]>;
  readUtilities(query?: Query): AsyncIterable<UtilityObservation>;
  readProjectiles(query?: Query): AsyncIterable<Extract<UtilityObservation, { kind: 'projectile' }>>;
  readEffects(query?: Query): AsyncIterable<Extract<UtilityObservation, { kind: 'smoke' | 'fire' }>>;
  readVoice(query?: Query & { batchSize?: number; startTick?: number; endTick?: number }): AsyncIterable<VoiceBatch>;
  prepareFrames?(query: PreparationQuery): Promise<{ preparationTicks: number[] }>;
  releasePreparedFrames?(): Promise<void>;
  diagnostics(): { wasmPages?: number | null };
  dispose(): Promise<void>;
}
export interface ParserEngine {
  readonly info: ParserInfo;
  /** Input is a host-owned transport descriptor; core does not open paths or files. */
  open(source: unknown, options?: { signal?: AbortSignal }): Promise<ParserSession>;
}
export class ParserError extends Error { code: string; details: Record<string, unknown>; constructor(code: string, message: string, details?: Record<string, unknown>) }
export function requireParser(condition: unknown, code: string, message: string): asserts condition;
export function frameTicks(query: FrameQuery): number[];
export type SessionOperations = Pick<ParserSession, 'getMetadata' | 'listSegments' | 'readEvents' | 'readFrames' | 'readUtilities' | 'readVoice' | 'prepareFrames' | 'releasePreparedFrames'>;
export function createParserSession(definition: { info: ParserInfo; parts: ParserPart[]; capabilities: ParserCapabilities; operations: Partial<SessionOperations>; dispose?: () => Promise<void>; diagnostics?: ParserSession['diagnostics'] }, options?: { signal?: AbortSignal }): ParserSession;
