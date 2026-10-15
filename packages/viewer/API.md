# Viewer API 0.2

This is an experimental contract, not a stable SDK release. The application version does not determine API compatibility. Use `viewer.apiVersion`, `getCapabilities()` and `getContract()` to discover the installed implementation. A breaking change to this common contract requires a new API version and a migration note; optional host extensions remain discoverable separately.

## Imports and coordinates

Use the exported package paths: `@csboard/viewer`, `/core`, `/data`, `/format`, `/resources`, `/playback`, `/audio`, `/overlays` and `/three`. Browser ESM and bundlers are supported; a WebGL renderer needs a DOM container. The controller and data contracts can run without WebGL. There is no CommonJS `require` entry or React requirement.

Source XYZ uses inches. Scene XYZ uses metres with Y up and a NAV-derived origin. Convert with `sourceToScene` and `sceneToSource` using `getState().coordinates.origin`; do not pass Source coordinates to scene commands. Rotation is in radians. A supplied GLB uses metres, Y up and uncentred map coordinates; the loader applies the NAV origin.

## Commands and results

```js
const workspace = viewer.getWorkspace();
const result = await viewer.execute({
  type: 'workspace.players',
  players: workspace.players,
}, {
  origin: 'my-editor',
  operationId: 'edit-42',
  expectedRevision: workspace.revision,
  signal: abortController.signal,
});
if (result.status !== 'succeeded') {
  console.log(result.status, result.error.code, result.error.message);
}
```

`execute` accepts synchronous and asynchronous commands; always `await` it. Its result contains `status`, `operationId` and `revision`, plus a successful `value` or `{code,message,details}` error. Status is `succeeded`, `failed` or `cancelled`. A failed command is not a guarantee that the host rolled back every side effect; inspect the current revision/state before deciding whether to retry.

| Result code | Caller action |
| --- | --- |
| `revision_conflict` | Read the new workspace and ask/reconcile before editing again |
| `operation_busy` | Wait for the outstanding operation; do not loop immediately |
| `permission_denied` | Respect the host decision |
| `unknown_command` | Discover available commands; do not assume every profile supports them |
| `invalid_command`, `invalid_argument`, `invalid_data`, `invalid_context` | Correct the input; schema failures include JSON Pointer paths, allowed/required fields and the parameter schema |
| `disposed` | Create a new instance; this one cannot be reused |
| `cancelled` | Treat as an intentional stop; an aborted signal may supply another error code |
| Other codes | Preserve diagnostics; resource, format and host errors are extensible |

The discovered `operation.errorCodes` lists core categories and recovery guidance; driver and host codes are extensible. It is not an automatic retry policy.

Queries and constructors may throw `ViewerError` or driver errors. They do not return an operation result. Standard package reading uses its own format errors. Read `code` rather than matching translated message text.

Invalid contexts return structured `invalid_context` errors; `origin` and `operationId` must be nonempty strings and `expectedRevision` a nonnegative safe integer. `origin` records provenance, not authentication. Permissions and approval belong to the host `policy`. An `AbortSignal` cancels supported asynchronous work; GLTF parsing and synchronous scene commits are not preemptible. One pending approval/command occupies the operation lane. State changes while approval is pending can invalidate that approval.

## Shared workspace and host profiles

`getWorkspace()` returns the common layout: `version`, `revision`, `mapName`, `coordinates`, `players`, `utilities` and `effects`. It is not an archive export. `workspace.players` replaces the player list, including removal of omitted IDs; it does not patch individual players. Utilities are lightweight placements, not recorded trajectories/voxels. Utility editing requires an injected source and renderer.

Inspect `getContract().profile` and each command's `schemaStatus`. Built-in application and standalone commands validate their published parameter schemas before approval or mutation (`runtimeValidation: schema`). `partial` means fields inside a host payload remain host-specific; it does not disable validation of the surrounding arguments. Custom profiles and schema overrides declare `runtimeValidation: host` and require host validation. Unknown extensions require host documentation. Legacy `board.apply` and `getState().workspace` differ between the standalone and application profiles. Use `getWorkspace()` for a common layout exchange.

## Events

`viewer.on(topic, callback)` returns an unsubscribe function. `'*'` receives all events. Each callback gets `{type,revision,operationId,origin,payload}`; values are copied and observer errors do not abort commands.

