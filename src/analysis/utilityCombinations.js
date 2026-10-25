import { route, difference } from './utilityRecommendations.js';
import { compileRecommendationFormulas, DEFAULT_RECOMMENDATION_FORMULAS } from './recommendationFormulas.js';
import { utilityMatchesFilters } from './utilityFilters.js';

// WORLD metres and seconds. These are recurrence criteria, never success labels.
// 米、秒；只描述实录时空复现，不能证明有意配合或战术收益。
export const COMBINATION_POLICY = Object.freeze({ minRounds: 4, maxUtilities: 2000, maxSpatialComparisons: 500000,
  maxCandidates: 100000, maxPatterns: 5000, maxMembersPerRoundWindow: 10, maxOccurrences: 128, maxResults: 24 });
export const DEFAULT_COMBINATION_OPTIONS = Object.freeze({ windowSeconds: 8, timeTolerance: 1.5, spatialScale: 1, areaRadius: 25, maxSize: 3 });
const position = value => value && [value.x, value.y, value.z].every(Number.isFinite);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const knownKinds = new Set(['smoke', 'flash', 'fire', 'he', 'decoy']);
const invalid = () => { throw Object.assign(new Error('Invalid utility combination query'), { code: 'invalid_arguments' }); };

export function combinationOptions(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const options = { ...DEFAULT_COMBINATION_OPTIONS, ...value };
  for (const [key, low, high] of [['windowSeconds', 2, 20], ['timeTolerance', .25, 5], ['spatialScale', .5, 2], ['areaRadius', 5, 60], ['maxSize', 2, 4]]) {
    if (!Number.isFinite(options[key]) || options[key] < low || options[key] > high) return invalid();
  }
  if (!Number.isInteger(options.maxSize)) return invalid();
  return options;
}

