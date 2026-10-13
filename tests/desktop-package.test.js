import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDesktopModuleGraph } from '../scripts/lib/desktop-module-graph.js';

function archive(overrides = {}) {
  const files = {
    'electron/main.js': "import '../shared/models.js'; import catalog from '../src/catalog.json' with {type:'json'};",
    'electron/preload.cjs': "require('../shared/protocol.cjs');",
    'shared/protocol.cjs': 'module.exports = {};',
    'shared/models.js': "export * from '../packages/viewer/objects.js';",
    'packages/viewer/objects.js': 'export const model = {};',
    'src/catalog.json': '{}', ...overrides,
  };
  return file => { if (typeof files[file] !== 'string') throw Error('Not in archive'); return Buffer.from(files[file]); };
}

test('packaged dependency graph follows re-exports, JSON and preload requires', () => {
  const files = checkDesktopModuleGraph(archive());
  assert.ok(files.includes('packages/viewer/objects.js'));
  assert.ok(files.includes('src/catalog.json'));
  assert.ok(files.includes('shared/protocol.cjs'));
});
test('missing viewer dependency fails with the full packaged import chain', () => {
  assert.throws(() => checkDesktopModuleGraph(archive({'packages/viewer/objects.js': null})), /electron\/main.js -> shared\/models.js -> packages\/viewer\/objects.js/);
  assert.throws(() => checkDesktopModuleGraph(archive({'shared/protocol.cjs': null})), /electron\/preload.cjs -> shared\/protocol.cjs/);
});
test('cycles terminate and comments do not become dependencies', () => {
  assert.doesNotThrow(() => checkDesktopModuleGraph(archive({'packages/viewer/objects.js': "import '../../shared/models.js'; // import './missing.js'"})));
});
test('AI-disabled packages may omit only the known optional dynamic entry', () => {
  const read = archive({'electron/main.js': "if (enabled) import('./ai-service.js');"});
  assert.doesNotThrow(() => checkDesktopModuleGraph(read, {aiEnabled:false}));
  assert.throws(() => checkDesktopModuleGraph(read), /ai-service.js/);
  assert.throws(() => checkDesktopModuleGraph(archive({'electron/main.js': "import './missing.js';"}), {aiEnabled:false}), /missing.js/);
});

test('Intel Node can find an ARM macOS application without mistaking other files for a bundle',async t=>{
  const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
  const {findDesktopApplication}=await import('../scripts/lib/desktop-paths.js');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'csboard-launcher-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const metadata={name:'csboard',build:{productName:'CSBoard',directories:{output:'build/desktop'}}};
  const bundle=path.join(root,'build/desktop/mac-arm64/CSBoard.app');
  await fs.mkdir(bundle,{recursive:true});
  const wrong=path.join(root,'build/desktop/mac/CSBoard.app');await fs.mkdir(path.dirname(wrong),{recursive:true});await fs.writeFile(wrong,'not a bundle');
  assert.equal(await findDesktopApplication(root,metadata,{platform:'darwin',arch:'x64'}),bundle);
  await fs.rm(bundle,{recursive:true});
  await assert.rejects(findDesktopApplication(root,metadata,{platform:'darwin',arch:'x64'}),/Checked paths:/);
});
