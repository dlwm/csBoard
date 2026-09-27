import test from 'node:test';
import assert from 'node:assert/strict';
import { startRenderLoop } from '../src/three/renderLoop.js';

let current;
const presentation = { current: () => current.initial, subscribe: callback => { current.listener = callback; return () => { current.listener = null; }; } };
function fixture(t) {
  let resolve, id = 0;
  const initial = new Promise(done => { resolve = done; });
  current = { initial, listener: null };
  const document = new EventTarget();
  document.hidden = false;
  const frames = new Map(), draws = [];
  const globals = { window: { csboardDesktop: { isDesktop: true, native: {}, presentation } }, document,
    requestAnimationFrame: callback => { frames.set(++id, callback); return id; }, cancelAnimationFrame: id => frames.delete(id) };
  const restore = [];
  for (const [name, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    restore.push(() => descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name]);
  }
  const stop = startRenderLoop(now => draws.push(now));
  t.after(() => { stop(); restore.forEach(fn => fn()); });
  return { document, frames, draws, stop, resolve, native: value => current.listener(value),
    frame(now) { const [id, callback] = frames.entries().next().value; frames.delete(id); callback(now); },
    hidden(value) { document.hidden = value; document.dispatchEvent(new Event('visibilitychange')); } };
}

test('hidden/minimized windows stop drawing and resume with exactly one frame scheduled', async t => {
  const f = fixture(t);
  f.resolve(true); await Promise.resolve();
  assert.equal(f.frames.size, 1);
  f.frame(10); assert.deepEqual(f.draws, [10]);
  f.hidden(true); assert.equal(f.frames.size, 0);
  f.native(false); f.hidden(false); assert.equal(f.frames.size, 0);
  f.native(true); f.native(true); assert.equal(f.frames.size, 1);
  f.frame(20); assert.deepEqual(f.draws, [10, 20]);
  f.stop(); assert.equal(f.frames.size, 0);
  f.hidden(true); f.hidden(false); assert.equal(f.frames.size, 0);
});

test('late initial visibility cannot override a newer minimize event or restart a disposed loop', async t => {
  const f = fixture(t);
  f.native(false);
  f.resolve(true); await Promise.resolve();
  assert.equal(f.frames.size, 0);
  f.native(true); assert.equal(f.frames.size, 1);
  const lateFrame = f.frames.values().next().value;
  f.stop(); lateFrame(30);
  assert.deepEqual(f.draws, []);
  assert.equal(f.frames.size, 0);
});
