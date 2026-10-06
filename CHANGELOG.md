# Changelog

[中文](docs/CHANGELOG.zh-CN.md) · [Русский](docs/CHANGELOG.ru-RU.md)

## [1.20.6] - 2026-10-06

### Changed

- Reduce imported map rendering overhead and memory use; improve multi-view monitor playback and avoid redrawing unchanged paused views.
- Automatically use the full logical-core budget for desktop parsing, shared across Demos; remove adjustable performance modes and memory-budget waiting.
- Move the realtime analysis toggle to Storage & backups while preserving existing settings.

### Fixed

- Clear outdated monitor images after seeking or changing rounds, and refresh views when visibility, animated effects or weapon models change.
- Keep player aim lines and collision results consistent when the map model moves.
- Show the foreground parsing reminder only in the browser.

## [1.20.5] - 2026-10-06

### Added

- Browse imported map objects in a searchable tree grouped by name; show or hide individual objects or whole branches, with changes applied immediately and saved.

### Fixed

- Prevent imported game lights from making map models excessively bright.
- Restore foliage and awning colors while preserving their original textures and material tints.

## [1.20.4] - 2026-10-05

### Added

- Show the current Demo filename at the bottom centre of the 3D view, clear of player status panels.
- Remove individual imported map models and interface icons from the resource library, with a reload reminder.

### Fixed

- Improve Demo voice playback continuity and reduce gaps between voice segments.
- Reduce overly bright world models while preserving material detail.

## [1.20.3] - 2026-10-05

### Added

- Switch imported maps between a simple model and original materials, while keeping visibility and transparency controls.
- Play recorded Demo voices, with speaker indicators, mute enabled by default and a separate voice volume control.
- Adjust desktop interface text size from 80% to 150%, with automatic saving and a default reset.
- Replay freeze time before a round; start at freeze end by default and seek backward to inspect preparation and purchases.

### Changed

- Compact the top toolbar with a GitHub icon, a single-character Chinese language button and a vertical voice volume slider.
- Reduce held weapon thickness for clearer player models.
- Recommend restarting after resource imports to apply new models and icons.

### Fixed

- Recognize additional weapon, grenade and team-logo names when importing game resources.
- Keep replay state when switching maps and stop previous-round utility effects from appearing during freeze time.

## [1.20.2] - 2026-10-05

### Added

- Show weapon silhouettes with depth on player models, including first-person replay views.
- Check for desktop updates and download verified installers with progress and cancellation; launch installation on Windows or open the update disk image on macOS.
- Import map models and supported interface icons from local CS2 game resources on Windows and macOS, with automatic Steam library detection, directory selection, space estimates and cancellable progress.

### Changed

- Let Windows users choose the installation directory and whether to install for themselves or all users.
- Rename the download shortcut to “Download desktop app”.

### Fixed

- Keep expanded round selection menus inside the workspace.

## [1.20.1] - 2026-10-05

### Added

- Show recorded utility inputs, or clearly label action-based reconstruction when input data is unavailable; allow older notes to update from their source Demo.
- Hide location descriptions in the Utility Notes list while retaining starting-area details.
- Integrate utility playback and seeking into the bottom toolbar, with toggles for a map-wide overview of all saved trajectories and recorded utility effects.
- Show realistic direction keys, a Space key for jumping, and mouse buttons during utility playback, including complete run-up and jump-throw preparations from the last stationary aiming position.
- Rename Round Replay to Match Replay and merge custom recordings into its library; continue parsing non-standard Demos as custom recordings and show a Custom DEMO label.

### Changed

- Unify sidebar appearance and spacing across menus, including Camera Broadcast, with consistent collapse controls and workspace sizing.
- Move Utility Notes actions beside the folder controls, freeing the former right sidebar for the 3D view; separate playback and display settings into two bottom rows.

### Fixed

- Keep the operation assistant and viewport status controls anchored correctly when sidebars or bottom controls change.
- Fix non-standard Demo continuation progress and completion counts, anchor the Custom DEMO label to the viewport bottom-left, keep collapsed drawing controls on one row, and distinguish workspace tabs from settings buttons.
- Keep utility actions only until release, reveal flight trajectories progressively, and show brief forward-jump motion with direction arrows instead of WASD.
- Fix map/list overlap, toolbar alignment and popup offsets; hide weapon and inventory displays for dead players.
- Fix overlapping broadcast playback controls, missing map-control padding, replay players appearing in other menus, duplicate players when seeking, and utility trajectories incorrectly covered by the ground.

## [1.20.0] - 2026-10-04

### Added

- Add Custom recordings for practice and record/stop clips with varying player counts or incomplete rounds; open non-standard Demos from failed parsing tasks, with an independent library and playback position.

