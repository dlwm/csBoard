# CSBoard

> A 3D tactical board, CS2 Demo replay viewer, analysis workspace, and real-time collaboration tool.

[中文说明](docs/README.zh-CN.md) · [Русский](docs/README.ru-RU.md) · [Changelog](CHANGELOG.md)

![CSBoard demonstration](https://bucket.csboard.kuzuma.asia/output.gif)

CSBoard turns CS2 maps and Demo files into an interactive tactical workspace. It combines editing, round playback, player and utility visualization, event timelines, spatial analysis, local archives, and Yjs-powered collaboration in one application.

## Operation assistant

**Experimental feature.**

Open or create an archive in Collaboration, expand **Operation assistant**, and configure the service URL, model and API key. The service must support Chat Completions tool calls. Local services can use HTTP on localhost; other services require HTTPS.

Chat can read and edit players, illustrative utility effects, drawn routes, tactical frames, camera views and archive folders, or open the normal archive dialogs. A batch formation is one undo step. Room edits synchronize; chat persists locally in separate sessions. Stopping preserves completed edits.

Sessions can be switched, renamed and imported/exported as JSON. Edit persistent memory or create ordered workflow steps with allowed tools. Archive, frame, panel and board changes are observed locally and supplied on the next request. Views exclude building models and allow focused azimuth/elevation controls; the main camera stays unchanged.

Desktop keys use system encryption. Web keys stay in memory until refresh and requests pass through your backend; configure allowed service base URLs and, for separate hosting, the frontend origin. No API key is included in room data or exports. Current NAV data has no named callouts, so map-location suggestions require review. Drawn routes and manually placed effects are not physics simulations.

For image-capable models, enable **Model supports image input** in settings. The assistant can inspect numbered current, top and focused board views and resolve image pixels into NAV candidates. Leave this off for text-only models: local polygon geometry, heights, connections and relative positions remain available. Screenshots cover only the board, use a temporary camera and are not retained in model history across turns. Image recognition and imported geometry do not validate CS2 cover, line of sight or utility coverage.


## Version 1.20.3

- Switch imported maps between simple models and original materials.
- Play recorded Demo voices with speaking indicators; voice starts muted and has a separate volume control.
- Adjust desktop text size and inspect freeze time before each round without changing the default playback start.
- See the [release notes](CHANGELOG.md) for details.

## Highlights

### Match Replay

![Match replay](docs/img/round-replay.png)

- Import one Demo or select multiple Demo parts and merge them into one match.
- Parse playable rounds once and switch rounds from cache: The Go parser builds replay and analysis data; rounds are cached in IndexedDB or SQLite plus compressed files.
- Omit empty placeholder rounds and discard incompatible cached parses automatically.
- Replay from freeze end with player movement, kills, deaths, weapons, health, utility, C4 state, and event markers; seek backward to review freeze time.
- Play recorded voice with speaker indicators. Voice starts muted; use the header button to unmute and its vertical slider to adjust voice volume. Demos without recorded voice cannot supply audio; older caches need reparsing.
- Display simplified standing and crouching player models with yaw, pitch, dynamic eye height, and BVH-accelerated line-of-sight collision.
- Track C4 carriers, drops, plants, explosions, defuses, approximate drop trajectories, and the bomb timer.
- Save the current frame and convert live players and active utility into editable tactical-board objects.
- Switch to a same-team monitor wall with a selectable main POV; fallen teammates show a blacked-out view.
- Save a named time interval as a View Broadcast clip.

#### Custom DEMO

Play CS2 clips recorded with `record <name>` and `stop`, including practice sessions with varying numbers of bots or incomplete rounds. Import them through **Match Replay**; for non-standard Demos, select **Continue parsing** in the parsing list. Standard matches and custom recordings share the local library and playback tools. Custom recordings show a **Custom DEMO** label at the lower left, without match analysis, scoreboards, team status bars or kill feeds.

### View Broadcast

- Play one saved Demo interval without match-only score, kill-feed, or round controls; retain monitor mode, model settings, and clickable utility saving.
- Selecting a clip opens a six-character room. Guests see full-screen transfer progress and receive a local archive before playback starts.
- Keep Broadcast and Match Replay playback positions, cameras, and selected POVs separate when switching pages.

### Tactical Editing

![Tactical editing](docs/img/collaboration.png)

- Place T or CT tactical points directly on surfaces (Collaboration panel only).
- Draw freehand brush strokes on the ground in round replay / analysis / utility panels, with undo/redo.
- Edit point team, symbol type, direction, aim length, and vertical angle.
- Place and adjust smoke, fire, flash, HE, and decoy effects.
- Open the custom utility wheel from any desktop workspace and delete placed utility with `Ctrl`/`Cmd` + click.
- Store ten camera presets per map and restore them with `1-9` / `0`.
- Save local workspace archives containing player markers, utility, brushes, camera presets, and an optional Demo frame reference.
- Organize local archives in a draggable folder tree; folder deletion moves entries to the parent.

### Utility Notes

![Utility notes](docs/img/utility-notes.png)

- Save map-specific utility setups from pasted `getpos` output or Demo throws.
- Search and replay saved lineups with setup positions, view angles, thrower details, events, and projectile paths.
- Edit utility titles and descriptions without rebuilding the record.
- Export the utility library as JSON and append imported JSON records to the local library.
- Deduplicate records by complete deep equality during import; identical records are retained only once.
- Import a saved utility into a collaboration frame only after selecting it and confirming the action. Imported utility and custom `Q`-wheel utility remain separate data types.
- Sort saved setups into draggable folders independently of Collaboration and View Broadcast archives.

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

- Native apps and mobile H5 use landscape layouts with collapsible sidebars and larger touch controls; mouse and keyboard remain supported.
- Native apps retain the full workspace. Mobile H5 offers Utility Notes and Collaboration, with Demo import, Match Replay, Analysis and Broadcast disabled.
- Portrait mode prompts you to rotate the device and pauses map rendering.
- Rotate with one finger; use two fingers to zoom and pan. Move, aim and pitch controls support touch editing.
- Android/iOS development builds use native Go parsing and SQLite, with optional WASM parsing. See the [mobile development guide](docs/mobile.md) for build commands and current limitations.

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

Training Ground is available only in Utility Notes and Collaboration. Switching to Match Replay or Analysis automatically returns to Dust II.

First-time visitors are asked whether to open the tutorial, which starts directly in the Training Ground Collaboration practice frame. For local testing, Vite DEV or `localhost`, `127.0.0.1`, and `::1` environments repeat the prompt every third visit and show that trigger condition in small text inside the dialog. The tutorial map includes synchronized upper and lower NAV top views.

## Getting Started

Requirements:

- Node.js 20 or newer
- npm
- GNU Make and Bash (Windows: Git Bash + `choco install make`)

Install dependencies:

```bash
make install
cp .env.example .env.local
```

Set your own `VITE_OSS_BASE_URL` in `.env.local`, then run `make resources` to download missing local maps. `MAP_DOWNLOAD_BASE_URL` can override the source for that command only; the repository does not provide a default download origin.

Build the frontend and start the APIs and collaboration service with the default Node.js Runtime:

```bash
make dev
```

The default development command starts the traditional Node.js HTTP/WebSocket adapter on port `3001`. Run `make dev-workers` when testing the Cloudflare Workers Runtime and Durable Objects integration; this also starts a local map server on port `3002` for GLB files under `.local/official/maps`. Run `make help` for the main setup, resource, frontend, backend, and Workers commands.

The Node.js Runtime adapter listens on `PORT` (default `3001`) and reads `MAP_BASE_URL` from `process.env`. The Cloudflare Workers adapter uses `env.MAP_BASE_URL` and Durable Object Storage; shared route, parsing, and protocol logic lives under `server/core/`.

Build the production bundle:

```bash
make build
make workers-build
```

`make build` creates the local web frontend in `dist/`; `make workers-build` separately builds both Cloudflare Workers with `--dry-run` into `build/workers/`, including the remote frontend. Frontend builds use the package version; Workers/Docker Make commands derive the version from Git (interactive dirty/untagged builds request confirmation).

`make build` uses local `/maps` resources and same-origin APIs. `make build-remote` uses `VITE_OSS_BASE_URL` and `VITE_BACKEND_BASE_URL`; the frontend Worker invokes this remote build.

Electron release builds (`make desktop-build-mac-arm64` / `make desktop-build-mac-x64` / `make desktop-build-win-x64`) do not include map models. Open **Resources** in the desktop header to import multiple SVG icons and GLB maps, in batches if needed. The completeness list reports every supported filename; missing icons retain the default UI, and missing models use NAV without model controls or OSS downloads. Files are stored in the application's user-data directory. Matching names replace previous imports only after validation. Save your work, then select **Reload and apply**. Game imports include converted textures; use **Simple model / Original materials** in the model controls. Reimport older game packs to obtain textures. See [resource-pack instructions](docs/ai/references/resource-packs.en.md).

Unpackaged development runs may read `.local/official/maps`; `make desktop-prepare ARGS=--local-models` creates an explicit local-test package containing these models. Ordinary release packaging never includes `.local/official` or `.local/official/maps`. Web builds retain their existing local/OSS model behavior.

Desktop builds write the renderer to `build/renderer/` and bundled background tasks to `build/tasks/`; Web builds keep `dist/`. `make desktop-prepare` builds native components, icons and desktop bundles, then creates a CSBoard application for the host platform. `make desktop-start` opens that existing application without rebuilding. Run prepare again after source changes. `make desktop-dev` launches the unpackaged Electron runtime with DevTools and optional local models; macOS can display this runtime as Electron.

Release packages are limited to these three targets. Run macOS commands on macOS and Windows commands on Windows:

| Target | Command | Output in `build/desktop/` |
| --- | --- | --- |
| Apple Silicon | `make desktop-build-mac-arm64` | `CSBoard-<version>-mac-arm64.dmg` |
| Intel Mac | `make desktop-build-mac-x64` | `CSBoard-<version>-mac-x64.dmg` |
| Windows amd64 | `make desktop-build-win-x64` | `CSBoard-<version>-win-x64.exe` |

Use Git, Node.js and Go to build. Both native components use Go with CGO disabled; one Mac can build both macOS architectures. On Windows, use x64 Node.js. The commands select matching Go, storage and Electron targets and never publish automatically. Signing credentials must be configured separately.

#### GitHub Actions

Commit the workflows under `.github/workflows/` along with the release changes. CI checks pull requests and pushes to `main`/`master`. To build a release, push an existing or newly created `v1.18.0` tag pointing at the version commit, or run **Actions → Release → Run workflow** with that existing tag (manual dispatch requires the workflow on the default branch). The tag, package/lockfile versions and changelog must agree.

One Release workflow builds the three desktop targets and Android/iOS in parallel, checks packaged contents and native storage, then attaches all five packages plus `SHA256SUMS.txt` and `SHA256SUMS-mobile.txt` to a **draft Release** after every build succeeds. Mobile development builds remain available for branches, pull requests and manual runs; version tags trigger only the unified Release workflow. It never publishes the draft or overwrites a published release. Reruns update only a draft for the same commit. Check installation before selecting **Publish release** on GitHub.

Normally no extra Secrets or personal token are needed: the workflow uses the built-in `GITHUB_TOKEN`, with write access only for the draft job. GitHub Actions must be enabled; repository/organization policies must permit these actions and Release writes. macOS apps and bundled native programs use free ad-hoc signing, and CI verifies their signatures before upload. They are not Developer ID signed or Apple notarized; Windows installers remain unsigned.

`make help` lists the retained commands. All project commands use Make; use `make install` for dependencies, `make deploy` for Workers deployment, and `docker compose -f config/docker/compose.yml down`, `logs -f` or `ps` for container management. Internal icon and background-task builds run automatically. `make desktop-prepare ARGS=--local-models` produces a separate test application under `build/desktop-local/`; open that application directly.

Version: `make version` offers major, minor, patch and custom input; it synchronizes all platforms without committing or tagging. Mobile: `make mobile-prepare`, `make mobile-open` or `make mobile-build`, with `PLATFORM=ios|android`. Pass extra flags through `ARGS="..."`.

Building the native desktop component requires Git, Node.js and Go (the toolchain follows `native/parser/go.mod` and `native/storage/go.mod`). SQLite uses a pure Go driver, with no Rust/Cargo or C compiler requirement. Installed applications include the executables and need no Go or Python setup. Native data lives under the Electron user-data directory in `native-data/`. Legacy IndexedDB data is copied when needed without deleting the original database; browser preferences remain in browser storage. Back up important archives before upgrading.

Desktop → Parser performance offers Balanced (default), Fast and Custom modes. Fast allows the full logical-core budget; concurrent Demos share it and wait when memory is insufficient. Custom controls concurrent Demos, threads per Demo and the memory admission budget. Safe tick sampling uses native threads; events, button state and smoke/fire journals remain sequential. The budget does not impose a hard process memory limit.

Desktop → Appearance adjusts interface text size from 80% to 150%, saves it automatically and offers a default reset.

Desktop → Storage & backups shows database, cache and resource usage, supports manual least-recently-used cache cleanup, and creates verified backup folders. Restore replaces native data and imported resources on restart while retaining the previous directories. Original Demo files, browser preferences and unsaved work are not included. Background tasks are bounded and cancellable; automatic sleep prevention is optional for the current session.


To run the Node.js Runtime in Docker, place the GLB models under `.local/official/maps/<map>/` and run `make docker`. Compose mounts that directory read-only at `/app/.local/official/maps`; set `BUILD_VERSION` only when overriding the default `v1.18.0` image version.

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

AI prompts and references live in [docs/ai](docs/ai/README.md); starter records live separately in [docs/presets](docs/presets/README.md).

```text
assets/
  readme/                 # README screenshots and demonstration GIF
src/
  data/nav/               # generated, committed NAV JSON bundled by Vite
docs/
  ai/                     # AI prompts and references
    prompts/
    references/
  presets/                # starter records
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

Contributors can place default utility-note or Collaboration-archive JSON files directly in the corresponding `docs/presets/` subdirectory. See [`docs/presets/README.md`](docs/presets/README.md) for accepted formats. These files are imported only when the browser has never created the corresponding local data, so existing user data is never replaced or repopulated.

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
- The pinned `dlwm/demoinfocs` fork and `native/parser/` adapter for Demo events, ticks, players, inventory and projectiles, built as Go WASM and a native executable.
- `src/platform/` selects browser or desktop services; desktop utility processes handle heavy computation, and SQLite plus compressed files persist data.
- `three-mesh-bvh` for accelerated map raycasting.
- Yjs and `y-websocket` for collaborative rooms.
- Cloudflare Workers Fetch API for HTTP routes in the backend Worker and static assets in the frontend Worker.
- Cloudflare Durable Objects for room WebSockets and short-lived Yjs persistence.

## Cloudflare Workers

Use the project commands from the repository root:

```sh
make dev-workers                # Local Workers development
make deploy ARGS=--dry-run        # Build without publishing
make deploy                    # Authorize and deploy
```

Deployment reuses Wrangler OAuth or opens the browser for authorization. Configure optional frontend/backend domains in the ignored `config/cloudflare/deploy.env`; Cloudflare manages DNS and certificates when the root zone belongs to the selected account. The script deploys both Workers and reports their URLs after health and frontend asset checks.

For map resources, custom domains, CI credentials, AI provider permissions and optional UI icons, see the [Cloudflare deployment guide](config/cloudflare/README.md). Large Demos should be parsed locally because Workers memory and CPU limits still apply.

## License

Copyright (C) 2026 Colvin Chen. Original CSBoard source code and documentation are licensed under the [GNU General Public License v3.0 only](LICENSE). Distributed modified versions must remain under GPLv3 and provide their corresponding source code. Third-party libraries and assets retain their own licenses; see [licensing scope](docs/THIRD_PARTY_NOTICES.md#licensing-scope) for the exact scope.

## Current Limitations

- Node.js Runtime rooms are held in process memory. Cloudflare Workers rooms use Durable Object storage and are deleted five minutes after the final client disconnects.
- Room ownership is currently client-managed rather than protected by a server-issued owner token.
- The parser does not expose per-Tick C4 entity coordinates, so dropped-C4 motion is approximated between events.
- Remote web builds use cloud storage for GLB models; local/Docker builds use local models. Electron releases require user-imported models; only local-test builds include local models. Bundled NAV geometry and 2D radar remain available offline.
- Large Demo files can require significant memory because all round snapshots are cached after the initial parse.
- Match Replay and Demo Analysis are available in desktop browsers and native applications; mobile H5 exposes Utility Notes and Collaboration.

## Roadmap

### Model Size Reduction

- Reduce map model asset size, download cost, and runtime memory usage.
