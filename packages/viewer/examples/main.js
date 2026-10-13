import { utilitySource, createUtilityRenderer } from './utilityDriver.js';
import { createViewerToolAdapter } from '../src/index.js';
import { createVoiceDecoder } from '../../../src/demo/voice/createVoiceDecoder.js';
import { createWebAudioVoiceDriver } from '../src/index.js';
import { readCsboardDirectorEvent } from '../../../src/demo/directorAdapter.js';
import { weaponIconKey } from '../src/index.js';
const iconModules = import.meta.glob('../../../src/assets/icons/Equip/*.svg', { eager: true, query: '?url', import: 'default' });
const iconUrls = Object.fromEntries(Object.entries(iconModules).map(([path, url]) => [path.split('/').pop().replace('.svg', ''), url]));
import { readCsboardProducerFields } from '../../../src/formats/replayAdapter.js';
import { createViewer, sourceToScene, createGltfResourceLoader } from '../src/index.js';
// Only the host example chooses a map. The viewer has no map catalogue.
import navData from '../../../src/data/nav/de_dust2.json';
import nukeNav from '../../../src/data/nav/de_nuke.json';
const log = document.querySelector('#events'), entries = [];
let modelUrl;
const weaponIcons = (weapon, { side }) => { const key = weaponIconKey(weapon, { side }); return { key, url: iconUrls[key] }; };
const resourceLoader = createGltfResourceLoader({ resolve: () => modelUrl ? [modelUrl] : [] });
// This host chooses tile rectangles; no application DOM selectors reach the library.
const monitorLayout = ({ width, height, playerIds }) => {
  if (width < 64 || height < playerIds.length * 8 || !playerIds.length) return null;
  const mainWidth = width * .68 - 10;
  return { mainWidth, tiles: playerIds.map((id, index) => ({ id, x: mainWidth + 10,
    y: height - (index + 1) * height / playerIds.length,
    width: width - mainWidth - 14, height: height / playerIds.length - 4,
  })) };
};
let voiceContext = null;
const voiceDriver = createWebAudioVoiceDriver({ getContext: () => voiceContext });
const voiceDecoder = createVoiceDecoder();
const viewers = ['first', 'second'].map(id => createViewer({ container: document.getElementById(id), utilitySource: id === 'first' ? utilitySource : null, createUtilityRenderer: id === 'first' ? createUtilityRenderer : null, navData: id === 'first' ? navData : nukeNav, mapName: id === 'first' ? 'de_dust2' : 'de_nuke', floorBoundary: id === 'second' ? -495 : null, voiceDriver: id === 'first' ? voiceDriver : null, voiceDecoder: id === 'first' ? voiceDecoder : null, readProducerFields: readCsboardProducerFields, readDirectorEvent: readCsboardDirectorEvent, monitorLayout: id === 'first' ? monitorLayout : null, resourceLoader, weaponIcons, flashMode: 'source-duration' }));
const locations = Object.values(navData.areas).slice(15, 20).map(area => Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, area.corners.reduce((sum, corner) => sum + corner[axis], 0) / area.corners.length])));
const colors = ['#4086e8', '#e5cd48', '#ed943e', '#59b679', '#ac72d8'];
for (const [index, viewer] of viewers.entries()) {
  viewer.on('*', event => { entries.push({ instance: index + 1, ...event }); log.textContent = JSON.stringify(entries.slice(-5), null, 2); });
  const positions = index === 0 ? locations : Object.values(nukeNav.areas).slice(15, 20).map(area => Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, area.corners.reduce((sum, corner) => sum + corner[axis], 0) / area.corners.length])));
  viewer.execute({ type: 'board.apply', snapshot: { points: positions.map((point, i) => ({ id: `player-${i}`, name: `Player ${i + 1}`, team: i % 2 ? 'T' : 'CT', position: sourceToScene([point.x, point.y, point.z], viewer.getState().coordinates.origin), baseColor: colors[i] })) } });
  viewer.execute({ type: 'camera.focusPlayer', id: 'player-0' });
}
viewers[1].execute({ type: 'camera.mode', mode: '2d' });
document.querySelector('#rename').onclick = () => viewers[0].execute({ type: 'player.rename', id: viewers[0].getState().workspace.points[0]?.id || '', name: 'Renamed by host' }, { origin: 'example-ui', expectedRevision: viewers[0].getState().revision });
document.querySelector('#mode').onclick = () => viewers[0].execute({ type: 'camera.mode', mode: viewers[0].getState().camera.mode === '2d' ? '3d' : '2d' }, { origin: 'example-ui' });
document.querySelector('#dispose').onclick = event => { viewers[1].dispose(); event.currentTarget.disabled = true; };
// The example exposes handles for host inspection; the library does not use globals.
window.exampleViewers = viewers;
window.addEventListener('pagehide', () => viewers.forEach(viewer => viewer.dispose()), { once: true });


