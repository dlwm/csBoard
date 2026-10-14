const locales = { zh: 'zh-CN', en: 'en-US', ru: 'ru-RU' };
export const localeForLanguage = language => locales[language] || locales.zh;

// Display only: protocol coordinates, IDs and serialized numbers stay unchanged.
// 仅用于界面；getpos 坐标、协议数值和存储格式不能使用本地化格式。
export function formatNumber(value, language = 'en', options = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat(localeForLanguage(language), { useGrouping: false, ...options }).format(number);
}
export function formatBytes(value = 0, language = 'en') {
  const bytes = Math.max(0, Number(value) || 0);
  const unit = bytes >= 1024 ** 3 ? 'GB' : bytes >= 1024 ** 2 ? 'MB' : bytes >= 1024 ? 'KB' : 'B';
  const divisor = { GB: 1024 ** 3, MB: 1024 ** 2, KB: 1024, B: 1 }[unit];
  return `${formatNumber(bytes / divisor, language, { maximumFractionDigits: 1 })} ${unit}`;
}
export function formatDuration(milliseconds, language = 'en') {
  return `${formatNumber(Number(milliseconds) / 1000, language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
}
