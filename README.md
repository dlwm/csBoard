# CSBoard

A tool for CS2 Demo playback, data analysis, utility notes and collaboration.

[中文](docs/README.zh-CN.md) · [Русский](docs/README.ru-RU.md) · [Desktop download](https://github.com/dlwm/csBoard/releases/latest)


> **2.0 preview:** [2.0.0-alpha.2](https://github.com/dlwm/csBoard/releases/tag/v2.0.0-alpha.2). Integration interfaces are experimental; the desktop download link points to the stable release.

## Documentation

| I want to… | Start here |
| --- | --- |
| Use CSBoard | [User manual](docs/user-guide.md) — replay, analysis, lineups, collaboration and controls |
| Understand or contribute to the code | [Developer guide](docs/developer-guide.md) — architecture, drivers and library boundaries |
| Build and run locally | [Local build guide](docs/build-guide.md) — development, packaging and CI |
| Embed the viewer in another application | [Minimal integration example](packages/viewer/examples/minimal/README.md) · [API and compatibility](packages/viewer/README.md) |
| See what changed or what comes next | [Changelog](CHANGELOG.md) · [Roadmap](ROADMAP.md) |

## Match Replay

Play imported Demos by round. The timeline shows player positions, utility effects and combat events, with controls to seek to a specific moment.

- Switch between a map overview, a player’s first-person view and simultaneous teammate monitors.
- Scrub back into freeze time, inspect smoke lifetimes and filter recorded voice by team.
- Save the current frame for editing in Collaboration, or save a time interval as a custom DEMO.

<table>
<tr>
<td width="50%" valign="top">
<a href="docs/img/round-replay.png"><img src="docs/img/round-replay.png" alt="Round overview · positions, utility and timeline" width="440"></a>
<p>Round overview · positions, utility and timeline</p>
</td>
<td width="50%" valign="top">
<a href="docs/img/round-monitors.png"><img src="docs/img/round-monitors.png" alt="Team monitors · compare several perspectives" width="440"></a>
<p>Team monitors · compare several perspectives</p>
</td>
</tr>
</table>

## Analysis

View movement, kill and death events, and utility events for selected players across rounds. Filter results by side and economy; utility recommendations group similar throws and show their counts.

- View area-time heatmaps by early, mid and post-plant phases.
- Inspect kill and death positions, with separate economy filters for each side.
- Filter players, teams, rounds and utility types; inspect launch points, landing points and flight paths.
- Recommendations group similar recorded throws, show their counts and choose a representative from the group.
- Focus one group to inspect it, then save the representative directly to Utility Notes.

<table>
<tr>
<td width="50%" valign="top">
<a href="docs/img/analysis-area.png"><img src="docs/img/analysis-area.png" alt="Area time · heatmap by round phase" width="440"></a>
<p>Area time · heatmap by round phase</p>
</td>
<td width="50%" valign="top">
<a href="docs/img/analysis-kd.png"><img src="docs/img/analysis-kd.png" alt="KD events · positions, side and economy filters" width="440"></a>
<p>KD events · positions, side and economy filters</p>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="docs/img/analysis.png"><img src="docs/img/analysis.png" alt="Across rounds · trajectories and recommendations" width="440"></a>
<p>Across rounds · trajectories and recommendations</p>
</td>
<td width="50%" valign="top">
<a href="docs/img/analysis-focus.png"><img src="docs/img/analysis-focus.png" alt="Focused group · inspect a repeated smoke" width="440"></a>
<p>Focused group · inspect a repeated smoke</p>
</td>
</tr>
</table>

## Utility Notes

Save throws from Analysis or add notes using getpos. Imported throws retain preparation, movement, release, flight and effect data for playback.

- Organize notes in folders and sort by landing area; retain the source player, round and coordinates.
- Preview the landing effect with surrounding cover, or replay the throw in first person with recorded inputs.
- Copy getpos to reproduce the starting position and aim in game.

<table>
<tr>
<td width="50%" valign="top">
<a href="docs/img/utility-notes.png"><img src="docs/img/utility-notes.png" alt="Saved lineup · source details and landing preview" width="440"></a>
<p>Saved lineup · source details and landing preview</p>
</td>
<td width="50%" valign="top">
<a href="docs/img/utility-first-person.png"><img src="docs/img/utility-first-person.png" alt="First-person playback · recorded inputs" width="440"></a>
<p>First-person playback · recorded inputs</p>
</td>
</tr>
</table>

## Collaboration

Add and move players, place utilities and draw routes on the map. Import saved replay frames for editing, or open a room to edit with other users.

- Switch between 3D and a 2D plan view to inspect positions and sightlines.
- Save, duplicate and switch frames; add saved throws from Utility Notes.
- Open or join a room to edit together, see connected users and synchronize changes.

<table>
<tr>
<td width="50%" valign="top">
<a href="docs/img/collaboration.png"><img src="docs/img/collaboration.png" alt="Frame editing · player positions in 2D" width="440"></a>
<p>Frame editing · player positions in 2D</p>
</td>
<td width="50%" valign="top">
<a href="docs/img/collaboration-live.png"><img src="docs/img/collaboration-live.png" alt="Shared room · live editing and the utility wheel" width="440"></a>
<p>Shared room · live editing and the utility wheel</p>
</td>
</tr>
</table>

## Data and license

Demos, analysis caches, archives and utility notes stay on your device. Collaboration and shared replays use a server. Optional experimental assistant requests send context to your configured provider; resource and update downloads also use the network.

Original source and documentation: [GPL-3.0-only](LICENSE). Dependencies retain their own licenses; see [third-party notices](docs/THIRD_PARTY_NOTICES.md).