let replaySource;
const status = document.querySelector('#replay-status');
const seek = document.querySelector('#seek');
const roundSelect = document.querySelector('#segment');
const controls = document.querySelector('#replay-controls');
const invoke = async command => {
  const result = await viewers[0].execute(command, { origin: 'example-ui' });
  if (result.status !== 'succeeded') status.textContent = result.error.message;
  return result;
};
viewers[0].on('*', event => {
  if (event.type.startsWith('playback.')) {
    const state = viewers[0].getState().playback;
    controls.hidden = state.status !== 'ready';
    document.querySelector('#copy-frame').disabled = state.status !== 'ready';
    document.querySelector('#rename').disabled = !viewers[0].getCapabilities().editing;
    if (state.segment) { roundSelect.value = state.segment.id; status.textContent = `${replaySource.getMetadata().name} · ${state.segment.id}`; seek.min = state.segment.startTick; seek.max = state.segment.endTick; seek.value = state.tick; }
    document.querySelector('#time').textContent = state.segment ? `${((state.tick - state.segment.activeStartTick) / replaySource.getMetadata().tickRate).toFixed(1)}s` : '';
  }
});
roundSelect.onchange = () => invoke({ type: 'replay.open', segmentId: roundSelect.value });
seek.oninput = () => invoke({ type: 'replay.seek', tick: Number(seek.value) });
document.querySelector('#play').onclick = () => invoke({ type: viewers[0].getState().playback.playing ? 'replay.pause' : 'replay.play' });
document.querySelector('#speed').onchange = event => invoke({ type: 'replay.speed', speed: Number(event.target.value) });
// The host loads the package; all playback timing and rendering live in the library.
document.querySelector('#replay-file').onchange = async event => {
  const input = event.currentTarget, file = input.files[0];
  if (!file) return;
  input.disabled = true; status.textContent = '读取中…';
  let source;
  try {
    const { openReplayPackageSource } = await import('../src/formats/index.js');
    source = await openReplayPackageSource(await file.arrayBuffer());
    const metadata = source.getMetadata();
    if (metadata.mapName !== 'de_dust2') throw new Error('示例只注入了 de_dust2 NAV，请提供该地图的回放包');
    viewers[0].setDataSource(source); replaySource?.dispose(); replaySource = source;
    const segments = source.listSegments();
    roundSelect.replaceChildren(...segments.map(segment => { const option = document.createElement('option'); option.value = segment.id; option.textContent = `Round ${segment.sourceRound ?? segment.id}`; return option; }));
    const selected = segments.find(segment => segment.sourceRound === 22) || segments[0];
    roundSelect.value = selected.id;
    const result = await invoke({ type: 'replay.open', segmentId: selected.id });
    if (result.status !== 'succeeded') throw new Error(result.error.message);
    const point = viewers[0].getState().workspace.points[0];
    if (point) await invoke({ type: 'camera.focusPlayer', id: point.id });
    status.textContent = `${metadata.name} · ${selected.id}`;
  } catch (error) { if (source && source !== replaySource) source.dispose(); status.textContent = error.message; }
  finally { input.disabled = false; input.value = ''; }
};
window.addEventListener('pagehide', () => replaySource?.dispose(), { once: true });

document.querySelector('#copy-frame').onclick = async () => {
  const points = viewers[0].getState().workspace.points;
  viewers[0].setDataSource(null); replaySource?.dispose(); replaySource = null;
  await invoke({ type: 'board.apply', snapshot: { points } });
  status.textContent = '当前帧已复制为可编辑布局';
};

const modelStatus = document.querySelector('#model-status');
viewers[0].on('resource.state', event => {
  const value = event.payload;
  modelStatus.textContent = `${value.status} · ${(value.loaded / 1024 ** 2).toFixed(1)} MiB${value.error ? ' · ' + value.error.message : ''}`;
});
document.querySelector('#model-file').onchange = async event => {
  const input = event.currentTarget, file = input.files[0]; if (!file) return;
  await invoke({ type: 'model.unload' });
  if (modelUrl) URL.revokeObjectURL(modelUrl);
  modelUrl = URL.createObjectURL(file);
  await invoke({ type: 'model.visibility', visible: true }); input.value = '';
};
document.querySelector('#model-toggle').onclick = () => invoke({ type: 'model.visibility', visible: !viewers[0].getState().modelVisible });
document.querySelector('#model-unload').onclick = () => invoke({ type: 'model.unload' });
window.addEventListener('pagehide', () => { if (modelUrl) URL.revokeObjectURL(modelUrl); }, { once: true });

