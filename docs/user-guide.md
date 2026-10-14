# User manual

[Home](../README.md) · [中文](user-guide.zh-CN.md)

## Start here

Open the operation guide on first launch or click **?** at the upper-right of the main view to restart it. Hover for a controls reference. The compact built-in example includes round 22 of Falcons vs Vitality on Dust2; no original Demo download is required.

| Task | Workspace |
| --- | --- |
| Watch a match, POV or several teammates | Match Replay |
| Find repeated throws, routes and kill positions | Demo Analysis |
| Save, review and copy getpos for a lineup | Utility Notes |
| Arrange players and phases with other people | Collaboration |

## Match Replay

Select Demos, wait for parsing and open them from the local library. Parts of the same match can be merged; failed tasks can be retried individually. Practice recordings with unusual rounds or player counts can continue as **Custom DEMOs**, without match analysis or combat HUDs.

Choose a round and use the bottom timeline to play, pause or seek. Playback starts after freeze time; seek earlier to review the freeze phase. Event markers jump to kills and bomb events. Use player POV or the teammate monitor wall. Voice starts muted; the header enables it, filters All/T/CT, and offers a volume slider on hover.

Save a frame for tactical editing, or save a time interval as an independent local Custom DEMO with optional sharing. Saved intervals contain replay data, not regenerated game `.dem` files.

## Analysis → Utility Notes

1. Select the map, players and Demos, then filter rounds, sides or economy.
2. Open **Utility Events**, filter grenade types and inspect starts, trajectories and landings. Position mode is the default; heatmaps are optional.
3. Recommendations group similar throws with at least four occurrences. Hover to preview, focus one group, or save its representative.
4. In **Utility Notes**, name and organize lineups, replay preparation and throwing actions, switch to POV and copy getpos. You can also create a note from game getpos text.

Recommendation scores help sorting; they are not success rates. Missing recorded inputs or smoke volumes cannot be reconstructed as fact. The bottom trajectory/effect switches affect the map-wide lineup view. Export/import JSON to keep your library.

## Collaboration

Open frames saved from a replay, move players, adjust their aim, place utilities and draw routes. Insert or duplicate frames for later phases, then save a local archive. Camera presets remain private rather than forcing other members to follow your view.

Open a room and share its code, or join with the in-app room dialog. The local board stays visible until synchronization succeeds. Check the server address after a failed connection. Save important shared work to a local archive; utility folders and tactical archives are separate libraries.

## Views and controls

Switch between 3D and a zoomable, rotatable top-down 2D view. Layered maps have adjacent 2D views. The minimap can show plain geometry or named locations. NAV, model lenses and floor selection reveal layouts; utility paths retain depth occlusion without floor clipping.

| Input | Action |
| --- | --- |
| Middle drag / Shift + middle drag | Rotate / pan; pan supports cursor wrapping |
| Wheel; W A S D | Zoom; move camera |
| Space; Left / Right | Play/pause; step or switch Collaboration frames |
| E; Q | Add a Collaboration player; open the utility wheel |
| Drag player; Ctrl / Shift + drag | Move; adjust yaw / pitch; double-click toggles crouch |
| Ctrl / Cmd + click placed utility | Remove utility |
| Ctrl + Z / Ctrl + Shift + Z | Undo / redo |
| Ctrl + 1–9 / 0; 1–9 / 0 | Save / restore camera presets |
| One / two fingers | Rotate / zoom and pan; connected keyboards and mice still work |

## Resources, settings and backups

NAV is bundled; building models are optional and load on demand. A model left disabled stays unloaded on the next launch. Desktop **Resources** accepts SVG and GLB imports or local CS2 resources. Reload when prompted. Map imports remove textures, retaining simplified geometry and the object tree; originals are unchanged. See [resource packs](ai/references/resource-packs.en.md).

Settings include text size, per-camera model simplification, parsing samples and storage. Desktop analysis uses a cache by default, with optional realtime processing; incompatible caches are invalidated. Desktop backups include native data and imported resources, but exclude original Demos, browser preferences and unsaved work. Clearing data requires typed confirmation. Export important libraries before cleanup or migration.

## Privacy and experimental features

Demos, caches, archives, notes and sessions stay on your device. Collaboration and shared replays use a server. Optional assistant requests send conversation context to your configured provider; model and update downloads also use the network.

The operation assistant is experimental and can be excluded at build time. It can inspect context and execute editing tools, with separate sessions, memory, workflows and JSON import/export. Review its edits; it does not validate real throw physics or tactical effectiveness. See [AI prompts and references](ai/README.md).

Room authorization and reconnection have limitations; large Demos can require substantial memory. Report the version, reproduction steps and relevant diagnostics in [Issues](https://github.com/dlwm/csBoard/issues), keeping private recordings and keys out of public reports.

## Experimental operation assistant

When AI is included in the build, the same assistant is available in Match Replay, Data Analysis and Collaboration. Configure a model that supports tool calls in its settings. The service receives the conversation and queried evidence; it does not automatically receive an entire Demo.

In Match Replay, ask for a round summary or key events. Evidence cards identify the Demo, round and original tick; click a card to view that moment. In Data Analysis, select players and Demos, then ask for event statistics or utility recommendations. Event statistics apply Demo/player/round/event-type filters, not the UI's side, economy or spatial filters; recommendation results use the current UI filters. Missing data and omitted Demos are reported. Frequency scores do not measure tactical effectiveness.

Prepared replay views and analysis filters apply only when clicked. Changing the selection can invalidate an old action. Review mode does not edit tactical archives or save throws automatically; use the normal UI to save them. Collaboration retains its existing editing tools. All of these AI features remain experimental.

The experimental assistant can present evidence-linked finding cards, event-moment lists and two-column comparisons in Match Replay and Data Analysis. Click an evidence item to inspect it; publishing a card does not change the view. Cards are retained when saving or exporting a conversation and labelled as historical when reopened. Current data and selection are checked again before navigation. Comparisons show two groups of evidence, rather than simultaneous replay viewports.