### Changed

- Preview representative smokes using their recorded voxel shapes, show loading while reading them, and report missing data instead of substituting a generic smoke.
- Reuse loaded utility records for preview and saving, and discard outdated loading results when changing recordings or selections.
- Improve application preference storage and migration while preserving existing settings.

### Fixed

- Fix recorded clip validation, missing map names and shared bot identities that could merge multiple players.

## [1.19.3] - 2026-10-03

### Changed

- Make the parsing list collapsible, add localized details with a JSON view, and let failed Demos be retried individually.
- Reuse versioned analysis caches by default on desktop, with an optional realtime mode; recommend throws occurring at least four times using endpoint heights, trajectories and flight times, with counts, frequency scores, spotlight previews, group focus and one-click saving.
- Add a latest-version download shortcut that opens the GitHub release page.

## [1.19.2] - 2026-10-03

### Changed

- Show loading and empty-result diagnostics in data analysis, and load individual utility replays on demand to reduce display delays.

## [1.19.1] - 2026-10-03

### Changed

- Show estimated progress during Demo preparation, sort batch tasks by progress, and refresh parsed Demos as each result is saved.
- Release parsing resources before final cache writes to help queued Demos start sooner.
- Adapt the mobile workspace to the on-screen keyboard, keep the 3D view aligned when panels resize, and reduce rendering load on high-density screens.
- Pause map rendering while selecting Demo files in the mobile app to reduce competition with the system file picker.

### Fixed

- Keep Demo parsing running when a player entity lacks view-angle data.
- Fix oversized camera buttons and drawing controls in the desktop toolbar on touch-capable computers.

## [1.19.0] - 2026-10-03

### Added

- Add Android and iOS development previews with a landscape workspace, native Demo parsing and local archive, note and Demo storage. Physical-device validation is still pending.
- Add touch controls for player movement, aim and pitch; retain mouse, keyboard and trackpad support on phones and tablets.

### Changed

- Mobile view settings now share one panel. Map and camera controls expand on demand, with touch-friendly camera saving and a simpler workspace before importing a Demo.
- Use landscape layouts with collapsible sidebars, larger touch targets and scrollable lists on mobile devices. Portrait mode shows a rotation prompt and pauses map rendering.
- Keep mobile H5 focused on Utility Notes and Collaboration, without Demo import, Round Replay, Analysis or Broadcast; connecting a mouse does not change the available features.
- Support one-finger editing and camera rotation, with two-finger zoom and pan. Switching to camera gestures preserves completed edits for undo.
- Cancel native mobile parsing when the app enters the background and clean up temporary Demo files after import or cancellation.

### Fixed

- Fix the iOS workspace failing to load at startup.
- Prevent long-press selection of mobile controls and accidental drawing while rotating the map; touch drawing now requires an explicit mode.

## [1.18.1] - 2026-10-02

### Fixed

- Reduce delays when selecting players in Demo Analysis and keep player search available while results update.
- Load utility replay data only when needed, reduce repeated calculations and combine rapid selection changes.

## [1.18.0] - 2026-10-01

### Added

- Add an experimental operation assistant that reads and edits players, recorded utilities, schematic effects, lines, frames and archives, and manages collaboration actions. Edits support undo and room synchronization; destructive actions require confirmation.
- Add persistent sessions with editable memory, application context, switching and JSON import/export. Arrange ordered workflows with per-step tool permissions.
- Add configurable automatic context compression with a 60,000-character default. Save summaries while retaining original conversations for retrieval.
- Let image-capable models inspect numbered current, top and custom focused views of NAV ground and resolve image pixels into location candidates. Text-only models can inspect polygons, floor heights, connections and relative positions.
- Add common AI provider presets and custom service settings. Let the assistant read bundled application and resource guides by language, section and page.

### Changed

- Improve chat formatting, copying, collapsible activity, keyboard controls, panel sizing and history scrolling. Localize tool names; reveal technical IDs on hover or focus.

### Fixed

- Fix assistant session saving failing on valid record names.
- Handle long streamed replies without counting repeated transmission metadata toward content limits. Preserve provider reasoning across tool requests, improve argument compatibility and show specific service errors.
- Reduce repeated location searches and unchanged reads; stop loops without progress. Cancellation, declined actions and pending user input stop subsequent edits while preserving completed work.
- Align player position reads and writes and explain invalid arguments. Improve NAV region queries, incomplete-place and empty-library diagnostics, schematic-effect reporting and operation outcomes; clarify frame creation/copying and protect the confirmed deletion target.

## [1.17.0] - 2026-09-30

### Changed

