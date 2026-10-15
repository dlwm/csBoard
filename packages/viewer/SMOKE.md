# Smoke voxel prediction (experimental)

The library can estimate a static smoke cloud from a detonation position and static collision geometry. This API is available to any consumer of the viewer package. It does not require a Demo, the application UI or a CSBoard server.

Valve describes smoke as volumetric and environment dependent, but does not publish the algorithm or its parameters ([Counter-Strike 2](https://www.counter-strike.net/cs2)). This implementation is an approximation, **not a game-accurate solver**. Prefer recorded voxel frames whenever they exist. Do not substitute predicted data for recorded data silently.

## Public entry points

- `@csboard/viewer/smoke`: pure JavaScript kernel, async variant, coordinate conversion, comparison metrics and `SmokePredictionError`.
- `@csboard/viewer/smoke/three`: optional static geometry collision adapter, shared density renderer and disposal helper. Requires the package's Three.js and BVH peers.

```js
import { predictSmokeVoxelsAsync } from '@csboard/viewer/smoke';
import {
  createSmokeCollisionWorld, createPredictedSmokeVolume,
  disposePredictedSmokeVolume,
} from '@csboard/viewer/smoke/three';

// modelRoot is a static model already aligned to the viewer's scene coordinates.
// Offsets are XYZ metres, exactly as used by the viewer, not Source inches.
const sceneOrigin = [0, 0, 0];
const collision = createSmokeCollisionWorld({ root: modelRoot, sceneOrigin });
try {
  const prediction = await predictSmokeVoxelsAsync({
    origin: [529.726, 648.0956, 3.3875], // Source XYZ inches
    collision,
    signal: abortController.signal,
    onProgress: progress => console.log(progress.fraction),
  });
  console.log(prediction.source, prediction.diagnostics);
  const volume = createPredictedSmokeVolume(prediction, sceneOrigin);
  scene.add(volume);
  // After the preview is no longer needed:
  disposePredictedSmokeVolume(volume);
} finally {
  collision.dispose();
}
```

A custom engine can provide a synchronous `collision.isBlocked(from, to)` and optionally `isCellBlocked(center, halfSize)` in Source inches. The kernel never imports Three.js. Without a collision driver, the result is explicitly `source: 'illustrative'`; with one it is `source: 'predicted'`. An edge-only driver prevents travel through walls but cannot reject every intersected cell; provide cell tests for that stronger constraint.

## Algorithm and editable parameters

Coordinates follow recorded smoke packing: a 32³ grid, centre index 16, cell width 20 Source inches; packed axes are Z/Y/X. `smokeVoxelToSource(id, origin)` converts cell centres. Output `frame` uses `sequence`, matching the viewer replay contract, and a transferable `Uint16Array`.

The seed is one cell above the detonation origin. Six-neighbour growth considers only reachable cells within:

```
q = (dx / radiusX)² + (dy / radiusY)² + ((dz - rise) / radiusZ)² <= 1
```

A minimum priority queue fills cells with the lowest `q` first, breaking ties by packed index. A blocked edge does not block alternative paths through a doorway. A blocked seed fails explicitly; it is never moved into a neighbouring room.

Defaults: `radius: [110, 110, 80]`, `rise: 40`, `maxVoxels: 256`, `maxCollisionChecks: 100000`. All spatial parameters are Source inches. These are heuristic shape limits, not recovered Valve constants or fitted gameplay guarantees. `maxVoxels` is an upper bound, not a promise that every cloud reaches that count. `diagnostics.budgetReached` reports that the cell budget was reached (the remaining volume is not exhaustively explored). The cloud is static: no growth timeline, pressure solver, density calibration, bullet holes, HE response or prediction of grenade flight is computed here.

`predictSmokeVoxelsAsync` yields every 32 accepted cells and checks the abort signal between queries. Collision calls and initial BVH construction are synchronous; use a host-owned Worker for CPU isolation on large maps. Instantiate the collision driver inside that worker; functions are not transferable. Progress is work-budget progress, not elapsed-time accuracy. Progress callbacks execute synchronously; a callback exception propagates to the caller.

## Collision ownership and limits

The Three adapter snapshots static triangles and their transforms, using independent position/index buffers, double-sided mesh BVHs and a broad-phase index. Hiding a wall or changing its visual material does not remove collision. Decorative overlay-only meshes are excluded. Supply `filter(mesh)` for your own physics mesh selection; visible render meshes are not necessarily equivalent to game collision geometry.

`sceneOrigin` must match the coordinate offset applied to the model. No automatic axis/unit guessing is performed. Recreate the snapshot after transforms or geometry change. Skinned, instanced, morph-deformed and singular geometry require baking/filtering first. Batched display meshes are ignored; pass original static meshes. Per-cell corner rays conservatively reject surfaces cutting a cell, but do not prove a centre is outside every closed solid when the entire probe lies inside it. Incorrect seeds, missing triangles and thin/overlapping visual surfaces affect accuracy. Prefer a dedicated physics mesh. Render smoothing can extend past occupied-cell boundaries and does not clip the density shader to map walls.

Default adapter budgets: 2,000,000 triangles and 256 MiB estimated geometry/BVH allocation. Memory is an estimate, not an operating-system hard limit. `maxCollisionChecks` counts driver calls; the Three adapter may cast up to eight rays per cell test. `getStats().raycasts` reports actual ray count. Do not create a fresh world for every smoke; reuse it for an unchanged map and dispose when replacing the map.

The caller owns the original model; disposing the collision world leaves its materials, raycast functions and geometries intact. The caller owns the returned smoke volume and must use `disposePredictedSmokeVolume` when finished. The helper is idempotent. Existing renderer density-field caching remains bounded to 16 MiB.

Failures use `SmokePredictionError.code`: `invalid_argument`, `seed_blocked`, `budget_exceeded`, `disposed`, with `details` when applicable. Abort signals propagate their native abort reason. Errors thrown by custom collision/progress drivers propagate unchanged.

## Comparison and acceptance

`compareSmokeVoxels(recorded, predicted, { tolerance: 20 })` returns exact occupied-cell IoU, symmetric nearest-centre distance, Hausdorff distance and tolerance precision/recall/F1 in Source inches. It handles differing origins in world coordinates and preserves the raw recorded representation; a tolerance score never replaces exact IoU. Its nearest-neighbour comparison is quadratic, bounded to 8192 input cells per frame: use it for offline evaluation, not every rendered frame.

From the repository:

```sh
make test-js TEST=tests/smoke-prediction.test.js
make viewer-check
make smoke-compare ARGS="--model /path/to/de_dust2.glb --serve"
# Open the printed local URL; omit --serve to only generate the report.
```

The comparison uses the bundled real Falcons–Vitality Dust2 example: 43 smoke frames over six rounds, with 40–44 recorded cells per frame. This sparse corpus is kept unchanged and is not a complete validation set of engine states. Reports retain blocked seeds and show recorded / collision-constrained / unconstrained clouds side by side, with an occupied-cell view and the existing density renderer. Generated reports live under `.local`, outside Git. Changing output location does not require changing import paths.

Automated tests cover packing/units, deterministic async parity, progress and abort recovery, walls/doors/floors, budget failures, hidden/transformed meshes, caller resource ownership, renderer disposal and an installed-package browser consumer. Shape agreement against real data is a separate measured result; passing those engineering checks does not establish game accuracy. Do not enable automatic replacement of recorded smoke or rely on these estimates for exact tactical visibility.
