# @csboard/viewer

Experimental, private workspace package. API **0.1**; not published to npm.

The package contains actual Three.js rendering primitives and a renderer-neutral operation controller. It does not include CSBoard panels, parser engines, storage, collaboration transport or AI services. See [integration and limitations](../../docs/viewer-library.md) and [compatibility scope](../../docs/viewer-compatibility.md).

```js
import { createViewer, sourceToScene } from './src/index.js';

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

`viewer.getContract()` describes only registered commands, their JSON Schema parameter descriptions, query names and optional event topics. `profile` distinguishes the standalone viewer from the application host. `schemaStatus: partial | unknown` means callers must obtain host-specific field definitions; discovery does not replace runtime validation or authorization. Event payload schemas remain pending.

```js
import { createViewerToolAdapter } from './src/index.js';

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
