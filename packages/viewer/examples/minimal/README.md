# Minimal standard replay consumer

This example imports only `@csboard/viewer` and `@csboard/viewer/format`. It needs no React, CSBoard panels, cache adapter, parser or server API.

## Run from this repository

1. Run `make viewer-example`.
2. Serve `build/viewer-example` over HTTP, for example with `python3 -m http.server 8080 --directory build/viewer-example`.
3. Open `http://localhost:8080/minimal/`.
4. Choose the matching NAV JSON and a `cs2-demo-format/replay/0.1` ZIP (`.cs2df`), then click **Open**.

The repository build resolves package names to the source package. The older example at `/` demonstrates additional CSBoard host adapters; this minimal example does not use them.

## Use in another application

The package is experimental/private and is not published to npm. For a reproducible standalone installation, pack the library and install the archive in an empty Vite project. The archive includes this example and the API reference:

```sh
# In csBoard, write a tarball to your chosen staging directory:
npm pack ./packages/viewer --pack-destination /path/to/staging

# In an empty directory outside csBoard:
npm init -y
npm install /path/to/staging/csboard-viewer-0.0.0.tgz three@^0.185.1 three-mesh-bvh@^0.9.14
npm install --save-dev vite@8.2.1
cp node_modules/@csboard/viewer/examples/minimal/index.html .
cp node_modules/@csboard/viewer/examples/minimal/main.js .
npx vite --host 127.0.0.1
```

Open the local URL printed by Vite. On Windows, use your file manager or PowerShell `Copy-Item` in place of `cp`. `make viewer-check` verifies a packed installation and runs this example, including invalid-file recovery and reopening.

Use the same package-name imports in `main.js`; no CSBoard path alias is required. The package declares JSZip and Ajv dependencies for standard reading. NAV JSON must provide an `areas` object whose entries contain `corners: [{x,y,z}, …]` in Source coordinates; choose the NAV belonging to the package's map. The reader validates the replay package, but cannot verify the identity of an unlabeled NAV file.

## Ownership and operations

- `openReplayPackageSource(file, {signal})` validates the standard package and opens its data source. It does not reinterpret standard rows as application cache fields.
- `createViewer({container, navData, mapName})` creates the renderer; `setDataSource(source)` lends it the opened source.
- `source.listSegments()` populates the round selector. `replay.open`, `replay.play`, `replay.pause` and `replay.seek` all use `viewer.execute` and check its structured result.
- `playback.*` events refresh the host's controls. Event callbacks are removed when the viewer is disposed.
- On close or navigation, abort pending reads, dispose the viewer, then dispose the borrowed source.

No GLB is required. Add optional model, equipment and voice drivers only when your application needs them. The example shows base rendering, not the full CSBoard combat UI or an audio player. v3 statistics packages are not full replay packages; missing tracks remain unknown/unsupported rather than fabricated. JSON is decoded per segment, not streamed row by row.

## Camera input and optional models

Choose the input preset before opening: CSBoard, Orbit, custom arrow keys with Space + middle-button grab, or disabled. Focus the canvas to use keyboard navigation. Custom configurations and omitted-action semantics are documented in the package README.

After opening a replay, choose a matching, self-contained GLB to display its world model. The example injects `createGltfResourceLoader`, resolves `world-model` to a local Object URL, and uses `model.visibility` / `model.unload`. No CSBoard resource registry or platform adapter is involved. The model must use metres, Y-up, and original uncentred map coordinates; the viewer subtracts its NAV origin. Progress and errors use `resource.state`; object URLs are released after view disposal.