export function findUtilityCombinations({ utilities, flags = {}, side = 'ALL', options: inputOptions, formulas: expressions, inputOmitted = 0 } = {}) {
  const options = combinationOptions(inputOptions);
  if (!Number.isSafeInteger(inputOmitted) || inputOmitted < 0 || !Array.isArray(utilities) || utilities.length > 50000 || !['ALL', 'T', 'CT'].includes(side)
    || !flags || typeof flags !== 'object' || ['utilityKinds', 'economyOwn', 'economyOpponent'].some(key => flags[key] != null && (!Array.isArray(flags[key]) || flags[key].some(value => typeof value !== 'string')))) return invalid();
  const formulas = { ...DEFAULT_RECOMMENDATION_FORMULAS, ...expressions };
  // Scale the same adaptive 3D endpoint/route policy used by single recommendations.
  // 沿用单颗道具完整三维、飞行时间及轨迹容差；只增加显式空间倍率。
  for (const key of ['startTolerance', 'landingTolerance', 'routeMeanTolerance']) formulas[key] = `(${formulas[key]}) * ${options.spatialScale}`;
  const compiled = compileRecommendationFormulas(formulas);
  const diagnostics = { missingTiming: 0, invalidUtilities: 0, omittedUtilities: inputOmitted, spatialBudget: false, candidateBudget: false, patternBudget: false, denseWindows: 0, occurrenceLimit: false, omittedResults: 0 };
  const seen = new Set(), entries = [];
  for (const utility of [...utilities].sort((a, b) => String(a?.id).localeCompare(String(b?.id)))) {
    if (!utility || !knownKinds.has(utility.kind) || !['T', 'CT'].includes(utility.side) || typeof utility.id !== 'string' || utility.id.length > 4096
      || !utility.source || typeof utility.source.demoId !== 'string' || utility.source.demoId.length > 4096 || !Number.isInteger(utility.source.round)
      || !position(utility.throwPosition) || !position(utility.landing) || !Array.isArray(utility.projectiles) || utility.projectiles.length > 200000) { diagnostics.invalidUtilities++; continue; }
    if (!utilityMatchesFilters(utility, flags, side)) continue;
    if (![utility.throwSeconds, utility.effectSeconds].every(Number.isFinite) || utility.effectSeconds < utility.throwSeconds) { diagnostics.missingTiming++; continue; }
    const key = utility.occurrenceId || utility.id;
    if (seen.has(key)) continue; seen.add(key);
    if (entries.length >= COMBINATION_POLICY.maxUtilities) { diagnostics.omittedUtilities++; continue; }
    const path = route(utility.projectiles);
    if (!path.points.length) { diagnostics.invalidUtilities++; continue; }
    entries.push({ ...utility, route: path, flightTime: utility.effectSeconds - utility.throwSeconds });
  }
  // Complete-link clusters prevent A≈B≈C chains from merging incompatible throws.
  const clusters = [], clusterFor = new Map();
  let spatialComparisons = 0;
  const compare = (a, b) => {
    if (++spatialComparisons > COMBINATION_POLICY.maxSpatialComparisons) { diagnostics.spatialBudget = true; return Infinity; }
    return difference(a, b, compiled);
  };
  for (let i = 0; i < entries.length; i++) {
    if (diagnostics.spatialBudget) { diagnostics.omittedUtilities += entries.length - i; break; }
    const entry = entries[i]; let best, bestCost = Infinity;
    for (const cluster of clusters) {
      if (cluster[0].kind !== entry.kind || cluster[0].side !== entry.side) continue;
      let total = 0, valid = true;
      for (const member of cluster) { const cost = compare(entry, member); if (!Number.isFinite(cost)) { valid = false; break; } total += cost; }
      if (valid && total / cluster.length < bestCost) { best = cluster; bestCost = total / cluster.length; }
    }
    if (diagnostics.spatialBudget) { diagnostics.omittedUtilities += entries.length - i; break; }
    if (best) { best.push(entry); clusterFor.set(entry.id, clusters.indexOf(best)); }
    else { clusterFor.set(entry.id, clusters.length); clusters.push([entry]); }
  }
  const clusterSupport = clusters.map(cluster => new Set(cluster.map(item => JSON.stringify([item.source.demoIdentity || item.source.demoId, item.source.round]))).size);
  const rounds = new Map();
  for (const entry of entries) {
    const cluster = clusterFor.get(entry.id);
    if (cluster == null || clusterSupport[cluster] < COMBINATION_POLICY.minRounds) continue;
    const key = JSON.stringify([entry.source.demoIdentity || entry.source.demoId, entry.source.round, entry.side]);
    if (!rounds.has(key)) rounds.set(key, []);
    rounds.get(key).push({ ...entry, cluster, roundKey: key });
  }
  // Canonical slot order is spatial cluster, then observed effect time for repeats.
  // 对同类重复闪光使用真实生效时间排槽，时间向量以最早生效为零点。
  const occurrence = members => {
    const firstEffect = Math.min(...members.map(item => item.effectSeconds));
    const firstThrow = Math.min(...members.map(item => item.throwSeconds));
    const slots = [...members].sort((a, b) => a.cluster - b.cluster || a.effectSeconds - b.effectSeconds || a.id.localeCompare(b.id));
    return { slots, offsets: slots.map(item => item.effectSeconds - firstEffect), firstEffect, firstThrow, roundKey: slots[0].roundKey };
  };
  const timingCost = (a, b) => {
    let total = 0;
    for (let i = 0; i < a.offsets.length; i++) {
      const gap = Math.abs(a.offsets[i] - b.offsets[i]);
      if (gap > options.timeTolerance) return Infinity;
      total += gap / options.timeTolerance;
    }
    return total / a.offsets.length;
  };
  const patterns = new Map(); let candidates = 0;
  for (const members of rounds.values()) {
    members.sort((a, b) => a.effectSeconds - b.effectSeconds || a.id.localeCompare(b.id));
    for (let start = 0; start < members.length; start++) {
      if (diagnostics.candidateBudget) break;
      const window = members.slice(start + 1).filter(item => item.effectSeconds - members[start].effectSeconds <= options.windowSeconds);
      if (window.length + 1 > COMBINATION_POLICY.maxMembersPerRoundWindow) diagnostics.denseWindows++;
      const available = window.slice(0, COMBINATION_POLICY.maxMembersPerRoundWindow - 1);
      const visit = selected => {
        if (diagnostics.candidateBudget) return;
        if (selected.length >= 2) {
          if (++candidates > COMBINATION_POLICY.maxCandidates) { diagnostics.candidateBudget = true; return; }
          const candidate = occurrence(selected), signature = JSON.stringify([selected[0].side, candidate.slots.map(item => item.cluster)]);
          const variants = patterns.get(signature) || [];
          let best, bestCost = Infinity;
          for (const variant of variants) {
            let cost = 0;
            for (const member of variant) { const value = timingCost(candidate, member); if (!Number.isFinite(value)) { cost = Infinity; break; } cost += value; }
            if (cost / variant.length < bestCost) { best = variant; bestCost = cost / variant.length; }
          }
          if (best) {
            if (!best.some(item => item.roundKey === candidate.roundKey)) {
              if (best.length < COMBINATION_POLICY.maxOccurrences) best.push(candidate); else diagnostics.occurrenceLimit = true;
            }
          } else if (patterns.size < COMBINATION_POLICY.maxPatterns && variants.length < 8) {
            variants.push([candidate]); patterns.set(signature, variants);
          } else diagnostics.patternBudget = true;
        }
        if (selected.length >= options.maxSize) return;
        const previous = selected.at(-1);
        for (const item of available) {
          if (item.effectSeconds < previous.effectSeconds || item.effectSeconds === previous.effectSeconds && item.id.localeCompare(previous.id) <= 0) continue;
          if (selected.some(member => member.id === item.id || distance(member.landing, item.landing) > options.areaRadius)) continue;
          visit([...selected, item]);
        }
      };
      visit([members[start]]);
    }
  }
  const groups = [];
  for (const variants of patterns.values()) for (const occurrences of variants) {
    if (occurrences.length < COMBINATION_POLICY.minRounds) continue;
    // Whole-occurrence exact medoid; never synthesize a combo from different rounds.
    // 整组 medoid = 各槽三维轨迹归一距离的均值 + 生效时间偏移误差均值。
    const costs = occurrences.map(() => 0);
    for (let i = 0; i < occurrences.length; i++) for (let j = i + 1; j < occurrences.length; j++) {
      const a = occurrences[i], b = occurrences[j];
      const spatial = a.slots.reduce((total, item, slot) => total + difference(item, b.slots[slot], compiled), 0) / a.slots.length;
      const cost = spatial + timingCost(a, b); costs[i] += cost; costs[j] += cost;
    }
    let index = 0; for (let i = 1; i < costs.length; i++) if (costs[i] < costs[index]) index = i;
    const representative = occurrences[index];
    const summarize = item => ({ demoId: item.slots[0].source.demoId, fileName: item.slots[0].source.fileName, round: item.slots[0].source.round,
      tick: item.firstThrow * (item.slots[0].source.tickRate || 64),
      members: item.slots.map(utility => ({ utilityId: utility.id, kind: utility.kind, thrower: utility.thrower || '',
        throwOffsetSeconds: utility.throwSeconds - item.firstThrow, effectOffsetSeconds: utility.effectSeconds - item.firstThrow })) });
    groups.push({ id: representative.slots.map(item => item.id).join('|'), side: representative.slots[0].side,
      count: occurrences.length, demoCount: new Set(occurrences.map(item => item.slots[0].source.demoIdentity || item.slots[0].source.demoId)).size,
      representative: summarize(representative), occurrences: occurrences.map(summarize),
      allUtilityIds: [...new Set(occurrences.flatMap(item => item.slots.map(utility => utility.id)))] });
  }
  groups.sort((a, b) => b.count - a.count || b.representative.members.length - a.representative.members.length || a.id.localeCompare(b.id));
  diagnostics.omittedResults = Math.max(0, groups.length - COMBINATION_POLICY.maxResults);
  return { groups: groups.slice(0, COMBINATION_POLICY.maxResults), diagnostics, candidateCount: candidates, eligibleGroups: groups.length };
}