- Use the pinned `dlwm/demoinfocs` fork for Demo parsing, with one Go adapter producing native and WASM components. Source builds prepare the fork automatically; applications include the compiled parser.
- Combine replay, analysis and pre-throw position samples into one decoding pass per Demo part. Retain real smoke journals and fire cells, read only appended smoke bytes, and refresh incompatible parser caches.
- Replace SQLite storage with Go, retaining the existing database format, compressed caches, backups and restore behavior.
- Move HTTP parsing and offline analysis tools to Go WASM. Release HTTP source sessions after each request; identify grenade-release event sources and retain unknown velocity values in offline reports.
- Remove Rust/Cargo requirements, the previous parser artifacts and patches, and the native npm parser dependency. Update builds, installer checks, GitHub Actions and Docker to use Go.

### Fixed

- Restore Source 2 user-command baselines from checkpoints without duplicate input events or stale-state rollback.
- Read macOS available memory from both observed `vm_stat` page-size header formats so parsing does not remain queued because of a missing memory sample.

## [1.16.2] - 2026-09-28

### Fixed

- Keep upstream parser sources and patch files in LF format on Windows so the native build applies both patches consistently.
- Resolve ASAR entries with platform-native separators when checking Windows installers, then normalize the file list before inspecting packaged resources.

## [1.16.0] - 2026-09-28

### Added

- Add a native desktop backend: an independent Rust executable parses Demos, while SQLite and compressed files store archives and Demo caches outside browser storage quotas. Keep Electron, Three.js and Yjs for the interface, rendering and collaboration; Web continues to use WASM and IndexedDB through shared platform interfaces.
- Add concurrent Demo parsing and native multithreaded tick sampling, with Balanced (default), Fast and Custom performance modes. Allocate a shared CPU budget and admit tasks according to available memory, input size and observed usage; allow custom Demo concurrency, thread limits and memory budgets.
- Add Desktop Manager for task progress, cancellation, thread and memory diagnostics, storage usage, manual cache cleanup, verified backups and restore on restart. Restore retains the previous data; optional sleep prevention applies while tasks run in the current session.
- Migrate legacy IndexedDB archives and Demo caches into native storage without removing the old database or overwriting newer native records.

### Changed

- Reduce repeated decoding by skipping full-packet segments outside requested ticks, reuse the parser Huffman table, and remove extra copies of large JSON payloads. Preserve sequential parsing for events, smoke/fire journals, button state and properties that cannot safely be split.
- Move analysis, large import/export serialization and broadcast payload processing into desktop utility processes. Use files and streamed cache reads to reduce large transfers through the Electron main process; inspect cached Demos through compact summaries.
- Pause 3D rendering when the desktop window is hidden or minimized while native parsing continues. Advance playback by elapsed time so delayed callbacks do not slow its clock.
- Redesign resource-pack management around resource categories, completeness and per-file import results. Unify the CSBoard application name and icon assets; packaged macOS launches use the CSBoard application identity.
- Add GitHub Actions checks and three-target installer automation with version validation, packaged-storage checks, SHA-256 checksums and draft Releases. Replace source-string assertions with behavioral, native-storage and publishing-contract tests; missing native prerequisites now fail explicitly.
- Limit release installers to macOS Apple Silicon, Intel Mac and Windows amd64, with explicit architecture-specific commands and filenames. Consolidate duplicate npm/Make commands; local-model testing is now `desktop:prepare -- --local-models`.
- Separate Web, desktop renderer and background-task outputs, and share parser/data contracts through platform adapters. `desktop:prepare` builds the application; `desktop:start` opens the existing package; `desktop:dev` retains the Electron development runtime. Desktop source builds require Rust/Cargo and a C toolchain; installed applications include the native component.

### Removed

- Remove the current AI guide, model-access integration and WebMCP registration pending a future redesign. Data analysis and export remain available.

### Fixed

- Preserve cross-segment button state in native parsing; keep smoke/fire output ordering and typed-array storage compatible with existing playback.
- Handle queued/running task cancellation, reject duplicate Demo jobs and recover storage connections after native-process failure. Publish rebuilt macOS native executables by atomic replacement to avoid stale executable-signature cache failures.

### Validation and limits

- On an Apple M4 with 16 GB RAM at 8 Hz, complete native parsing of a 299 MB Nuke Demo improved from 39.3 s to 15.0 s and a 282 MB Inferno Demo from 45.2 s to 16.3 s. Two Demos sharing a four-thread budget took 18.2 s sequentially and 10.3 s concurrently in Electron. These sample measurements include several optimizations and are not universal speed guarantees.
- Full outputs from three Demos matched the serial baseline within floating-point tolerance; 87 behavioral/integration tests (zero skipped) and isolated desktop checks passed. Memory budgets control task admission, not hard process limits. Intel Mac/Windows runtime validation and signed/notarized release packages remain outstanding.

