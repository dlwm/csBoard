import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('relocated Wrangler configs resolve project paths and retain root persistence', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const configDir = path.join(root, 'config/cloudflare');
  for (const name of ['dev', 'backend', 'frontend']) {
    const config = JSON.parse(fs.readFileSync(path.join(configDir, `wrangler.${name}.jsonc`), 'utf8'));
    assert.ok(fs.existsSync(path.resolve(configDir, config.$schema)));
    if (config.main) assert.equal(path.resolve(configDir, config.main), path.join(root, 'server/index.js'));
    if (config.assets) assert.equal(path.resolve(configDir, config.assets.directory), path.join(root, 'dist'));
    if (config.build) {
      assert.equal(config.build.cwd, '.');
      assert.equal(path.resolve(configDir, config.build.watch_dir), path.join(root, 'src'));
    }
  }
  const launcher = fs.readFileSync(path.join(root, 'scripts/dev-workers.js'), 'utf8');
  assert.ok(launcher.includes('config/cloudflare/wrangler.dev.jsonc'));
  assert.ok(launcher.includes("'--persist-to', path.join(root, '.wrangler/state')"));
});
