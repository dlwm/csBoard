import type { ResourceLoader, ResourceState } from './resources/index.js';
import type { ReplayDataSource } from './data/replaySource.js';
import type { PlaybackState } from './playback/index.js';
export type Vec3 = [number, number, number];
export interface Player { id: string; kind?: 'player'; name?: string; team: 'T' | 'CT'; position: Vec3; rotationY?: number; crouched?: boolean; alive?: boolean | null; baseColor?: string }
export interface WorkspacePlayer { id: string; name?: string; team: 'T' | 'CT'; position: Vec3; rotationY?: number; crouched?: boolean; baseColor?: string }
export interface WorkspaceLayout { version: '0.1'; revision?: number; mapName: string | null; coordinates: { space: 'scene-local'; unit: 'metres'; rotation: 'radians'; origin: Vec3 | null }; players: WorkspacePlayer[]; utilities: { id: string; referenceId: string | null; kind: string | null; position: Vec3; effectPosition: Vec3 | null }[]; effects: { id: string; kind: string; position: Vec3; range: number }[] }
export interface UtilityPlacement { id: string; referenceId: string | null; kind: string | null; position: Vec3; effectPosition: Vec3 | null }
export interface UtilityCatalogueQuery { query?: string; offset?: number; limit?: number }
export interface UtilityCatalogue { total: number; offset?: number; items: { referenceId: string; mapName: string; name?: string; kind?: string }[] }
export interface UtilityAsset { referenceId: string; mapName: string; position: Vec3; payload?: unknown }
export interface UtilitySource { list(query: UtilityCatalogueQuery & { mapName: string | null }, context: { signal: AbortSignal }): UtilityCatalogue | Promise<UtilityCatalogue>; load(referenceId: string, context: { signal: AbortSignal; mapName: string | null }): { asset: UtilityAsset; release(): void } | Promise<{ asset: UtilityAsset; release(): void }> }
export interface UtilityRenderer { place(input: { id: string; asset: UtilityAsset; position: Vec3 }): void | { id: string }; move(input: { id: string; position: Vec3 }): void | { id: string }; remove(id: string): void | { id: string }; getPlacements(): UtilityPlacement[]; clear(): void; dispose(): void }
export type ViewerCommand =
  | { type: 'utility.place'; referenceId: string; id?: string; position?: Vec3 }
  | { type: 'utility.move'; id: string; position: Vec3 }
  | { type: 'utility.remove'; id: string }
  | { type: 'workspace.players'; players: WorkspacePlayer[] }
  | { type: 'model.visibility'; visible: boolean }
  | { type: 'model.unload' }
  | { type: 'model.style'; opacity?: number; focus?: 'full' | 'pointer' | 'camera'; range?: number }
  | { type: 'model.objectsVisibility'; ids: number[]; visible: boolean; signature: string }
  | { type: 'map.floor'; id: string }
  | { type: 'replay.open'; segmentId: string }
  | ({ type: 'voice.configure' } & Pick<import('./playback/index.js').VoicePlaybackOptions, 'enabled' | 'muted' | 'volume' | 'side'>)
  | { type: 'replay.play' | 'replay.pause' }
  | { type: 'replay.seek'; tick: number }
  | { type: 'replay.speed'; speed: number }
  | ({ type: 'replay.overlays' } & import('./overlays/index.js').CombatOverlayOptions)
  | { type: 'replay.display'; effects?: boolean; trajectories?: boolean }
  | { type: 'board.apply'; snapshot: { points: Player[] } }
  | { type: 'board.clear' | 'camera.reset' }
  | { type: 'player.rename'; id: string; name: string }
  | { type: 'player.team'; id: string; team: 'T' | 'CT' }
  | { type: 'player.move'; id: string; position: Vec3 }
  | { type: 'camera.mode'; mode: '2d' | '3d' }
  | { type: 'camera.focusPlayer'; id: string }
  | { type: 'camera.pov'; id: string }
  | { type: 'camera.director'; mode: 'follow' | 'fixed' | 'chase' }
  | { type: 'camera.free' }
  | { type: 'camera.monitor'; playerIds: string[] }
  | { type: 'camera.focusPoint'; position: Vec3 };