## [1.15.1] - 2026-09-23

### Fixed

- Size the camera zoom limit and far clipping plane from bundled NAV data while the GLB model is still downloading, so large maps are not constrained by the temporary default camera range.

## [1.15.0] - 2026-09-22

### Added

- Add a same-team monitor view to Round Replay and View Broadcast: select the main POV, switch teams, watch other teammates in a right-hand column with smaller crosshairs, and distinguish dead views with a black overlay and diagonal cross.
- Add View Broadcast archives. Save one named interval from Round Replay, select it to open a room, and let guests download the clip with full-screen progress before it is saved locally. Broadcast playback keeps its own Demo, timeline, camera, monitor, and model controls rather than leaking state into Round Replay; it omits match-only HUD elements.
- Add independent draggable folder trees for Collaboration archives, View Broadcast clips, and Utility Notes. Saving can target a folder; Root is fixed, duplicate names are allowed, and deleting a folder moves its contents upward without deleting archives.
- Allow an optional local SVG icon pack in Cloudflare Worker frontend builds. Missing icons retain the built-in UI; map models remain external and are not included in the pack.

### Changed

- Render replay smoke as one denser, soft-edged volume instead of visibly separate spheres, and retain its recorded shape when saving or importing utility.
- Add a temporary HE-cleared opening to replay smoke, expanding from the recorded blast point and refilling over time. Obvious wall occlusion blocks the effect; Broadcast clips retain a recent HE when playback starts during the opening. The visual radius is an approximation, not a published game constant.
- Keep the View Broadcast bottom bar within the center canvas column. Model controls occupy the left portion and playback the right; narrow desktop windows open model options from a compact button.
- Make running trails shorter, smaller, and less opaque. Emit puffs only for sustained forward displacement, so short back-and-forth movements or sparse/missing coordinates do not accumulate a cloud.
- Resolve kill-feed weapon icons from the longest recognized weapon-name prefix, including Demo variants such as `usp_silencer_txz09` and `glock_vip`, while keeping the original event name available for inspection.

## [1.14.1] - 2026-09-15

### Added

- Desktop version supports importing UI and map resources.

## [1.14.0] - 2026-09-14

### Added

- Add desktop resource packs with native multi-file SVG/GLB import, per-file results, a completeness checklist, validated replacement, and persistent disk storage. Missing icons retain defaults; missing models use NAV without model controls or automatic OSS downloads. Reload explicitly to apply imported resources. Release packages exclude map models; a separate local-test packaging command may include them.
- Add single-round model analysis for an exact selected Demo: full-team positioning timelines, combat/bomb events, utility records, optional trajectories, paginated JSON, data-coverage diagnostics, and prompts that distinguish observations from hypotheses about intent, rotations, and fakes. Queries retain original Demo ticks and do not alter playback.

### Changed

- Generate offline 2D radar views from bundled NAV geometry instead of static radar images. Share square bounds, padding, and floor cuts with radar markers; correct stretched layouts and Train floor selection. Higher NAV areas appear lighter within each floor, and higher surfaces render over lower ones.
- Smooth the 3D NAV surface through shared vertices, normals, and height colors; remove NAV edge rendering and its toggle.
- Refresh weapon, knife, grenade, C4, defuser, faction, armor, and HUD silhouettes. Use a hollow shield for armor and a central circle for helmet-plus-armor; improve equipment and utility-reserve icon sizing.
- Replace separate map emblems with larger, localized, map-colored name labels. Use chess-pawn player markers with distinct crouched poses; keep equipment and aim-ray heights synchronized in replay and Collaboration.
- Update documentation and licensing scope; distribute third-party notices alongside the GPL license in web and desktop builds.

### Acknowledgements

- Thanks to React, Three.js, three-mesh-bvh, LaihoE/demoparser (including the Rust/WASM parser), Yjs, y-websocket, y-protocols, lib0, ws, Electron, Vite, electron-builder, Wrangler, Fontsource, and the Space Grotesk / DM Mono font authors. Third-party terms and notices are listed in THIRD_PARTY_NOTICES.md; their licenses remain unchanged.

## [1.13.1] - 2026-09-09

### Added

- Add a Russian README and Changelog, connect all three documentation languages with direct navigation, repair stale documentation links and image paths, and make the offline Changelog dialog follow the Russian interface language.

### Fixed

