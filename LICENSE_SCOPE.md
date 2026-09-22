# CSBoard Licensing Scope

Copyright (C) 2026 Colvin Chen

Unless a file states otherwise, original CSBoard source code and documentation are licensed under GNU GPL version 3 only (`GPL-3.0-only`), as provided in `LICENSE`.

The GPL license applies only to material for which the CSBoard copyright holder has authority to grant a license. It does not replace or override any third-party terms.

## Third-party software

Third-party libraries retain their own licenses. In particular, the Rust/WASM Demo parser under `src/wasm/` is a modified build of `LaihoE/demoparser` commit `266a831` and remains subject to its MIT license and the licenses of its Rust dependencies. The local modifications are recorded in that directory's patch files and README.

The dependency inventory, acknowledgements, and bundled license texts are provided in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Preserve applicable copyright and license notices when redistributing dependencies. Space Grotesk and DM Mono remain under SIL Open Font License 1.1; Electron/Chromium and Rust dependency notices must also accompany distributions containing those components. These notices do not relicense third-party components under GPL.

Release 1.15.0 retains GPL-3.0-only for CSBoard; the standard GPL text in `LICENSE` is unchanged. Corresponding source for distributed modified parser builds includes the upstream revision and local patches documented in `src/wasm/README.md`.

## Game and other third-party assets

Desktop release packages do not bundle GLB map models. User-imported resource
packs and local-test resources retain their original rightsholders' terms;
importing a file does not grant permission to redistribute it. Material under
`.local/official/` is local test input and is excluded from release packages.

No rights are granted under the CSBoard GPL license to Valve, Counter-Strike, map, radar, Demo, or other third-party game content. Unless an individual file contains an explicit compatible license, treat material under `src/data/nav/` and `.local/official/maps/` as outside the GPL grant and subject to its original rightsholder's terms. Mere inclusion in this repository or a build does not grant permission to redistribute that material independently.

Counter-Strike and Valve are trademarks or registered trademarks of Valve Corporation. CSBoard is not affiliated with or endorsed by Valve Corporation.
