/**
 * Editable recommendation policy. Distances are WORLD METRES, time is SECONDS.
 * 可编辑的推荐公式：距离使用世界坐标的米，时间使用秒。
 *
 * Pair variables / 两次投掷的比较变量:
 * {distance}: mean straight-line throw-to-landing distance / 平均起落直线距离。
 * {pathLength}: mean travelled trajectory length / 平均轨迹弧长。
 * {flightTime}: mean recorded (effectTick - throwTick) / tickRate; unknown = 0.
 *              平均出手到生效时间；缺失时为 0，不虚构飞行时间。
 * {routeMeanTolerance}: evaluated mean-path tolerance / 已计算的轨迹平均容差。
 *
 * Score variables / 频次分变量:
 * {count}: distinct recorded throws / 去重后的投掷次数。
 * {roundCount}, {demoCount}: distinct supporting rounds and Demos / 涉及回合和 Demo 数。
 *
 * Score: saturating support × recurrence evidence, clamped to [0,100].
 * Not a percentage or a success probability. Counts remain separately visible.
 * 分数 = 饱和增长的次数支持度 × 跨回合、跨 Demo 的复现证据，限制在 0–100。
 * 不是百分比、也不是成功率；保留原始次数，以免掩盖样本量。
 *
 * {startHeightGap}, {landingHeightGap}: absolute endpoint height differences (m).
 * {startHorizontalGap}, {landingHorizontalGap}: endpoint horizontal differences (m).
 * 起落点高度差及水平差均可用于编辑容差公式；默认距离与轨迹采用完整三维距离。
 * Similarity requires every pair to pass adaptive 3D tolerances, including height.
 * Slopes are allowed within the tolerance; there is no rigid vertical cutoff.
 * Exact medoid minimizes normalized pair distances.
 * 组内每两条都必须通过包含高度误差的动态三维容差；不对坡度作固定高度截断。
 * 用精确 medoid 选真实中心记录。
 */
export const DEFAULT_RECOMMENDATION_FORMULAS = Object.freeze({
  startTolerance: 'min(4, 2.5 + 0.015 * {distance})',
  landingTolerance: 'min(10, 3 + 0.04 * {distance} + 0.45 * {flightTime})',
  routeMeanTolerance: 'min(7, 2 + 0.025 * {distance} + 0.3 * {flightTime})',
  routeMaxTolerance: '1.8 * {routeMeanTolerance}',
  flightTolerance: '0.75 + 0.25 * {flightTime}',
  frequencyScore: '100 * (1 - exp(-{count} / 8)) * (0.6 + 0.25 * (1 - exp(-{roundCount} / 4)) + 0.15 * (1 - exp(-{demoCount} / 2)))',
});
const pairVariables = ['distance', 'pathLength', 'flightTime', 'startHeightGap', 'landingHeightGap', 'startHorizontalGap', 'landingHorizontalGap'];
export const FORMULA_VARIABLES = Object.freeze({
  startTolerance: pairVariables, landingTolerance: pairVariables, routeMeanTolerance: pairVariables,
  routeMaxTolerance: [...pairVariables, 'routeMeanTolerance'], flightTolerance: pairVariables,
  frequencyScore: ['count', 'roundCount', 'demoCount'],
});
const functions = {
  min: { run: Math.min, min: 1, max: 16 }, max: { run: Math.max, min: 1, max: 16 },
  sqrt: { run: Math.sqrt, min: 1, max: 1 }, exp: { run: Math.exp, min: 1, max: 1 },
  log: { run: Math.log, min: 1, max: 1 }, log1p: { run: Math.log1p, min: 1, max: 1 },
  abs: { run: Math.abs, min: 1, max: 1 }, pow: { run: Math.pow, min: 2, max: 2 },
  clamp: { run: (value, lower, upper) => Math.min(upper, Math.max(lower, value)), min: 3, max: 3 },
};