// Host UI renders metadata, and changes visibility through public commands.
// 树按需展开，避免大型地图一次创建数千行 DOM；根节点同样可折叠。
const objectsTree = document.querySelector('#objects-tree');
const renderObjects = () => {
  const opened = new Set([...objectsTree.querySelectorAll('details[open]')].map(item => item.dataset.key));
  objectsTree.replaceChildren();
  if (viewers[0].getState().resources[0]?.status !== 'ready') return;
  const { tree, signature } = viewers[0].getModelObjectTree(document.querySelector('#objects-query').value);
  const visible = new Set(viewers[0].getModelObjects({ limit: 1000 }).objects.filter(item => item.visible).map(item => item.id));
  // Query remaining pages so visibility checkboxes reflect the complete catalogue.
  const total = viewers[0].getModelObjects({ limit: 1 }).total;
  for (let offset = 1000; offset < total; offset += 1000) for (const item of viewers[0].getModelObjects({ offset, limit: 1000 }).objects) if (item.visible) visible.add(item.id);
  const append = (branch, parent) => {
    const details = document.createElement('details'), summary = document.createElement('summary'), box = document.createElement('input');
    box.type = 'checkbox'; box.checked = branch.ids.length > 0 && branch.ids.every(id => visible.has(id));
    box.indeterminate = branch.ids.some(id => visible.has(id)) && !box.checked;
    box.onclick = event => event.stopPropagation();
    box.onchange = async () => { await invoke({ type: 'model.objectsVisibility', ids: branch.ids, visible: box.checked, signature }); renderObjects(); };
    summary.append(box, document.createTextNode(`${branch.label || 'root'} (${branch.ids.length})`)); details.append(summary); details.dataset.key = branch.key; parent.append(details);
    details.addEventListener('toggle', () => { if (!details.open || details.childElementCount > 1) return; const children = document.createElement('div'); children.style.paddingLeft = '20px'; for (const child of branch.children) append(child, children); details.append(children); });
    if (opened.has(branch.key)) details.open = true;
  };
  append(tree, objectsTree);
};
viewers[0].on('resource.state', event => { if (['ready', 'idle', 'error', 'cancelled'].includes(event.payload.status)) renderObjects(); });
document.querySelector('#objects-query').oninput = renderObjects;
document.querySelector('#model-opacity').oninput = event => invoke({ type: 'model.style', opacity: Number(event.target.value) });
document.querySelector('#model-focus').onchange = event => invoke({ type: 'model.style', focus: event.target.value });
const floor = document.querySelector('#floor');
for (const id of ['all', ...viewers[1].getState().floors.map(item => item.id)]) { const option = document.createElement('option'); option.value = id; option.textContent = id; floor.append(option); }
floor.onchange = () => viewers[1].execute({ type: 'map.floor', id: floor.value }, { origin: 'example-ui' });

viewers[0].on('model.style', event => { document.querySelector('#model-opacity').value = event.payload.opacity; document.querySelector('#model-focus').value = event.payload.focus; });
viewers[1].on('map.floor', event => { floor.value = event.payload.id; });

const povPlayer = document.querySelector('#pov-player');
viewers[0].on('playback.ready', () => {
  povPlayer.replaceChildren(...viewers[0].getState().workspace.points.map(player => { const option = document.createElement('option'); option.value = player.id; option.textContent = player.name; return option; }));
});
document.querySelector('#pov').onclick = () => invoke({ type: 'camera.pov', id: povPlayer.value });
document.querySelector('#free').onclick = () => invoke({ type: 'camera.free' });
document.querySelector('#monitors').onclick = () => invoke({ type: 'camera.monitor', playerIds: viewers[0].getState().camera.monitorIds.length ? [] : viewers[0].getState().workspace.points.slice(0, 4).map(player => player.id) });

// HUD is a host view of the neutral status DTO, not a React dependency.
const roster = document.querySelector('#hud-roster'), kills = document.querySelector('#hud-kills');
const renderHud = () => {
  const { hud } = viewers[0].getState();
  roster.replaceChildren(...hud.players.map(player => {
    const row = document.createElement('button'); row.disabled = !player.cameraAvailable;
    row.textContent = `${player.side} · ${player.name} · ${player.health ?? '?'} HP · ${player.weapon?.name || (player.alive === false ? 'DEAD' : '—')} · ${player.weapon?.ammo ?? '—'}`;
    row.onclick = () => invoke({ type: 'camera.pov', id: player.id }); return row;
  }));
  const bombText = hud.bomb?.status === 'planted' ? `C4 ${hud.bomb.countdownSeconds?.toFixed(1) ?? '?'}s` : '';
  kills.textContent = [bombText, hud.kills.map(kill => `${kill.actorName || '—'} → ${kill.targetName || '—'} · ${kill.weapon || '—'}`).join(' | ')].filter(Boolean).join(' · ');
};
viewers[0].on('*', event => { if (event.type.startsWith('playback.')) renderHud(); });

