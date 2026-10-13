# Checking changes

| Command | Purpose |
| --- | --- |
| `make desk-dev` | Build and run the unpackaged desktop app for development |
| `make test-js TEST=tests/go-parser-adapter.test.js` | Run a focused JavaScript test without rebuilding native storage |
| `make test` | Build native storage, run JS behavior tests and Go storage tests |
| `make check` | Versions, architecture, behavior, Web build and Go parser tests |
| `make desktop-check` | Build the host's directory package, inspect signatures/dependencies and launch it |
| `make desktop-smoke` | Check an existing package; optional `TARGET=mac-arm64` or `win-x64` |

`TEST` can contain several test paths. Use `make test` when testing native storage: `test-js` does not build its executable.

## What CI proves

PR and main checks run behavior/contracts/Web and standalone viewer builds plus actual packaged startup on macOS ARM and Windows x64. Startup uses temporary user data and random local ports. It requires a rendered canvas and working preload bridge, then writes/reads an isolated record through real renderer IPC and packaged native storage. It closes its process and removes its profile afterward. It does not join a live room or borrow user archives/resources.

Artifacts under `build/qa/desktop-<target>/` contain the screenshot, result and process log (or failure details); Actions retains them for seven days. This checks the directory package, not installation, OS publisher trust, automatic updating or every UI workflow. Release jobs repeat startup before attaching installers.

Packaging derives local main/preload dependencies from their parsed imports and re-exports. Inspection follows the actual archive bytes. Literal dynamic imports and `require` are covered; computed imports, native resource paths and external npm resolution still need explicit package checks or real startup. Source presence is not proof of packaged presence.

## Useful test expectations

- Exercise user-visible behavior: retained archives after restart, rejected stale edits, cancellation, complete pagination, preserved unknown values and recorded smoke data.
- For mocks, assert the public outcome and a meaningful failure path. Avoid checking internal call counts, source substrings or a function merely existing unless that is the actual contract.
- Add a regression that fails when the original defect is restored. Dependency tests deliberately omit a transitive viewer module; launcher tests use Intel Node semantics with an ARM bundle; protocol tests reject truncated pages and malformed columns.
- Prefer small authored fixtures; never require `.local`, a game installation, credentials or a large downloaded Demo in ordinary tests.
- Do not relax an expected result just to obtain green CI. Distinguish stale expectations from broken behavior, and record the intended contract.

Real Demo native/WASM parity, room reconnect flows and performance budgets need separate integration fixtures and are not implied by the checks above.
