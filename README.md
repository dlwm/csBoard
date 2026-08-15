# CSBoard

> A 3D tactical board, CS2 Demo replay viewer, analysis workspace, and real-time collaboration tool.

[中文说明](README.zh-CN.md)

![CSBoard demonstration](assets/readme/demo.gif)

CSBoard turns CS2 maps and Demo files into an interactive tactical workspace. It combines NAV-aware editing, round playback, player and utility visualization, event timelines, spatial analysis, local archives, and Yjs-powered collaboration in one browser application.

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

- Place T or CT tactical points directly on NAV surfaces (Collaboration panel only).
- Draw freehand brush strokes on the NAV ground in round replay / analysis / utility panels, with undo/redo.
- Edit point team, symbol type, direction, aim length, and vertical angle.
- Draw connected movement paths and remove points or paths interactively.
- Place and adjust smoke, fire, flash, HE, and decoy effects.
- Store nine camera presets per map and restore them with number keys.
- Save local workspace archives containing points, paths, utility, camera presets, and an optional Demo frame reference.

### Demo Analysis

![Demo analysis](assets/readme/analysis.png)

- Select one or more players and overlay movement from every round starting at freeze end.
- Filter analysis by all rounds, T-side rounds, or CT-side rounds.
- Inspect synchronized movement paths and aggregated spatial heatmaps.
- Visualize killer positions, victim positions, target positions, and opposing-player positions at kill time.

### Collaboration

![Collaboration panel](assets/readme/collaboration.png)

- Create or join a six-character Yjs WebSocket room.
- Synchronize tactical points, player markers, utility, paths, the active map, owner archives, and owner camera presets.
- Player markers carry a character model and random name; drag to move, adjust yaw/pitch, toggle crouch/stand, with undo/redo.
- Frames: insert, duplicate, delete, and switch between snapshots; switching smoothly transitions player positions and facing.
- Let room members edit shared tactical content while keeping the current camera private.
- Support owner-controlled room destruction and member leave notifications.
- Use local archives as reusable starting points for collaborative sessions.

### Map Rendering

- Load CS2 NAV data for supported maps (from cloud storage, parsed in the browser) and constrain tactical editing to reachable surfaces.
- Render GLB map geometry loaded from cloud storage with configurable opacity.
- Switch between reachable-surface, mouse-lens, and camera-lens model views.
- Use `three-mesh-bvh` for efficient nearest-wall line-of-sight queries.
- Navigate with Blender-style mouse controls, trackpad gestures, and WASD movement.

### Interface

- Switch the application between English and Chinese at runtime.
- Inspect live T/CT rosters, score, health, active weapons, remaining utility, deaths, and C4 ownership.
- Jump directly to kills, C4 plants, explosions, and round-end events from the timeline.

## Supported Maps

The repository includes NAV files for:

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
| Left drag (round replay / analysis / utility) | Draw a freehand brush stroke on the NAV ground |
| `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` | Undo / redo brush strokes |
| `E` | Place a tactical point (Collaboration panel only) |
| `Ctrl` | Draw a path or adjust point pitch |
| `Q` | Open the utility wheel |
| Left click a point | Open the point editor |
| `Ctrl` + `1-9` | Save a camera preset |
| `1-9` | Restore a camera preset |
| `Space` | Play or pause replay/analysis |
| Arrow keys | Step through the current round |

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

## Roadmap

### Richer Collaboration

- Server-authorized room ownership and persistent rooms.
- Presence, cursors, member lists, permissions, and granular conflict handling.
- Shared utility editing, annotations, review states, and export/import workflows.

### Utility Reference and Personal Menu

- A personal utility library for saved lineups, tags, favorites, and map-specific quick access.
- Searchable utility reference cards with setup, aim point, movement, and result previews.
- Reusable personal presets that can be inserted into local or collaborative boards.

### Map Model Transparency

- Better depth handling for dense and multi-level maps.
- More stable mouse-lens and camera-lens transparency transitions.
- Simplified collision/render meshes, occlusion controls, and improved visual separation between NAV and geometry.

## License and Game Assets

CSBoard is an independent project and is not affiliated with Valve. Counter-Strike, CS2, map names, and related game assets are trademarks or property of their respective owners. This repository does not distribute GLB map models, VPK archives, or Demo files.
