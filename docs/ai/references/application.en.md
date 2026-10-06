# CSBoard application guide

## Operation assistant

**Experimental feature.**

Open or create an archive in Collaboration, expand **Operation assistant**, and configure the service URL, model and API key. The service must support Chat Completions tool calls. Local services can use HTTP on localhost; other services require HTTPS.

Chat can read and edit players, illustrative utility effects, drawn routes, tactical frames, camera views and archive folders, or open the normal archive dialogs. A batch formation is one undo step. Room edits synchronize; chat persists locally in separate sessions. Stopping preserves completed edits.

Sessions can be switched, renamed and imported/exported as JSON. Edit persistent memory or create ordered workflow steps with allowed tools. Archive, frame, panel and board changes are observed locally and supplied on the next request. Views exclude building models and allow focused azimuth/elevation controls; the main camera stays unchanged.

Desktop keys use system encryption. Web keys stay in memory until refresh and requests pass through your backend; configure allowed service base URLs and, for separate hosting, the frontend origin. No API key is included in room data or exports. Current NAV data has no named callouts, so map-location suggestions require review. Drawn routes and manually placed effects are not physics simulations.

For image-capable models, enable **Model supports image input** in settings. The assistant can inspect numbered current, top and focused board views and resolve image pixels into NAV candidates. Leave this off for text-only models: local polygon geometry, heights, connections and relative positions remain available. Screenshots cover only the board, use a temporary camera and are not retained in model history across turns. Image recognition and imported geometry do not validate CS2 cover, line of sight or utility coverage.

## Highlights

### Round Replay



- Import one Demo or select multiple Demo parts and merge them into one match.
- Parse playable rounds once and switch rounds from cache: The Go parser builds replay and analysis data; rounds are cached in IndexedDB or SQLite plus compressed files.
- Omit empty placeholder rounds and discard incompatible cached parses automatically.
- Replay from freeze end with player movement, kills, deaths, weapons, health, utility, C4 state, and event markers.
- Display simplified standing and crouching player models with yaw, pitch, dynamic eye height, and BVH-accelerated line-of-sight collision.
- Track C4 carriers, drops, plants, explosions, defuses, approximate drop trajectories, and the bomb timer.
- Save the current frame and convert live players and active utility into editable tactical-board objects.
- Switch to a same-team monitor wall with a selectable main POV; fallen teammates show a blacked-out view.
- Save a named time interval as a View Broadcast clip.

### View Broadcast

- Play one saved Demo interval without match-only score, kill-feed, or round controls; retain monitor mode, model settings, and clickable utility saving.
- Selecting a clip opens a six-character room. Guests see full-screen transfer progress and receive a local archive before playback starts.
- Keep Broadcast and Round Replay playback positions, cameras, and selected POVs separate when switching pages.

### Tactical Editing



- Place T or CT tactical points directly on surfaces (Collaboration panel only).
- Draw freehand brush strokes on the ground in round replay / analysis / utility panels, with undo/redo.
- Edit point team, symbol type, direction, aim length, and vertical angle.
- Place and adjust smoke, fire, flash, HE, and decoy effects.
- Open the custom utility wheel from any desktop workspace and delete placed utility with `Ctrl`/`Cmd` + click.
- Store ten camera presets per map and restore them with `1-9` / `0`.
- Save local workspace archives containing player markers, utility, brushes, camera presets, and an optional Demo frame reference.
- Organize local archives in a draggable folder tree; folder deletion moves entries to the parent.

### Utility Notes



- Save map-specific utility setups from pasted `getpos` output or Demo throws.
- Search and replay saved lineups with setup positions, view angles, thrower details, events, and projectile paths.
- Edit utility titles and descriptions without rebuilding the record.
- Export the utility library as JSON and append imported JSON records to the local library.
- Deduplicate records by complete deep equality during import; identical records are retained only once.
- Import a saved utility into a collaboration frame only after selecting it and confirming the action. Imported utility and custom `Q`-wheel utility remain separate data types.
- Sort saved setups into draggable folders independently of Collaboration and View Broadcast archives.

### Demo Analysis



- Lazily load Analysis payloads, aggregated players, and per-round utility trajectories only after opening the Analysis page. Search and select multiple players through prefix, substring, or ordered-character fuzzy matching, with removable colored chips and an explicit loading state.
- Select recent or specific parsed Demos available to any selected player, then filter rounds by T/CT side and each player's own/opponent economy classes.
- Switch between Area Time, KD Events, and Utility Events while keeping shared path playback, timeline scrubbing, and stepping controls.
- Combine Early, Mid, and Post-plant Area Time phases. The Early/Mid boundary defaults to 30 seconds after freeze end and can be adjusted from 10 to 90 seconds.
- Inspect killer, victim, target, and opposing-player locations for KD events.
- Filter Utility Events by smoke, flash, fire, HE, and decoy. Position mode renders distinct throw markers, colored landing markers, and full trajectories; heatmap mode counts landings only.
- Keep nearby utility landings separate while choosing them from a hover list, then click a landing to save the complete throw to Utility Notes.
- Sample heatmaps by NAV height to prevent cross-floor bleeding and adjust planar spread from 2 to 24 metres. Expensive heat recomputation occurs only after releasing the slider.

### Collaboration



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

## Current Limitations

- Node.js Runtime rooms are held in process memory. Cloudflare Workers rooms use Durable Object storage and are deleted five minutes after the final client disconnects.
- Room ownership is currently client-managed rather than protected by a server-issued owner token.
- The parser does not expose per-Tick C4 entity coordinates, so dropped-C4 motion is approximated between events.
- Remote web builds use cloud storage for GLB models; local/Docker builds use local models. Electron releases require user-imported models; only local-test builds include local models. Bundled NAV geometry and 2D radar remain available offline.
- Large Demo files can require significant memory because all round snapshots are cached after the initial parse.
- Round Replay and Demo Analysis require a desktop-sized interface (including desktop web browsers); H5 exposes Utility Notes and Collaboration.

## Desktop performance and storage

Desktop parsing automatically uses the full logical-core budget, shared across concurrent Demos, without waiting for an estimated memory budget. Entity, event and smoke/fire processing remains sequential. Desktop → Storage & backups includes the realtime analysis toggle; cached analysis is used by default.

Desktop → Storage & backups shows database, cache and resource usage, supports manual least-recently-used cache cleanup, and creates verified backup folders. Restore replaces native data and imported resources on restart while retaining the previous directories. Original Demo files, browser preferences and unsaved work are not included. Background tasks are bounded and cancellable; automatic sleep prevention is optional for the current session.
