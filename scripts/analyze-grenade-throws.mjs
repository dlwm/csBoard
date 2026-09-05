import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseEvents, parseHeader, parseTicks } = require('@laihoe/demoparser2');

const root = process.cwd();
const inputDir = path.join(root, 'ref', 'dem');
const outputDir = path.join(inputDir, 'throw-analysis');
const tickRate = 64;
const maxRunupTicks = tickRate * 2;
const attackLookbackTicks = tickRate * 2;
const jumpLookbackTicks = Math.round(tickRate * 0.5);
const zeroSpeedThreshold = 5;
const runupSpeedThreshold = 20;
const props = ['X', 'Y', 'Z', 'pitch', 'yaw', 'FIRE', 'RIGHTCLICK', 'FORWARD', 'BACK', 'LEFT', 'RIGHT', 'WALK', 'duck_amount', 'is_airborne'];
const eventProps = [...props, 'velocity', 'velocity_X', 'velocity_Y', 'velocity_Z', 'active_weapon_name'];

const asRows = (value) => Array.isArray(value) ? value : Object.values(value || {});
const bool = (value) => value === true || value === 1 || value === '1';
const round = (value, digits = 3) => value == null || !Number.isFinite(Number(value)) ? null : Number(Number(value).toFixed(digits));
const csvValue = (value) => {
  const text = value == null ? '' : Array.isArray(value) ? value.join('+') : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

function movementKeys(rows) {
  const keys = ['FORWARD', 'BACK', 'LEFT', 'RIGHT'].filter((key) => rows.some((row) => bool(row[key])));
  return keys.length ? keys : ['NONE'];
}

function attackType(rows, eventTick) {
  const heldRows = rows.filter((row) => row.tick <= eventTick && row.tick >= eventTick - attackLookbackTicks && (bool(row.FIRE) || bool(row.RIGHTCLICK)));
  if (!heldRows.length) return { attack: 'unknown', attackStartTick: null, releaseTick: eventTick, attackHoldTicks: null };
  const nearest = heldRows.at(-1);
  const segment = [];
  let expectedTick = nearest.tick;
  for (let index = heldRows.length - 1; index >= 0; index -= 1) {
    const row = heldRows[index];
    if (expectedTick - row.tick > 1) break;
    segment.unshift(row);
    expectedTick = row.tick - 1;
  }
  const both = segment.some((row) => bool(row.FIRE) && bool(row.RIGHTCLICK));
  const primary = bool(nearest.FIRE);
  const secondary = bool(nearest.RIGHTCLICK);
  return {
    attack: both ? 'both' : primary ? 'primary' : secondary ? 'secondary' : 'unknown',
    attackStartTick: segment[0]?.tick ?? nearest.tick,
    releaseTick: nearest.tick + 1,
    attackHoldTicks: nearest.tick - (segment[0]?.tick ?? nearest.tick) + 1,
  };
}

function calculateMotion(rows) {
  const sorted = [...rows].sort((left, right) => left.tick - right.tick);
  return sorted.map((row, index) => {
    const previous = sorted[index - 1];
    if (!previous || row.tick <= previous.tick || row.X == null || row.Y == null || previous.X == null || previous.Y == null) return { ...row, horizontalSpeed: null, verticalSpeed: null };
    const elapsed = (row.tick - previous.tick) / tickRate;
    return { ...row, horizontalSpeed: Math.hypot(row.X - previous.X, row.Y - previous.Y) / elapsed, verticalSpeed: row.Z == null || previous.Z == null ? null : (row.Z - previous.Z) / elapsed };
  });
}

function jumpInfo(rows, releaseTick, eventTick, eventVerticalSpeed) {
  const window = calculateMotion(rows.filter((row) => row.tick >= eventTick - jumpLookbackTicks && row.tick <= eventTick));
  let jumpStart = null;
  for (let index = 0; index < window.length; index += 1) {
    const previous = window[index - 1];
    if (bool(window[index].is_airborne) && (!previous || !bool(previous.is_airborne)) && (window[index].verticalSpeed || 0) > 20) { jumpStart = window[index]; break; }
  }
  const airborneAtRelease = rows.some((row) => row.tick >= releaseTick - 1 && row.tick <= eventTick && bool(row.is_airborne)) && (Number(eventVerticalSpeed) > 20 || window.some((row) => (row.verticalSpeed || 0) > 20));
  const jumped = Boolean(jumpStart || airborneAtRelease);
  const keyCenter = jumpStart?.tick ?? releaseTick;
  const keyRows = rows.filter((row) => row.tick >= keyCenter - 2 && row.tick <= Math.min(eventTick, keyCenter + 4));
  const keys = movementKeys(keyRows);
  return { jumped, jumpStartTick: jumpStart?.tick ?? null, jumpMovement: jumped ? keys.join('+') : 'NONE' };
}

function runupInfo(rows, eventTick) {
  const motion = calculateMotion(rows.filter((row) => row.tick >= eventTick - maxRunupTicks && row.tick <= eventTick));
  let zeroIndex = -1;
  for (let index = motion.length - 1; index >= 0; index -= 1) {
    const speed = motion[index].horizontalSpeed;
    if (speed != null && speed <= zeroSpeedThreshold) { zeroIndex = index; break; }
  }
  const startIndex = zeroIndex >= 0 ? Math.min(zeroIndex + 1, motion.length - 1) : 0;
  const segment = motion.slice(startIndex);
  const speeds = segment.map((row) => row.horizontalSpeed).filter(Number.isFinite);
  const peakSpeed = speeds.length ? Math.max(...speeds) : 0;
  const startTick = segment[0]?.tick ?? eventTick;
  const durationTicks = Math.max(0, eventTick - startTick);
  const distance = segment.reduce((sum, row, index) => {
    const previous = segment[index - 1];
    return previous && row.X != null && row.Y != null && previous.X != null && previous.Y != null ? sum + Math.hypot(row.X - previous.X, row.Y - previous.Y) : sum;
  }, 0);
  const hasRunup = peakSpeed >= runupSpeedThreshold && distance >= 4;
  return {
    hasRunup,
    runupStartTick: hasRunup ? startTick : null,
    runupDurationSeconds: hasRunup ? durationTicks / tickRate : 0,
    runupTruncated: hasRunup && zeroIndex < 0 && durationTicks >= maxRunupTicks - 1,
    runupDistance: hasRunup ? distance : 0,
    runupPeakSpeed: peakSpeed,
    runupMovement: hasRunup ? movementKeys(segment).join('+') : 'NONE',
  };
}

function analyzeThrow(fileName, mapName, event, playerRows) {
  const eventTick = Number(event.tick);
  const nearby = playerRows.filter((row) => row.tick >= eventTick - maxRunupTicks && row.tick <= eventTick + 2);
  const attack = attackType(nearby, eventTick);
  const releaseRows = nearby.filter((row) => row.tick >= attack.releaseTick - 2 && row.tick <= eventTick);
  const jump = jumpInfo(nearby, attack.releaseTick, eventTick, event.user_velocity_Z);
  const runup = runupInfo(nearby, eventTick);
  const movement = movementKeys(releaseRows).join('+');
  const duckAmount = Math.max(0, ...releaseRows.map((row) => Number(row.duck_amount) || 0));
  const stance = duckAmount >= 0.8 ? 'crouched' : duckAmount >= 0.15 ? 'duck_transition' : 'standing';
  const walking = releaseRows.some((row) => bool(row.WALK));
  const throwSpeed = Number(event.user_velocity);
  const initialSpeedClass = !Number.isFinite(throwSpeed) || throwSpeed < 5 ? 'stationary' : throwSpeed < 80 ? 'low' : throwSpeed < 180 ? 'medium' : 'fast';
  const result = {
    demo: fileName,
    map: mapName,
    tick: eventTick,
    player: event.user_name || '',
    steamid: String(event.user_steamid || ''),
    grenade: event.weapon || event.user_active_weapon_name || 'unknown',
    attack: attack.attack,
    attackStartTick: attack.attackStartTick,
    releaseTick: attack.releaseTick,
    attackHoldSeconds: attack.attackHoldTicks == null ? null : attack.attackHoldTicks / tickRate,
    jumped: jump.jumped,
    jumpStartTick: jump.jumpStartTick,
    jumpMovement: jump.jumpMovement,
    movement,
    walking,
    stance,
    duckAmount,
    hasRunup: runup.hasRunup,
    runupStartTick: runup.runupStartTick,
    runupDurationSeconds: runup.runupDurationSeconds,
    runupTruncated: runup.runupTruncated,
    runupDistance: runup.runupDistance,
    runupPeakSpeed: runup.runupPeakSpeed,
    runupMovement: runup.runupMovement,
    throwSpeed: Number.isFinite(throwSpeed) ? throwSpeed : null,
    initialSpeedClass,
    throwVelocityZ: round(event.user_velocity_Z),
    pitch: round(event.user_pitch),
    yaw: round(event.user_yaw),
    x: round(event.user_X),
    y: round(event.user_Y),
    z: round(event.user_Z),
  };
  result.behaviorGroup = [result.attack, result.jumped ? `jump:${result.jumpMovement}` : 'no_jump', result.stance, result.walking ? 'walk' : 'no_walk', `move:${result.movement}`, `speed:${result.initialSpeedClass}`, result.hasRunup ? `runup:${result.runupMovement}` : 'no_runup'].join('|');
  return result;
}

function writeCsv(filePath, rows) {
  if (!rows.length) return fs.writeFileSync(filePath, '');
  const columns = Object.keys(rows[0]);
  fs.writeFileSync(filePath, `${columns.join(',')}\n${rows.map((row) => columns.map((column) => csvValue(row[column])).join(',')).join('\n')}\n`);
}

const demos = fs.readdirSync(inputDir).filter((name) => name.endsWith('.dem')).sort();
const results = [];

for (const fileName of demos) {
  const filePath = path.join(inputDir, fileName);
  const header = parseHeader(filePath);
  const events = asRows(parseEvents(filePath, ['grenade_thrown'], eventProps, ['total_rounds_played'])).sort((left, right) => left.tick - right.tick);
  const wantedTicks = [...new Set(events.flatMap((event) => Array.from({ length: maxRunupTicks + 3 }, (_, index) => Math.max(0, event.tick - maxRunupTicks + index))))].sort((left, right) => left - right);
  const throwers = [...new Set(events.map((event) => String(event.user_steamid)).filter(Boolean))];
  console.log(`${fileName}: ${events.length} throws, ${wantedTicks.length} ticks, ${throwers.length} throwers`);
  const tickRows = asRows(parseTicks(filePath, props, wantedTicks, throwers, false));
  const byPlayer = new Map();
  tickRows.forEach((row) => { const key = String(row.steamid); if (!byPlayer.has(key)) byPlayer.set(key, []); byPlayer.get(key).push(row); });
  byPlayer.forEach((rows) => rows.sort((left, right) => left.tick - right.tick));
  events.forEach((event) => results.push(analyzeThrow(fileName, header.map_name || '', event, byPlayer.get(String(event.user_steamid)) || [])));
}

const groupMap = new Map();
results.forEach((row) => {
  const current = groupMap.get(row.behaviorGroup) || {
    behaviorGroup: row.behaviorGroup,
    attack: row.attack,
    jumped: row.jumped,
    jumpMovement: row.jumpMovement,
    stance: row.stance,
    walking: row.walking,
    movement: row.movement,
    initialSpeedClass: row.initialSpeedClass,
    hasRunup: row.hasRunup,
    runupMovement: row.runupMovement,
    count: 0,
    grenades: new Set(),
    demos: new Set(),
    exampleDemo: row.demo,
    exampleTick: row.tick,
    examplePlayer: row.player,
  };
  current.count += 1;
  current.grenades.add(row.grenade);
  current.demos.add(row.demo);
  groupMap.set(row.behaviorGroup, current);
});
const groups = [...groupMap.values()].map((group) => ({ ...group, grenades: [...group.grenades].sort(), demos: [...group.demos].sort() })).sort((left, right) => right.count - left.count || left.behaviorGroup.localeCompare(right.behaviorGroup));

fs.mkdirSync(outputDir, { recursive: true });
writeCsv(path.join(outputDir, 'grenade-throws.csv'), results);
writeCsv(path.join(outputDir, 'behavior-groups.csv'), groups);
fs.writeFileSync(path.join(outputDir, 'grenade-throws.json'), `${JSON.stringify(results, null, 2)}\n`);

const counts = (key) => Object.entries(Object.groupBy(results, (row) => String(row[key]))).map(([value, rows]) => ({ value, count: rows.length })).sort((left, right) => right.count - left.count);
const exampleFor = (label, predicate) => {
  const row = results.find(predicate);
  return row ? `| ${label} | ${row.demo} | ${row.tick} | ${row.player} | ${row.grenade} | ${row.attack} | ${row.jumped ? row.jumpMovement : '否'} | ${row.stance} | ${row.walking ? '是' : '否'} | ${row.movement} | ${row.initialSpeedClass} | ${row.hasRunup ? row.runupMovement : '否'} |` : `| ${label} | - | - | - | - | - | - | - | - | - | - | 未发现 |`;
};
const representativeExamples = [
  exampleFor('主攻击', (row) => row.attack === 'primary'),
  exampleFor('辅助攻击', (row) => row.attack === 'secondary'),
  exampleFor('双键', (row) => row.attack === 'both'),
  exampleFor('原地跳投', (row) => row.jumped && row.jumpMovement === 'NONE'),
  exampleFor('前跳投', (row) => row.jumped && row.jumpMovement.includes('FORWARD')),
  exampleFor('左跳投', (row) => row.jumped && row.jumpMovement === 'LEFT'),
  exampleFor('右跳投', (row) => row.jumped && row.jumpMovement === 'RIGHT'),
  exampleFor('后跳投', (row) => row.jumped && row.jumpMovement.includes('BACK')),
  exampleFor('蹲投', (row) => row.stance === 'crouched'),
  exampleFor('静步投掷', (row) => row.walking),
  exampleFor('无助跑', (row) => !row.hasRunup),
  exampleFor('有助跑', (row) => row.hasRunup && !row.runupTruncated),
  exampleFor('助跑截断 2 秒', (row) => row.hasRunup && row.runupTruncated),
].join('\n');
const examples = groups.slice(0, 30).map((group) => `| ${group.count} | ${group.attack} | ${group.jumped ? group.jumpMovement : '否'} | ${group.stance} | ${group.walking ? '是' : '否'} | ${group.movement} | ${group.initialSpeedClass} | ${group.hasRunup ? group.runupMovement : '否'} | ${group.exampleDemo} | ${group.exampleTick} | ${group.examplePlayer} |`).join('\n');
const report = `# CS2 道具投掷行为案例集\n\n生成时间：${new Date().toISOString()}\n\n- Demo 数量：${demos.length}\n- 投掷总数：${results.length}\n- 行为组合数：${groups.length}\n- Tick rate 假定：${tickRate}\n\n## 判定规则\n\n- 攻击方式：向前最多 2 秒找到出手前最近的连续攻击按键段；FIRE 为主键、RIGHTCLICK 为副键、同一 Tick 两者同时按下才判定双键。\n- 跳投：出手前 0.5 秒内出现落地到离地变化，并要求 Z 上升速度或事件 velocity_Z > 20 u/s，避免把跌落识别为跳投。\n- 移动、静步、蹲伏：取攻击释放附近到 grenade_thrown 事件之间的状态。\n- 助跑：用逐 Tick XY 坐标差计算水平速度，向前回溯到最近一次速度 <= ${zeroSpeedThreshold} u/s；最多记录 2 秒。没有零速样本时标记 runupTruncated。\n- 初速：使用 grenade_thrown 事件的水平 velocity，并分为 stationary (<5)、low (<80)、medium (<180)、fast (>=180)。\n- 事件自带 velocity 仅作为出手水平速度，逐 Tick助跑速度由坐标计算，因为非事件 Tick 的 velocity 可能为空。\n\n## 分布\n\n### 攻击方式\n\n${counts('attack').map((item) => `- ${item.value}: ${item.count}`).join('\n')}\n\n### 跳跃\n\n${counts('jumped').map((item) => `- ${item.value}: ${item.count}`).join('\n')}\n\n### 姿态\n\n${counts('stance').map((item) => `- ${item.value}: ${item.count}`).join('\n')}\n\n### 静步\n\n${counts('walking').map((item) => `- ${item.value}: ${item.count}`).join('\n')}\n\n### 初速\n\n${counts('initialSpeedClass').map((item) => `- ${item.value}: ${item.count}`).join('\n')}\n\n### 助跑\n\n${counts('hasRunup').map((item) => `- ${item.value}: ${item.count}`).join('\n')}\n\n## 代表案例\n\n| 类型 | Demo | Tick | 选手 | 道具 | 攻击 | 跳跃方向 | 姿态 | 静步 | 出手移动 | 初速 | 助跑方向 |\n| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${representativeExamples}\n\n## 高频行为组合示例\n\n| 数量 | 攻击 | 跳跃方向 | 姿态 | 静步 | 出手移动 | 初速 | 助跑方向 | Demo | Tick | 选手 |\n| ---: | --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- |\n${examples}\n\n## 输出\n\n- grenade-throws.csv：所有投掷明细，行为维度使用独立列。\n- behavior-groups.csv：按变量组合分组统计，保留 behaviorGroup 并将其组成维度拆分为独立列。\n- grenade-throws.json：完整机器可读数据。\n`;
fs.writeFileSync(path.join(outputDir, 'REPORT.md'), report);
console.log(`Wrote ${results.length} throws and ${groups.length} groups to ${path.relative(root, outputDir)}`);
