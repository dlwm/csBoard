# Default Starter Data

Files in this directory seed browser-local data only when the corresponding
IndexedDB record has never been created. Existing user data is never merged,
replaced, or restored after deletion.

## Utility Notes

Add JSON files anywhere under `utility-notes/`. Each file may contain:

- An export produced by CSBoard: `{ "version": 3, "notes": [...] }`
- A JSON array of note objects
- One note object

Every note should have a stable, repository-unique `id`. The regular fields are
`mapName`, `position`, `angles`, `name`, `summary`, and `createdAt`. Demo-derived
notes may retain their exported `replay`, `thrower`, and location fields.
Older `localStorage["csboard-utility-notes"]` data is imported once and removed
only after the IndexedDB write succeeds.

## Workspace Archives

Add JSON files anywhere under `workspace-archives/`. Each file may contain:

- `{ "archives": [...] }`
- A JSON array of archive objects
- One archive object

An archive should use the same shape stored in the `workspace-archives`
IndexedDB record. At minimum it needs a stable `id`, `name`, `mapName`, and
either `frames` or `workspace`. A frame contains an `id` and a `workspace` with
arrays such as `points`, `grenades`, `collabUtilities`, and `brushStrokes`.
Keep `paths` as an empty array. Older
`localStorage["csboard-workspace-archives"]` data is imported once and removed
only after the IndexedDB write succeeds.

Example:

```json
{
  "archives": [
    {
      "id": "default-dust2-example",
      "name": "Dust II Example",
      "mapName": "de_dust2",
      "savedAt": "2026-01-01T00:00:00.000Z",
      "activeFrameId": "default-frame-1",
      "frames": [
        {
          "id": "default-frame-1",
          "workspace": {
            "points": [],
            "paths": [],
            "grenades": [],
            "collabUtilities": [],
            "brushStrokes": []
          }
        }
      ],
      "workspace": {
        "points": [],
        "paths": [],
        "grenades": [],
        "collabUtilities": [],
        "brushStrokes": [],
        "cameraSlots": []
      }
    }
  ]
}
```

Use separate, descriptively named files for unrelated maps or contributions.
Do not add Demo files, map resources, or generated build output here.
