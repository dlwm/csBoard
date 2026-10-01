import { documentationCatalog } from './documentationCatalog.js';

// This bounded glob contains only reference Markdown; the manifest is the
// explicit allowlist. Adding a registered reference needs no tool-code changes.
const sources = import.meta.glob('../../docs/ai/references/**/*.md', { eager: true, import: 'default', query: '?raw' });
for (const document of documentationCatalog) for (const file of Object.values(document.files)) {
  if (typeof sources[`../../docs/ai/${file}`] !== 'string') throw new Error(`Missing registered AI reference: ${file}`);
}
function sections(text, language) {
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  const introduction = [];
  const rows = []; let current = null; let fenced = false;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = !fenced && /^## (.+)$/.exec(line);
    if (heading) { current = { heading: heading[1].trim(), lines: [] }; rows.push(current); }
    else if (current) current.lines.push(line);
    else if (!/^# /.test(line)) introduction.push(line);
  }
  if (introduction.join('\n').trim()) rows.unshift({ heading: { en: 'Overview', zh: '概览', ru: 'Обзор' }[language], lines: introduction });
  return rows.map(row => ({ heading: row.heading, content: row.lines.join('\n').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<img\b[^>]*>/gi, '').trim() }));
}
const cached = new Map();
function documentSections(id, language) {
  const key = `${id}:${language}`;
  if (!cached.has(key)) {
    const document = documentationCatalog.find(item => item.id === id);
    const text = sources[`../../docs/ai/${document.files[language]}`];
    const parsed = sections(text, language);
    const selected = parsed.length ? parsed : [{ heading: document.title[language] || document.title.en, content: text.trim() }];
    cached.set(key, selected.map((section, index) => ({ id: `section-${index + 1}`, ...section })));
  }
  return cached.get(key);
}
export function readAppDocumentation(input = {}, preferredLanguage = 'en') {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['documentId', 'language', 'section', 'offset', 'limit'].includes(key))) throw new Error('Invalid documentation arguments; use documentId, language, section, offset, limit');
  const requestedLanguage = input.language ?? (['en', 'zh', 'ru'].includes(preferredLanguage) ? preferredLanguage : 'en');
  if (!['en', 'zh', 'ru'].includes(requestedLanguage)) throw new Error('Document language must be en, zh or ru');
  const catalog = documentationCatalog.map(document => {
    const language = document.languages.includes(requestedLanguage) ? requestedLanguage : document.languages[0];
    return { ...document, language, requestedLanguage, translationAvailable: language === requestedLanguage, sections: documentSections(document.id, language).map(({ id, heading, content }) => ({ id, heading, characters: content.length })) };
  });
  if (input.documentId == null) {
    if (input.section != null || input.offset != null || input.limit != null) throw new Error('Specify documentId before selecting a section or page');
    return { scope: 'bundled user documentation; not live board state', buildVersion: import.meta.env.VITE_BUILD_VERSION || '', documents: catalog };
  }
  const document = catalog.find(item => item.id === input.documentId);
  if (!document) throw new Error('Unknown documentId; allowed: ' + documentationCatalog.map(item => item.id).join(', '));
  if (input.section != null && (typeof input.section !== 'string' || input.section.length > 160)) throw new Error('Invalid documentation section');
  const offset = input.offset ?? 0; const limit = input.limit ?? 6000;
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 500 || limit > 12000) throw new Error('Documentation paging requires offset ≥0 and limit 500–12000 characters');
  const all = documentSections(document.id, document.language);
  const selected = input.section == null ? all : all.filter(section => section.id === input.section || section.heading === input.section);
  if (!selected.length) return { ...document, status: 'section_not_found', content: '', guidance: 'Choose an exact section ID or heading from sections; do not guess filesystem paths.' };
  const text = selected.map(section => `## ${section.heading}\n\n${section.content}`).join('\n\n');
  const content = text.slice(offset, offset + limit);
  return { ...document, buildVersion: import.meta.env.VITE_BUILD_VERSION || '', status: 'read', selectedSections: selected.map(section => section.id), content, offset, returnedCharacters: content.length, totalCharacters: text.length, nextOffset: offset + content.length < text.length ? offset + content.length : null, guidance: 'User reference only; capabilities and live state must be checked with current tools. Developer and future-plan sections are excluded.' };
}
