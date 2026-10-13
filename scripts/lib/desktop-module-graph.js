import path from 'node:path';
import { parseSync } from 'vite';

function visit(node, callback) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const item of node) visit(item, callback); return; }
  callback(node);
  for (const value of Object.values(node)) if (value && typeof value === 'object') visit(value, callback);
}

// Inspect the packaged bytes, not the source checkout. Follow local imports,
// re-exports, literal dynamic imports and CommonJS require transitively.
// 检查实际包中的代码及传递依赖，源码存在不等于发行包存在。
export function checkDesktopModuleGraph(readFile, { aiEnabled = true } = {}) {
  const visited = new Set();
  function read(file, chain = []) {
    if (visited.has(file)) return;
    let bytes;
    try { bytes = readFile(file); }
    catch (cause) { throw new Error(`Missing packaged module: ${[...chain, file].join(' -> ')}`, { cause }); }
    visited.add(file);
    if (!/\.(?:mjs|cjs|js)$/.test(file)) return;
    const parsed = parseSync(file, bytes.toString());
    if (parsed.errors.length) throw new Error(`Cannot parse packaged module ${file}: ${JSON.stringify(parsed.errors)}`);
    visit(parsed.program, node => {
      let specifier, dynamic = false;
      if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type)) specifier = node.source?.value;
      if (node.type === 'ImportExpression') { specifier = node.source?.value; dynamic = true; }
      if (node.type === 'CallExpression' && node.callee?.name === 'require') specifier = node.arguments[0]?.value;
      if (typeof specifier !== 'string' || !specifier.startsWith('.')) return;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      if (target.startsWith('../')) throw new Error(`Packaged import escapes application: ${file} -> ${specifier}`);
      // This optional dynamic module is deliberately omitted from AI-disabled builds.
      if (!aiEnabled && dynamic && target === 'electron/ai-service.js') return;
      read(target, [...chain, file]);
    });
  }
  read('electron/main.js'); read('electron/preload.cjs');
  return [...visited];
}
