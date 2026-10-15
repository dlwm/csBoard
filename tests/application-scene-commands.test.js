import { playerBaseColor } from '../packages/viewer/src/data/playerColors.js';
import { projectWorkspace } from '../src/collaboration/workspaceAdapter.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoardCommands } from '../packages/viewer/src/core/boardCommands.js';
import { createModelCommands } from '../packages/viewer/src/core/modelCommands.js';
import { createCommandRegistry } from '../packages/viewer/src/core/commandRegistry.js';
import { createViewerController } from '../packages/viewer/src/core/controller.js';

test('application player movement respects editing permission and validates before history mutation', () => {
  let editable = false, position = [0, 0, 0];
  const history = [];
  const commands = createBoardCommands({ isEditable: () => editable,
    movePlayer: (id, next) => { assert.equal(id, 'one'); history.push(position); position = [...next]; },
  });
  const viewer = createViewerController({ profile: 'application', commands, readState: () => ({ position }) });
  assert.equal(viewer.execute({ type: 'player.move', id: 'one', position: [1, 2, 3] }).status, 'failed');
  editable = true;
  assert.equal(viewer.execute({ type: 'player.move', id: 'one', position: [1, NaN, 3] }).error.code, 'invalid_argument');
  assert.deepEqual(history, []);
  assert.equal(viewer.execute({ type: 'player.move', id: 'one', position: [1, 2, 3] }).status, 'succeeded');
  assert.deepEqual(position, [1, 2, 3]); assert.deepEqual(history, [[0, 0, 0]]);
  viewer.dispose();
});

test('host and standalone model commands merge styles and publish one correlated revision', () => {
  for (const profile of ['application', 'standalone']) {
    let style = { opacity: .4, focus: 'full', range: .5 }, visible = false, viewer;
    const events = [], errors = [];
    const commands = createCommandRegistry(createModelCommands({ readStyle: () => style,
      applyStyle: value => { style = value; }, setVisible: value => { visible = value; },
      notify: (...args) => viewer.notify(...args),
    }));
    viewer = createViewerController({ profile, commands, readState: () => ({ modelStyle: style, modelVisible: visible }), onObserverError: error => errors.push(error) });
    viewer.on('*', event => events.push(event));
    const result = viewer.execute({ type: 'model.style', range: .75 }, { origin: 'ui', operationId: 'slider' });
    assert.equal(result.revision, 1);
    assert.deepEqual(viewer.getState().modelStyle, { opacity: .4, focus: 'full', range: .75 });
    const event = events.find(event => event.type === 'model.style');
    assert.equal(event.operationId, 'slider'); assert.equal(event.origin, 'ui'); assert.equal(event.revision, 1);
    assert.equal(viewer.execute({ type: 'model.style', opacity: 2 }).error.code, 'invalid_argument');
    assert.equal(viewer.getState().revision, 1);
    assert.equal(viewer.execute({ type: 'model.visibility', visible: true }).status, 'succeeded');
    assert.equal(visible, true); assert.deepEqual(errors, []); viewer.dispose();
  }
});

test('failed object visibility persistence publishes no successful change event', () => {
  let viewer;
  const events = [];
  const commands = createCommandRegistry(createModelCommands({ readStyle: () => ({}), applyStyle: () => {}, setVisible: () => {},
    setObjects: () => { throw Object.assign(new Error('storage unavailable'), { code: 'storage_failed' }); },
    notify: (...args) => viewer.notify(...args),
  }));
  viewer = createViewerController({ profile: 'application', commands, readState: () => ({}) });
  viewer.on('*', event => events.push(event));
  const result = viewer.execute({ type: 'model.objectsVisibility', ids: [1], signature: 'one', visible: false });
  assert.equal(result.status, 'failed'); assert.equal(result.error.code, 'storage_failed'); assert.equal(result.revision, 0);
  assert.equal(events.some(event => event.type === 'model.objectsChanged'), false); viewer.dispose();
});

test('random and legacy HSL player colors remain compatible with the public layout', () => {
  for (let index = 0; index < 32; index++) assert.match(playerBaseColor(index, `player-${index}`), /^#[0-9a-f]{6}$/);
  const workspace = projectWorkspace({ points: [{ kind: 'player', id: 'one', team: 'T', position: [0,0,0], baseColor: 'hsl(0, 72%, 65%)' }] });
  assert.equal(workspace.players[0].baseColor, '#e66565');
});
