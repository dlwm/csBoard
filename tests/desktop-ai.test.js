import test from 'node:test';
import assert from 'node:assert/strict';
import { isDesktopRuntime } from '../src/app/runtime.js';
import { registerCsboardTools } from '../src/webmcp/registerCsboardTools.js';

test('AI tools require the desktop preload marker, not just a browser API', () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const registered = [];
  globalThis.document = { modelContext: { registerTool: (tool, options) => {
    registered.push({ tool, options });
    return Promise.resolve();
  } } };
  try {
    globalThis.window = {};
    assert.equal(isDesktopRuntime(), false);
    registerCsboardTools({ maps: [] })();
    assert.equal(registered.length, 0);

    globalThis.window = { csboardDesktop: { isDesktop: true } };
    assert.equal(isDesktopRuntime(), true);
    const cleanup = registerCsboardTools({ maps: [] });
    assert.ok(registered.some(({ tool }) => tool.name === 'get_round_analysis'));
    assert.ok(registered.some(({ tool }) => tool.name === 'capture_3d_view'));
    cleanup();
    assert.ok(registered.every(({ options }) => options.signal.aborted));

    globalThis.document = {};
    assert.doesNotThrow(() => registerCsboardTools({ maps: [] })());
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
