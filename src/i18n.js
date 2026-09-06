export const SUPPORTED_LANGUAGES = ['zh', 'en', 'ru'];

const LANGUAGE_LABELS = { zh: '中文', en: 'EN', ru: 'RU' };

export const normalizeLanguage = (language) => SUPPORTED_LANGUAGES.includes(language) ? language : 'zh';

export const nextLanguage = (language) => {
  const current = normalizeLanguage(language);
  return SUPPORTED_LANGUAGES[(SUPPORTED_LANGUAGES.indexOf(current) + 1) % SUPPORTED_LANGUAGES.length];
};

// Language buttons identify the active locale; this avoids presenting the next locale as current state.
export const languageLabel = (language) => LANGUAGE_LABELS[normalizeLanguage(language)];

export const localeForLanguage = (language) => ({ zh: 'zh-CN', en: 'en-US', ru: 'ru-RU' })[normalizeLanguage(language)];

// Component-local dictionaries use this helper so an incomplete locale still has readable English text.
export const localize = (language, variants) => variants[normalizeLanguage(language)] ?? variants.en ?? variants.zh ?? '';
