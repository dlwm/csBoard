// Stable markers keep localized Markdown separate from signing notices and
// release provenance. 说明按语言标记分隔，不能将签名提示当作用户更新内容。
const LANGUAGES = ['en', 'zh', 'ru'];
const MAX_NOTES_LENGTH = 16000;

export function formatReleaseNotes(notesByLanguage) {
  return LANGUAGES.filter(language => notesByLanguage[language]?.trim()).map(language => {
    const block = `<!-- csboard-release-notes:${language} -->\n${notesByLanguage[language].trim()}\n<!-- /csboard-release-notes:${language} -->`;
    if (language === 'en') return block;
    return `<details>\n<summary>${language === 'zh' ? '中文' : 'Русский'}</summary>\n\n${block}\n\n</details>`;
  }).join('\n\n');
}

export function parseReleaseNotes(body) {
  const source = String(body || '');
  const notes = {};
  for (const language of LANGUAGES) {
    const start = `<!-- csboard-release-notes:${language} -->`;
    const end = `<!-- /csboard-release-notes:${language} -->`;
    const from = source.indexOf(start);
    const to = from < 0 ? -1 : source.indexOf(end, from + start.length);
    if (to >= 0) notes[language] = source.slice(from + start.length, to).trim().slice(0, MAX_NOTES_LENGTH);
  }
  // Older releases contain only English notes; do not invent a translation.
  // 旧版本只发布英文；缺少翻译时明确回退，不把当前安装版本的说明冒充新版本。
  if (!notes.en) notes.en = source.split('\n\nmacOS apps are ad-hoc signed')[0]
    .split('<!-- csboard-release-commit:')[0].split('<details>')[0]
    .replace(/<!--[^]*?-->/g, '').trim().slice(0, MAX_NOTES_LENGTH);
  return notes;
}

export function selectReleaseNotes(notesByLanguage, language) {
  const requested = LANGUAGES.includes(language) ? language : 'en';
  const translated = notesByLanguage?.[requested]?.trim();
  return { content: translated || notesByLanguage?.en || '', language: translated ? requested : 'en', fallback: !translated && requested !== 'en' };
}
