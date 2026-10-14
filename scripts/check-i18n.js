import fs from 'node:fs';
import path from 'node:path';
import { parseSync } from 'vite';
import legacyKeys from '../src/i18n/legacyKeys.js';

const root = path.resolve(import.meta.dirname, '..');
const directory = path.join(root, 'src/i18n/locales');
const languages = ['en', 'zh', 'ru'];
const failures = [];
const names = fs.readdirSync(path.join(directory, 'en')).filter(name => name.endsWith('.json')).sort();
const catalogues = Object.fromEntries(languages.map(language => [language, {}]));
const tokens = text => [...new Set(text.match(/\{[A-Za-z_][A-Za-z0-9_]*\}/g) || [])].sort().join(',');
for (const language of languages) {
  const files = fs.readdirSync(path.join(directory, language)).filter(name => name.endsWith('.json')).sort();
  if (JSON.stringify(files) !== JSON.stringify(names)) failures.push(`${language}: namespace files differ`);
  for (const name of files) {
    const source = fs.readFileSync(path.join(directory, language, name), 'utf8');
    const entries = JSON.parse(source);
    const namespace = name.slice(0, -5);
    // Parse as an object expression to detect duplicate keys JSON.parse would hide.
    const parsed = parseSync('catalogue.js', '(' + source + ')');
    const seen = new Set();
    let object = parsed.program.body[0].expression;
    while (object.type === 'ParenthesizedExpression') object = object.expression;
    for (const property of object.properties) {
      const key = property.key.value;
      if (seen.has(key)) failures.push(`${language}/${name}: duplicate ${key}`);
      seen.add(key);
    }
    for (const [key, value] of Object.entries(entries)) {
      if (typeof value !== 'string' || !value.trim()) failures.push(`${language}/${name}: ${key} must be a nonempty string`);
      else catalogues[language][namespace + '.' + key] = value;
    }
  }
}
for (const language of languages.slice(1)) {
  const entries = catalogues[language];
  for (const [key, value] of Object.entries(catalogues.en)) {
    if (!(key in entries)) failures.push(`${language}: missing ${key}`);
    else if (tokens(value) !== tokens(entries[key])) failures.push(`${language}: placeholders differ for ${key}`);
  }
  for (const key of Object.keys(entries)) if (!(key in catalogues.en)) failures.push(`${language}: extra ${key}`);
}
for (const [key, target] of Object.entries(legacyKeys)) if (!(target in catalogues.en)) failures.push(`legacy alias ${key}: missing ${target}`);
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'range') continue;
    if (Array.isArray(value)) value.forEach(item => walk(item, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(path.join(directory, entry.name)) : /\.(js|jsx)$/.test(entry.name) ? [path.join(directory, entry.name)] : []);
}
const namespaces = new Set(names.map(name => name.slice(0, -5)));
for (const file of files(path.join(root, 'src')).filter(file => !file.startsWith(path.join(root, 'src/i18n') + path.sep))) {
  const source = fs.readFileSync(file, 'utf8');
  const parsed = parseSync(file, source);
  for (const error of parsed.errors) failures.push(`${path.relative(root, file)}: ${error.message}`);
  walk(parsed.program, node => {
    if (node.type === 'CallExpression' && ['translate', 'translateMessage', 'translateParts', 'text', 't'].includes(node.callee?.name)) {
      const offset = ['translate', 'translateMessage', 'translateParts'].includes(node.callee.name) ? 1 : 0;
      const reference = node.arguments[offset];
      if (reference?.type === 'Literal' && typeof reference.value === 'string') {
        const key = legacyKeys[reference.value] || reference.value;
        if (namespaces.has(key.split('.')[0])) {
          if (!(key in catalogues.en)) failures.push(`${path.relative(root, file)}: unknown message ${key}`);
          else {
            const values = node.arguments[offset + 1];
            if (!values || (values.type === 'ObjectExpression' && !values.properties.some(property => property.type === 'SpreadElement'))) {
              const provided = new Set((values?.properties || []).map(property => property.key.name || property.key.value));
              for (const token of tokens(catalogues.en[key]).split(',').filter(Boolean)) if (!provided.has(token.slice(1, -1))) failures.push(`${path.relative(root, file)}: missing ${token} for ${key}`);
            }
          }
        }
      }
    }
    // Includes keys in arrays/descriptors, not just direct translate() calls.
    if (node.type === 'Literal' && typeof node.value === 'string' && namespaces.has(node.value.split('.')[0]) && node.value.split('.').length >= 3) {
      if (!(node.value in catalogues.en) && !legacyKeys[node.value] && !(node.value.endsWith('.') && Object.keys(catalogues.en).some(key => key.startsWith(node.value)))) failures.push(`${path.relative(root, file)}: unknown message ${node.value}`);
    }
  });
}
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`Internationalization: ${Object.keys(catalogues.en).length} messages, ${languages.length} languages; keys and placeholders agree.`);