export interface OperationContext { origin?: string; operationId?: string; expectedRevision?: number; signal?: AbortSignal }
export interface OperationResult { status: 'succeeded' | 'failed' | 'cancelled'; operationId: string; revision: number; value?: unknown; error?: { code: string; message: string; details: unknown } }
export interface OperationRecord { status: OperationResult['status']; operationId: string; revision: number; type?: string; origin: string; error?: NonNullable<OperationResult['error']> }
export interface ViewerEvent<Payload = unknown> { type: string; revision: number; operationId: string | null; origin: string; payload: Payload }
export interface ViewerEventPayloads {
  'operation.started': { type: string };
  'operation.succeeded': { status: 'succeeded'; operationId: string; revision: number; type: string; origin: string };
  'operation.failed': { status: 'failed'; operationId: string; revision: number; type?: string; origin: string; error: NonNullable<OperationResult['error']> };
  'operation.cancelled': { status: 'cancelled'; operationId: string; revision: number; type?: string; origin: string; error: NonNullable<OperationResult['error']> };
  'lifecycle.ready': { ready: boolean }; 'lifecycle.disposed': Record<string, never>;
  'workspace.playersChanged': { players: WorkspacePlayer[] };
  'utility.placementsChanged': { action: 'placed' | 'moved' | 'removed'; id: string; placements: UtilityPlacement[] };
  'selection.changed': { id: string | null }; 'camera.changed': ViewerState['camera'];
  'camera.follow': ViewerState['camera']['follow']; 'camera.director': ViewerState['camera']['director'];
  'equipment.ready': { playerId: string; weapon: string; key: string }; 'equipment.failed': { playerId: string; weapon: string; message: string };
  'map.floor': { id: string }; 'model.visibility': { visible: boolean }; 'model.style': ViewerState['modelStyle'];
  'model.objectsChanged': { signature: string; ids: number[]; visible: boolean }; 'resource.state': ResourceState;
  'playback.source': PlaybackState; 'playback.loading': PlaybackState; 'playback.ready': PlaybackState;
  'playback.failed': PlaybackState; 'playback.cancelled': PlaybackState; 'playback.play': PlaybackState;
  'playback.pause': PlaybackState; 'playback.seek': PlaybackState; 'playback.speed': PlaybackState;
  'playback.time': PlaybackState; 'playback.ended': PlaybackState;
  'playback.display': ViewerState['effectDisplay']; 'playback.overlays': import('./overlays/index.js').CombatOverlayOptions;
  'voice.state': import('./playback/index.js').VoiceState; 'voice.options': import('./playback/index.js').VoiceState;
}
export interface ModelObject { id: number; name: string }
export interface ModelObjectBranch { label: string; key: string; ids: number[]; objects: ModelObject[]; children: ModelObjectBranch[] }
export interface MonitorLayout { mainWidth: number; tiles: { id: string; x: number; y: number; width: number; height: number }[] }
export interface PlayerStatus {
  health: number | null; alive: boolean | null; armor: number | null; helmet: boolean | null; defuseKit: boolean | null; hasBomb: boolean | null; money: number | null;
  equipmentVisible: boolean; weapon: { name: string; kind: string; ammo: number | null } | null;
  inventory: { name: string; count: number }[] | null; inventoryUnknownCount: number;
  scoped: boolean | null; flashDurationSeconds: number | null; hasPosition: boolean; hasViewAngles: boolean; cameraAvailable: boolean;
}
export interface PlayerAnimation { reload: import('./playback/index.js').ReloadState | null; delayedHealth: number | null; firing: boolean | null; hurt: boolean | null; headHurt: boolean | null; moneyDelta: number | null; flash: import('./playback/index.js').FlashPresentation }
export interface HudPlayer extends PlayerStatus { animation: PlayerAnimation; id: string; name: string; side: string }
export interface HudKill { id: string; tick: number; actorId: string | null; actorName: string | null; targetId: string | null; targetName: string | null; assistantId: string | null; assistantName: string | null; weapon: string | null }
export interface ReplayHud { overlayOptions: import('./overlays/index.js').CombatOverlayOptions; overlays: import('./overlays/index.js').CombatOverlayState; bomb: import('./playback/index.js').BombState | null; eventsStatus: 'available' | 'empty' | 'unknown' | 'unsupported'; tick: number; players: HudPlayer[]; kills: HudKill[] }
export interface ViewerState { input: CameraInputBindings & { wheelMode: 'zoom' | 'auto' | 'trackpad'; minPolarAngle: number; maxPolarAngle: number; wheelSpeed: number; wheelInvert: boolean; keyboardScope: 'viewport' | 'window'; rotateSpeed: number; panSpeed: number }; revision: number; ready: boolean; mapName: string | null; workspace: { points: Player[] }; selectedId: string | null; voice: import('./playback/index.js').VoiceState; playback: PlaybackState; hud: ReplayHud; equipmentStats: { ready: number; loading: number; failed: number; triangles: number }; resources: ResourceState[]; modelVisible: boolean; modelStyle: { opacity: number; focus: 'full' | 'pointer' | 'camera'; range: number }; monitorStats: { scenePasses: number; cachedTiles: number; updates: number; updateCostMs: number }; renderStats: { frame: number; calls: number; triangles: number }; modelStats: Record<string, number | boolean | string> | null; floor: string; floors: { id: string; range: [number, number] }[]; effectDisplay: { effects: boolean; trajectories: boolean }; effectCounts: { smoke: number; fire: number; trajectories: number; other: number }; camera: { position: Vec3; target: Vec3; mode: '2d' | '3d'; director: { mode: 'follow' | 'fixed' | 'chase' | null; status: 'idle' | 'following' | 'unavailable'; eventKey: string | null; playerId: string | null; reason: 'missing_event' | 'missing_target_or_pose' | null }; follow: { playerId: string | null; status: 'idle' | 'following' | 'unavailable' }; monitorIds: string[] }; coordinates: { space: 'scene-local'; unit: 'metres'; origin: Vec3 }; lastAction: OperationRecord | null }
export interface SurfaceHit { surface: 'model' | 'nav'; sourcePosition: Vec3; scenePosition: Vec3; sceneNormal: Vec3 | null; distanceMetres: number }
export interface SurfaceQueries {
  pickSurface(pointer: { clientX: number; clientY: number }): SurfaceHit | null;
  projectSource(position: Vec3): { clientX: number; clientY: number; visible: boolean };
}
export interface Viewer extends SurfaceQueries {
  readonly apiVersion: string;
  /** Host owns the source; detach before editing. Map must match injected NAV. */
  setDataSource(source: ReplayDataSource | null): void;
  execute(command: ViewerCommand, context?: OperationContext): OperationResult | Promise<OperationResult>;
  getState(): ViewerState;
  getContract(): ViewerContract;
  getWorkspace(): WorkspaceLayout & { revision: number };
  getUtilityCatalogue?: (query?: UtilityCatalogueQuery, context?: { signal?: AbortSignal }) => Promise<UtilityCatalogue>;
  mountSceneExtension(id: string, setup: (context: SceneExtensionContext) => SceneExtensionLifecycle | void): () => void;
  getModelObjects(query?: { query?: string; offset?: number; limit?: number }): { signature: string; total: number; offset: number; objects: (ModelObject & { visible: boolean })[] };
  getModelObjectTree(query?: string): { signature: string; tree: ModelObjectBranch };
  getCapabilities(): { commands: string[]; editing: boolean; camera: boolean; picking: boolean; director: boolean; voice: boolean; firstPerson: boolean; monitors: boolean; equipment: boolean; hud: boolean; nav: boolean; utilities: boolean; replay: boolean; model: boolean };
  on<K extends keyof ViewerEventPayloads>(type: K, listener: (event: ViewerEvent<ViewerEventPayloads[K]>) => void): () => void;
  on(type: string, listener: (event: ViewerEvent) => void): () => void;
  dispose(): void;
}
/** Three.js extension surface. Camera is read-only; use commands for navigation.
 * 中文：相机用于投影/拾取，不直接修改；导航走命令。宿主负责释放自有 GPU 资源。 */
