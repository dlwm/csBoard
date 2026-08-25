# CSBoard

> A 3D tactical board, CS2 Demo replay viewer, analysis workspace, and real-time collaboration tool.

[中文说明](README.zh-CN.md)

![CSBoard demonstration](assets/readme/demo.gif)

CSBoard turns CS2 maps and Demo files into an interactive tactical workspace. It combines editing, round playback, player and utility visualization, event timelines, spatial analysis, local archives, and Yjs-powered collaboration in one browser application.

## Highlights

### Round Replay

![Round replay](assets/readme/round-replay.png)

- Import one Demo or select multiple Demo parts and merge them into one match.
- Parse all rounds once through Rust/WASM, then switch rounds instantly from the in-memory cache.
- Replay from freeze end with player movement, kills, deaths, weapons, health, utility, C4 state, and event markers.
- Display simplified standing and crouching player models with yaw, pitch, dynamic eye height, and BVH-accelerated line-of-sight collision.
- Track C4 carriers, drops, plants, explosions, defuses, approximate drop trajectories, and the bomb timer.
- Save the current frame and convert live players and active utility into editable tactical-board objects.

### Tactical Editing

![Tactical editing](assets/readme/collaboration.png)

- Place T or CT tactical points directly on surfaces (Collaboration panel only).
- Draw freehand brush strokes on the ground in round replay / analysis / utility panels, with undo/redo.
- Edit point team, symbol type, direction, aim length, and vertical angle.
- Place and adjust smoke, fire, flash, HE, and decoy effects.
- Store ten camera presets per map and restore them with `1-9` / `0`.
- Save local workspace archives containing player markers, utility, brushes, camera presets, and an optional Demo frame reference.

### Utility Notes

![Utility notes](assets/readme/utility-notes.png)

- Save map-specific utility setups from pasted `getpos` output or Demo throws.
- Search and replay saved lineups with setup positions, view angles, thrower details, events, and projectile paths.
- Edit utility titles and descriptions without rebuilding the record.
- Export the utility library as JSON and append imported JSON records to the local library.
- Deduplicate records by complete deep equality during import; identical records are retained only once.
- Import a saved utility into a collaboration frame only after selecting it and confirming the action. Imported utility and custom `Q`-wheel utility remain separate data types.

### Demo Analysis

![Demo analysis](assets/readme/analysis.png)

- Select one or more players and overlay movement from every round starting at freeze end.
- Filter analysis by all rounds, T-side rounds, or CT-side rounds.
- Inspect synchronized movement paths and aggregated spatial heatmaps.
- Visualize killer positions, victim positions, target positions, and opposing-player positions at kill time.

### Collaboration

![Collaboration panel](assets/readme/collaboration.png)

- Create or join a six-character Yjs WebSocket room.
- Synchronize player markers, imported utility, custom utility, brushes, frame order, and active frames.
- Player markers carry a character model, AK47, and unique three-digit hexadecimal name; drag to move, use `Ctrl` to adjust yaw, `Shift` to adjust pitch, and double-click to toggle crouch/stand.
- Frames contain players, imported utility, custom utility, trajectories, and brushes. Camera state and camera presets remain archive-level data.
- Insert, duplicate, delete, save, and switch frames. Saving to an existing archive appends a frame; switching smoothly transitions same-name player positions, yaw, and pitch.
- Use unified undo/redo for players, utility, brushes, imported utility, and erasing. History is isolated per frame.
- Let room members edit shared tactical content while keeping the current camera private.
- Support owner-controlled room destruction and member leave notifications.
- Use local archives as reusable starting points for collaborative sessions.

### Map Rendering

- Load CS2 data for supported maps (from cloud storage, parsed in the browser) and constrain tactical editing to reachable surfaces.
- Render GLB map geometry loaded from cloud storage with configurable opacity.
- Switch between reachable-surface, mouse-lens, and camera-lens model views.
- Use `three-mesh-bvh` for efficient nearest-wall line-of-sight queries.
- Navigate with Blender-style mouse controls, trackpad gestures, and WASD movement.

### Interface

- Switch the application between English and Chinese at runtime.
- Inspect live T/CT rosters, score, health, active weapons, remaining utility, deaths, and C4 ownership.
- Jump directly to kills, C4 plants, explosions, and round-end events from the timeline.

### Mobile / H5

![Mobile collaboration](assets/readme/mobile.jpeg)

- Use a dedicated mobile layout with a 4:3 Three.js viewport above the operation panels.
- Rotate with one finger; use two fingers to zoom and pan.
- Select camera presets from a cyclic iPhone-style semicircular dial overlaid on the bottom of the 3D viewport.
- Tap a saved camera position to restore it, rotate through positions continuously, swipe up to save the centered slot, or select `RESET`.
- Keep collaboration frames at the top of the operation area for quick switching.
- Hide Round Replay, Demo Analysis, map controls, brush controls, trackpad settings, and model-lens modes on H5. Utility Notes and Collaboration remain available.

