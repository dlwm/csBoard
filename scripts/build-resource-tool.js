import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pin from '../config/resources/source2viewer.json' with { type: 'json' };

async function ensureNotice(directory) {
  const license = path.join(directory, 'LICENSE-Source2Viewer.txt');
  if (!await fs.access(license).then(() => true, () => false)) {
    const response = await fetch(`https://raw.githubusercontent.com/${pin.repository}/${pin.version}/LICENSE`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('Unable to obtain Source 2 Viewer license');
    await fs.writeFile(license, await response.text());
  }
  await fs.writeFile(path.join(directory, 'NOTICE.txt'), `Powered by Source 2 Viewer (ValveResourceFormat) ${pin.version}\nhttps://github.com/${pin.repository}\nSee LICENSE-Source2Viewer.txt for the upstream MIT license.\n`);
}

export async function buildResourceTool(target = `${process.platform}-${process.arch}`) {
  const spec = pin.targets[target];
  if (!spec) throw new Error(`Unsupported resource converter target: ${target}`);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../build/resource-tool', target);
  const executable = path.join(root, spec.executable);
  const infoFile = path.join(root, 'build-info.json');
  const existing = JSON.parse(await fs.readFile(infoFile, 'utf8').catch(() => '{}'));
  if (existing.sha256 === spec.sha256 && existing.target === target && await fs.access(executable).then(() => true, () => false)) { await ensureNotice(root); return root; }
  const temporary = `${root}.staging`;
  await fs.rm(temporary, { recursive: true, force: true });
  await fs.mkdir(temporary, { recursive: true });
  try {
    console.log(`Preparing Source 2 Viewer ${pin.version} (${target})…`);
    const response = await fetch(`https://github.com/${pin.repository}/releases/download/${pin.version}/${spec.asset}`, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`Resource converter download failed (${response.status})`);
    const archive = Buffer.from(await response.arrayBuffer());
    if (archive.length > 150 * 1024 ** 2 || createHash('sha256').update(archive).digest('hex') !== spec.sha256) throw new Error('Resource converter checksum mismatch');
    const zip = `${temporary}.zip`;
    await fs.writeFile(zip, archive);
    try {
      const result = process.platform === 'win32'
        ? spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:CSBOARD_TOOL_ZIP -DestinationPath $env:CSBOARD_TOOL_OUTPUT -Force'], { env: { ...process.env, CSBOARD_TOOL_ZIP: zip, CSBOARD_TOOL_OUTPUT: temporary }, stdio: 'inherit' })
        : spawnSync('unzip', ['-q', zip, '-d', temporary], { stdio: 'inherit' });
      if (result.error || result.status !== 0) throw new Error('Unable to unpack the resource converter');
    } finally { await fs.rm(zip, { force: true }); }
    await fs.access(path.join(temporary, spec.executable));
    if (process.platform !== 'win32') await fs.chmod(path.join(temporary, spec.executable), 0o755);
    await ensureNotice(temporary);
    await fs.writeFile(path.join(temporary, 'build-info.json'), JSON.stringify({ version: pin.version, target, sha256: spec.sha256 }));
    await fs.rm(root, { recursive: true, force: true });
    await fs.rename(temporary, root);
    return root;
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}
