import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import catalog from '../electron/resource-catalog.json' with { type: 'json' };
import { validateResource } from '../electron/resource-store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultConfig = path.join(root, '.local', 'worker-resource-pack.json');
const iconFolders = ['Equip', 'HUD', 'SideLogo', ''];

export async function collectWorkerIcons(configFile = defaultConfig, optional = false) {
  let config;
  try { config = JSON.parse(await fs.readFile(configFile, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT' && optional) return [];
    throw error;
  }
  if (!config || typeof config.iconDirectory !== 'string' || !config.iconDirectory.trim()) {
    throw new Error(`Invalid Worker resource-pack config: ${configFile}`);
  }
  const directory = path.resolve(root, config.iconDirectory);
  if (!(await fs.stat(directory)).isDirectory()) throw new Error(`Icon directory is not a directory: ${directory}`);
  const icons = [];
  for (const name of catalog.icons) {
    const candidates = await Promise.all(iconFolders.map(async (folder) => {
      const source = path.join(directory, folder, `${name}.svg`);
      try { return (await fs.stat(source)).isFile() ? source : null; }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    }));
    const matches = candidates.filter(Boolean);
    if (matches.length > 1) throw new Error(`Duplicate Worker icon: ${name}`);
    if (matches.length) icons.push({ name, source: matches[0] });
  }
  return icons;
}

export async function stageWorkerIcons(icons, outputDirectory = path.join(root, 'dist')) {
  const destination = path.join(outputDirectory, 'resource-pack', 'icons');
  if (!icons.length) return;
  await fs.mkdir(destination, { recursive: true });
  for (const icon of icons) {
    const target = path.join(destination, `${icon.name}.svg`);
    await fs.copyFile(icon.source, target);
    // Validate the staged copy so a rejected asset never changes the local pack.
    await validateResource(target, { kind: 'icons' });
  }
}

async function main() {
  const configFile = process.env.CF_RESOURCE_PACK_CONFIG
    ? path.resolve(root, process.env.CF_RESOURCE_PACK_CONFIG)
    : defaultConfig;
  const icons = await collectWorkerIcons(configFile, !process.env.CF_RESOURCE_PACK_CONFIG);
  const result = spawnSync('npm', ['run', 'build:remote'], {
    cwd: root,
    env: { ...process.env, VITE_WORKER_RESOURCE_ICONS: JSON.stringify(icons.map(icon => icon.name)) },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
  await stageWorkerIcons(icons);
  console.log(`Worker resource pack: ${icons.length ? `${icons.length} UI icons` : 'default UI'}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
