export const UTILITY_NOTES_VERSION = 3;

// Legacy replay coordinates are incompatible; retain manually entered notes during migration.
export function compatibleUtilityNotes(notes, version) {
  return Number(version || 0) >= UTILITY_NOTES_VERSION ? notes : notes.filter((note) => !note.replay);
}