export interface SceneExtensionContext extends SurfaceQueries {
  group: import('three').Group;
  readonly camera: import('three').Camera;
  readonly canvas: HTMLCanvasElement;
  readonly origin: readonly [number, number, number];
  readonly signal: AbortSignal;
  addObject(object: import('three').Object3D, options?: { occlusion?: 'world' | 'overlay'; surfaceBias?: number }): () => void;
  on(type: string, listener: (event: ViewerEvent) => void): () => void;
  execute(command: ViewerCommand, context?: OperationContext): OperationResult | Promise<OperationResult>;
}
export interface SceneExtensionLifecycle { update?(timestamp: number): void; dispose?(): void }
export interface NavData { areas: Record<string, { corners: { x: number; y: number; z: number }[] }> }
export function createViewer(options: { container: HTMLElement; navData: NavData; input?: CameraInputConfiguration; mapName?: string; pixelRatioLimit?: number; resourceLoader?: ResourceLoader; utilitySource?: UtilitySource; createUtilityRenderer?: (context: { scene: unknown; origin: Vec3; navData: unknown; floorState: unknown }) => UtilityRenderer; voiceDecoder?: import('./playback/index.js').VoiceDecoder; voiceDriver?: import('./playback/index.js').VoiceDriver; combatOverlayTheme?: Partial<typeof import('./overlays/index.js').COMBAT_OVERLAY_THEME>; combatOverlay?: import('./overlays/index.js').CombatOverlayOptions; readDirectorEvent?: (event: import('./data/replaySource.js').ReplayRow, context: { origin: Vec3; frames: import('./playback/index.js').ReplayFrame[]; roster: import('./data/replaySource.js').ReplayPlayer[] }) => DirectorRecord | null; flashMode?: 'sample' | 'source-duration'; weaponIcons?: (weapon: string, context: { side: string }) => { key: string; url?: string } | null; floorRanges?: Record<string, [number, number]>; floorBoundary?: number; monitorLayout?: (surface: { width: number; height: number; playerIds: string[] }) => MonitorLayout | null; dataSource?: ReplayDataSource; playbackBudget?: { maxBytes?: number; maxRows?: number }; readProducerFields?: (fields: unknown) => Record<string, unknown>; policy?: (command: ViewerCommand, context: OperationContext & { revision: number }) => boolean | void | Promise<boolean | void>; presentation?: { current(): Promise<boolean>; subscribe(listener: (visible: boolean) => void): () => void }; onObserverError?: (error: unknown) => void }): Viewer;
export function sourceToScene(position: Vec3, origin?: readonly [number, number, number]): Vec3;
export function sceneToSource(position: Vec3, origin?: readonly [number, number, number]): Vec3;
export const VIEWER_API_VERSION: string;
export class ViewerError extends Error { constructor(code: string, message: string, details?: unknown); code: string; details: unknown }
/** Renderer-neutral controller. The host declares its own commands and state. */
export function createViewerController(options: { commands: { names: readonly string[]; execute(type: string, args: Record<string, unknown>, context?: OperationContext): unknown }; readState(): Record<string, unknown>; readCapabilities?: () => Record<string, unknown>; readWorkspace?: () => WorkspaceLayout; readUtilityCatalogue?: (query?: UtilityCatalogueQuery, context?: { signal?: AbortSignal }) => Promise<UtilityCatalogue>; policy?: (command: Record<string, unknown>, context: OperationContext & { revision: number }) => boolean | void | Promise<boolean | void>; onObserverError?: (error: unknown) => void; profile?: string; queries?: string[]; contractOverrides?: Record<string, CommandDescriptor> }): {
  readonly apiVersion: string;
  execute(command: { type: string; [key: string]: unknown }, context?: OperationContext): OperationResult | Promise<OperationResult>;
  getContract(): ViewerContract;
  getWorkspace?: () => WorkspaceLayout & { revision: number };
  getUtilityCatalogue?: (query?: UtilityCatalogueQuery, context?: { signal?: AbortSignal }) => Promise<UtilityCatalogue>;
  getState(): Record<string, unknown> & { revision: number; lastAction: OperationRecord | null };
  getCapabilities(): Record<string, unknown> & { commands: string[] };
  notify(type: string, payload?: unknown, options?: { origin?: string; changed?: boolean }): void;
  on(type: string, listener: (event: ViewerEvent) => void): () => void;
  commands: { names: readonly string[]; execute(type: string, args?: Record<string, unknown>, context?: OperationContext): unknown };
  dispose(): void;
};
export { createReplayDataSource, REPLAY_SOURCE_VERSION, REPLAY_TRACKS } from './data/replaySource.js';
export type { ReplayDataSource, ReplayMetadata, ReplaySegment, SegmentLease, ReplayTrack, ReplayRow, ReplayPlayer, TrackQuery, TrackCapability } from './data/replaySource.js';
export { createReplayController, interpolateReplayFrame } from './playback/index.js';
export type { PlaybackState, ReplayFrame, ReplayPlayerState } from './playback/index.js';