- Always include non-projectile grenade entities while parsing Demo utilities, so HLTV matches retain their recorded `CInferno` cells even when a normal `grenade_thrown` event already exists. Parser-side state deduplication keeps the additional rows bounded; the Demo cache schema is advanced so affected sources are reparsed once instead of continuing to show the small fallback fire.
- Move Collaboration workspace archives from quota-constrained `localStorage` to IndexedDB, serialize nearby writes in user-action order, and migrate existing archives before deleting the legacy copy. Demo frames containing trajectories, smoke voxels, and fire cells can now be saved without prematurely reporting that browser storage is full.
- Move Utility Notes, including their recorded trajectories, smoke voxels, and fire cells, to the same IndexedDB-backed local data store with ordered writes and safe legacy migration. Remove the unused large room-snapshot write and clean up its stale keys, while keeping genuinely small synchronous preferences in `localStorage`.
- Restore the parsing mini-game lifecycle after the batch-parser migration: batches still running after three seconds open the game overlay automatically, completed or cached batches cancel it cleanly, and a user's dismissal remains respected for the current batch.
- Bundle Space Grotesk and DM Mono with the frontend instead of depending on Google Fonts at runtime, and route every UI/data font declaration through cross-platform stacks. Windows now falls back explicitly to Segoe UI, Microsoft YaHei UI, Cascadia Mono, or Consolas for unsupported Chinese and Cyrillic glyphs instead of legacy generic fonts.

## [1.13.0] - 2026-09-08

### Added

- Bundle local GLB map models into Electron packages as streamable external resources. Desktop builds load each packaged model first and fall back per file to the configured OSS origin when the bundled copy is missing or invalid.
- Replay Molotov and incendiary fire from the Demo's authoritative `CInferno` cells instead of estimating its footprint from connected NAV areas. A strengthened cumulative metaball tension field joins neighboring cells into one irregular, single-color surface, fills enclosed no-fire holes without leaving internal seams, and leaves transparency softness only on the outer edge before projecting onto the nearest same-floor NAV geometry. This avoids both the bead-like cell appearance and vertical flame/model intersections while following ramps and height transitions. Fire frames are stored only when their state changes, fall back to the existing NAV effect for legacy data, and remain available in saved throws and Collaboration frames.
- Open a formatted, scrollable, fully offline Changelog dialog by clicking the build version beside the CSBoard brand; select the bundled Chinese or English document from the active interface language.

### Fixed

- Give Q-wheel fire a deterministic smoke-like default range using the same merged, single-color NAV projection as recorded fire. Remove the legacy connected-NAV patches, layered flame circles, and pulse rings; range dragging uses a lightweight preview scale, then rebuilds the footprint against the newly covered NAV surface on release.
- Restore saving projected fire from Round Replay by associating the post-impact `CInferno` entity with its projectile segment through the shared `inferno_startburn` landing event; anchor the save action at the clicked fire-surface point rather than the projection group's scene origin.
- Prevent large Demos from exhausting the browser's 4 GiB WASM memory limit while decoding utilities: deduplicate persistent `CInferno` arrays inside the parser before column/AoS allocation, and emit held-grenade state only when a valid throw time changes. This preserves every real fire cell and throw sample while removing millions of redundant rows.

## [1.12.0] - 2026-09-07

### Added

- Preview the complete trajectory and landing effect when hovering or keyboard-focusing an entry in Utility Notes, focus the camera on that landing effect, and restore the previous camera after leaving the list. Legacy manual notes without landing data fall back to their saved throw position.
- Replay utilities contained in the destination Collaboration frame when switching frames: trajectories advance from their throw positions using the recorded tick timing and irregular sample intervals, effects appear at their recorded detonation ticks, smoke grows for its recorded post-detonation interval, and the completed target-frame state remains visible. Ordinary panel/archive restoration stays static.
- Enter the corresponding player's saved first-person eye position and aim direction when hovering a Collaboration player-list entry, temporarily using a first-person field of view and hiding that player's own model; restore the previous camera when the pointer leaves the list.
- Preserve active Demo utilities as anonymous Collaboration utility entries when saving a round frame, including their trajectories and recorded smoke voxel shape. Hovering an anonymous entry focuses its existing scene effect, temporarily switches visualization to a 20% camera lens, and orbits the effect at a constant speed; leaving the list restores the prior camera and visualization settings. Anonymous entries can be deleted or saved beside the delete action; saving requires a title and throw description, adds the completed entry to Utility Notes, and promotes it to a regular imported utility.
- Add an explicit save action beside every Collaboration archive: it confirms before overwriting the selected archive, while the button at the bottom of the archive list always creates a new archive.
- Preview saved utilities directly from Collaboration's import list: hovering an option temporarily renders its effect and trajectory while smoothly focusing the camera on its landing point; only confirmation adds it to the tactical frame.
- Add downloader-style batch Demo parsing: unrelated files become independent jobs, numbered parts remain grouped, capable desktop devices run two parsers in parallel while constrained devices process sequentially, and completion reports success/failure counts without auto-playing a match. Development builds can expand each job's source, parser, cache, environment, timing, match summary, warnings, and error diagnostics for tracing.
- Replay recorded CS2 smoke shapes from each smoke projectile's networked voxel seed. The bundled parser now preserves and incrementally emits the voxel journal, while the 3D board renders its environment-aware occupancy without depending on a GLB map model. Each recorded occupancy voxel contributes exactly one correctly spaced density source; three stronger relaxation passes close gaps before marching cubes extracts one continuous irregular outer shell. The shell is opaque, front-face-only, and softly lit so internal and rear contours cannot overlap while its coverage remains legible. Newly saved Demo/Analysis throws retain their matching smoke voxel frames, while older notes, manual utilities, and previews use the same shell renderer with a deterministic fallback volume instead of separate spheres. The complete volume is uniformly displayed at 1.1× scale, preserving the proportions between cell size, spacing, and silhouette. The visually verified coordinate mapping converts decoded A/B/C to scene +B/+A/+C.

