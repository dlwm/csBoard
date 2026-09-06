# Changelog

[中文](docs/CHANGELOG.zh-CN.md)

## [1.10.1] - 2026-09-06

### Changed

- Bundle parsed NAV data for all supported maps into the frontend, removing the runtime NAV download and legacy parsing API dependency while preserving offline map geometry.
- Add an offline region-data generation pipeline that preserves `env_cs_place` height bounds and associates each region with bundled NAV areas.
- Make the Docker service read GLB models directly from the read-only `.local/maps` bind mount instead of running a resource downloader at startup.
- Temporarily hide T/CT spawn and bombsite zone models while a clearer replacement visualization is designed.

### Fixed

- Fix Docker builds so the supplied v1.10.0 build version reaches Vite even when `.git` is excluded from the build context.
- Fix map switches mounting the new GLB with the previous map's bundled NAV data when both NAV files share the same format version.
- Anchor Anubis's default 3D orbit height to its highest playable NAV surface so non-playable bottom geometry cannot displace it.
- Remove the duplicate generic crosshair from Demo first-person playback while retaining its animated POV HUD crosshair.
- Align the remaining Demo POV crosshair to the actual 3D viewport instead of the taller stage that also contains bottom controls.
- Freeze a utility's first-person camera at the release view for 0.3 seconds, then immediately return to the original replay camera instead of following the thrower's post-release movement.
- Preserve the model perspective range in saved camera positions and make 0% disable the perspective opening completely.
- Let five-die Farkle straights score together with a sixth scoring 1 or 5, and make Reaction Test measure the response on press instead of release.
- Allow Analysis utility records to be opened and saved from either throw or landing markers; hovering a nearby-list entry now highlights its exact trajectory.
- Make the Analysis nearby-utility list smaller and translucent, and close it immediately after the pointer leaves the entered list.

## [1.10.0] - 2026-09-06

### Changed

- Begin decomposing the oversized `main.jsx`: move Analysis UI and calculations, Demo domain logic and HUD, shared UI, floor clipping, NAV boundaries, Analysis, death-heat, Demo utility, utility-note, collaboration-utility, and C4 scene controllers, camera input and state persistence, and scroll-edge detection into dedicated modules.
- Reorganized the development tooling structure: project scripts have been consolidated under scripts/, while local third-party tools are now stored under .local/.

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

- Add a committable `src/default-data/` directory whose utility notes and Collaboration archives seed first-time visits without replacing existing local data.
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
