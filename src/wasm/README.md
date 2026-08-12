# CSBoard Rust WASM Parser

This bundle is built from `LaihoE/demoparser` commit `266a831` with one WASM
compatibility fix: profiling calls to `std::time::Instant::now()` are disabled
for `wasm32-unknown-unknown`, where `Instant::now()` panics.

The WASM `parseGrenades` export is also patched to return the parser's
`ProjectileRecord` stream. CSBoard uses those records for per-Tick grenade
trajectories instead of interpolating only between throw and detonation events.

Build prerequisites:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.100 --locked
```

Build the demoparser `src/wasm` crate with `cargo build --release --target
wasm32-unknown-unknown`, then run `wasm-bindgen` with `--target web` and copy
the generated package into this directory.
