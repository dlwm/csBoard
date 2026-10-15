# Checking changes

| Command | Purpose |
| --- | --- |
| `make desk-dev` | Build and run the unpackaged desktop app for development |
| `make test-js TEST=tests/go-parser-adapter.test.js` | Run a focused JavaScript test without rebuilding native storage |
| `make test` | Build native storage, run JS behavior tests and Go storage tests |
| `make check` | Versions, architecture, behavior, Web build and Go parser tests |
| `make desktop-check` | Build the host's directory package, inspect signatures/dependencies and launch it |
| `make desktop-smoke` | Check an existing package; optional `TARGET=mac-arm64` or `win-x64` |
| `make mobile-ui-check` | Build and exercise mobile H5 touch, popup and viewport resizing |
| `make viewer-check` | Install the packed viewer in an isolated project and exercise it in a real browser |

`TEST` can contain several test paths. Use `make test` when testing native storage: `test-js` does not build its executable.

## What CI proves

PR and main checks run behavior/contracts/Web and standalone viewer builds plus actual packaged startup on macOS ARM and Windows x64. Startup uses temporary user data and random local ports. It requires a rendered canvas and working preload bridge, then writes/reads an isolated record through real renderer IPC and packaged native storage. It also seeds the shipped compact replay example in that isolated profile and runs the actual replay → collaboration frame → utility analysis → utility notes workflow. It checks seek/play, round switching, cancelled saves, rejected stale edits, recorded-utility persistence and recovery after renderer reload. It closes its process and removes its profile afterward. It does not join a live room or borrow user archives/resources.

Artifacts under `build/qa/desktop-<target>/` contain the screenshot, result and process log (or failure details); Actions retains them for seven days. This checks the directory package, not installation, OS publisher trust, automatic updating or every UI workflow. Release jobs repeat startup before attaching installers.

Packaging derives local main/preload dependencies from their parsed imports and re-exports. Inspection follows the actual archive bytes. Literal dynamic imports and `require` are covered; computed imports, native resource paths and external npm resolution still need explicit package checks or real startup. Source presence is not proof of packaged presence.

## Independent viewer acceptance

`make viewer-check` packs `@csboard/viewer` and installs the archive in a temporary project outside this repository, with its declared dependencies and locked peer versions. It imports all public entry points and builds a consumer with package-name imports, without CSBoard source aliases or React. A real Electron browser checks standard replay loading/seeking/playback, structured errors, the packed minimal example with invalid-file recovery/close/reopen, local GLB loading/hiding/unloading, lazy resources, configured and disabled keyboard input, focus, resizing, callbacks and disposal/recreation. Real wheel events verify default smooth-scroll zoom, pinch, delta units, inversion/sensitivity, explicit trackpad orbit/pan, the CSBoard preset, and host scrolling when input is disabled. The authored replay fixture is shared with format tests; no private Demo or game installation is required.

PR/main and release preparation run this acceptance check. Linux uses `xvfb-run` and software WebGL; this proves browser behavior, not GPU performance or physical mobile interactions. Results, a screenshot and process logs are saved in `build/qa/viewer-consumer/`, including on failure. Temporary installs and browser profiles are removed. The check requires npm registry access to install the package's declared dependencies.

## Useful test expectations

- Exercise user-visible behavior: retained archives after restart, rejected stale edits, cancellation, complete pagination, preserved unknown values and recorded smoke data.
- For mocks, assert the public outcome and a meaningful failure path. Avoid checking internal call counts, source substrings or a function merely existing unless that is the actual contract.
- Add a regression that fails when the original defect is restored. Dependency tests deliberately omit a transitive viewer module; launcher tests use Intel Node semantics with an ARM bundle; protocol tests reject truncated pages and malformed columns.
- Prefer small authored fixtures; never require `.local`, a game installation, credentials or a large downloaded Demo in ordinary tests.
- Do not relax an expected result just to obtain green CI. Distinguish stale expectations from broken behavior, and record the intended contract.

Real Demo native/WASM parity, room reconnect flows and performance budgets need separate integration fixtures and are not implied by the checks above.

## Mobile workspace acceptance

`make mobile-ui-check` builds the Web application and runs its reduced mobile H5 host in a real browser with a disposable profile. Seven screenshot scenarios cover touch navigation, an expanded and scrolled map popup, settings, collaboration, a reduced viewport and restored landscape dimensions. Assertions check the actual hit target of the popup, canvas/container alignment, reduced navigation and runtime exceptions. Both checks and release preparation run it with a virtual display. Artifacts are in `build/qa/mobile-workspace/`.

Touch and viewport resizing are emulated. This does not prove physical iOS/Android rendering, the native file picker, IME/soft-keyboard behavior, OS permissions or installer/updater trust. The desktop workflow uses prepared replay data, not a fresh Demo parse; native/WASM parsing still needs separate real-input acceptance.

## Remaining beta acceptance on actual devices

| Environment | Remaining workflow |
| --- | --- |
| Windows x64 | Install to a chosen path; upgrade an older installation; cancel/retry download; restart into the update while retaining local records |
| macOS ARM | Install the DMG and update an existing app; import/remove game resources with real file permissions and available disk space |
| Native iOS/Android | Touch camera/scrolling, external mouse and keyboard, system file picker, soft keyboard and app background/foreground on a physical device |
| Fresh Demo inputs | Native and WASM parsing of a real match/custom recording; loading feedback, cancellation, failed-item retry and memory pressure |

Automated package startup does not execute installers or grant operating-system publisher trust. Do not mark these scenarios passed solely because the CI job is green. The prepared tutorial replay covers playback/analysis, not parser input compatibility.

### Public contract maintenance

`make viewer-contracts` regenerates command and event validators from the built-in schema definitions. `make lint` checks the generated files. `viewer-contract.test.js` verifies rejection before permission/mutation, actionable errors, malformed contexts, event diagnostics and asynchronous result failures. The installed consumer additionally checks actual emitted payloads through `onObserverError`.

`application-scene-commands.test.js` covers player permissions, model command/event consistency, failed persistence and legacy colors. Desktop acceptance uses a tiny real GLB in an isolated profile to check lazy loading and object masks; it does not claim to validate a full map's appearance. Real pointer and keyboard input place a player, expose the public operation and undo it.