export { createResourceController, createGltfResourceLoader } from './resources/index.js';
export type { ResourceLoader, ResourceLease, ResourceState, ResourceProgress } from './resources/index.js';

/** Source Z bounds in inches. Supply a host-owned boundary for multi-level maps. */
export function deriveNavFloorRanges(navData: NavData, boundary?: number | null): Record<string, [number, number]>;

export function describePlayer(player: Partial<import('./playback/index.js').ReplayPlayerState>): PlayerStatus;
export function weaponIconKey(weapon?: string, options?: { side?: string; hasTKnife?: boolean }): string;
export function grenadeIconKey(weapon?: string): string | null;

export { createPlayerTimeline, delayedPlayerHealth, flashPresentation, weaponAnimation } from './playback/index.js';
export type { PlayerTimeline, ReloadState, FlashPresentation, IndexedPlayerEvent } from './playback/index.js';
export { createBombTimeline } from './playback/index.js';
export type { BombState, BombEvent } from './playback/index.js';

export { createDirectorTimeline } from './playback/index.js';
export function directorCameraPose(event: { type: string; position?: Vec3 | null; pitch?: number; yaw?: number; fov?: number; distanceMetres?: number; inEye?: boolean }, target?: { position: Vec3 | null; pitch?: number | null; yaw?: number | null; crouchAmount?: number | null; scoped?: boolean | null } | null, secondary?: { position: Vec3 | null } | null): { position: import('three').Vector3; target: import('three').Vector3; fov: number } | null;

