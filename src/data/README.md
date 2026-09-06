# Bundled NAV data

`nav/*.json` contains the parsed CS2 navigation meshes embedded in the frontend.
The browser reads these files from the application bundle, so NAV rendering does
not depend on a runtime network request and remains available offline.

The generated files come from `.local/maps/<map>/<map>.nav`. After replacing a
source NAV file, rebuild them with:

```sh
npm run nav:generate
```

These files contain navigation geometry rather than Valve's visual/material map
assets. The GLB models remain external runtime resources under `.local/maps` or
the configured object-storage origin.
