// Normalizes round winners and end reasons from parser-specific values.
import { translate } from '../i18n.js';

export const roundReasonLabel = (reason, language) => ({
  bomb_defused: translate(language, "replay.rounds.bombDefused"),
  time_ran_out: translate(language, "replay.rounds.timeExpired"),
  t_killed: translate(language, "replay.rounds.tEliminated"),
  ct_killed: translate(language, "replay.rounds.ctEliminated"),
  bomb_exploded: translate(language, "replay.rounds.bombExploded"),
  target_saved: translate(language, "replay.rounds.targetSaved"),
})[reason] || String(reason || '').replaceAll('_', ' ');

export const roundWinnerSide = (winner) => {
  const normalized = String(winner ?? '').toUpperCase();
  if (normalized === '2' || normalized === 'T' || normalized.includes('TERRORIST')) return 'T';
  if (normalized === '3' || normalized === 'CT' || normalized.includes('COUNTER')) return 'CT';
  return normalized || null;
};