### Fixed

- Simplify Round Replay death positions to a clear ground-level X marker without the surrounding ring.
- Compact anonymous Demo utility storage by keeping trajectory samples and the final smoke voxel frame only once instead of duplicating the full smoke journal inside embedded note metadata; existing anonymous archives are compacted on their next save. Reconstruct the portable note only when the user completes it, and keep the item anonymous if the Utility Notes write fails.
- Keep Collaboration drawing authorization synchronized with the active tactical frame on every render, restoring left-drag ground drawing after panel/frame transitions and cleanly releasing camera controls when a stroke ends.
- Keep saved-throw smoke expansion and editable collaboration smoke ranges at the calibrated 1.1× proportion, and preserve the latest recorded voxel frame when a smoke note is imported into Collaboration so its deformation is not replaced by a generic volume.
- Fix missing runtime dependencies exposed by the entry-point and Three.js board refactor, including Analysis grenade-segment construction and point-selection callbacks.
- Ignore placeholder or partially initialized scene materials when installing floor-fade shaders, preventing the animation loop from repeatedly failing on imported objects.
- Fix Source 2 entity handles above index 2047 in the bundled Demo parser by using the full 14-bit index, restoring missing player coordinates, state, equipment ownership, and event associations; retain the controller fallback and explicit warning for genuinely unavailable pawn data.
- Warn during Demo parsing that switching tabs, minimizing the browser, or locking the screen can significantly slow background-page processing; show the reminder beside both the progress bar and parsing mini games.

## [1.11.0] - 2026-09-06

### Added

- Add Russian interface localization across the main workspace, Demo analysis, tutorial, parser settings, camera controls, round results, and parsing side games, with persisted three-language switching and locale-aware dates.
- Allow selecting multiple Analysis players through a searchable chip picker. Player names, paths, per-player round economy, KD events, utility events, area-time heat, Demo availability, and the shared timeline now aggregate correctly across the selection.

### Changed

- Index player names once per loaded Demo, defer expensive dataset rebuilding during selection updates, group multi-player area calculations by player-round, and reuse selected Demo filters when players are added or removed.
- Bundle parsed NAV data for all supported maps into the frontend, removing the runtime NAV download and legacy parsing API dependency while preserving offline map geometry.
- Add an offline region-data generation pipeline that preserves `env_cs_place` height bounds and associates each region with bundled NAV areas.
- Make the Docker service read local GLB models from a read-only mount without downloading resources at startup.
- Temporarily hide T/CT spawn and bombsite zone models while a clearer replacement visualization is designed.

### Fixed

- Fix Docker builds so the supplied v1.11.0 build version reaches Vite even when `.git` is excluded from the build context.
- Fix map switches mounting the new GLB with the previous map's bundled NAV data when both NAV files share the same format version.
- Anchor Anubis's default 3D orbit height to its highest playable NAV surface so non-playable bottom geometry cannot displace it.
- Remove the duplicate generic crosshair from Demo first-person playback while retaining its animated POV HUD crosshair.
- Align the remaining Demo POV crosshair to the actual 3D viewport instead of the taller stage that also contains bottom controls.
- Freeze a utility's first-person camera at the release view for 0.3 seconds, then cut to a projectile chase camera without following the thrower's post-release movement; restore the original map view after detonation.
- Preserve the model perspective range in saved camera positions and make 0% disable the perspective opening completely.
- Let five-die Farkle straights score together with a sixth scoring 1 or 5, and make Reaction Test measure the response on press instead of release.
- Allow Analysis utility records to be opened and saved from either throw or landing markers; hovering a nearby-list entry now highlights its exact trajectory.
- Make the Analysis nearby-utility list smaller and translucent, and close it immediately after the pointer leaves the entered list.
- Make the language-switch button identify the active Chinese, English, or Russian locale while its tooltip announces the next locale.

