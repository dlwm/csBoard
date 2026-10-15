# @csboard/viewer

Experimental, private workspace package. API **0.2**; not published to npm. See the [public API contract](API.md) and [minimal example](examples/minimal/README.md).

The package contains actual Three.js rendering primitives and a renderer-neutral operation controller. It does not include CSBoard panels, parser engines, storage, collaboration transport or AI services. See [integration and limitations](https://github.com/dlwm/csBoard/blob/main/docs/viewer-library.md) and [compatibility scope](https://github.com/dlwm/csBoard/blob/main/docs/viewer-compatibility.md).

```js
import { createViewer, sourceToScene } from '@csboard/viewer';

const viewer = createViewer({ container, navData, mapName: 'my-map' });
const origin = viewer.getState().coordinates.origin;
await viewer.execute({
  type: 'board.apply',
  snapshot: { points: [{
    id: 'player-1', name: 'Player 1', team: 'CT',
    position: sourceToScene([sourceX, sourceY, sourceZ], origin),
  }] },
});
const unsubscribe = viewer.on('selection.changed', event => {
  console.log(event.payload.id);
});
unsubscribe();
viewer.dispose();
```

Host policy runs before commands. Provide `expectedRevision` to reject stale operations. Callers inspect `result.status`; failed operations return structured errors rather than throwing. Queries after disposal throw `ViewerError`.

`make viewer-example` builds a plain JavaScript example with two independent instances. Serve `build/viewer-example/` over HTTP. The example injects Dust2 and Nuke NAV data; the library itself has no map catalogue. Source positions are in inches, scene positions in metres with Y up. `rotationY` is in radians.

Current standalone capabilities: NAV, player snapshots/interpolation, selection, perspective/orthographic cameras, segment playback, recorded smoke/fire effects, progressive utility trajectories, operations, state and events. Undo and full replay streaming are not yet exposed. First-person equipment/HUD and optional injected voice playback are available; their remaining limits are documented in the integration guide. The existing application uses the same controller and rendering primitives while retaining its advanced scene orchestration during migration.

Three.js is a peer dependency. GPL-3.0-only, same as the containing project; extracted code retains its existing licensing.

The `./data` entry exposes the renderer-neutral replay source contract: catalogue queries, segment leases, capability checks, cancellable batched track reads and disposal. The example can also select a Dust2 replay-profile package to play a real segment with pause, seek, speed and recorded utility effects. The host owns the source; attach it with `viewer.setDataSource(source)` and execute `replay.open`. Detach before editing. Three.js and three-mesh-bvh are peer dependencies.

Optional map models use an injected `resourceLoader`. Default construction performs no model fetch. `model.visibility` starts/cancels lazy loading and `model.unload` releases the lease; progress and failures arrive as `resource.state`. The `./resources` entry provides a renderer-neutral lease controller and a cancellable self-contained GLB driver. Host applications choose URLs, permissions, units and map matching. See the integration guide for budgets and non-preemptible GLTF parsing.

Map display uses the same simple material and bounded batching pipeline as the application. `model.style` controls opacity/focus; catalogue/tree queries and `model.objectsVisibility` control original GLB node IDs with signature validation. Inject `floorRanges` or `floorBoundary` for `map.floor`; floor metadata stays host-owned. The example includes model controls, a lazy expandable object tree, and Nuke floor selection.

`camera.pov` follows a current replay player; `camera.free` restores the saved free camera. `camera.monitor` accepts up to 16 unique current player IDs, or an empty list to close. Both require 3D. The shared monitor renderer uses bounded cached render targets and budgeted refreshes. Hosts may inject `monitorLayout` with Canvas CSS pixel rectangles; missing angles are reported rather than guessed. See the integration guide for state, events and remaining equipment/HUD migration.

Neutral player presentation is available through `describePlayer` and `getState().hud`: health/equipment unknowns remain null, deaths hide display equipment, and recent kills seek with playback. Optional `weaponIcons` injects asset descriptors for shared extruded SVG firearms in pawn and POV views. Asset readiness/failure events and equipment statistics are exposed; other equipment and full combat animations remain host-side. Icon name mapping and seat colors are shared with the application.

`createPlayerTimeline` builds renderer-neutral per-player time indexes for reloads, balance changes, purchases and recent events. Shared flash/damage/weapon-motion equations feed application and standalone views; HUD players expose `animation`. Reload estimates carry provenance. `flashMode` defaults to sampled values; choose `source-duration` only for constant Source-style duration fields. Indexed inputs must remain immutable; full segment streaming/index scheduling remains pending.


`createBombTimeline` provides seekable C4 state/countdown/defuse queries without Three.js. HUD exposes `bomb`; the application and standalone viewer use one C4 scene controller. Missing positions stay null, and unknown kit ownership marks the duration estimate. The host retains legacy sampled-defuse fallback. `createDirectorTimeline` provides binary time queries; `directorCameraPose` consumes scene-local positions and resolves camera targets. Application director modes use these shared primitives; standalone and application director commands now use shared lifecycle controllers.


`camera.director` selects `follow`, `fixed` or `chase` on a loaded 3D replay. `camera.director` events and `camera.director` state report following/unavailable and the reason. `camera.free` restores the saved camera; POV, focus/reset, 2D and source changes release director ownership. Monitors can coexist. Seek snaps, while continuous movement blends by elapsed time. Inject `readDirectorEvent` to adapt producer-specific events into scene-local positions and stable player IDs. The CSBoard example supplies an adapter; the application uses the same lifecycle controller.


CSBoard now uses the same director and POV controllers. Replay director UI executes public camera commands; app state exposes the same director/follow availability. Legacy source fields and userid matching remain host adapters, while utility preview/projectile camera ownership remains app-specific. Switching away from replay explicitly clears its POV input.


`./overlays` exposes renderer-neutral `combatOverlayState` and DOM-only `createCombatOverlay`. The SDK uses them in the primary view; React uses a thin mounting wrapper. `replay.overlays` controls enabled/hurt/flash/reducedEffects/maxFlashOpacity, while HUD exposes overlay options and calculated intensity. `combatOverlayTheme` customizes gradients/shadows. Unknown source values remain null; unavailable/dead/free/2D views clear both layers. Standalone hosts default to the system's initial reduced-motion preference; React listens for changes. Hosts may also render their own themed overlay against a positioned container.


`./audio` exposes `createVoiceScheduler`, `createVoiceTimeline` and a context-injected Web Audio driver without importing Three.js. Decoding remains host-owned. Scheduling uses one audio-clock anchor, bounded PCM, side filters, seek/drift reset, optional playback speed and independent pumping. Speaking indicators represent recorded activity even when muted. The application uses these primitives; standalone voice commands and decoder injection are also available. Never create/resume an AudioContext implicitly on behalf of the user.


Standalone voice accepts paired `voiceDecoder` and `voiceDriver` ports. When present, replay selection also reads `voiceFrames`; playback starts muted and decoding waits for explicit unmute. `voice.configure` controls enabled/muted/volume/side; `getState().voice` and `voice.state` expose capability, decode status, counts, speaking IDs and device readiness. The SDK never creates/resumes a context or assumes unknown means empty. Mute/disable/zero-volume cancels decoding and releases PCM; selection/source/disposal reject stale decoder results. Inject a separate driver per viewer; the host owns the driver and audio context. The example supplies an Opus Worker adapter and user-initiated audio unlock. Live audio validation still needs a source with supported voice packets.


CSBoard now adopts the same voice coordinator and Worker decoder adapter. Header controls execute `voice.configure`; voice state/events match the standalone API. Host preferences remember volume and start muted each launch; context creation/resume stays in a user gesture. The React owner borrows the controller to its scene and gates playback to the active replay. Encoded field conversion, persistence, permissions and session ownership stay outside the library. Live voice quality and decoder cancellation still require a recording with supported packets.


## Contract discovery and agent tools

`viewer.getContract()` describes only registered commands, their JSON Schema parameter descriptions, query names and optional event topics. `profile` distinguishes the standalone viewer from the application host. `schemaStatus: partial | unknown` means callers must obtain host-specific field definitions. Built-in command schemas are validated before mutation; `runtimeValidation: host` marks custom profiles or overrides that need host validation. Event descriptors include payload schemas. Discovery does not grant authorization.

```js
import { createViewerToolAdapter } from '@csboard/viewer';

const tools = createViewerToolAdapter(viewer, { origin: 'my-agent' });
// Map these neutral descriptions into your model provider's tool format.
const descriptions = tools.listTools();
const state = await tools.invoke('viewer_get_workspace');
const result = await tools.invoke('viewer_execute', {
  command: { type: 'player.rename', id: state.players[0].id, name: 'Entry' },
  expectedRevision: state.revision,
}, { signal });
// Handle result.status/error; reread context on revision_conflict.
```

Tools use the same execute/policy/cancellation path as external apps. They do not supply a model, prompt, network transport or conversation loop. Compact state omits workspace unless requested. Query responses default to a 256 KiB UTF-8 JSON budget; oversized operation values are omitted without reporting an applied operation as failed. A provider adapter must preserve this distinction to avoid repeating edits.

The plain JavaScript example includes an expandable contract display and command editor using this tool adapter. It is an integration example, not a production AI chat UI. Imports from `./core` expose the controller; discovery and tool helpers are exported from the root entry.


`viewer.getWorkspace()` exposes layout version `0.1`, revision, map/coordinate context, editable players, read-only utility references and illustrative effects. `workspace.players` accepts the same player fields and replaces only that list, preserving other application content and retained players' host equipment. Replay editing remains prohibited. `viewer_get_workspace` exposes it to agents; `workspace.playersChanged` carries `{ players }` for this command. Legacy snapshots and other event payloads are still host-specific. See the integration guide before exchanging layouts between maps.


Optional utility editing uses paired `utilitySource` and `createUtilityRenderer` ports. Query `getUtilityCatalogue()` for reference IDs, then execute `utility.place`, `utility.move` or `utility.remove`. The source returns borrowed asset leases; synchronous renderer commits copy/own their resources. Cancellation, map mismatches and workspace changes prevent late placement. The source remains host-owned, while the viewer disposes its renderer. Results contain placement IDs; `utility.placementsChanged` describes the resulting lightweight placements. The example's flash asset is explicitly illustrative, not a recorded lineup. Application legacy AI tools and transactions still require migration.

## Open standard Demo data

See the [minimal consumer](examples/minimal/README.md) for a complete vanilla JavaScript example with file selection, rounds, play/pause, seeking and cleanup. After `make viewer-example`, serve `build/viewer-example` and open `/minimal/`.

The `./format` entry opens **`cs2-demo-format/replay/0.1`** ZIP packages directly. It reads standard rows; it does not translate them into CSBoard's private cache format. Parser adapters are only needed when producing standard data from a parser's own output.

```js
import { createViewer } from '@csboard/viewer';
import { openReplayPackageSource } from '@csboard/viewer/format';

const source = await openReplayPackageSource(file, { signal }); // File, Blob or bytes
const viewer = createViewer({ container, navData, mapName: source.getMetadata().mapName });
viewer.setDataSource(source);
const segment = source.listSegments()[0];
if (segment) {
  const result = await viewer.execute({ type: 'replay.open', segmentId: segment.id });
  if (result.status !== 'succeeded') console.error(result.error);
}
// When finished: detach/dispose the viewer before releasing its borrowed source.
viewer.dispose();
source.dispose();
```

The reader works independently of React, CSBoard storage and parser engines. Its dependencies are JSZip and precompiled Ajv validators; there is no runtime schema compilation. ZIP paths, schemas and size budgets are checked. Opening reads metadata and players; segment JSON and events are decompressed on demand, with cancellation. This is segment-level loading, not streaming a huge JSON file row by row. The format entry does not import Three.js.

`cs2-demo-format/3.0` statistics packages are a different profile and are not accepted as complete playback packages. Applications may support them through their own migration adapter. NAV and optional map models remain host-provided; a replay package does not contain these assets. Missing optional tracks are reported through capabilities rather than invented data.

### Camera input

The viewer defaults to the `orbit` preset: left-button rotate, Shift + left-button or right-button pan, vertical wheel/trackpad scroll to zoom, and touch gestures. It does not enable WASD, pointer wrapping or hardware guessing. `input: 'csboard'` explicitly selects the original middle-button / WASD / wheel zoom behavior; CSBoard itself uses that preset. Keyboard bindings are scoped to the focused canvas unless the host chooses window scope. `input: false` or `input: {}` disables user camera navigation without blocking the host page's scrolling; API camera commands remain available.

| Option | Default / meaning |
| --- | --- |
| `wheelMode` | `zoom`: scroll only zooms; `trackpad`: two-finger scroll rotates in 3D, Shift pans, Ctrl pinches, 2D scroll pans; `auto`: CSBoard's heuristic device detection, which is opt-in and can misclassify smooth wheels |
| `wheelSpeed` | Positive multiplier, default 1, for wheel/trackpad gesture deltas |
| `wheelInvert` | Reverse wheel gesture direction, default false; respects the deltas already supplied by the OS |
| `rotateSpeed`, `panSpeed` | Positive overrides for drag and trackpad rotation/pan sensitivity; omitted values retain the supplied OrbitControls settings |
| `zoom` | Whether zoom is enabled, including touch pinch; false leaves wheel scrolling to the host |
| `touch` | Whether touchscreen camera gestures are enabled; false allows native touch scrolling |
| `wrap` | Pointer Lock for continuous mouse dragging; false unless explicitly enabled or using `csboard` |

Custom objects do not inherit action bindings. To modify a full preset, spread `CAMERA_INPUT_PRESETS.orbit` or `.csboard` into your configuration. `getState().input` exposes the standalone viewer's resolved input settings for host help/settings UIs. Wheel pixel, line and page deltas are normalized; no operating-system name determines direction. API 0.1 callers wanting the previous default should pass `input: 'csboard'` explicitly; see [migration](API.md#from-01-to-02).

Custom configurations enable **only** the supplied actions. Use `KeyboardEvent.code` so bindings do not depend on the keyboard language. Mouse buttons are 0 (left), 1 (middle), 2 (right). A mouse binding's `keys` are alternative held keys, allowing either Shift key or a custom grab key.

```js
const viewer = createViewer({
  container, navData,
  input: {
    rotate: { button: 1 },
    pan: { button: 1, keys: ['Space'] }, // Hold Space to grab/pan.
    forward: 'ArrowUp', backward: 'ArrowDown',
    left: 'ArrowLeft', right: 'ArrowRight',
    up: 'PageUp', down: 'PageDown',
    zoom: true, touch: true, wrap: true,
    speed: 18, fast: ['ShiftLeft', 'ShiftRight'], fastSpeed: 51,
  },
});
```

`wrap` requests Pointer Lock during a mouse drag so movement can continue at the screen edge; refusal falls back to captured dragging. Navigation releases held keys on focus loss, window blur and page hiding. Disposal removes listeners and restores the original controls. Advanced hosts may import `createCameraInputController` for an existing camera/OrbitControls pair, call `attach()`, call `update(timestamp)` in their render loop and call `dispose()` on teardown. `keyboardScope: 'window'` is available for a dedicated application viewport; the default is `'viewport'`. Business editing shortcuts remain the host's responsibility.

### Experimental smoke voxel estimates

Use `@csboard/viewer/smoke` for deterministic, bounded voxel calculation without Three.js or a browser. `@csboard/viewer/smoke/three` supplies an optional static collision snapshot and the existing smoke density renderer. Both are available to external consumers; no CSBoard application, native parser or server is required.

See [smoke prediction](SMOKE.md) for inputs, ownership, limitations and real recorded sample comparisons. An estimate is **not** an exact reproduction of CS2 smoke physics.


### Host scene extensions

Use `viewer.mountSceneExtension(id, setup)` for host markers, prediction candidates,
measurement lines or picking tools. There is no need to provide a fake utility
catalogue. UI controls remain host DOM, outside the canvas.

```js
import * as THREE from 'three';
import { sourceToScene } from '@csboard/viewer';
const unmount = viewer.mountSceneExtension('target-marker', context => {
  const geometry = new THREE.SphereGeometry(.2);
  const material = new THREE.MeshBasicMaterial({ color: '#ffbc60' });
  const marker = new THREE.Mesh(geometry, material);
  marker.position.fromArray(sourceToScene([100, 200, 50], context.origin));
  context.addObject(marker);
  // For map picking: context.pickSurface(pointerEvent).
  // DOM listeners can use { signal: context.signal } for automatic removal.
  return { dispose() { geometry.dispose(); material.dispose(); } };
});
unmount(); // Idempotent; viewer.dispose() also unmounts all extensions.
```

`setup` is synchronous. It receives an owned scene-local group, read-only camera
reference for projection/raycasting, canvas, Source-coordinate origin, an abort
signal, event subscription and command execution. `on()` subscriptions are removed
on unmount. Optional `update(timestamp)` runs once per viewer frame, before all
monitor views, and pauses with the viewer. An update error unmounts the extension
and is reported through `onObserverError`; other extensions continue rendering.
Use commands for camera changes. Extensions do not access private scene children.
The host disposes its own GPU resources; shared assets are not implicitly freed.
A failed setup must release resources it allocated before throwing. Arbitrary host
geometry does not automatically become player navigation or smoke collision data.

The `csboard` input preset uses wheel zoom, middle-button rotation, Shift + middle
or right-button pan and WASD. Enable device guessing explicitly with
`{ ...CAMERA_INPUT_PRESETS.csboard, wheelMode: 'auto' }`, or choose `'trackpad'` for
known touchpad input. Every binding remains configurable/disableable.

Known exported Dust2 dust/steam/light-shaft cards are hidden by default: without
Source shaders they render as solid wedges. They remain in the model catalogue
and can be re-enabled using `model.objectsVisibility`. Other geometry is retained.

### Host geometry and picking: avoid depth and coordinate surprises

For a whole map, use `resourceLoader` with the `world-model` key and
`model.visibility`. This runs the shared display pipeline (display material,
object visibility, batching and floor rules). Model vertices must already be in
**scene-axis world metres**, before subtracting NAV origin; do not subtract the
origin yourself. For a mesh already in **scene-local metres**, use an extension.

```js
const unmount = viewer.mountSceneExtension('my-objects', context => {
  context.addObject(building); // Normal world depth, including NAV occlusion.
  context.addObject(targetMarker, { occlusion: 'overlay' }); // Intentionally see through walls.
  context.addObject(groundDecal, { surfaceBias: 1 }); // Small raster bias for coplanar surfaces.
  context.canvas.addEventListener('pointerup', event => {
    const hit = context.pickSurface(event);
    if (hit) console.log(hit.surface, hit.sourcePosition);
  }, { signal: context.signal });
  return { dispose() { /* Release host-owned geometries/materials/textures. */ } };
});
```

`addObject` accepts an unattached Object3D and returns an idempotent detach function.
It manages the descendants present at attachment time. Attach additional objects
separately; do not replace a managed node's material until after detaching it.
The default `world` mode enables depth testing. Opaque/stochastic surfaces write
depth; blended transparent surfaces do not. `overlay` disables both and renders
last. Materials are cloned and restored on detach; host geometry/textures are
never disposed by the viewer. `surfaceBias` is a signed raster-only bias within
−16..16 (positive brings coplanar surfaces forward), not a coordinate/height fix.
`context.group.add()` remains an unmanaged escape hatch for custom rendering.

`viewer.pickSurface({clientX, clientY})` and `viewer.projectSource(SourceXYZ)` are
also available outside extensions. Coordinates are CSS viewport pixels, directly
compatible with pointer events and DOM labels; do not multiply by devicePixelRatio.
Queries target the primary view, not monitor thumbnails. Picking reuses existing
model/NAV collision geometry and the active floor. When a visible model misses,
it returns `null`; it does not silently select NAV behind walls. With the model
hidden or in 2D, it uses NAV. Arbitrary extension meshes are not collision surfaces.
The hit includes `sourcePosition` in inches, `scenePosition`/`sceneNormal` in the
scene coordinate system, `distanceMetres`, and `surface: 'model' | 'nav'`.

If geometry appears in front of everything, check `depthTest: false`, a large
`renderOrder`, or an explicitly requested `overlay`. If nearby surfaces flicker,
check coincident geometry before applying a small `surfaceBias`. If geometry
appears displaced or tilted, check units, axis conversion and double subtraction
of NAV origin; changing depth settings will not repair wrong coordinates.

Vertical camera orbit now defaults to the same above-ground limit as CSBoard
(`maxPolarAngle = Math.PI * .49`). Hosts can set `minPolarAngle`/`maxPolarAngle` in
radians, with `0 <= min < max <= PI`; `maxPolarAngle: Math.PI` explicitly permits
underside views. These limits do not move the orbit target or enable mouse-follow
rotation pivots. Use camera focus commands to change the target intentionally.

If a consumer pins a Git revision or uses an archived SDK, local source changes
will not reach that consumer. Update its SDK revision and rebuild its application;
changing only a local `file:` dependency does not override a bundler alias.
