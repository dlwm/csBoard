import { stableHash, stableSerialize } from '../utils/stableValue.js';

// Merge portable notes deterministically; importing the same file again is idempotent.
export function mergeUtilityNotes(current, imported) {
      const next = [...current];
      const exact = new Set(next.map(stableSerialize));
      const ids = new Set(next.map((note) => note.id).filter(Boolean));
      let added = 0;
      let skipped = 0;
      imported.forEach((raw, index) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
        const rawKey = stableSerialize(raw);
        if (exact.has(rawKey)) { skipped += 1; return; }
        const contentHash = stableHash(rawKey);
        const requestedId = String(raw.id || `import-${contentHash}`);
        // An ID-less note gets the same derived ID on reimport, not a collision suffix.
        if (exact.has(stableSerialize({ ...raw, id: requestedId }))) { skipped += 1; return; }
        const id = ids.has(requestedId) ? `${requestedId}-import-${contentHash}` : requestedId;
        const note = { ...raw, id };
        const noteKey = stableSerialize(note);
        if (exact.has(noteKey)) { skipped += 1; return; }
        next.push(note);
        exact.add(noteKey);
        ids.add(id);
        added += 1;
      });
      return { next, added, skipped };
}
