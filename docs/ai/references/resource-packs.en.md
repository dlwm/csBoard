# English

## Using resource packs

Release desktop packages contain no GLB maps. Use **Resources → Import resources** to select SVG icons and GLB maps in batches. Names determine their slots;
the full list is in the Resources panel. `glock.svg` is accepted as
an alias for `glock18.svg`. Missing icons use built-in defaults; missing models
use NAV, with no model controls or automatic OSS downloads. Training Ground is
built in. Web behavior is unchanged.

Imported files live under Electron's `userData/resource-packs`, outside browser
storage. Valid matching files replace previous imports; invalid files do not.
SVGs must be self-contained, image-only and at most 2 MB. GLB 2.0 models must
embed required data, retain original map coordinates and be at most 1 GB.
Structural validation does not guarantee correct rendering or NAV alignment.
Zone models, map logos, scripts and custom maps are not supported. Save work
before **Reload and apply**, or restart the app later.
