import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'vite';
import { checkWorkspaceNode, checkWorkspaceStyles } from './check-workspace.js';

// Enforce dependencies on parsed code, not text matches (comments and examples
// must not become false violations). 依赖边界通过 AST 检查，忽略注释和示例字符串。
const domainRoots = [
  'packages/viewer/src/data/workspace.js', 'packages/viewer/src/core/utilityReferences.js', 'packages/viewer/src/core/contract.js', 'packages/viewer/src/core/toolAdapter.js',
  'packages/viewer/src/playback/voiceController.js',
  'packages/viewer/src/playback/voiceTimeline.js',
  'packages/viewer/src/playback/combatOverlay.js',
  'packages/viewer/src/resources/controller.js', 'packages/viewer/src/playback/controller.js', 'packages/viewer/src/playback/interpolation.js', 'packages/viewer/src/data/replaySource.js', 'src/demo/replayDataSource.js', 'packages/viewer/src/core/controller.js', 'src/analysis/queryService.js', 'src/app/serialization.js', 'src/formats/tasks.js', 'src/demo/parsers/session.js',
  'src/demo/savedRecordingRepository.js', 'src/demo/recordings.js', 'src/demo/playbackSessions.js', 'src/demo/library.js', 'src/demo/parserRuntime.js', 'src/demo/grenades.js',
  'src/analysis/buildAnalysisDataset.js', 'src/analysis/utilityRecommendations.js',
  'src/utility/savedThrow.js', 'src/utility/recordedThrowRepository.js',
  'src/utility/recoverRecordedReplay.js', 'packages/viewer/src/core/commandRegistry.js', 'packages/viewer/src/core/boardCommands.js',
  'src/collaboration/archiveStore.js', 'src/collaboration/frameSession.js',
];
const compositions = new Set(['src/entry.js', 'src/bootstrap.js']);
const infrastructure = /^src\/platform\/(drivers|hosts|assembly)\//;
const physicalAPIs = new Set(['localStorage', 'indexedDB', 'csboardDesktop']);
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'range') continue;
    if (Array.isArray(value)) value.forEach(item => walk(item, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}
export function checkArchitecture(root) {
  const modules = new Map(), errors = [];
  const normalize = file => path.relative(root, file).split(path.sep).join('/');
  function scan(folder) {
    for (const entry of fs.readdirSync(path.join(root, folder), { withFileTypes: true })) {
      const file = `${folder}/${entry.name}`;
      if (entry.isDirectory() && !['node_modules', 'dist'].includes(entry.name)) scan(file);
      else if (/\.(js|jsx)$/.test(file)) {
        const source = fs.readFileSync(path.join(root, file), 'utf8');
        const ast = parseSync(file, source);
        if (ast.errors.length) throw new Error(`Cannot parse ${file}: ${JSON.stringify(ast.errors)}`);
        const dependencies = [];
        const report = (node, message) => errors.push(`${file}:${source.slice(0, node.start).split('\n').length}: ${message}`);
        walk(ast.program, node => {
          checkWorkspaceNode(file, node, report);
          let specifier;
          if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(node.type)) specifier = node.source?.value;
          if (node.type === 'NewExpression' && node.callee?.name === 'URL') specifier = node.arguments[0]?.value;
          if (typeof specifier === 'string') {
            const target = specifier.startsWith('.') ? normalize(path.resolve(root, path.dirname(file), specifier.split('?')[0])) : specifier;
            if (!/\.(js|jsx)$/.test(target) && specifier.startsWith('.')) return;
            dependencies.push({ target, node });
            if (file.startsWith('packages/viewer/src/') && (/^(src|shared|electron)\//.test(target) || /^(react|react-dom|electron|@capacitor)(\/|$)/.test(target))) report(node, `Viewer cannot depend on host ${target}`);
            if (/^packages\/viewer\/src\/(core|data|playback)\//.test(file) && (target.startsWith('packages/viewer/src/three/') || /^three(\/|$)/.test(target))) report(node, `Viewer core cannot depend on renderer ${target}`);
            if (specifier.startsWith('.') && !fs.existsSync(path.join(root, target))) report(node, `Missing module ${target}`);
            if (file.startsWith('shared/') && (target.startsWith('src/') || /^(react|electron|@capacitor)(\/|$)/.test(target))) report(node, `Shared protocol cannot depend on ${target}`);
            if (!file.startsWith('src/platform/') && file.startsWith('src/') && !compositions.has(file) && (infrastructure.test(target) || target === 'src/platform/createPlatform.js')) report(node, `Use public platform ports, not ${target}`);
            if (/^src\/platform\/(drivers|hosts)\//.test(file) && (/^react(?:-dom)?(?:\/|$)/.test(target) || /\.jsx$/.test(target) || target.startsWith('src/three/'))) report(node, `Driver/host cannot depend on UI ${target}`);
          }
          const physicalName = node.type === 'Identifier' ? node.name : node.type === 'MemberExpression' && node.computed ? node.property?.value : undefined;
          if (file.startsWith('src/') && !/^src\/platform\/(drivers|hosts)\//.test(file) && physicalAPIs.has(physicalName)) report(node, `Physical API ${physicalName} belongs in a driver or host`);
        });
        modules.set(file, { dependencies, report });
      }
    }
  }
  for (const folder of ['src', 'shared', 'electron', 'packages']) scan(folder);
  // Follow each pure business entry's complete import closure. An indirect UI
  // dependency violates the same boundary as a direct one. 核心边界检查传递依赖。
  for (const entry of domainRoots) {
    const visited = new Set();
    function follow(file, chain) {
      if (visited.has(file)) return;
      visited.add(file);
      const module = modules.get(file);
      if (!module) throw new Error(`Domain entry is missing: ${file}`);
      for (const { target, node } of module.dependencies) {
        if (/^react(?:-dom)?(?:\/|$)/.test(target) || /\.jsx$/.test(target) || target.startsWith('src/platform/') || target.startsWith('src/three/')) module.report(node, `Business core depends on ${target} via ${[...chain, file].join(' -> ')}`);
        else if (modules.has(target)) follow(target, [...chain, file]);
      }
    }
    follow(entry, []);
  }
  errors.push(...checkWorkspaceStyles(root));
  if (errors.length) throw new Error(`Architecture violations:\n${[...new Set(errors)].join('\n')}`);
  console.log(`Architecture checked: ${modules.size} modules, ${domainRoots.length} business core entries`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { checkArchitecture(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
