// Release labels use SemVer precedence; native build counters are separate.
// 应用版本遵循语义版本顺序；原生构建编号独立递增。
export function parseAppVersion(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/.exec(version || '');
  if (!match) return null;
  const numbers = match.slice(1, 4).map(Number), serial = Number(match[5] || 0);
  if (![...numbers, serial].every(Number.isSafeInteger)) return null;
  return { core: numbers.join('.'), numbers, stage: match[4] || null, serial };
}
export function compareAppVersions(a, b) {
  const left = parseAppVersion(a), right = parseAppVersion(b);
  if (!left || !right) throw new TypeError('Invalid application version');
  for (let i = 0; i < 3; i++) if (left.numbers[i] !== right.numbers[i]) return Math.sign(left.numbers[i] - right.numbers[i]);
  const rank = stage => stage ? ['alpha', 'beta', 'rc'].indexOf(stage) : 3;
  return Math.sign(rank(left.stage) - rank(right.stage)) || Math.sign(left.serial - right.serial);
}
