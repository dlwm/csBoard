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
npm run deploy:workers
```

`workers-build` validates with `--dry-run`; `deploy:workers` performs deployment.
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
`CF_RESOURCE_PACK_CONFIG` to its path before running `make workers-deploy` or
`make workers-build`.

This pack is UI-only: GLB files are not copied, and the existing `OSS_BASE_URL`
continues to supply map models. `npm run dev:workers` uses the same optional
pack as production Worker builds. The local `.local/official/ui` sample is
ignored by Git and is not bundled into desktop releases. Check the rights for any icons before
publishing them; the CSBoard license does not grant rights to third-party art.
