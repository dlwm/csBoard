// Normalizes round winners and end reasons from parser-specific values.
import { localize } from '../i18n.js';

export const roundReasonLabel = (reason, language) => ({
  bomb_defused: localize(language, { zh: '炸弹已拆除', en: 'Bomb defused', ru: 'Бомба обезврежена' }),
  time_ran_out: localize(language, { zh: '时间耗尽', en: 'Time expired', ru: 'Время истекло' }),
  t_killed: localize(language, { zh: 'T 方全灭', en: 'T eliminated', ru: 'Команда T уничтожена' }),
  ct_killed: localize(language, { zh: 'CT 方全灭', en: 'CT eliminated', ru: 'Команда CT уничтожена' }),
  bomb_exploded: localize(language, { zh: '炸弹爆炸', en: 'Bomb exploded', ru: 'Бомба взорвалась' }),
  target_saved: localize(language, { zh: '目标保全', en: 'Target saved', ru: 'Цель сохранена' }),
})[reason] || String(reason || '').replaceAll('_', ' ');

export const roundWinnerSide = (winner) => {
  const normalized = String(winner ?? '').toUpperCase();
  if (normalized === '2' || normalized === 'T' || normalized.includes('TERRORIST')) return 'T';
  if (normalized === '3' || normalized === 'CT' || normalized.includes('COUNTER')) return 'CT';
  return normalized || null;
};
