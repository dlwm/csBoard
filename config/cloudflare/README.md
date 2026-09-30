# Cloudflare configuration

| File | Purpose |
| --- | --- |
| `wrangler.dev.jsonc` | Local combined frontend/API Worker |
| `wrangler.backend.jsonc` | Production API and room Durable Objects |
| `wrangler.frontend.jsonc` | Production static frontend |

Run commands from the repository root:

```sh
npm run dev:workers
make workers-build
npm run deploy
```

`workers-build` validates with `--dry-run`; `npm run deploy` performs deployment.
The developer launcher explicitly keeps local persistence at `.wrangler/state`
in the repository root. No existing state needs moving. Wrangler may create
ignored temporary files beside its configuration.

For direct local CLI use, specify both options:

```sh
npx wrangler dev --config config/cloudflare/wrangler.dev.jsonc --persist-to .wrangler/state
```

Entrypoint, asset, schema and watch paths are relative to these configuration
files. `build.cwd` is relative to the command's working directory, so invoke
Wrangler from the repository root as the project scripts do.
Keep deployment credentials in the existing ignored `deploy.cloudflare.env`
or environment variables, never in these tracked configuration files.

## Demo parser

The backend HTTP parser uses the generated Go WASM in `build/go-parser/web/`.
Worker commands build it from the pinned fork before bundling. The browser's
normal Demo import runs in its own Worker; it does not upload to `/api/parse`.
The HTTP compatibility route retains the original response structure and
serializes sessions within an isolate, releasing source references afterward.

Dry-run bundling and local workerd initialization have passed. They do not prove
that large Demo files fit production Workers: the platform has a 128 MB memory
limit per isolate and CPU limits depending on the plan. Use browser or desktop
import for large Demos; the Node HTTP adapter was verified with a real 59 MB
sample. See [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/).

## Optional Worker UI resource pack

The frontend Worker can bundle an SVG icon pack. Create the ignored
`.local/worker-resource-pack.json` file with an `iconDirectory` path relative to
the repository root, for example:

```json
{ "iconDirectory": ".local/official/ui" }
```

The directory may contain `Equip/`, `HUD/`, and `SideLogo/` subdirectories, or
SVG files at its root. Only names in `electron/resource-catalog.json` are
included. Missing icons keep the built-in UI; without the config file, the
whole frontend uses the existing built-in UI. An explicit but invalid path or
unsafe SVG fails the build. To use a different config file, set
`CF_RESOURCE_PACK_CONFIG` to its path before running `npm run deploy` or
`make workers-build`.

This pack is UI-only: GLB files are not copied, and the existing `OSS_BASE_URL`
continues to supply map models. `npm run dev:workers` uses the same optional
pack as production Worker builds. The local `.local/official/ui` sample is
ignored by Git and is not bundled into desktop releases. Check the rights for any icons before
publishing them; the CSBoard license does not grant rights to third-party art.
