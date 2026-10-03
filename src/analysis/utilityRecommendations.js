import { compileRecommendationFormulas } from './recommendationFormulas.js';
import { utilityMatchesFilters } from './utilityFilters.js';
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const finitePosition = p => p && [p.x, p.y, p.z].every(Number.isFinite);

// Sample by travelled distance, not tick count: resting projectiles do not
// distort shape comparisons. Positions are world metres, including height.
function route(points) {
  const valid = points.filter(finitePosition);
  if (valid.length < 2) return { points: [], length: 0 };
  const lengths = [0];
  for (let i = 1; i < valid.length; i++) lengths.push(lengths[i - 1] + distance(valid[i - 1], valid[i]));
  const total = lengths.at(-1);
  if (!total) return { points: [], length: 0 };
  let index = 1;
  return { length: total, points: Array.from({ length: 21 }, (_, step) => {
    const target = total * step / 20;
    while (index < lengths.length - 1 && lengths[index] < target) index++;
    const blend = (target - lengths[index - 1]) / (lengths[index] - lengths[index - 1] || 1);
    const a = valid[index - 1], b = valid[index];
    return { x: a.x + (b.x - a.x) * blend, y: a.y + (b.y - a.y) * blend, z: a.z + (b.z - a.z) * blend };
  }) };
}
function difference(a, b, formulas) {
  if (a.kind !== b.kind) return Infinity;
  const knownTimes = [a.flightTime, b.flightTime].filter(value => Number.isFinite(value) && value >= 0);
  const values = {
    distance: (distance(a.throwPosition, a.landing) + distance(b.throwPosition, b.landing)) / 2,
    pathLength: (a.route.length + b.route.length) / 2,
    // Endpoints and path distances include height; slopes are admitted by the
    // same adaptive 3D tolerance, rather than a rigid floor-height cutoff.
    startHeightGap: Math.abs(a.throwPosition.y - b.throwPosition.y),
    landingHeightGap: Math.abs(a.landing.y - b.landing.y),
    startHorizontalGap: Math.hypot(a.throwPosition.x - b.throwPosition.x, a.throwPosition.z - b.throwPosition.z),
    landingHorizontalGap: Math.hypot(a.landing.x - b.landing.x, a.landing.z - b.landing.z),
    flightTime: knownTimes.length ? knownTimes.reduce((sum, time) => sum + time, 0) / knownTimes.length : 0,
  };
  const startTolerance = formulas.startTolerance(values), landingTolerance = formulas.landingTolerance(values);
  values.routeMeanTolerance = formulas.routeMeanTolerance(values);
  const routeMaxTolerance = formulas.routeMaxTolerance(values), flightTolerance = formulas.flightTolerance(values);
  if ([startTolerance, landingTolerance, values.routeMeanTolerance, routeMaxTolerance, flightTolerance].some(value => value <= 0)) throw new Error('Similarity tolerances must be positive');
  const start = distance(a.throwPosition, b.throwPosition), end = distance(a.landing, b.landing);
  if (start > startTolerance || end > landingTolerance) return Infinity;
  const timeGap = knownTimes.length === 2 ? Math.abs(a.flightTime - b.flightTime) : 0;
  if (timeGap > flightTolerance) return Infinity;
  const gaps = a.route.points.map((point, index) => distance(point, b.route.points[index]));
  const shape = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  if (shape > values.routeMeanTolerance || Math.max(...gaps) > routeMaxTolerance) return Infinity;
  // Medoid cost: three spatial errors normalized by their tolerances, plus
  // flight-time error with weight 0.2. Eligibility was checked above;
  // this cost only selects the group and its most central real throw.
  // 中心距离 = 起点/容差 + 落点/容差 + 平均轨迹/容差 + 0.2×时间差/容差。
  // 0.2 为时间项权重；相似性已在上方判定，此值仅用于选组与中心记录。
  return start / startTolerance + end / landingTolerance + shape / values.routeMeanTolerance + 0.2 * timeGap / flightTolerance;
}

export function buildUtilityRecommendations({ utilities, flags, side, formulas: expressions }) {
  const formulas = compileRecommendationFormulas(expressions);
  const seen = new Set();
  const entries = utilities.filter(utility => finitePosition(utility.throwPosition) && finitePosition(utility.landing) && utilityMatchesFilters(utility, flags, side))
    .map(utility => ({ ...utility, route: route(utility.projectiles || []) }))
    .filter(utility => utility.route.points.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id))
    .filter(utility => {
      const occurrenceId = utility.occurrenceId || utility.id;
      if (seen.has(occurrenceId)) return false;
      seen.add(occurrenceId); return true;
    });
  const groups = [];
  for (const entry of entries) {
    let best = null, bestCost = Infinity;
    for (const group of groups) {
      // Require similarity to every member; prevent chains of distant throws.
      const differences = group.members.map(member => difference(entry, member, formulas));
      const cost = differences.reduce((sum, value) => sum + value, 0) / differences.length;
      if (cost < bestCost) { best = group; bestCost = cost; }
    }
    if (best) best.members.push(entry); else groups.push({ members: [entry] });
  }
  return groups.filter(group => group.members.length > 3).map(({ members }) => {
    // Exact medoid: a real throw minimizing total difference to all members.
    // Stable ID order breaks ties reproducibly, never selects an averaged fake.
    const costs = members.map(() => 0);
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
      const cost = difference(members[i], members[j], formulas); costs[i] += cost; costs[j] += cost;
    }
    let best = 0;
    for (let i = 1; i < members.length; i++) if (costs[i] < costs[best]) best = i;
    const representative = members[best];
    const demoCount = new Set(members.map(member => member.source.demoId)).size;
    const roundCount = new Set(members.map(member => `${member.source.demoId}:${member.source.round}`)).size;
    const score = Math.max(0, Math.min(100, formulas.frequencyScore({ count: members.length, demoCount, roundCount })));
    return { id: representative.id, representativeId: representative.id, kind: representative.kind,
      memberIds: members.map(member => member.id), count: members.length, total: entries.length,
      demoCount, roundCount, score };
  }).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}