export interface DirectorRecord { type: 'hltv_fixed' | 'hltv_chase'; tick: number; position?: Vec3 | null; targetId?: string | null; secondaryId?: string | null; pitch?: number; yaw?: number; fov?: number; distanceMetres?: number; inEye?: boolean; inertia?: number }

export { createCombatOverlay, combatOverlayState, COMBAT_OVERLAY_THEME } from './overlays/index.js';
export type { CombatOverlayOptions, CombatOverlayState } from './overlays/index.js';
export { createVoiceTimeline, createVoiceScheduler, voiceSideMatches } from './playback/index.js';
export type { VoiceClip, VoiceDriver, VoicePlaybackOptions } from './playback/index.js';
export function createWebAudioVoiceDriver(options: { getContext: () => AudioContext | null | undefined }): import('./playback/index.js').VoiceDriver & { getState(): { activeSources: number; contextState: string }; dispose(): void };

export { createVoicePlaybackController } from './playback/index.js';
export type { VoiceDecoder, VoiceDecodeResult, VoiceState } from './playback/index.js';

export interface CommandDescriptor { name: string; description: string; effect: string; schemaStatus: 'complete' | 'partial' | 'unknown'; runtimeValidation?: 'schema' | 'host'; parameters: Record<string, any>; examples: Record<string, unknown>[] }
export interface ViewerContract { apiVersion: string; profile: string; schemaDialect: string; coordinates: Record<string, unknown>; commands: CommandDescriptor[]; queries: string[]; events: { name: string; support: 'optional'; delivery: string; schemaStatus: 'complete' | 'partial'; payloadSchema: Record<string, unknown>; description?: string }[]; eventEnvelope: Record<string, unknown>; operation: Record<string, unknown> }
export function describeViewerContract(options: { apiVersion: string; profile?: string; names: readonly string[]; queries?: string[]; overrides?: Record<string, CommandDescriptor> }): ViewerContract;
export function createViewerToolAdapter(viewer: { execute(command: any, context?: OperationContext): any; getState(): Record<string, any>; getCapabilities(): Record<string, unknown>; getContract(): ViewerContract; getWorkspace?: () => WorkspaceLayout; getUtilityCatalogue?: (query?: UtilityCatalogueQuery, context?: { signal?: AbortSignal }) => Promise<UtilityCatalogue>; getModelObjects?: (query?: any) => any; getModelObjectTree?: (query?: string) => any }, options?: { origin?: string; maxResponseBytes?: number }): { listTools(): { name: string; description: string; inputSchema: Record<string, any> }[]; invoke(name: string, args?: Record<string, unknown>, context?: OperationContext): Promise<any> };

