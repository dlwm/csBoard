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

### Hotspot utility recommendations

In Analysis, choose **KD Events → Hotspot utilities**. Select a suggested hotspot or tap a KD position on the map; adjust its range independently of the heatmap spread. The current player, side and economy filters determine the engagements. Candidates include recorded teammate throws from the selected Demos, matched by side and round phase.

Smoke uses the representative throw's recorded occupied cells to find intersections with historical engagement sightlines. Fire uses recorded fire cells when available; HE and fallback fire matches use position proximity. These are geometric associations, not verified tactical outcomes or success probabilities. Height is respected, but wall obstruction and approximate eye height still limit the result.

A group needs at least four similar throws. Ranking uses the match score; frequency, supporting Demos and rounds remain separate. Hover or focus a card to preview the real throw, save its representative to Utility Notes, or expand the focused group to open a related engagement in Match Replay. Flash candidates require positive recorded enemy blindness linked to the same thrower and detonation time; they match historical blinded positions, not a predicted future field of view. Queries are bounded and cancelled when the analysis context changes; missing source data and candidate limits are reported.

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


## Death review and notes

In Match Replay, open **Review** in the playback view controls. Filter deaths by player, choose the lead-in and victim/attacker/free view, then select an event and use the existing Play button. Playback stops one second after the death; **Full round** or seeking manually returns to normal round playback. Previous/Next opens another event. Cameras are reconstructed from Demo samples; missing or dead players cannot retain a first-person view.

Save an observation at the current moment to retain its round, time, view and drawings locally. Opening a note restores that moment and replaces the current drawings. Notes reference the original replay; they do not contain an independent replay copy and cannot play without the source. A reparse with unchanged source metadata retains the association. Custom recordings support notes but do not create a match death queue.


## Utility combinations

In Data Analysis → Utility Events, enable **Utility combinations**. The current player, Demo, side, economy and utility-type filters apply. Select multiple teammates to study joint executes. Matching uses the existing adaptive 3D throw/landing/trajectory policy, plus relative effect timing and a maximum distance between effects. Groups contain two to four utilities and must recur in at least four distinct source rounds; repeat imports and multiple matches inside one round do not increase support.

Each representative is one complete real occurrence, chosen as the medoid of both spatial and timing differences. Relative throw/effect times are measured from its first throw. Preview individual recorded effects, focus all matching utilities, or open a source round in Match Replay. **Save group** prepares every recorded throw before one note write, retaining actual smoke voxels and timing metadata; a new Utility Notes folder contains the group. Timings are metadata for reference; individual notes retain their existing playback behaviour. Folder failure leaves saved notes at the root with a warning.

Search has explicit input/comparison/candidate budgets and reports exclusions. These results describe recurring utility sequences, not proven coordination, complete tactics or causal benefit; player movement and efficacy are not inferred by this detector.


## Event timing heatmap

Data Analysis → Utility Events now offers a shared mode switch: individual recommendations, combinations and the timing heatmap. Select players and source Demos, then adjust side/economy and utility types. Timing reads source events and round metadata without loading round trajectories or voxel payloads. It shows utility throws/effect starts, kills/deaths and involvement in the first opposing-team kill of each round. The opener is determined before player filters. It does not classify a complete tactical execute.

Zero means freeze end. Bins are half-open intervals such as [0,5); choose 5/10/15-second bins and a range ending at 60/120/180/300 seconds. Switch between event counts and distinct supporting rounds; colours use one shared logarithmic scale. A row can overlap another (opening kills are also kills), so do not sum rows as independent events or interpret counts as probabilities. Unknown economy/team facts may exclude records; partial-source/range/budget warnings remain visible.

Select a cell to inspect its original sources, then open a replay beginning two seconds before the selected event. Evidence lists are capped per cell with an explicit notice while counts remain complete within the search budget. The chart uses the main viewport, with settings and sources in the sidebar; 3D rendering is paused while the chart is shown. It scrolls horizontally on touch devices and supports keyboard arrows. Spatial heat controls and the multi-round animation transport are hidden while this temporal mode is active.
