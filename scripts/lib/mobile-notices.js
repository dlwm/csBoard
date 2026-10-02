import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function copyMobileNotices(root, env) {
  const output = path.join(root, 'build/mobile/web/licenses');
  const cwd = path.join(root, 'native/mobile');
  const listed = spawnSync('go', ['list', '-mod=readonly', '-m', '-f', '{{.Path}}|{{.Version}}|{{.Dir}}', 'all'], { cwd, env, encoding: 'utf8' });
  if (listed.error || listed.status !== 0) throw new Error(`Cannot collect mobile dependency notices: ${listed.stderr || listed.error}`);
  fs.mkdirSync(output, { recursive: true });
  const notices = [];
  for (const line of listed.stdout.trim().split('\n')) {
    const [name, version, directory] = line.split('|');
    if (name.startsWith('csboard/') || !directory) continue;
    const files = fs.readdirSync(directory).filter(file => /^(LICENSE|LICENCE|COPYING|NOTICE)([._-]|$)/i.test(file) && fs.statSync(path.join(directory, file)).isFile());
    const destination = path.join(output, name.replaceAll('/', '__'));
    fs.mkdirSync(destination, { recursive: true });
    for (const file of files) fs.copyFileSync(path.join(directory, file), path.join(destination, file));
    notices.push({ name, version, files });
  }
  for (const name of ['core', 'android', 'ios', 'app', 'screen-orientation']) {
    const source = path.join(root, 'node_modules/@capacitor', name, 'LICENSE');
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(output, `capacitor-${name}.txt`));
  }
  const goroot = spawnSync('go', ['env', 'GOROOT'], { cwd, env, encoding: 'utf8' });
  if (goroot.error || goroot.status !== 0) throw new Error('Cannot locate Go runtime notices');
  fs.copyFileSync(path.join(goroot.stdout.trim(), 'LICENSE'), path.join(output, 'Go.txt'));
  fs.writeFileSync(path.join(output, 'dependencies.json'), JSON.stringify(notices, null, 2) + '\n');
}
