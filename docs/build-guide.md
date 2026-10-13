# Local build guide

[Home](../README.md) · [中文](build-guide.zh-CN.md) · [Developer guide](developer-guide.md)

## Prerequisites

Use Node.js 24, npm, Git, GNU Make and Bash. Go versions follow `native/parser/go.mod` and `native/storage/go.mod`; Rust and Python are not required. Windows needs Git Bash, Make and x64 Node.js. Mobile development additionally needs Android Studio or Xcode.

```sh
make install
cp .env.example .env.local
make help
```

NAV is bundled. Models are optional; local GLBs belong in `.local/official/maps/<map>/<map>.glb`. Set your own `VITE_OSS_BASE_URL` before `make resources`; the repository supplies no default download origin.

## Daily development

| Task | Command |
| --- | --- |
| Desktop development with DevTools | `make desk-dev` / `make desktop-dev` |
| Build the host desktop application | `make desktop-prepare` |
| Open it without rebuilding | `make desktop-start` |
| Build and serve web + Node backend | `make dev` |
| Independent viewer example | `make viewer-example` |

Rebuild after source changes. `desktop-start` requires an existing build. Desktop outputs use `build/renderer`, `build/tasks` and `build/desktop`; web uses `dist`. Serve `build/viewer-example` over HTTP.

## Configuration

Public production addresses come from `.env.production.local`, overridden by `.env.desktop.local` or `.env.mobile.local`. Native asset servers do not host collaboration: configure an absolute `VITE_BACKEND_BASE_URL`. `CSBOARD_AI_ENABLED=false` excludes the experimental assistant at build time; `CSBOARD_PARSER_ENGINE=auto` selects the host-appropriate native/WASM transport.

```sh
make build          # Local frontend
make build-remote   # Public backend/resources
make workers-build # Bundle only; no deployment
```

Do not put secrets in frontend-visible `VITE_*` variables. See [Cloudflare deployment](../config/cloudflare/README.md) for OAuth and domains. `make deploy ARGS=--dry-run` checks bundles; `make deploy` actually publishes. Mobile uses `make mobile-prepare`, `mobile-open` or `mobile-build PLATFORM=ios|android`; see [mobile development](mobile.md).

## Checks and packaging

```sh
make test-js TEST=tests/replay-package.test.js
make check
make desktop-check
```

`test-js` avoids native rebuilding; run `make native-build` first for tests needing native storage. `check` validates versions, architecture, behavior, the web build and Go parser. `desktop-check` builds, inspects and launches a real package with isolated storage; `desktop-smoke` checks an existing package. See [testing](../tests/README.md).

| Target | Command on the corresponding OS |
| --- | --- |
| macOS Apple Silicon | `make desktop-build-mac-arm64` |
| Windows amd64 | `make desktop-build-win-x64` |
| Local Intel Mac | `make desktop-build-mac-x64` |

Releases exclude game models; users import them in Resources. `desktop-prepare ARGS=--local-models` creates a separate local test package. Installed applications need no Go toolchain.

## Versions and CI

`make version` offers major/minor/patch/custom input; `BUMP=patch` and `VERSION=x.y.z` are noninteractive options. It synchronizes versions without committing or tagging. Prepare user-facing changelog and version information in the final release commit, then tag `vX.Y.Z`. Tags, package/lockfile and changelog must agree.

Checks runs on PRs and main/master pushes: behavior/web, independent consumers and actual macOS/Windows packaged startup. Version tags or manual selection of an existing tag trigger Release, building macOS ARM, Windows x64 and Android into one draft. Mobile preview is manual; Intel Mac and iOS are excluded from release builds.

Set public Actions variables `VITE_BACKEND_BASE_URL` and `VITE_OSS_BASE_URL`. Default release writes use `GITHUB_TOKEN`. Inspect installation and the draft before publishing. macOS ad-hoc signing is not notarization; Windows installers are unsigned.

## Resources

Keep raw Demos, VPKs, GLBs and extraction output under ignored `.local`; do not commit them. `make nav-data` regenerates bundled NAV, `make nav-labels` edits location names, and `make map-places` imports game regions. Contribute starter records in [presets](presets/README.md), prompts in [AI](ai/README.md).

### Preview versions

Use `make version VERSION=2.0.0-alpha.1` to begin a preview, and `make version BUMP=prerelease` for the next number. The interactive menu also offers the next preview number. Supported phases are `alpha`, `beta` and `rc`, each with a numeric suffix. The final release commit is `release: v2.0.0-alpha.1`, followed by the matching tag.

`package.json` owns the application version and, once previews begin, `mobileBuildNumber`. The native build counter increases when the version changes; repeated synchronization does not increase it. Android keeps the full version label, while iOS uses the numeric core for its marketing version. Both receive the same build counter.

Release Actions creates a draft with GitHub's Pre-release flag for preview tags. Desktop automatic updates continue to select stable releases; obtain preview installers manually from their release page. The independent viewer remains an experimental workspace package, not a published npm package.
