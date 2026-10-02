import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function prepareGoParserSource(root, { localSource = false } = {}) {
  if (localSource && process.env.CI) throw new Error('--local-source is for local fork development only');
  const source = path.join(root, '.local/demoparser/demoinfocs');
  const goRoot = path.join(root, 'native/parser');
  const { revision, repository: remote } = JSON.parse(fs.readFileSync(path.join(goRoot, 'source.json'), 'utf8'));
  if (!/^https:\/\/github\.com\/dlwm\/demoinfocs(?:\.git)?$/.test(remote) || !/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error('Invalid Go parser source pin');
  }
  function run(command, args, cwd = root, env = process.env) {
    const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} failed (${result.signal || result.status})`);
  }
  function read(command, args, cwd = root) {
    const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
    if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.error}`);
    return result.stdout.trim();
  }
  if (!fs.existsSync(source)) {
    fs.mkdirSync(path.dirname(source), { recursive: true });
    run('git', ['clone', remote, source]);
    run('git', ['checkout', '--detach', revision], source);
  }
  if (path.resolve(read('git', ['rev-parse', '--show-toplevel'], source)) !== source) throw new Error(`Unexpected parser checkout at ${source}`);
  const dirty = Boolean(read('git', ['status', '--porcelain', '--', '.', ':!**/.DS_Store', ':!.DS_Store'], source));
  if (dirty && !localSource) {
    throw new Error(`Parser checkout has local changes in ${source}; use node scripts/build-go-parser.js --local-source for local development, or publish the fork changes and update native/parser/source.json for a reproducible build.`);
  }
  if (!localSource && read('git', ['rev-parse', 'HEAD'], source) !== revision) {
    run('git', ['fetch', remote, revision], source);
    run('git', ['checkout', '--detach', revision], source);
  }
  const sourceRevision = read('git', ['rev-parse', 'HEAD'], source);
   return { source, revision: sourceRevision, dirty };

}
