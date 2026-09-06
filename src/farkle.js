export const FARKLE_TARGET = 2000;

export function rollDice(count, random = Math.random) {
  return Array.from({ length: count }, () => Math.floor(random() * 6) + 1);
}

export function scoreDice(dice) {
  if (!dice.length) return 0;
  const counts = Array(7).fill(0);
  dice.forEach((die) => { counts[die] += 1; });
  if (dice.length === 6 && counts.slice(1).every((count) => count === 1)) return 1500;
  if (dice.length === 6 && counts.slice(1).filter((count) => count === 2).length === 3) return 1500;
  let score = 0;
  // Consume the straight first so an extra scoring 1 or 5 can be selected with it.
  const straight = [1, 2, 3, 4, 5].every((face) => counts[face] >= 1)
    ? { faces: [1, 2, 3, 4, 5], score: 500 }
    : [2, 3, 4, 5, 6].every((face) => counts[face] >= 1)
      ? { faces: [2, 3, 4, 5, 6], score: 750 }
      : null;
  if (straight) {
    straight.faces.forEach((face) => { counts[face] -= 1; });
    score += straight.score;
  }
  for (let face = 1; face <= 6; face += 1) {
    const count = counts[face];
    if (count >= 3) {
      score += (face === 1 ? 1000 : face * 100) * 2 ** (count - 3);
      continue;
    }
    if (face === 1) score += count * 100;
    else if (face === 5) score += count * 50;
    else if (count > 0) return 0;
  }
  return score;
}

export function scoringSelections(dice) {
  const selections = [];
  for (let mask = 1; mask < 2 ** dice.length; mask += 1) {
    const indexes = [];
    const values = [];
    dice.forEach((die, index) => { if (mask & 2 ** index) { indexes.push(index); values.push(die); } });
    const score = scoreDice(values);
    if (score > 0) selections.push({ indexes, score });
  }
  return selections;
}

export const bustChance = { 1: 2 / 3, 2: 4 / 9, 3: 5 / 18, 4: 17 / 108, 5: 25 / 324, 6: 5 / 216 };

export function chooseAiMove(dice, turnScore, aiScore, playerScore) {
  const options = scoringSelections(dice);
  if (!options.length) return null;
  const ranked = options.map((option) => {
    const remaining = dice.length - option.indexes.length || 6;
    const accumulated = turnScore + option.score;
    const risk = bustChance[remaining];
    const pressure = aiScore < playerScore ? 1.18 : aiScore > playerScore + 450 ? 0.82 : 1;
    const continuation = (1 - risk) * (remaining * 72 + (remaining === 6 ? 190 : 0)) * pressure;
    return { ...option, remaining, accumulated, value: option.score + continuation - risk * accumulated * 0.72 };
  }).sort((left, right) => right.value - left.value || right.score - left.score || left.indexes.length - right.indexes.length);
  const best = ranked[0];
  const wins = aiScore + best.accumulated >= FARKLE_TARGET;
  const lead = aiScore - playerScore;
  const bankThreshold = lead > 350 ? 250 : lead < -350 ? 650 : 400;
  const bank = wins || best.accumulated >= bankThreshold || best.accumulated >= 250 && bustChance[best.remaining] >= 0.44;
  return { ...best, bank };
}