// Parse only arithmetic, documented variables and whitelisted math functions.
// 不使用 eval / Function；不允许属性访问、脚本或任意函数调用。
export function compileFormula(source, allowedVariables) {
  if (typeof source !== 'string' || !source.trim() || source.length > 1024) throw new Error('Formula must contain 1–1024 characters');
  const tokens = []; let offset = 0;
  while (offset < source.length) {
    const remaining = source.slice(offset);
    const space = remaining.match(/^\s+/);
    if (space) { offset += space[0].length; continue; }
    const token = remaining.match(/^(?:\{[a-zA-Z][a-zA-Z0-9]*\}|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[a-zA-Z][a-zA-Z0-9]*|[()+\-*/^,])/);
    if (!token) throw new Error(`Invalid formula character at ${offset + 1}`);
    tokens.push(token[0]); offset += token[0].length;
    if (tokens.length > 256) throw new Error('Formula is too complex');
  }
  let position = 0, depth = 0;
  const accept = token => tokens[position] === token && (++position, true);
  const require = token => { if (!accept(token)) throw new Error(`Expected ${token}`); };
  function primary() {
    if (++depth > 32) throw new Error('Formula nesting is too deep');
    try {
      const token = tokens[position++];
      if (!token) throw new Error('Expected a value');
      if (token === '(') { const node = addition(); require(')'); return node; }
      if (token.startsWith('{')) {
        const name = token.slice(1, -1);
        if (!allowedVariables.includes(name)) throw new Error(`Unknown variable ${token}`);
        return values => values[name];
      }
      if (/^(?:\d|\.)/.test(token)) { const value = Number(token); if (!Number.isFinite(value)) throw new Error('Non-finite number'); return () => value; }
      const fn = Object.hasOwn(functions, token) ? functions[token] : null;
      if (!fn) throw new Error(`Unknown function ${token}`);
      require('('); const args = [addition()];
      while (accept(',')) args.push(addition());
      require(')');
      if (args.length < fn.min || args.length > fn.max) throw new Error(`Invalid argument count for ${token}`);
      return values => fn.run(...args.map(arg => arg(values)));
    } finally { depth--; }
  }
  function power() { const left = primary(); if (!accept('^')) return left; const right = unary(); return values => left(values) ** right(values); }
  function unary() {
    if (accept('+')) return unary();
    if (accept('-')) { const node = unary(); return values => -node(values); }
    return power();
  }
  function multiplication() {
    let node = unary();
    while (tokens[position] === '*' || tokens[position] === '/') {
      const operation = tokens[position++], left = node, right = unary();
      node = values => operation === '*' ? left(values) * right(values) : left(values) / right(values);
    }
    return node;
  }
  function addition() {
    let node = multiplication();
    while (tokens[position] === '+' || tokens[position] === '-') {
      const operation = tokens[position++], left = node, right = multiplication();
      node = values => operation === '+' ? left(values) + right(values) : left(values) - right(values);
    }
    return node;
  }
  const evaluate = addition();
  if (position !== tokens.length) throw new Error('Unexpected formula token');
  return values => {
    const result = evaluate(values);
    if (!Number.isFinite(result)) throw new Error('Formula produced a non-finite result');
    return result;
  };
}
export function compileRecommendationFormulas(overrides = {}) {
  const expressions = { ...DEFAULT_RECOMMENDATION_FORMULAS, ...overrides };
  return Object.fromEntries(Object.entries(DEFAULT_RECOMMENDATION_FORMULAS).map(([name]) => [name, compileFormula(expressions[name], FORMULA_VARIABLES[name])]));
}
export function validateRecommendationFormulas(expressions) {
  const formulas = compileRecommendationFormulas(expressions);
  for (const distance of [0, 30, 100]) for (const flightTime of [0, 2, 8]) {
    const values = { distance, flightTime, pathLength: distance * 1.5, startHeightGap: 0.5, landingHeightGap: 1, startHorizontalGap: 1, landingHorizontalGap: 2, count: 4, roundCount: 3, demoCount: 2 };
    values.routeMeanTolerance = formulas.routeMeanTolerance(values);
    for (const [name, evaluate] of Object.entries(formulas)) if (name !== 'frequencyScore' && evaluate(values) <= 0) throw new Error(`${name} must be positive`);
    if (formulas.frequencyScore(values) < 0) throw new Error('frequencyScore must be non-negative');
  }
  return expressions;
}