## [1.10.0] - 2026-09-06

### Fixed

- Fix truncated synthesized utility trajectories when per-tick projectile data is unavailable and the original geometry buffer is too small.
- Fix a runtime crash in the radar overview caused by reading `radarSourceBounds` after NAV-boundary logic had moved it out of scope.

### Added

- Add Docker build support.

## [1.9.0] - 2026-09-05

### Added

- Add Utility Events to Demo Analysis with smoke, flash, fire, HE, and decoy filters. Position mode shows distinct throw markers, colored landing markers, and full trajectories; heatmap mode aggregates landing points only.
- Save complete utility throws directly from Analysis landing markers. Nearby markers remain separate but expose a hover selection list so overlapping points stay reachable.
- Split Area Time into combinable Early, Mid, and Post-plant phases. A gear control adjusts the Early/Mid boundary from 10 to 90 seconds.
- Add a 2–24 metre planar heat-spread slider. Dragging previews the value and heat textures are recomputed only after release.
- Add dynamic top and bottom gradient masks to the main vertically scrollable panels and lists, shown only while more content remains in that direction.
- Explain in the bilingual tutorial prompt that development builds repeat the reminder every third visit.

### Changed

- Render heatmaps through a 64-height-slice texture atlas sampled by NAV surface height, preventing upper-floor events from bleeding onto lower floors.
- Defer Analysis payload, player aggregation, and per-round utility trajectory loading until the Analysis page is opened. Reuse loaded results until the map or Demo cache changes.
- Replace the player select with a searchable picker supporting prefix, substring, and ordered-character fuzzy matching, including an explicit loading state.
- Keep the KD path-time timeline available across every analysis type so Area, KD, and Utility views share playback and stepping controls.
- Preserve the actual trajectory-end height for smoke, flash, HE, and decoy Analysis markers instead of forcing airbursts onto the nearest ground. Fire remains ground-aligned.

### Fixed

- Fix Analysis playback when it uses only IndexedDB analysis caches and no current Demo is open.
- Prefer the NAV intersection closest to an event's height instead of the highest surface when matching points on multi-level maps.

## [1.8.0] - 2026-09-05

### Added

- Let Demo Analysis select data from multiple parsed Demos on the same map and aggregate rounds for a player across those Demos.
- Add economy-matchup filters that independently combine the selected player's and opposing side's ECO, SEMI, FULL, and other economy states.
- Add Heatmap and Position display modes for switching between aggregated density and individual event markers.
- Add Area Time analysis, generating spatial heat from how long a player remains in each area.

## [1.7.1] - 2026-09-05

### Added

- Show T/CT spawn areas and A/B bomb-plant zones on supported maps.

## [1.7.0] - 2026-09-04

### Added

- While layer selection is active, use an axis-aligned square covering the map extent instead of following the NAV outline; geometry starts fading 50 game units outside the square and finishes over the next 20 units. Rename the single-floor control from “Playable Layer” to “Layer”.
- Prevent localized floor, model-mode, and toolbar button labels from wrapping; the single-map Layer control now spans the full floor-control width.
- Localize the bottom-bar Grid and Trackpad controls, map-floor badge, mobile Reset action, and CSS-generated Display, Camera, and Side Switch labels.
- Move Reset View below the layer controls, remove the Area Edges and Reachable Surface options, and make Camera Lens the default model view.

## [1.6.0] - 2026-09-04

### Added

- Replace floor fading with binary NAV-derived bottom/top ranges: multi-floor maps clip each floor independently, while every other map can toggle a playable-layer clip to hide rooftop geometry.
- Keep the native cursor during `Shift` + middle-mouse panning, then switch to pointer lock and a virtual cursor at the viewport edge for Blender-style continuous wrapping.
- Replace the static team label in the Collaboration player list with explicit `T` / `CT` controls that do not conflict with player movement, aiming, or crouching gestures.

## [1.5.0] - 2026-09-03

### Added

