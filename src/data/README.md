# Bundled NAV data

`nav/*.json` contains the parsed CS2 navigation meshes embedded in the frontend.
The browser reads these files from the application bundle, so NAV rendering does
not depend on a runtime network request and remains available offline.

The generated files come from `.local/official/maps/<map>/<map>.nav`. After replacing a
source NAV file, rebuild them with:

```sh
npm run nav:generate
```

These files contain navigation geometry rather than Valve's visual/material map
assets. The GLB models remain external runtime resources under `.local/official/maps` or
the configured object-storage origin.

The same NAV data generates the offline 2D radar, including shared square bounds,
floor selection, and per-floor elevation shading (higher areas are lighter).
3D NAV rendering shares vertices for smooth lighting and has no edge overlay.
Desktop releases use user-imported GLB resources without OSS fallback; only
explicit local-test packages include local models. See docs/resource-packs.md.
Navigation data remains subject to the game-content exclusions in
[LICENSE_SCOPE.md](../../LICENSE_SCOPE.md); bundling it does not grant additional rights.
