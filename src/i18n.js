import messages from './app/messages.js';

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

export const translate = (language, key, values = {}) => Object.entries(values).reduce(
  (text, [name, value]) => text.replace(`{${name}}`, value),
  messages[normalizeLanguage(language)]?.[key] || messages.en[key] || key,
);

// Demo parsing originates in Chinese worker messages; normalize those statuses at the UI boundary.
export const translateDemoWorkerStatus = (language, message) => {
  if (language === 'zh') return message;
  const roundCount = String(message).match(/(\d+)/)?.[1];
  const translations = language === 'ru' ? {
    '正在加载 Demo 解析器…': 'Загрузка анализатора Demo…',
    '正在读取 Demo Header…': 'Чтение заголовка Demo…',
    '正在读取回合事件…': 'Чтение событий раундов…',
    '正在读取道具与投掷物轨迹…': 'Чтение траекторий гранат…',
    '正在读取全场移动数据…': 'Чтение данных движения за матч…',
    '全场移动数据已就绪': 'Данные движения за матч готовы',
  } : {
    '正在加载 Demo 解析器…': 'Loading Demo parser...',
    '正在读取 Demo Header…': 'Reading Demo header...',
    '正在读取回合事件…': 'Reading round events...',
    '正在读取道具与投掷物轨迹…': 'Reading utility trajectories...',
    '正在读取全场移动数据…': 'Reading full-match movement data...',
    '全场移动数据已就绪': 'Full-match movement data ready',
  };
  if (message.startsWith('正在一次性解析')) return language === 'ru' ? `Разбор позиций в ${roundCount} раундах…` : `Parsing ${roundCount} rounds...`;
  if (message.startsWith('Demo 已读取')) return language === 'ru' ? `Demo загружен: готово раундов — ${roundCount}` : `Demo loaded, ${roundCount} rounds ready`;
  return translations[message] || message;
};
