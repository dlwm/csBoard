export { localeForLanguage, formatNumber, formatBytes, formatDuration } from './format.js';
import legacyKeys from './legacyKeys.js';
import en_analysis from './locales/en/analysis.json' with { type: 'json' };
import en_assistant from './locales/en/assistant.json' with { type: 'json' };
import en_broadcast from './locales/en/broadcast.json' with { type: 'json' };
import en_collaboration from './locales/en/collaboration.json' with { type: 'json' };
import en_common from './locales/en/common.json' with { type: 'json' };
import en_formats from './locales/en/formats.json' with { type: 'json' };
import en_onboarding from './locales/en/onboarding.json' with { type: 'json' };
import en_replay from './locales/en/replay.json' with { type: 'json' };
import en_resources from './locales/en/resources.json' with { type: 'json' };
import en_settings from './locales/en/settings.json' with { type: 'json' };
import en_utility from './locales/en/utility.json' with { type: 'json' };
import en_view from './locales/en/view.json' with { type: 'json' };
import zh_analysis from './locales/zh/analysis.json' with { type: 'json' };
import zh_assistant from './locales/zh/assistant.json' with { type: 'json' };
import zh_broadcast from './locales/zh/broadcast.json' with { type: 'json' };
import zh_collaboration from './locales/zh/collaboration.json' with { type: 'json' };
import zh_common from './locales/zh/common.json' with { type: 'json' };
import zh_formats from './locales/zh/formats.json' with { type: 'json' };
import zh_onboarding from './locales/zh/onboarding.json' with { type: 'json' };
import zh_replay from './locales/zh/replay.json' with { type: 'json' };
import zh_resources from './locales/zh/resources.json' with { type: 'json' };
import zh_settings from './locales/zh/settings.json' with { type: 'json' };
import zh_utility from './locales/zh/utility.json' with { type: 'json' };
import zh_view from './locales/zh/view.json' with { type: 'json' };
import ru_analysis from './locales/ru/analysis.json' with { type: 'json' };
import ru_assistant from './locales/ru/assistant.json' with { type: 'json' };
import ru_broadcast from './locales/ru/broadcast.json' with { type: 'json' };
import ru_collaboration from './locales/ru/collaboration.json' with { type: 'json' };
import ru_common from './locales/ru/common.json' with { type: 'json' };
import ru_formats from './locales/ru/formats.json' with { type: 'json' };
import ru_onboarding from './locales/ru/onboarding.json' with { type: 'json' };
import ru_replay from './locales/ru/replay.json' with { type: 'json' };
import ru_resources from './locales/ru/resources.json' with { type: 'json' };
import ru_settings from './locales/ru/settings.json' with { type: 'json' };
import ru_utility from './locales/ru/utility.json' with { type: 'json' };
import ru_view from './locales/ru/view.json' with { type: 'json' };

export const LANGUAGE_CHANGED_EVENT = 'csboard-language-change';
export const SUPPORTED_LANGUAGES = Object.freeze(['zh', 'en', 'ru']);
const labels = { zh: '中文', en: 'EN', ru: 'RU' };
export const normalizeLanguage = language => SUPPORTED_LANGUAGES.includes(language) ? language : 'zh';
export const nextLanguage = language => SUPPORTED_LANGUAGES[(SUPPORTED_LANGUAGES.indexOf(normalizeLanguage(language)) + 1) % SUPPORTED_LANGUAGES.length];
export const languageLabel = language => labels[normalizeLanguage(language)];
const catalogue = {
  en: Object.assign({}, namespace('analysis', en_analysis), namespace('assistant', en_assistant), namespace('broadcast', en_broadcast), namespace('collaboration', en_collaboration), namespace('common', en_common), namespace('formats', en_formats), namespace('onboarding', en_onboarding), namespace('replay', en_replay), namespace('resources', en_resources), namespace('settings', en_settings), namespace('utility', en_utility), namespace('view', en_view)),
  zh: Object.assign({}, namespace('analysis', zh_analysis), namespace('assistant', zh_assistant), namespace('broadcast', zh_broadcast), namespace('collaboration', zh_collaboration), namespace('common', zh_common), namespace('formats', zh_formats), namespace('onboarding', zh_onboarding), namespace('replay', zh_replay), namespace('resources', zh_resources), namespace('settings', zh_settings), namespace('utility', zh_utility), namespace('view', zh_view)),
  ru: Object.assign({}, namespace('analysis', ru_analysis), namespace('assistant', ru_assistant), namespace('broadcast', ru_broadcast), namespace('collaboration', ru_collaboration), namespace('common', ru_common), namespace('formats', ru_formats), namespace('onboarding', ru_onboarding), namespace('replay', ru_replay), namespace('resources', ru_resources), namespace('settings', ru_settings), namespace('utility', ru_utility), namespace('view', ru_view)),
};
function namespace(name, entries) { return Object.fromEntries(Object.entries(entries).map(([key, value]) => [name + '.' + key, value])); }
function message(language, reference) {
  const key = typeof reference === 'string' ? reference : reference?.key;
  if (!key) return '';
  const canonical = legacyKeys[key] || key;
  return catalogue[normalizeLanguage(language)][canonical] ?? catalogue.en[canonical] ?? key;
}
// Values are substituted literally, globally, and once. '$&' and nested braces
// in user names must never be interpreted as replacement syntax or new tokens.
// 参数按字面替换；重复占位符全部替换，用户输入不参与二次插值。
export function translate(language, reference, values = {}) {
  const parameters = { ...(reference?.values || {}), ...values };
  return message(language, reference).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (token, name) => Object.hasOwn(parameters, name) ? String(parameters[name]) : token);
}
// Rich text uses host-provided nodes. No HTML parsing or React dependency.
export function translateParts(language, reference, values = {}) {
  const parameters = { ...(reference?.values || {}), ...values };
  return message(language, reference).split(/(\{[A-Za-z_][A-Za-z0-9_]*\})/g).map(part => {
    const name = part.slice(1, -1);
    return part.startsWith('{') && Object.hasOwn(parameters, name) ? parameters[name] : part;
  });
}
export const createTranslator = language => (key, values) => translate(language, key, values);
export const mapDisplayName = (language, map) => catalogue.en['view.maps.' + map.id]
  ? translate(language, 'view.maps.' + map.id) : map.label || map.id;

// Protocol codes are stable; only UI copy and locale dictionaries change.
// Unknown provider errors retain their diagnostic text, without guessing a code.
export function translateDemoWorkerStatus(language, status) {
  if (status?.code?.startsWith('ticks_')) return translate(language, 'replay.progress.' + status.code.slice(6), status.values);
  if (status?.code) return translate(language, 'replay.status.' + status.code, status.values);
  return typeof status === 'string' ? status : status?.message || '';
}
export function translateError(language, error, fallbackKey) {
  const key = error?.code && 'common.errors.' + error.code;
  if (key && catalogue.en[key]) return translate(language, key, error.values ?? error.details);
  return error?.message || (fallbackKey ? translate(language, fallbackKey) : '');
}
// Legacy import facade remains available while downstream app integrations migrate.
export const localize = (language, reference) => reference && typeof reference === 'object' && !reference.key
  ? reference[normalizeLanguage(language)] ?? reference.en ?? reference.zh ?? ''
  : translate(language, reference);