viewers[0].on('camera.changed', event => { if (event.payload.follow?.playerId) povPlayer.value = event.payload.follow.playerId; });

const directorButtons = document.createElement('div');
for (const [mode, label] of [['follow', '导播'], ['fixed', '固定镜头'], ['chase', '追踪镜头']]) {
  const button = document.createElement('button'); button.textContent = label;
  button.onclick = () => invoke({ type: 'camera.director', mode }); directorButtons.append(button);
}
document.querySelector('#monitors').parentElement.append(directorButtons);
viewers[0].on('camera.director', event => {
  directorButtons.dataset.status = event.payload.status;
  for (const [index, mode] of ['follow', 'fixed', 'chase'].entries()) directorButtons.children[index].setAttribute('aria-pressed', String(event.payload.mode === mode));
});

const overlayControls = document.createElement('div');
for (const [key, label, checked] of [['enabled', '屏幕效果', true], ['reducedEffects', '减弱屏幕效果', false]]) {
  const labelNode = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.checked = checked;
  input.onchange = () => invoke({ type: 'replay.overlays', [key]: input.checked }); labelNode.append(input, label); overlayControls.append(labelNode);
}
directorButtons.after(overlayControls);

const voiceControls = document.createElement('div'), voiceButton = document.createElement('button'), voiceStatus = document.createElement('span');
voiceButton.textContent = '开启语音';
voiceButton.onclick = async () => {
  try {
    const muted = !viewers[0].getState().voice.muted;
    if (!muted) { voiceContext ??= new AudioContext(); await voiceContext.resume(); }
    await invoke({ type: 'voice.configure', muted });
  } catch (error) { voiceStatus.textContent = error.message; }
};
voiceControls.append(voiceButton);
for (const side of ['all', 'T', 'CT']) { const button = document.createElement('button'); button.textContent = side; button.onclick = () => invoke({ type: 'voice.configure', side }); voiceControls.append(button); }
voiceControls.append(voiceStatus); overlayControls.after(voiceControls);
viewers[0].on('voice.state', event => { voiceButton.textContent = event.payload.muted ? '开启语音' : '静音'; voiceStatus.textContent = `语音：${event.payload.status} · ${event.payload.side}`; });
window.addEventListener('pagehide', () => { voiceDriver.dispose(); voiceContext?.close(); }, { once: true });

// External apps and agents call exactly the same public command/policy path.
const tools = createViewerToolAdapter(viewers[0], { origin: 'example-agent' });
window.exampleTools = tools;
window.exampleUtilitySource = utilitySource; // Example-only: inspect or replace the host source during integration.
const integration = document.createElement('details'), title = document.createElement('summary'), input = document.createElement('textarea'), run = document.createElement('button'), describe = document.createElement('button'), output = document.createElement('pre');
title.textContent = '公共接口 / Agent 工具示例'; input.rows = 5; input.cols = 70;
input.value = JSON.stringify({ type: 'workspace.players', players: viewers[0].getWorkspace().players.map((p, i) => i === 0 ? { ...p, name: 'Renamed through common layout' } : p) }, null, 2);
run.textContent = '通过工具入口执行'; describe.textContent = '查看接口契约';
run.onclick = async () => {
  try { const command = JSON.parse(input.value); const result = await tools.invoke('viewer_execute', { command, expectedRevision: viewers[0].getState().revision }); output.textContent = JSON.stringify(result, null, 2); }
  catch (error) { output.textContent = error.message; }
};
describe.onclick = () => { output.textContent = JSON.stringify({ contract: viewers[0].getContract(), tools: tools.listTools() }, null, 2); };
integration.append(title, input, run, describe, output); document.body.append(integration);

const utilityReferenceButton = document.createElement('button'); utilityReferenceButton.textContent = '放置示意闪光（驱动示例）';
utilityReferenceButton.onclick = async () => { const catalogue = await tools.invoke('viewer_get_utilities'); if (catalogue.items?.[0]) output.textContent = JSON.stringify(await tools.invoke('viewer_execute', { command: { type: 'utility.place', referenceId: catalogue.items[0].referenceId }, expectedRevision: viewers[0].getState().revision }), null, 2); else output.textContent = JSON.stringify(catalogue, null, 2); };
integration.append(utilityReferenceButton);
