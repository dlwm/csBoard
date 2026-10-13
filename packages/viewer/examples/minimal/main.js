import { createViewer } from '@csboard/viewer';
import { openReplayPackageSource } from '@csboard/viewer/format';

const $ = id => document.getElementById(id);
let viewer, source, pending;
function close() {
  pending?.abort(); pending = null;
  // The view borrows its data source. Release it after disposing the view.
  // 视图借用来源；先销毁视图，再释放标准包读取器。
  viewer?.dispose(); viewer = null;
  source?.dispose(); source = null;
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
    viewer = createViewer({ container: $('viewport'), navData, mapName: metadata.mapName });
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
    candidate?.dispose(); close(); throw error;
  } finally { pending = null; $('open').disabled = false; }
});
$('segment').onchange = handle(() => execute({ type: 'replay.open', segmentId: $('segment').value }));
$('seek').oninput = handle(() => execute({ type: 'replay.seek', tick: Number($('seek').value) }));
$('play').onclick = handle(() => execute({ type: viewer.getState().playback.playing ? 'replay.pause' : 'replay.play' }));
$('close').onclick = () => { close(); $('status').textContent = 'Closed.'; };
window.addEventListener('pagehide', close, { once: true });
