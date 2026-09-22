import assert from 'node:assert/strict';
import test from 'node:test';
import { addArchiveFolder, assignArchiveItem, emptyArchiveFolders, folderChildren, folderOptions, moveArchiveNode, normalizeArchiveFolders, removeArchiveFolder, ROOT_FOLDER_ID, unassignArchiveItem } from '../src/app/archiveFolders.js';

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

test('root is immutable, duplicate folder names are distinct, and legacy items start at root', () => {
  let state = emptyArchiveFolders();
  assert.deepEqual(folderChildren(state, items, ROOT_FOLDER_ID).map((item) => item.id), ['a', 'b', 'c']);
  state = addArchiveFolder(state, 'Same', ROOT_FOLDER_ID, items, 'one');
  state = addArchiveFolder(state, 'Same', 'one', items, 'two');
  assert.deepEqual(folderOptions(state).map((item) => item.id), ['root', 'one', 'two']);
  assert.equal(addArchiveFolder(state, 'Root', ROOT_FOLDER_ID, items, ROOT_FOLDER_ID), state);
});

test('dragging entries reorders siblings, nests folders and refuses descendant cycles', () => {
  let state = addArchiveFolder(emptyArchiveFolders(), 'A', 'root', items, 'folder-a');
  state = addArchiveFolder(state, 'B', 'folder-a', items, 'folder-b');
  state = moveArchiveNode(state, items, { type: 'item', id: 'c' }, { type: 'folder', id: 'folder-b' }, 'inside');
  assert.deepEqual(folderChildren(state, items, 'folder-b').map((entry) => entry.id), ['c']);
  const unchanged = moveArchiveNode(state, items, { type: 'folder', id: 'folder-a' }, { type: 'folder', id: 'folder-b' }, 'inside');
  assert.equal(unchanged, state);
  state = moveArchiveNode(state, items, { type: 'item', id: 'b' }, { type: 'item', id: 'a' }, 'before');
  assert.deepEqual(folderChildren(state, items, 'root').filter((entry) => entry.type === 'item').map((entry) => entry.id), ['b', 'a']);
});

test('deleting a folder moves children and records to parent without deleting them', () => {
  let state = addArchiveFolder(emptyArchiveFolders(), 'A', 'root', items, 'folder-a');
  state = addArchiveFolder(state, 'B', 'folder-a', items, 'folder-b');
  state = assignArchiveItem(state, 'a', 'folder-a', items);
  state = removeArchiveFolder(state, 'folder-a', items);
  assert.equal(state.folders.find((folder) => folder.id === 'folder-b')?.parentId, 'root');
  assert.equal(state.items.a.folderId, 'root');
  assert.equal(removeArchiveFolder(state, 'root', items), state);
  assert.equal(unassignArchiveItem(state, 'a').items.a, undefined);
});

test('missing folder references fall back to root without changing record contents', () => {
  const state = normalizeArchiveFolders({ folders: [], items: { a: { folderId: 'missing', order: 1 } } });
  assert.deepEqual(folderChildren(state, items, 'root').map((entry) => entry.id), ['a', 'b', 'c']);
  assert.equal(state.items.a.folderId, 'missing');
});

test('corrupt cyclic folder ancestry is repaired without hiding the subtree', () => {
  const state = normalizeArchiveFolders({ folders: [{ id: 'x', name: 'X', parentId: 'y' }, { id: 'y', name: 'Y', parentId: 'x' }], items: {} });
  assert.ok(folderOptions(state).some((folder) => folder.id === 'x'));
  assert.ok(folderOptions(state).some((folder) => folder.id === 'y'));
});
