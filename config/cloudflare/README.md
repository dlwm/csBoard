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
