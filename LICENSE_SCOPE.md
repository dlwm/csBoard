# CSBoard Licensing Scope

Copyright (C) 2026 Colvin Chen

Unless a file states otherwise, original CSBoard source code and documentation are licensed under GNU GPL version 3 only (`GPL-3.0-only`), as provided in `LICENSE`.

The GPL license applies only to material for which the CSBoard copyright holder has authority to grant a license. It does not replace or override any third-party terms.

## Third-party software

Third-party libraries retain their own licenses. In particular, the Rust/WASM Demo parser under `src/wasm/` is a modified build of `LaihoE/demoparser` commit `266a831` and remains subject to its MIT license and the licenses of its Rust dependencies. The local modifications are recorded in that directory's patch files and README.

## Game and other third-party assets

No rights are granted under the CSBoard GPL license to Valve, Counter-Strike, map, radar, icon, Demo, or other third-party game content. Unless an individual file contains an explicit compatible license, treat material under `src/assets/icons/`, `src/assets/map_2d/`, `src/data/nav/`, and `.local/maps/` as outside the GPL grant and subject to its original rightsholder's terms. Mere inclusion in this repository or a build does not grant permission to redistribute that material independently.

Counter-Strike and Valve are trademarks or registered trademarks of Valve Corporation. CSBoard is not affiliated with or endorsed by Valve Corporation.
