import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeUtilityNotes } from '../src/utility/mergeUtilityNotes.js';
import { compatibleUtilityNotes, UTILITY_NOTES_VERSION } from '../src/utility/noteSchema.js';

test('note import handles duplicates and conflicting IDs without mutating existing records', () => {
  const current = [{ id: 'a', name: 'first' }];
  const input = [{ name: 'first', id: 'a' }, { id: 'a', name: 'second' }, { name: 'no id' }, null, 42, []];
  const first = mergeUtilityNotes(current, input);
  assert.equal(first.added, 2);
  assert.equal(first.skipped, 1);
  assert.equal(current.length, 1);
  assert.equal(new Set(first.next.map(note => note.id)).size, 3);
  const repeated = mergeUtilityNotes(first.next, input);
  assert.equal(repeated.added, 0);
  assert.equal(repeated.skipped, 3);
  assert.deepEqual(repeated.next, first.next);
});

test('legacy replay migration retains manual notes and preserves current-version replays', () => {
  const notes = [{ id: 'manual' }, { id: 'replay', replay: {} }];
  assert.deepEqual(compatibleUtilityNotes(notes, 0), [notes[0]]);
  assert.equal(compatibleUtilityNotes(notes, UTILITY_NOTES_VERSION), notes);
  assert.equal(compatibleUtilityNotes(notes, UTILITY_NOTES_VERSION + 1), notes);
  assert.equal(notes.length, 2);
});