- Automatically load bundled utility notes and Collaboration archives on first use without replacing existing local data.
- Add a NAV ground visibility switch to independently show or hide the navigation-mesh fill.
- Add a self-contained minimalist Training Ground with lower streets, linked rooftops, connecting ramps, a subdivided two-level NAV layout, a practice frame, and a bilingual walkthrough covering utility, camera positions, tactical frames, archives, and collaboration.
- Limit Training Ground to Utility Notes and Collaboration, automatically returning to Dust II when opening Round Replay or Analysis.
- Prompt first-time visitors before opening the Collaboration tutorial, repeat the prompt every third local load for testing, and add synchronized upper/lower 2D radar images for Training Ground.
- Render translucent CS map models with MSAA alpha-to-coverage and depth writes, reducing both overlapping-face sorting flicker and alpha-hash noise.
- Set the default map-model opacity to 90%.
- Remove the status dot from the NAV switch and localize all model and map-control labels in Chinese and English.
- Localize every map name, including the established Chinese names for Inferno, Mirage, Dust II, and the other supported maps.
- Add synchronized upper/lower 3D floor filtering for Train around its official radar altitude boundary of `-50` units.
- Fix the ghost material incorrectly clipping a map-center square through every height while the NAV distance field is disabled.

## [1.4.0] - 2026-09-02

### Added

- Add synchronized 2D-radar and 3D-model floor views for Nuke and Vertigo, switchable from either the radar preview or the `UP` / `LOW` camera-bar controls, with an option to restore the full map.
- Fade map geometry, players, utility, projectile paths, landing effects, and movement trails by floor while preserving cross-floor path continuity around the boundary.
- Ignore hidden floors for manual drawing, erasing, player dragging, utility placement, and object selection while retaining full-map line-of-sight and wall collision.

### Changed

- Compact and raise the desktop camera bar to add joined floor controls below the ten camera presets.
- Use independent Nuke thresholds of `Z = -520` for the upper floor and `Z = -500` for the lower floor; Vertigo currently uses `Z = 11700`.

### Fixed

- Raise the parsed-Demo list and its parent stacking context so the popup is no longer hidden behind the 3D viewport.

## [1.3.3] - 2026-08-31

### Fixed

- Ignore zero-duration placeholder rounds before the first playable Demo round, renumber playable rounds, and invalidate stale schema-23 caches.
- Recognize C4 weapon-name variants such as `C4 Explosive` in roster weapon icons.
- Move the optional Demo-map switch prompt into the replay controls after the map-title overlay was removed.

## [1.3.2] - 2026-08-31

### Fixed

- Preserve Git build versions across subsequent Vite builds by reading `.build-version` from `vite.config.js`.

## [1.3.1] - 2026-08-31

### Added

- Resolve Make build versions from exact Git tags or `git describe` and show the result beside the CSBoard brand.
- Confirm dirty or untagged interactive builds while allowing non-interactive builds to continue automatically.
- Propagate build versions through frontend, Node.js, Workers development, validation, and deployment targets.

## [1.3.0] - 2026-08-31

### Added

- Rework the desktop workspace into non-overlapping left, center, and right columns with collapsible sidebars and panel-specific bottom controls.
- Add proportional radar and roster sizing, numbered collaboration frames, Analysis timeline controls, and Cache/Inferno radar previews.
- Add GLB download progress and a NAV-only fallback for camera framing, surface editing, ground collision, and top-view boundary collision.
- Add adjective-fruit collaboration names, room presence, owner/current-user labels, and recent join/leave activity.
- Add custom-utility deletion, utility-wheel access across desktop workspaces, Analysis stepping, and Collaboration frame navigation.
- Add distinct local and remote frontend builds plus a Workers development map server on port `3002`.

### Fixed

- Stabilize the H5 4:3 WebGL viewport and prevent desktop portal controls from altering mobile layout.
- Align Demo/NAV coordinates when a GLB is unavailable and prevent aim helpers from intercepting player hover selection.

## [1.2.0] - 2026-08-29

### Added

- Add separate frontend/backend Cloudflare Workers, Durable Objects collaboration rooms, and a traditional Node.js Runtime.
- Add Make workflows, Wrangler configurations, deployment templates, dry runs, custom domains, and automated deployment.
- Make map storage and backend endpoints configurable and require an explicit map-resource download source.

### Changed

- Share HTTP, Demo, NAV, map proxy, and Yjs protocol code between Node.js and Workers.
- Remove the legacy Vite proxy and Express/multer/concurrently dependency chain.

## [1.1.0] - 2026-08-27

### Added

- Add an always-accessible mini-game launcher, Schulte tables, a GitHub link, and explicit camera shortcut hints.

### Changed

- Improve utility parsing, missing-event inference, jump throws, throw strength/velocity, and multipart Demo boundaries.
- Improve weapon recovery and aliases, round numbering, imported utility replay, and first-person throw animations.
- Improve responsive desktop panels, rosters, POV HUDs, and compact mobile header controls.

## [1.0.1] - 2026-08-21

### Changed

- Replace the demonstration GIF with an optimized version to reduce README media size.

Detailed notes for earlier releases are available in the [Chinese changelog](CHANGELOG.md).
