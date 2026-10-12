import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { zodToJsonSchema } from 'zod-to-json-schema';
import Ajv from 'ajv';
import standaloneCode from 'ajv/dist/standalone/index.js';

const root = path.resolve(import.meta.dirname, '..');
const source = process.argv.includes('--source') ? path.resolve(process.argv[process.argv.indexOf('--source') + 1]) : null;
const snapshotPath = path.join(root, 'config/formats/contracts.json');
let snapshot;
if (source) {
  const file = path.join(source, 'schemas/index.ts');
  const contract = await import(pathToFileURL(file));
  if (!contract.REPLAY_PACKAGE_SCHEMAS) throw new Error('Source has no replay profile; use the reviewed fork working branch');
  const entries = { manifest: contract.manifestSchema, ...contract.SCHEMAS_BY_KEY, ...contract.REPLAY_PACKAGE_SCHEMAS };
  const schemas = Object.fromEntries(Object.entries(entries).map(([name, schema]) => [name, zodToJsonSchema(schema, { name, $refStrategy: Object.hasOwn(contract.REPLAY_PACKAGE_SCHEMAS, name) ? 'root' : 'none' })]));
  snapshot = { source: {
    repository: 'https://github.com/dlwm/cs2-demo-format',
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(),
    draft: Boolean(execFileSync('git', ['status', '--porcelain', '--', 'schemas', 'parser', 'scripts/gen-json-schema.ts', 'spec', 'docs/replay-profile.md', 'README.md', 'package.json'], { cwd: source, encoding: 'utf8' }).trim()),
    contractSha256: createHash('sha256').update(await fs.readFile(file)).digest('hex'),
  }, replayVersion: contract.REPLAY_PROFILE_VERSION, schemas };
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2) + '\n');
  for (const [name, schema] of Object.entries(schemas)) await fs.writeFile(path.join(source, 'spec', `${name}.schema.json`), JSON.stringify(schema, null, 2) + '\n');
} else snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));

// Compile ahead of time: runtime validation never uses eval/Function or changes
// the Electron CSP. The generated snapshot is reproducible without .local.
// 构建期编译合同；运行时不生成代码，不放开 CSP，也不依赖本地 fork 目录。
const ajv = new Ajv({ strict: false, allErrors: false, code: { source: true, esm: true }, validateFormats: false });
const names = {};
for (const [name, schema] of Object.entries(snapshot.schemas)) {
  const id = `csboard-format:${name}`;
  ajv.addSchema(schema, id); names[name] = id;
}
let code = standaloneCode(ajv, names);
const dependencies = new Map();
code = code.replace(/require\("(ajv\/dist\/runtime\/[^"\n]+)"\)\.default/g, (_, module) => {
  if (!dependencies.has(module)) dependencies.set(module, `runtime${dependencies.size}`);
  return dependencies.get(module);
});
const imports = [...dependencies].map(([module, name]) => `import ${name}Module from '${module}.js';\nconst ${name} = ${name}Module.default || ${name}Module;`).join('\n');
const output = path.join(root, 'src/formats/generated/validators.js');
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `// Generated from config/formats/contracts.json. Run make format-contracts; do not edit.\nexport const REPLAY_PROFILE_VERSION = ${JSON.stringify(snapshot.replayVersion)};\n${imports}\n${code}\n`);
console.log(`Generated ${Object.keys(names).length} format validators; source ${snapshot.source.revision}${snapshot.source.draft ? ' (local draft)' : ''}`);
