# CSBoard Rust WASM Parser

This bundle is built from `LaihoE/demoparser` commit `266a831` with the local
changes recorded in `wasm-compat.patch`:

- profiling calls to `std::time::Instant::now()` are disabled for
  `wasm32-unknown-unknown`, where `Instant::now()` panics;
- Source 2 entity handles use their full 14-bit entity index instead of the
  legacy 11-bit mask, so pawns, weapons, owners, and event entities above index
  2047 do not alias unrelated entities;
- `parseGrenades` returns the parser's `ProjectileRecord` stream and retains
  CSBoard's `entity_id` field name.
- smoke projectile vectors retain the complete voxel journal internally while
  `parseGrenades` emits only newly appended records for each voxel update.
- `CInferno` fixed arrays retain all 64 fire positions, surface normals, and
  burning flags so the frontend can replay authoritative fire cells.

CSBoard uses the projectile records for per-Tick grenade trajectories instead
of interpolating only between throw and detonation events. Smoke journal frames
are decoded into compact occupancy seeds for environment-aware replay clouds.

Build prerequisites:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.100 --locked
```

Apply the source patches from the demoparser repository root in this order:

```sh
git apply --unidiff-zero /path/to/wasm-compat.patch
git apply /path/to/inferno-frames.patch
```

Build its `src/wasm`
crate with `cargo build --release --target wasm32-unknown-unknown`, then run
`wasm-bindgen` with `--target web` and copy the generated package into this
directory. Any parser-output change must also increment the Demo cache schema
in `demoWorker.js` and `main.jsx`.