## Supported Maps

The repository includes files for:

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

GLB map models are intentionally not committed. Running `npm run dev` automatically detects and downloads any missing `.nav`/`.glb` into `public/maps/<map>/`; after a production build the runtime loads both NAV and GLB from cloud storage.

## Getting Started

Requirements:

- Node.js 20 or newer
- npm

Install dependencies:

```bash
npm install
```

Start the Vite frontend and collaboration/API server:

```bash
npm run dev
```

Before starting, the `predev` resource check (`scripts/ensure-maps.js`) inspects each map's `.nav` and `.glb` under `public/maps/<map>/`; missing files are downloaded automatically from cloud storage with progress printed to the terminal. In development the map NAV/GLB load from the local `public/maps` directory.

The frontend uses Vite's development server, while the HTTP and Yjs WebSocket service runs on port `3001` and is reached through the configured proxy.

Build the production bundle:

```bash
npm run build
```

## Controls

| Input | Action |
| --- | --- |
| Middle mouse drag | Rotate camera |
| `Shift` + middle mouse | Pan camera |
| Mouse wheel / trackpad gesture | Zoom or orbit |
| `W A S D` | Move camera |
| Left drag (round replay / analysis / utility) | Draw a freehand brush stroke on the ground |
| `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` | Undo / redo brush strokes |
| `E` | Place a tactical point (Collaboration panel only) |
| `Ctrl` + left drag | Erase brush strokes, or adjust a player marker's yaw |
| `Shift` + left drag a player | Adjust player pitch |
| `Q` | Open the utility wheel |
| Left click a point | Open the point editor |
| `Ctrl` + `1-9` / `0` | Save one of ten camera presets |
| `1-9` / `0` | Restore a camera preset |
| `Space` | Play or pause replay/analysis |
| Arrow keys | Step through the current round |
| Mobile one-finger drag | Rotate camera |
| Mobile two-finger gesture | Zoom and pan camera |
| Mobile camera-dial swipe | Rotate through camera slots; swipe up to save the centered slot |

## Resource Layout

```text
assets/
  readme/                 # README screenshots and demonstration GIF
public/
  maps/
    <map>/
      <map>.nav           # local dev data, ignored by Git (auto-downloaded on dev)
      <map>.glb           # local dev data, ignored by Git (auto-downloaded on dev)
```

The whole `public/` directory is ignored by Git. Running `npm run dev` triggers `scripts/ensure-maps.js`, which downloads any missing map resource into `public/maps/<map>/`.

In development (`import.meta.env.DEV`) the app loads NAV and GLB from the local `public/maps` directory (`/maps/<map>/<map>.nav`, `/maps/<map>/<map>.glb`). A production build (`vite build`) instead uses cloud storage:

- `https://pub-535aa40e0aa54f49be75aa008da8b788.r2.dev/maps/<map>/<map>.nav`
- `https://pub-535aa40e0aa54f49be75aa008da8b788.r2.dev/maps/<map>/<map>.glb`

NAV files are fetched as raw bytes and parsed in the browser (`src/navParser.js`). The bucket must send `Access-Control-Allow-Origin` headers. The legacy `/api/maps/:map/nav` endpoint remains as a fallback but is not required at runtime.

Map extraction tools and raw game resources remain local-only. Do not commit VPK files, extracted game assets, Demo files, or GLB models.

## Architecture

- React and Vite for the application shell and UI.
- Three.js for map rendering, tactical objects, effects, and replay visualization.
- Rust/WASM `demoparser2` for Demo events, ticks, players, inventory, and projectiles.
- `three-mesh-bvh` for accelerated map raycasting.
- Yjs, `y-websocket`, and `ws` for collaborative rooms.
- Express for map/API endpoints and the collaboration server.

## Current Limitations

- Collaboration rooms are stored in server memory and disappear after a server restart.
- Room ownership is currently client-managed rather than protected by a server-issued owner token.
- The parser does not expose per-Tick C4 entity coordinates, so dropped-C4 motion is approximated between events.
- Production loads map NAV and GLB from cloud storage; development uses local files under `public/maps/` (auto-downloaded when missing).
- Large Demo files can require significant memory because all round snapshots are cached after the initial parse.
- Round Replay and Demo Analysis are desktop-only; H5 exposes Utility Notes and Collaboration.

## Roadmap

### Model Size Reduction

- Reduce map model asset size, download cost, and runtime memory usage.

### Map Area Markers

- Mark C4 bombsites and team spawn areas on supported maps.
