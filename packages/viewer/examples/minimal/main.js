import { createViewer, createGltfResourceLoader } from '@csboard/viewer';
import { openReplayPackageSource } from '@csboard/viewer/format';

const $ = id => document.getElementById(id);
let viewer, source, pending, modelUrl;
function close() {
  pending?.abort(); pending = null;
  // The view borrows its data source. Release it after disposing the view.
  // 视图借用来源；先销毁视图，再释放标准包读取器。
  viewer?.dispose(); viewer = null;
  source?.dispose(); source = null;
  if (modelUrl) URL.revokeObjectURL(modelUrl); modelUrl = null;
  $('model').value = '';
  $('model').disabled = true; $('model-toggle').disabled = true; $('model-unload').disabled = true; $('model-status').textContent = '';
  $('controls').hidden = true; $('close').disabled = true;
}
async function execute(command) {
  if (!viewer) return;
  const result = await viewer.execute(command, { origin: 'minimal-example' });
  if (result.status !== 'succeeded') throw new Error(result.error.message);
  return result;
}
function update() {
  const state = viewer.getState().playback;
  $('controls').hidden = state.status !== 'ready';
  if (state.segment) {
    $('segment').value = state.segment.id;
    $('seek').min = state.segment.startTick; $('seek').max = state.segment.endTick;
    $('seek').value = state.tick; $('tick').value = String(Math.round(state.tick));
  }
}
const handle = action => async () => {
  try { await action(); } catch (error) { $('status').textContent = error.message; }
};
$('open').onclick = handle(async () => {
  const navFile = $('nav').files[0], replayFile = $('replay').files[0];
  if (!navFile || !replayFile) throw new Error('Choose both files first.');
  close();
  const request = new AbortController(); pending = request;
  $('open').disabled = true; $('close').disabled = false;
  $('status').textContent = 'Reading standard package…';
  let candidate;
  try {
    const navData = JSON.parse(await navFile.text());
    candidate = await openReplayPackageSource(replayFile, { signal: request.signal });
    request.signal.throwIfAborted();
    const metadata = candidate.getMetadata();
    source = candidate;
    const choice = $('input-preset').value;
    const input = choice === 'disabled' ? false : choice === 'custom'
      ? { rotate: { button: 1 }, pan: { button: 1, keys: 'Space' }, forward: 'ArrowUp', backward: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', zoom: true, touch: true, wrap: true } : choice;
    const resourceLoader = createGltfResourceLoader({ resolve: key => key === 'world-model' && modelUrl ? [modelUrl] : [] });
    viewer = createViewer({ container: $('viewport'), navData, mapName: metadata.mapName, input, resourceLoader });
    $('model').disabled = false; $('model-toggle').disabled = false; $('model-unload').disabled = false;
    viewer.on('resource.state', event => {
      const state = event.payload;
      $('model-status').textContent = state.error?.message || (state.status === 'loading' ? `${state.phase || 'Downloading'} ${state.total ? Math.round(state.loaded / state.total * 100) + '%' : state.loaded + ' bytes'}` : state.status);
    });
    viewer.setDataSource(source);
    viewer.on('*', event => { if (event.type.startsWith('playback.')) update(); });
    const segments = source.listSegments();
    $('segment').replaceChildren(...segments.map(segment => {
      const option = document.createElement('option');
      option.value = segment.id; option.textContent = `Round ${segment.sourceRound ?? segment.id}`;
      return option;
    }));
    if (segments[0]) await execute({ type: 'replay.open', segmentId: segments[0].id });
    $('status').textContent = `${metadata.name} · ${metadata.mapName} · ${segments.length} segments`;
    update();
  } catch (error) {
    const cancelled = request.signal.aborted;
    const borrowed = source === candidate;
    close();
    if (!borrowed) candidate?.dispose();
    if (!cancelled) throw error;
  } finally { pending = null; $('open').disabled = false; }
});
$('segment').onchange = handle(() => execute({ type: 'replay.open', segmentId: $('segment').value }));
$('seek').oninput = handle(() => execute({ type: 'replay.seek', tick: Number($('seek').value) }));
$('play').onclick = handle(() => execute({ type: viewer.getState().playback.playing ? 'replay.pause' : 'replay.play' }));
$('model').onchange = handle(async () => {
  const file = $('model').files[0]; if (!viewer || !file) return;
  await execute({ type: 'model.unload' });
  if (modelUrl) URL.revokeObjectURL(modelUrl);
  modelUrl = URL.createObjectURL(file);
  await execute({ type: 'model.visibility', visible: true });
});
$('model-toggle').onclick = handle(() => execute({ type: 'model.visibility', visible: !viewer.getState().modelVisible }));
$('model-unload').onclick = handle(() => execute({ type: 'model.unload' }));
$('close').onclick = () => { close(); $('status').textContent = 'Closed.'; };
window.addEventListener('pagehide', close, { once: true });
