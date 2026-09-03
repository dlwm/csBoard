# Changelog

[中文](CHANGELOG.md)

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