export const WORKSPACE_LAYOUT_VERSION: '0.1';
export const WORKSPACE_PLAYER_SCHEMA: Readonly<Record<string, any>>;
export function normalizeWorkspacePlayers(players: WorkspacePlayer[]): WorkspacePlayer[];
export function createWorkspaceLayout(input: { players: WorkspacePlayer[]; utilities?: WorkspaceLayout['utilities']; effects?: WorkspaceLayout['effects']; mapName?: string; origin?: Vec3 }): WorkspaceLayout;

export function createUtilityReferenceController(options: { source: UtilitySource; renderer: Pick<UtilityRenderer, 'place' | 'move' | 'remove' | 'getPlacements'>; mapName: string | null; isEditable(): boolean; readGuard?: () => unknown; notify?: (type: string, payload: unknown, options: { changed: boolean }) => void; commit?: <T>(action: () => T) => T; onReleaseError?: (error: unknown) => void }): { list(query?: UtilityCatalogueQuery, context?: { signal?: AbortSignal }): Promise<UtilityCatalogue>; place(args: { referenceId: string; id?: string; position?: Vec3 }, context?: { signal?: AbortSignal }): Promise<{ id: string }>; move(args: { id: string; position: Vec3 }): { id: string }; remove(args: { id: string }): { id: string }; getPlacements(): UtilityPlacement[]; dispose(): void };

/** Keyboard bindings use KeyboardEvent.code. Omitted custom actions are disabled. */
export interface CameraMouseBinding { button: 0 | 1 | 2; keys?: string | string[]; }
export interface CameraInputBindings {
  rotate?: CameraMouseBinding | CameraMouseBinding[] | null;
  pan?: CameraMouseBinding | CameraMouseBinding[] | null;
  forward?: string | string[] | null; backward?: string | string[] | null;
  left?: string | string[] | null; right?: string | string[] | null;
  up?: string | string[] | null; down?: string | string[] | null;
  fast?: string | string[] | null;
  zoom?: boolean; touch?: boolean; wrap?: boolean;
  minPolarAngle?: number; maxPolarAngle?: number;
  wheelMode?: 'zoom' | 'auto' | 'trackpad'; wheelSpeed?: number; wheelInvert?: boolean;
  rotateSpeed?: number; panSpeed?: number;
  speed?: number; fastSpeed?: number; keyboardScope?: 'viewport' | 'window';
}
export type CameraInputConfiguration = 'csboard' | 'orbit' | false | CameraInputBindings;
export const CAMERA_INPUT_PRESETS: Readonly<Record<'csboard' | 'orbit', CameraInputBindings>>;
export function resolveCameraInput(value?: CameraInputConfiguration): CameraInputBindings;
/** Advanced hosts with an existing Three.js camera can reuse the same input module. */
export function createCameraInputController(options: {
  renderer: { domElement: HTMLCanvasElement }; camera: unknown; controls: unknown;
  bindings?: CameraInputConfiguration; onCameraInterrupt?: () => void;
  onManualInteraction?: () => void; canEnableControls?: () => boolean;
  trackpadDetectionRef?: { current: boolean }; wheelGestureRef?: { current: { lastTime: number; mode: string | null } };
}): { attach(mount?: HTMLElement): void; update(timestamp: number): void; beginDrag(event: PointerEvent): boolean; continueDrag(): boolean; endDrag(): boolean; readonly active: boolean; dispose(): void; };
