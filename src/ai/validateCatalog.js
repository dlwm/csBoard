// Pure validation shared by the renderer and the build entry point.
export function validateDocumentationCatalog(manifest) {
  if (!Array.isArray(manifest) || !manifest.length || manifest.length > 64) throw new Error('AI catalog must contain 1–64 documents');
  const ids = new Set();
  return manifest.map(document => {
    if (!document || typeof document.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(document.id) || ids.has(document.id) || !document.title || typeof document.title !== 'object' || typeof document.title.en !== 'string' || !document.title.en.trim() || typeof document.topics !== 'string' || !document.topics.trim() || document.topics.length > 1000 || !document.files || typeof document.files !== 'object' || Array.isArray(document.files)) throw new Error('Invalid AI documentation catalog entry');
    ids.add(document.id);
    if (Object.entries(document.title).some(([language, title]) => !['en', 'zh', 'ru'].includes(language) || typeof title !== 'string' || !title.trim() || title.length > 200)) throw new Error(`Invalid titles: ${document.id}`);
    const languages = Object.keys(document.files);
    if (!languages.length || languages.some(language => !['en', 'zh', 'ru'].includes(language) || typeof document.files[language] !== 'string' || !/^references\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.md$/.test(document.files[language]) || document.files[language].includes('..'))) throw new Error(`Invalid reference files: ${document.id}`);
    return { ...document, languages, source: Object.values(document.files).map(file => `docs/ai/${file}`).join(' / ') };
  });
}
