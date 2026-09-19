# CSBoard

> A 3D tactical board, CS2 Demo replay viewer, analysis workspace, and real-time collaboration tool.

[中文说明](docs/README.zh-CN.md) · [Русский](docs/README.ru-RU.md) · [Changelog](CHANGELOG.md)

![CSBoard demonstration](https://bucket.csboard.kuzuma.asia/output.gif)

CSBoard turns CS2 maps and Demo files into an interactive tactical workspace. It combines editing, round playback, player and utility visualization, event timelines, spatial analysis, local archives, and Yjs-powered collaboration in one browser application.

## Version 1.14.0

- Offline NAV-based 2D radar with square, aligned multi-floor views and elevation shading; smooth 3D NAV without edge overlays.
- Updated equipment/HUD icons, map-colored localized names, and standing/crouched pawn markers.
- Electron-only AI setup guide and single-round analysis: both-team timelines, events, utility, pagination, and evidence-aware prompts. Web browsers do not expose AI UI or register WebMCP tools. A compatible connected client is still required.
- See the [round analysis guide](docs/round-analysis-model.md), [release notes](CHANGELOG.md), and [third-party acknowledgements and licenses](THIRD_PARTY_NOTICES.md).

## Highlights

### Round Replay

![Round replay](docs/img/round-replay.png)

- Import one Demo or select multiple Demo parts and merge them into one match.
- Parse playable rounds once through Rust/WASM, persist each round in IndexedDB, and switch rounds without reparsing the Demo.
- Omit empty placeholder rounds and discard incompatible cached parses automatically.
- Replay from freeze end with player movement, kills, deaths, weapons, health, utility, C4 state, and event markers.
- Display simplified standing and crouching player models with yaw, pitch, dynamic eye height, and BVH-accelerated line-of-sight collision.
- Track C4 carriers, drops, plants, explosions, defuses, approximate drop trajectories, and the bomb timer.
- Save the current frame and convert live players and active utility into editable tactical-board objects.

### Tactical Editing

![Tactical editing](docs/img/collaboration.png)

- Place T or CT tactical points directly on surfaces (Collaboration panel only).
- Draw freehand brush strokes on the ground in round replay / analysis / utility panels, with undo/redo.
- Edit point team, symbol type, direction, aim length, and vertical angle.
- Place and adjust smoke, fire, flash, HE, and decoy effects.
- Open the custom utility wheel from any desktop workspace and delete placed utility with `Ctrl`/`Cmd` + click.
- Store ten camera presets per map and restore them with `1-9` / `0`.
- Save local workspace archives containing player markers, utility, brushes, camera presets, and an optional Demo frame reference.

### Utility Notes

![Utility notes](docs/img/utility-notes.png)

- Save map-specific utility setups from pasted `getpos` output or Demo throws.
- Search and replay saved lineups with setup positions, view angles, thrower details, events, and projectile paths.
- Edit utility titles and descriptions without rebuilding the record.
- Export the utility library as JSON and append imported JSON records to the local library.
- Deduplicate records by complete deep equality during import; identical records are retained only once.
- Import a saved utility into a collaboration frame only after selecting it and confirming the action. Imported utility and custom `Q`-wheel utility remain separate data types.

### Demo Analysis

![Demo analysis](docs/img/analysis.png)

- Lazily load Analysis payloads, aggregated players, and per-round utility trajectories only after opening the Analysis page. Search and select multiple players through prefix, substring, or ordered-character fuzzy matching, with removable colored chips and an explicit loading state.
- Select recent or specific parsed Demos available to any selected player, then filter rounds by T/CT side and each player's own/opponent economy classes.
- Switch between Area Time, KD Events, and Utility Events while keeping shared path playback, timeline scrubbing, and stepping controls.
- Combine Early, Mid, and Post-plant Area Time phases. The Early/Mid boundary defaults to 30 seconds after freeze end and can be adjusted from 10 to 90 seconds.
- Inspect killer, victim, target, and opposing-player locations for KD events.
- Filter Utility Events by smoke, flash, fire, HE, and decoy. Position mode renders distinct throw markers, colored landing markers, and full trajectories; heatmap mode counts landings only.
- Keep nearby utility landings separate while choosing them from a hover list, then click a landing to save the complete throw to Utility Notes.
- Sample heatmaps by NAV height to prevent cross-floor bleeding and adjust planar spread from 2 to 24 metres. Expensive heat recomputation occurs only after releasing the slider.

### Collaboration

![Collaboration panel](docs/img/collaboration.png)

- Create or join a six-character Yjs WebSocket room.
- Synchronize player markers, imported utility, custom utility, brushes, frame order, and active frames.
- Player markers carry a character model and AK47 and use generated adjective-fruit names; drag to move, use `Ctrl` to adjust yaw, `Shift` to adjust pitch, double-click to toggle crouch/stand, and select `T` or `CT` directly in the player list.
- Frames contain players, imported utility, custom utility, trajectories, and brushes. Camera state and camera presets remain archive-level data.
- Insert, duplicate, delete, save, and switch frames. Saving to an existing archive appends a frame; switching smoothly transitions same-name player positions, yaw, and pitch.
- Use unified undo/redo for players, utility, brushes, imported utility, and erasing. History is isolated per frame.
- Let room members edit shared tactical content while keeping the current camera private.
- Show room members, owner/current-user labels, and recent join/leave activity; support owner-controlled room destruction.
- Use local archives as reusable starting points for collaborative sessions.

### Map Rendering

- Load CS2 data for supported maps (from cloud storage, parsed in the browser) and constrain tactical editing to reachable surfaces.
- Render GLB map geometry loaded from cloud storage with configurable opacity; when layer selection is active, geometry starts fading 50 game units beyond the map's axis-aligned square boundary and becomes fully transparent across the next 20 units.
- Switch between mouse-lens and camera-lens model views, with camera lens selected by default.
- Show Nuke, Train, Vertigo, and Training Ground as full, upper, or lower 3D floors with binary NAV-bounded clipping. Other maps expose a toggleable playable-layer range that removes obstructing rooftop geometry; players, utility, trajectories, and manual editing follow the active range.
- Use `three-mesh-bvh` for efficient nearest-wall line-of-sight queries.
- Report GLB download/processing failures and retain NAV-based camera framing, collision, and surface editing when a model is unavailable.
- Build the 2D overview directly from bundled NAV geometry, with synchronized upper/lower views on layered maps.
- Navigate with Blender-style mouse controls, trackpad gestures, and WASD movement.

### Interface

- Switch the application between English, Chinese, and Russian at runtime.
- Inspect live T/CT rosters, score, health, active weapons, remaining utility, deaths, and C4 ownership.
- Jump directly to kills, C4 plants, explosions, and round-end events from the timeline.
- Keep desktop tool panels in dedicated columns around the 3D viewport and collapse available sidebars independently.
- Offer a non-blocking replay-control prompt when the loaded Demo map differs from the current map.
- Show black gradient cues on the top or bottom of primary vertical scrollers while more content remains in that direction, hiding each cue at its respective edge.

### Mobile / H5

![Mobile collaboration](docs/img/mobile.jpeg)

- Use a dedicated mobile layout with a 4:3 Three.js viewport above the operation panels.
- Rotate with one finger; use two fingers to zoom and pan.
- Select camera presets from a cyclic iPhone-style semicircular dial overlaid on the bottom of the 3D viewport.
- Tap a saved camera position to restore it, rotate through positions continuously, swipe up to save the centered slot, or select `RESET`.
- Keep collaboration frames at the top of the operation area for quick switching.
- Hide Round Replay, Demo Analysis, map controls, brush controls, trackpad settings, and model-lens modes on H5. Utility Notes and Collaboration remain available.

## Supported Maps

The repository includes files for:

- Training Ground (built-in two-level tutorial map with lower streets and linked rooftops; no external resources required)
- Ancient
- Anubis
- Cache
- Dust II
- Inferno
- Mirage
- Nuke
- Overpass
- Train
- Vertigo

Parsed NAV data for every supported map is committed and bundled into the frontend for offline use. GLB map models are intentionally not committed; run `make resources` when local source `.nav` and `.glb` files are needed under `.local/official/maps/<map>/`. Remote web builds load GLB from cloud storage; desktop releases use user-imported model resources.

Training Ground is available only in Utility Notes and Collaboration. Switching to Round Replay or Analysis automatically returns to Dust II.

First-time visitors are asked whether to open the tutorial, which starts directly in the Training Ground Collaboration practice frame. For local testing, Vite DEV or `localhost`, `127.0.0.1`, and `::1` environments repeat the prompt every third visit and show that trigger condition in small text inside the dialog. The tutorial map includes synchronized upper and lower NAV top views.

## Getting Started

Requirements:

- Node.js 20 or newer
- npm

Install dependencies:

```bash
npm install
cp .env.example .env.local
```

Set your own `VITE_OSS_BASE_URL` in `.env.local`, then run `make resources` to download missing local maps. `MAP_DOWNLOAD_BASE_URL` can override the source for that command only; the repository does not provide a default download origin.

Build the frontend and start the APIs and collaboration service with the default Node.js Runtime:

```bash
npm run dev
```

The default development command starts the traditional Node.js HTTP/WebSocket adapter on port `3001`. Run `make workers-dev` or `npm run dev:workers` when testing the Cloudflare Workers Runtime and Durable Objects integration; this also starts a local map server on port `3002` for GLB files under `.local/official/maps`. Run `make help` for the main setup, resource, frontend, backend, and Workers commands.

The same API and Yjs protocol core can also run behind a traditional Node.js HTTP/WebSocket entry:

```bash
make node-dev
# or: npm run dev:node
```

The Node.js Runtime adapter listens on `PORT` (default `3001`) and reads `MAP_BASE_URL` from `process.env`. The Cloudflare Workers adapter uses `env.MAP_BASE_URL` and Durable Object Storage; shared route, parsing, and protocol logic lives under `server/core/`.

Build the production bundle:

```bash
make build
```

This creates the frontend in `dist/`, validates the Node.js Runtime adapter, and writes the Cloudflare Workers bundle to `build/workers/`. Make builds derive the header version from Git: a clean exact-tag build uses that tag, while dirty or untagged interactive builds ask before using `git describe`.

`npm run build` and `npm run build:local` use local `/maps` resources and same-origin APIs. `npm run build:remote` uses `VITE_OSS_BASE_URL` and `VITE_BACKEND_BASE_URL`; the frontend Worker invokes this remote build.

Electron release builds (`npm run desktop:build:mac` / `npm run desktop:build:win`) do not include map models. Open **Resources** in the desktop header to import multiple SVG icons and GLB maps, in batches if needed. The completeness list reports every supported filename; missing icons retain the default UI, and missing models use NAV without model controls or OSS downloads. Files are stored in the application's user-data directory. Matching names replace previous imports only after validation. Save your work, then select **Reload and apply**. See [resource-pack instructions](docs/resource-packs.md).

Unpackaged development runs may read `.local/official/maps`; `npm run desktop:build:local` creates an explicit local-test package containing these models. Ordinary release packaging never includes `.local/official` or `.local/official/maps`. Web builds retain their existing local/OSS model behavior.

The Electron renderer also contains an experimental, opt-in WebMCP bridge. Run `npm run build:desktop` once, then `npm run desktop:start:webmcp` to enable experimental API support; successful registration and an actual client call must still be verified; ordinary `npm run desktop:start` launches without Chromium's experimental web-platform switch. In Analysis, a connected user model should call `get_analysis_context` first to read the current filters, field guide, readiness state, and starter prompts, then page through `get_filtered_analysis_data`. The latter returns already-filtered KD, area-time, or utility JSON in pages of at most 200 records; utility trajectories are opt-in to avoid wasting model context. Vision-capable models may call `capture_3d_view` to receive the current 3D canvas with camera and analysis metadata. Width, height, WebP/JPEG/PNG format, quality, fit mode, and context inclusion are configurable; the default is a compact 960px-wide WebP. Both launch modes use the same fixed, read-only `http://127.0.0.1:32145` application origin so desktop storage remains stable. Override the port with `CSBOARD_DESKTOP_PORT` only when necessary.

To run the Node.js Runtime in Docker, place the GLB models under `.local/official/maps/<map>/` and run `make docker`. Compose mounts that directory read-only at `/app/.local/official/maps`; set `BUILD_VERSION` only when overriding the default `v1.14.0` image version.

## Controls

| Input | Action |
| --- | --- |
| Middle mouse drag | Rotate camera |
| `Shift` + middle mouse | Pan camera with Blender-style cursor wrapping at viewport edges |
| Mouse wheel / trackpad gesture | Zoom or orbit |
| `W A S D` | Move camera |
| Left drag (round replay / analysis / utility) | Draw a freehand brush stroke on the ground |
| `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` | Undo / redo brush strokes |
| `E` | Place a tactical point (Collaboration panel only) |
| `Ctrl` + left drag | Erase brush strokes, or adjust a player marker's yaw |
| `Ctrl` / `Cmd` + click placed utility | Delete the placed utility |
| `Shift` + left drag a player | Adjust player pitch |
| `Q` | Open the custom utility wheel in the active desktop workspace |
| Left click a point | Open the point editor |
| `Ctrl` + `1-9` / `0` | Save one of ten camera presets |
| `1-9` / `0` | Restore a camera preset |
| `Space` | Play or pause replay/analysis |
| `←` / `→` | Step replay or analysis by 16 ticks; switch adjacent Collaboration frames |
| Mobile one-finger drag | Rotate camera |
| Mobile two-finger gesture | Zoom and pan camera |
| Mobile camera-dial swipe | Rotate through camera slots; swipe up to save the centered slot |

## Resource Layout

```text
assets/
  readme/                 # README screenshots and demonstration GIF
src/
  data/nav/               # generated, committed NAV JSON bundled by Vite
  default-data/           # committable data imported on first visit
    utility-notes/        # utility-note JSON files
    workspace-archives/   # Collaboration archive JSON files
.local/
  official/               # game-sourced assets, including converted resources
    maps/<map>/           # NAV sources and GLB models
    ui/                   # SVG resource-pack test inputs
    vpk/                  # source archives and extraction output
  dem/                    # Demo samples grouped by provider
  previews/               # generated previews and local checks
```

Contributors can place default utility-note or Collaboration-archive JSON files directly in the corresponding `src/default-data/` subdirectory. See [`src/default-data/README.md`](src/default-data/README.md) for accepted formats. These files are imported only when the browser has never created the corresponding local data, so existing user data is never replaced or repopulated.

Running `make resources` checks each local map source/model and downloads missing files from `VITE_OSS_BASE_URL` (or `MAP_DOWNLOAD_BASE_URL`) configured in `.env.local`. The command fails clearly when no download origin is configured. After replacing source NAV files, run `make nav-data` to regenerate the committed frontend data.

NAV JSON is included in the frontend bundle and parsed only when its map is selected; the browser makes no runtime NAV request. Local builds load GLB files from `.local/official/maps` through `/maps/<map>/<map>.glb`. Remote builds use:

- `<VITE_OSS_BASE_URL>/maps/<map>/<map>.glb`

The GLB bucket must send `Access-Control-Allow-Origin` headers. `src/navParser.js` is retained for the build-time NAV generator rather than exposed as a runtime API.

Map extraction tools and raw game resources remain local-only. Do not commit VPK files, extracted game assets, Demo files, or GLB models.

## Architecture

For code navigation and validation workflows, see the [development guide (Chinese)](docs/development.md).

- React and Vite for the application shell and UI.
- Feature-scoped Analysis components and calculations under `src/analysis/`; Demo domain logic and HUD under `src/demo/`; shared UI under `src/components/`; Three.js helpers under `src/three/`; utility-note logic under `src/utility/`; and reusable cross-panel DOM behavior under `src/hooks/`.
- Three.js for map rendering, tactical objects, effects, and replay visualization.
- Rust/WASM `demoparser2` for Demo events, ticks, players, inventory, and projectiles.
- `three-mesh-bvh` for accelerated map raycasting.
- Yjs and `y-websocket` for collaborative rooms.
- Cloudflare Workers Fetch API for HTTP routes in the backend Worker and static assets in the frontend Worker.
- Cloudflare Durable Objects for room WebSockets and short-lived Yjs persistence.

## Cloudflare Workers

Wrangler configuration lives in [`config/cloudflare/`](config/cloudflare/README.md): `wrangler.dev.jsonc` for local development, plus separate backend and frontend deployment files. Use the project scripts rather than bare `wrangler dev`; they select the right configuration and preserve the existing root `.wrangler/state` store.

The production backend is a Workers module exported from `server/index.js`; it does not open a local port. A separate frontend Worker serves `dist` through Workers Static Assets, while the backend routes `/rooms/<code>` to one Durable Object per room.

```bash
npm install
npm run dev:workers
cp deploy.cloudflare.env.example deploy.cloudflare.env
make workers-deploy
```

Edit `deploy.cloudflare.env` with the Cloudflare account, frontend and backend Worker names, OSS base URL, backend public URL, and optional custom domains. Prefer supplying `CLOUDFLARE_API_TOKEN` through the shell or CI secret store. The deploy script writes the platform-neutral `VITE_OSS_BASE_URL` and `VITE_BACKEND_BASE_URL` values to the ignored `.env.production.local`, then passes the same OSS base URL to the backend as `env.MAP_BASE_URL`.

The script deploys the API, room WebSockets, and Durable Objects to the backend Worker first, then deploys the Vite bundle to the frontend Workers Static Assets service. `BACKEND_PUBLIC_URL` is embedded into the frontend so collaboration connections use the separate backend origin.

The legacy `POST /api/parse` response contract is retained using the existing browser-compatible parser WASM. Cloudflare request-body, memory, and CPU limits still apply, so large Demo files should continue to be parsed locally in the browser.

The native `@laihoe/demoparser2` package is used only by the Node.js Runtime adapter and offline tools. It is not imported by or bundled into Cloudflare Workers because the runtime cannot load N-API addons or start subprocesses; the Cloudflare Workers adapter uses the existing parser WASM instead.

## License

Copyright (C) 2026 Colvin Chen. Original CSBoard source code and documentation are licensed under the [GNU General Public License v3.0 only](LICENSE). Distributed modified versions must remain under GPLv3 and provide their corresponding source code. Third-party libraries and assets retain their own licenses; see [LICENSE_SCOPE.md](LICENSE_SCOPE.md) for the exact scope. The CSBoard license does not grant rights to Valve, Counter-Strike, map, radar, Demo, or other third-party game content.

## Current Limitations

- Node.js Runtime rooms are held in process memory. Cloudflare Workers rooms use Durable Object storage and are deleted five minutes after the final client disconnects.
- Room ownership is currently client-managed rather than protected by a server-issued owner token.
- The parser does not expose per-Tick C4 entity coordinates, so dropped-C4 motion is approximated between events.
- Remote web builds use cloud storage for GLB models; local/Docker builds use local models. Electron releases require user-imported models; only local-test builds include local models. Bundled NAV geometry and 2D radar remain available offline.
- Large Demo files can require significant memory because all round snapshots are cached after the initial parse.
- Round Replay and Demo Analysis require a desktop-sized interface (including desktop web browsers); H5 exposes Utility Notes and Collaboration. AI integration is exclusive to the Electron application.

## Roadmap

### Model Size Reduction

- Reduce map model asset size, download cost, and runtime memory usage.