`workspace.playersChanged` carries `{players}` after the public layout command. `utility.placementsChanged` carries `{action,id,placements}` after public utility edits. They do not cover all legacy UI, undo or room restoration actions. Every built-in event descriptor supplies `payloadSchema` and `schemaStatus`; standalone subscriptions have typed payloads. `workspace.changed` remains a host-specific summary, and application camera snapshots permit host fields. Invalid built-in payloads reach `onObserverError` as `invalid_event` and are not delivered to subscribers. The discovered event list is optional per host. `playback.time` is sampled, not a lossless tick stream. Edits during change-event publication are rejected as `operation_busy` to prevent interleaved revisions. Schedule a follow-up after the current execution finishes rather than recursively editing from a change callback. Treat event callbacks as observations; inspect origin/revision before sending another edit to avoid feedback loops.

## Inputs, resources and disposal

- `input` omitted: the Orbit preset. `'csboard'`: the middle-button/WASD application controls with wheel zoom. `'orbit'`: Orbit preset. `false`: no camera input. A custom object enables only the supplied actions; omitted actions do not inherit defaults. Wheel mode defaults to `zoom`, not device guessing; sensitivity and direction are configurable. Disabled camera input leaves host scrolling available.
- Keyboard bindings use `KeyboardEvent.code`. The default keyboard scope requires canvas focus and ignores editable fields. Mouse buttons use 0/1/2; grab/pan and rotation can have separate key modifiers. Touch, zoom and pointer wrapping are optional.
- Models are lazy: constructing a viewer does not request the world model. `model.visibility` enables loading; `model.unload` releases the lease. Observe `resource.state` for progress and failures. Host loaders own URL resolution and access decisions.
- A data source is borrowed. Detach or dispose the viewer before disposing its source. Do not mutate indexed track rows during playback. Unknown/missing values remain unknown rather than zero or empty fabricated tracks.
- The viewer owns its canvas, event listeners, render resources and resource leases. `dispose()` is idempotent. It does not destroy a borrowed data source, host audio context or host storage. Unsubscribe host listeners and revoke host Object URLs when no longer used.

## Executable examples

The shipped `examples/minimal` demonstrates a standard replay package, custom/disabled inputs, local GLB, playback and cleanup. Its dependencies come only from public package imports. `make viewer-check` installs a real tarball outside the repository, builds and runs that example, and checks malformed-file recovery, playback, closing and reopening. The same run exercises commands, callbacks, resources and disposal directly.

See the [integration guide](https://github.com/dlwm/csBoard/blob/main/docs/viewer-library.md) for optional drivers and the [compatibility scope](https://github.com/dlwm/csBoard/blob/main/docs/viewer-compatibility.md) for application differences and unverified features.

## From 0.1 to 0.2

The default input preset changes from CSBoard to Orbit for embedding applications. Pass `input: 'csboard'` to retain the middle-button/WASD/pointer-wrap behavior, or spread a preset and override its fields. CSBoard's application shell selects its own preset explicitly. The standalone state adds `input` for inspecting resolved controls. The common workspace layout version and replay data format remain 0.1.

`zoom: false` now disables touch zoom as well as wheel zoom. Disabling all input no longer consumes wheel events or prevents native touch scrolling. Explicit custom wheel behavior uses `wheelMode`, `wheelSpeed` and `wheelInvert`; `auto` remains a heuristic, not a reliable hardware identifier.

## Maintaining the contract

Edit `src/core/contract.js`, `eventContract.js` and the matching TypeScript declarations together. Run `make viewer-contracts` to regenerate the static validators; `make lint` rejects stale generated files. Runtime validation never uses `eval` or `Function`. Schemas validate structure; command implementations still enforce identity, readiness, ownership and permissions. Hosts validate their extension schemas and supply their own diagnostics.


### Scene extensions

`viewer.mountSceneExtension(id, setup)` attaches host-owned Three.js content under
an isolated scene-local group and returns an idempotent unmount function. See the
README example for coordinates, picking, event subscriptions and resource cleanup.
This is an embedding API, not a serialized replay or AI command: executable host
callbacks must not be embedded in data files. `invalid_argument` rejects invalid
IDs/setup/lifecycle shapes; `extension_exists` rejects duplicate mounted IDs;
`disposed` rejects mounting or executing through a released context. Setup errors
are rethrown after detachment; frame/disposal errors go to `onObserverError`.

The `csboard` preset now defaults to `wheelMode: 'zoom'`. Hosts requiring the former
heuristic must pass `wheelMode: 'auto'` explicitly. Saved application touchpad
preferences remain controlled by the application shell.


`viewer.pickSurface(pointer)` and `viewer.projectSource(position)` expose primary-view
surface selection/projection without private scene traversal. Invalid coordinates
throw `invalid_argument`; calls after disposal throw `disposed`. The same methods
are available in scene extension contexts. `context.addObject` manages depth and
material cloning for host geometry; see the README troubleshooting section.
Camera input accepts `minPolarAngle` and `maxPolarAngle` in radians. Defaults match
the application's above-ground orbit range; limits are visible in `state.input`.
