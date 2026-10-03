import { ANALYSIS_UTILITY_KINDS, ECONOMY_CATEGORIES } from './constants.js';

// Keep the displayed count, trajectory lines and heat points on the same filters.
export function utilityMatchesFilters(utility, flags, side) {
  const [own, opponent] = String(utility.economyMatchup || '').split(':');
  return (flags.utilityKinds || ANALYSIS_UTILITY_KINDS).includes(utility.kind)
    && (flags.economyOwn || ECONOMY_CATEGORIES).includes(own)
    && (flags.economyOpponent || ECONOMY_CATEGORIES).includes(opponent)
    && (side === 'ALL' || utility.side === side);
}
