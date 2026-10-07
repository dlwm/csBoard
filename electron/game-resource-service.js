import { ipcMain, dialog } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { detectGameInstallations, inspectGameDirectory, estimateImportSpace } from './game-installation.js';
import { identifyResource } from './resource-store.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const activePhases = new Set(['preparing', 'extracting', 'converting', 'importing', 'cleaning']);
const coded = (code, message) => Object.assign(new Error(message), { code });
async function walk(directory) {
  const files = [];
  const visit = async dir => {
    for (const item of await fs.readdir(dir, { withFileTypes: true })) {
      if (files.length > 10000) throw coded('output', 'Too many exported files');
      const file = path.join(dir, item.name);
      if (item.isDirectory()) await visit(file); else if (item.isFile()) files.push(file);
    }
  };
  await visit(directory); return files;
}

export function registerGameResourceService({ app, authorize, getWindow, store, begin, end }) {
  const supported = ['win32', 'darwin'].includes(process.platform);
  const workingRoot = path.join(app.getPath('userData'), 'resource-imports');
  const destination = path.join(app.getPath('userData'), 'resource-packs');
  const executable = process.platform === 'win32' ? 'Source2Viewer-CLI.exe' : 'Source2Viewer-CLI';
  const tool = app.isPackaged ? path.join(process.resourcesPath, 'resource-tool', executable) : path.join(projectRoot, 'build/resource-tool', `${process.platform}-${process.arch}`, executable);
  const installations = new Map();
  let state = { phase: 'idle', revision: 0, completed: 0, total: 0, results: [] };
  let controller = null;
  const snapshot = () => ({ ...state });
  const emit = changes => {
    state = { ...state, ...changes, revision: state.revision + 1 };
    const target = getWindow()?.webContents;
    if (target && !target.isDestroyed()) target.send('resources:game-progress', snapshot());
  };
  const idle = () => { if (!supported) throw coded('unsupported', 'Game resource imports require a desktop app'); if (controller) throw coded('busy', 'Game resource import is already running'); };
  const add = installation => {
    const previous = [...installations.values()].find(item => item.directory === installation.directory);
    const item = { ...installation, id: previous?.id || randomUUID() };
    installations.set(item.id, item); return item;
  };
  const select = async input => {
    const installation = installations.get(input?.installationId);
    if (!installation || !Array.isArray(input.maps) || typeof input.icons !== 'boolean' || input.maps.some(key => !installation.maps.some(item => item.key === key)) || (!input.maps.length && !input.icons)) throw coded('selection', 'Select a game installation and resources');
    const current = await inspectGameDirectory(installation.directory);
    if (!current || input.maps.some(key => !current.maps.some(item => item.key === key))) throw coded('missing', 'Game files are missing or have changed');
    return { installation: current, maps: [...new Set(input.maps)], icons: input.icons };
  };
  async function space(selection) {
    await fs.mkdir(workingRoot, { recursive: true });
    const stat = await fs.statfs(workingRoot);
    return { requiredBytes: estimateImportSpace(selection.installation, selection.maps, selection.icons), availableBytes: stat.bavail * stat.bsize, destination };
  }
  async function runCli(args, signal) {
    if (signal.aborted) throw coded('cancelled', 'Import cancelled');
    await new Promise((resolve, reject) => {
      const child = spawn(tool, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let tail = '', pending = '';
      const stop = () => child.kill();
      signal.addEventListener('abort', stop, { once: true });
      const observe = bytes => {
        const text = bytes.toString(); tail = (tail + text).slice(-3000); pending = (pending + text).slice(-16000);
        const lines = pending.split(/[\r\n]/); pending = lines.pop();
        for (const line of lines) {
          const match = line.match(/\[(\d+)\/(\d+)\]/);
          if (match) emit({ filesCompleted: Number(match[1]), filesTotal: Number(match[2]) });
        }
      };
      child.stdout.on('data', observe); child.stderr.on('data', observe);
      child.once('error', error => { signal.removeEventListener('abort', stop); reject(error); });
      child.once('close', code => {
        signal.removeEventListener('abort', stop);
        if (signal.aborted) reject(coded(signal.reason === 'space' ? 'space' : signal.reason === 'timeout' ? 'timeout' : 'cancelled', 'Resource conversion stopped'));
        else if (code !== 0) reject(coded('conversion', `Conversion failed (${code}): ${tail}`));
        else resolve();
      });
    });
  }
  async function importOutput(files, signal) {
    emit({ phase: 'importing' });
    const results = [];
    for (const file of files) {
      if (signal.aborted) break;
      const result = await store.importFiles([file], { signal });
      results.push(...result.results);
      emit({ results: [...state.results, ...result.results] });
    }
    return results;
  }
  async function convertMap(installation, key, directory, signal) {
    await fs.mkdir(directory, { recursive: true });
    emit({ phase: 'extracting' });
    // Extract the complete map archive so world nodes, entities and prop models
    // can resolve their dependencies. Convert only the visual world scene;
    // physics exports required manual Blender editing and are not substitutes.
    // 完整提取地图归档以解析场景节点与实体依赖，仅使用 world.glb。
    // 旧 physics 产物需手动经 Blender 修整，不能作为自动导入的回退模型。
    await runCli(['-i', path.join(installation.directory, 'maps', `${key}.vpk`), '-o', directory], signal);
    const quote = value => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
    await fs.writeFile(path.join(directory, 'gameinfo.gi'), `"GameInfo" { "game" "CSBoard conversion" "FileSystem" { "SearchPaths" { "Game" ${quote(directory)} "Game" ${quote(installation.directory)} } } }`);
    const source = path.join(directory, 'maps', key, 'world.vwrld_c');
    await fs.access(source).catch(() => { throw coded('conversion', 'The map has no supported world scene'); });
    emit({ phase: 'converting', filesCompleted: 0, filesTotal: 0 });
    const output = path.join(directory, 'world.glb');
    await runCli(['-i', source, '-o', output, '-d', '--gltf_export_format', 'glb', '--gltf_export_materials', '--gltf_textures_adapt', '--threads', '1'], signal);
    if (signal.aborted) throw coded('cancelled', 'Import cancelled');
    // The common importer discards texture references and image bytes. Exported
    // texture files are never read or embedded into the installed map.
    // 手动导入和游戏提取共用无贴图转换，不再嵌入 PNG 或复制整份带贴图模型。
    const named = path.join(directory, `${key}.glb`);
    await fs.rename(output, named);
    return await importOutput([named], signal);
  }
  async function convertIcons(installation, directory, signal) {
    await fs.mkdir(directory, { recursive: true });
    emit({ phase: 'extracting' });
    // Team emblems live directly under icons/, outside equipment/ and ui/.
    // 阵营标志位于 icons 根目录，单独纳入提取范围，避免遗漏。
    await runCli(['-i', path.join(installation.directory, 'pak01_dir.vpk'), '-o', directory, '-d', '--vpk_extensions', 'svg,vsvg_c,vtex_c', '--vpk_filepath', 'panorama/images/icons/equipment/,panorama/images/icons/ui/,panorama/images/icons/t_logo.,panorama/images/icons/ct_logo.,panorama/images/hud/', '--threads', '2'], signal);
    const exported = (await walk(directory)).filter(file => file.toLowerCase().endsWith('.svg'));
    const usesInternalM4Names = exported.some(file => /^m4a1_silencer\.svg$/i.test(path.basename(file)));
    const namedDirectory = path.join(directory, 'named');
    await fs.mkdir(namedDirectory, { recursive: true });
    const unique = new Map();
    // SVG resources are matched by the same filename/alias rules as manual imports.
    // 道具与 HUD 名称使用现有映射；非支持图像明确跳过，不伪造成功结果。
    for (const file of exported) {
      let name = path.basename(file).toLowerCase().replace(/^weapon_/, '');
      // Internal m4a1 means M4A4 when the silencer variant is separately named.
      // 游戏内部 m4a1 与 m4a1_silencer 分别对应 M4A4 与 M4A1-S。
      if (usesInternalM4Names && name === 'm4a1.svg') name = 'm4a4.svg';
      const resource = identifyResource(name);
      if (!resource || unique.has(resource.name)) continue;
      const normalized = path.join(namedDirectory, resource.name);
      await fs.copyFile(file, normalized);
      unique.set(resource.name, normalized);
    }
    if (!unique.size) throw coded('icons', 'No supported SVG icons were found in the game archive');
    return await importOutput([...unique.values()], signal);
  }
  async function start(input) {
    idle();
    const selection = await select(input);
    const reservation = await space(selection);
    if (reservation.availableBytes < reservation.requiredBytes) throw coded('space', 'Not enough free disk space for game resource conversion');
    await fs.access(tool).catch(() => { throw coded('tool', 'Resource converter is missing; rebuild the desktop package'); });
    idle(); begin();
    const request = controller = new AbortController();
    emit({ phase: 'preparing', completed: 0, total: selection.maps.length + Number(selection.icons), results: [], error: null, current: '', filesCompleted: 0, filesTotal: 0 });
    const timeout = setTimeout(() => request.abort('timeout'), 60 * 60 * 1000);
    const diskTimer = setInterval(() => fs.statfs(workingRoot).then(stat => { if (stat.bavail * stat.bsize < 256 * 1024 ** 2) request.abort('space'); }).catch(() => {}), 2000);
    const execute = async () => {
      let staging;
      try {
        // Staging belongs solely to this importer; previous interrupted work is removed.
        await fs.rm(workingRoot, { recursive: true, force: true });
        await fs.mkdir(workingRoot, { recursive: true });
        staging = await fs.mkdtemp(path.join(workingRoot, 'game-'));
        const jobs = [...(selection.icons ? ['icons'] : []), ...selection.maps];
        for (const key of jobs) {
          if (request.signal.aborted) break;
          const output = path.join(staging, key);
          emit({ phase: 'converting', current: key, filesCompleted: 0, filesTotal: 0 });
          try {
            if (key === 'icons') await convertIcons(selection.installation, output, request.signal);
            else await convertMap(selection.installation, key, output, request.signal);
          } catch (error) {
            if (!request.signal.aborted) emit({ results: [...state.results, { name: key === 'icons' ? 'UI' : `${key}.glb`, ok: false, error: error.message, code: error.code || 'conversion' }] });
          } finally { await fs.rm(output, { recursive: true, force: true }).catch(() => {}); }
          if (!request.signal.aborted) emit({ completed: state.completed + 1 });
        }
        const stopped = request.signal.aborted;
        emit({ phase: 'cleaning' });
        if (staging) await fs.rm(staging, { recursive: true, force: true });
        const status = await store.status();
        emit({ phase: stopped ? (request.signal.reason === 'cancelled' ? 'cancelled' : 'failed') : 'complete', status, error: stopped && request.signal.reason !== 'cancelled' ? { code: request.signal.reason, message: 'Resource import stopped' } : null });
      } catch (error) { emit({ phase: 'failed', error: { code: error.code || 'conversion', message: error.message }, status: await store.status().catch(() => null) }); }
      finally {
        clearTimeout(timeout); clearInterval(diskTimer);
        if (staging) await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
        if (controller === request) controller = null;
        end();
      }
    };
    execute().catch(() => {});
    return snapshot();
  }
  for (const [action, handler] of Object.entries({
    status: () => snapshot(),
    detect: async () => { idle(); return (await detectGameInstallations()).map(add); },
    choose: async () => {
      idle();
      const chosen = await dialog.showOpenDialog(getWindow(), { properties: ['openDirectory'] });
      if (chosen.canceled) return null;
      const installation = await inspectGameDirectory(chosen.filePaths[0]);
      if (!installation) throw coded('missing', 'Select a CS2 game directory containing gameinfo.gi and pak01_dir.vpk');
      return add(installation);
    },
    estimate: async input => { idle(); return space(await select(input)); },
    start,
    cancel: () => { controller?.abort('cancelled'); return snapshot(); },
  })) ipcMain.handle(`resources:game-${action}`, (event, ...args) => { authorize(event); return handler(...args); });
  app.once('before-quit', () => controller?.abort('cancelled'));
  return { get busy() { return activePhases.has(state.phase); } };
}
