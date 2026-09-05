// Normalizes round winners and end reasons from parser-specific values.
export const roundReasonLabel = (reason, language) => ({
  bomb_defused: language === 'zh' ? '炸弹已拆除' : 'Bomb defused',
  time_ran_out: language === 'zh' ? '时间耗尽' : 'Time expired',
  t_killed: language === 'zh' ? 'T 方全灭' : 'T eliminated',
  ct_killed: language === 'zh' ? 'CT 方全灭' : 'CT eliminated',
  bomb_exploded: language === 'zh' ? '炸弹爆炸' : 'Bomb exploded',
  target_saved: language === 'zh' ? '目标保全' : 'Target saved',
})[reason] || String(reason || '').replaceAll('_', ' ');

export const roundWinnerSide = (winner) => {
  const normalized = String(winner ?? '').toUpperCase();
  if (normalized === '2' || normalized === 'T' || normalized.includes('TERRORIST')) return 'T';
  if (normalized === '3' || normalized === 'CT' || normalized.includes('COUNTER')) return 'CT';
  return normalized || null;
};
