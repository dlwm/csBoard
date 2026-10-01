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
Deployment uses Wrangler OAuth by default: it reuses an existing login or opens
the browser for authorization. A single account is selected automatically; if
there are several, choose one once for the current deployment. No API token or
Account ID needs copying. CI can still supply `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` through environment variables.

The map resource URL is reused from an existing `VITE_OSS_BASE_URL` in the
environment or frontend dotenv files. Otherwise provide `OSS_BASE_URL` (the public parent of `/maps`). It can be supplied
in the environment or the optional ignored `config/cloudflare/deploy.env`; an
interactive run asks if missing. Worker names default to `csboard-backend` and
`csboard-frontend`. Custom domains and `BACKEND_PUBLIC_URL` are optional overrides.
The script deploys the backend, reads its URL from Wrangler's structured output,
then embeds it while building and deploying the frontend. Build settings are
passed through the environment; existing `.env.production.local` is not rewritten.
The deployed frontend origin is added to the backend AI allowlist automatically,
which may require one additional backend deployment. The final URLs are printed.

For automatic subdomain binding, set only these deployment domains alongside the
existing map resource settings:

```dotenv
CF_FRONTEND_CUSTOM_DOMAIN=csboard.example.com
CF_BACKEND_CUSTOM_DOMAIN=api.csboard.example.com
```

Wrangler's `--domain` creates Custom Domain bindings; Cloudflare manages their DNS
records and TLS certificates. The root domain must already be an active zone in
the selected Cloudflare account. Do not pre-create CNAME records or use `/*` routes.
When both domains are set, the frontend origin is known before backend deployment,
so only two Worker deployments are needed. See [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

The Node deployment entry reads dotenv settings without executing shell code.
Missing local settings are created from the example; existing settings are kept.
After publication it checks backend `/api/health`, frontend HTML and the referenced
JavaScript asset, allowing time for DNS and certificates to activate. It records
the verified URLs in ignored `.wrangler/deployment/result.json`. It does not join
rooms, send edits or call a real AI provider. This frontend is static-only, so its
`/health` is not a backend health endpoint; collaboration uses the backend origin.

Run `npm run deploy -- --dry-run` (or set `CF_DEPLOY_DRY_RUN=true`) to bundle both Workers without logging in or uploading.
When no backend URL is supplied, this mode uses an explicit `.invalid` placeholder;
its frontend artifacts are for validation only, not publication.
Use `npm run deploy -- --no-login` to require existing credentials without opening an OAuth flow.
Authentication is managed by [Wrangler](https://developers.cloudflare.com/workers/wrangler/commands/general/);
URLs come from its [structured output](https://developers.cloudflare.com/changelog/post/2025-11-03-wrangler-output-file/).
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
Keep deployment credentials in the existing ignored `config/cloudflare/deploy.env`
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

## Optional AI build

The operation assistant is an experimental feature.

Cloudflare deployment and local Workers development exclude AI by default.
Set `CF_AI_ENABLED=true` in the ignored `config/cloudflare/deploy.env` for deployment,
or in the shell for `npm run dev:workers`, to include the assistant and proxy.
The deploy script applies the same choice to both Workers. Disabled builds omit
assistant code, styles, tools, prompts and reference content; `/api/ai/chat`
returns 404 and no provider/origin setup is needed.

Ordinary web and desktop builds keep AI by default. Set `CSBOARD_AI_ENABLED=false`
in `.env.local` (or `.env.desktop.local` for desktop only) to exclude it. Rebuild
for changes to take effect; this does not delete existing local sessions or credentials.
Desktop packages also omit AI service modules and do not register AI IPC handlers.
`CF_AI_ENABLED` is independent of this local setting and defaults to false.

## AI proxy (when enabled)

`/api/ai/chat` accepts a user's service settings and conversation, then streams the
provider response. Only the exact completion endpoints derived from
`AI_ALLOWED_BASE_URLS` are allowed; separate multiple service base URLs with commas.
With `AI_ALLOWED_BASE_URLS` empty or unset, the server permits the built-in provider
presets shared with the settings menu:

| Provider | Default base URL | Official documentation |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | [API reference](https://platform.openai.com/docs/api-reference/chat) |
| DeepSeek | `https://api.deepseek.com` (also `/v1`) | [API documentation](https://api-docs.deepseek.com/) |
| Kimi / Moonshot (China) | `https://api.moonshot.cn/v1` | [Overview](https://platform.kimi.com/docs/api/overview) |
| Zhipu GLM | `https://open.bigmodel.cn/api/paas/v4` | [OpenAI compatibility](https://docs.bigmodel.cn/cn/guide/develop/openai/introduction) |
| SiliconFlow (China) | `https://api.siliconflow.cn/v1` | [Quickstart](https://docs.siliconflow.cn/docs/userguide/quickstart) |
| OpenRouter | `https://openrouter.ai/api/v1` | [Quickstart](https://openrouter.ai/docs/quickstart) |
| Alibaba Model Studio (Beijing public endpoint) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | [Compatibility and regions](https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope) |

The menu fills in the address, not a model or key. Choose a model with tool calling;
keys and model access must match the provider and region. Model Studio recommends
workspace-specific addresses; these and other regions use Custom and require an
explicitly allowed exact base URL. Anthropic Messages and provider-native APIs
are not implemented by the Chat Completions transport.

An explicit comma-separated `AI_ALLOWED_BASE_URLS` replaces the defaults, allowing
operators to restrict providers or include custom hosts. For example, to allow
only OpenAI and DeepSeek:

```dotenv
AI_ALLOWED_BASE_URLS=https://api.openai.com/v1,https://api.deepseek.com,https://api.deepseek.com/v1
```

Provider hosts and path prefixes must match; the UI's
ability to enter a URL does not mean the proxy permits it. Rejected destinations
return `ai_service_not_allowed` with the requested endpoint and enabled endpoints,
without sending a request or key to the provider.
For split frontend/backend hosting, set `AI_ALLOWED_WEB_ORIGINS` to the exact
frontend origins (also comma-separated). Configure these variables in the backend
and local combined Worker. Node reads the same names from its environment.
The proxy has no shared API key and does not persist the key supplied with a request.
Never add keys to public build variables or committed Wrangler configuration.
