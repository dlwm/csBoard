const idle = () => ({ movement: [], jump: false, recentJump: false, jumpMode: 'unavailable', primary: false, secondary: false, recentMovement: [], recentPrimary: false, recentSecondary: false, mode: 'unavailable' });

// Recorded inputs are discrete: hold the last sample until the next one, never
// interpolate buttons. Missing input uses a separate, labelled action mode.
// 真实按键只读当前 tick 之前的离散记录；缺失时进入明确标注的动作还原模式。
export function utilityReplayInput(replay, tick, behavior) {
  const snapshots = replay?.snapshots;
  if (!snapshots?.length || !Number.isFinite(tick) || tick < snapshots[0].tick || tick >= replay.endTick || tick > replay.throwTick) return idle();
  let low = 0, high = snapshots.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (snapshots[middle].tick <= tick) low = middle + 1;
    else high = middle;
  }
  const sample = snapshots[low - 1];
  // Do not leave a final recorded key held throughout the remaining smoke/fire.
  if (!sample || (low === snapshots.length && tick > sample.tick)) return idle();
  const player = sample.players?.[0];
  // A 120ms echo makes short recorded taps visible. Echoes are separate from
  // pressed state and computed from the timeline, so seeking never leaks input.
  // 短按保留 120ms 外圈提示，与真实按住状态分开，拖动时间轴不会残留。
  const windowTicks = (replay.tickRate || 64) * .12;
  const recent = [];
  for (let index = low - 1; index >= 0 && snapshots[index].tick >= tick - windowTicks; index--) {
    const recorded = snapshots[index].players?.[0];
    if (recorded?.inputAvailable !== false) recent.push(recorded);
  }
  const available = player?.inputAvailable === true || (player?.inputAvailable !== false && (player?.movement?.length || player?.fire || player?.secondaryFire || typeof player?.jump === 'boolean'));
  if (!available) return observedInput(replay, tick, low - 1, behavior);
  return {
    ...jumpInput(replay, tick, low - 1), mode: 'recorded', movement: Array.isArray(player?.movement) ? player.movement : [],
    primary: available && Boolean(player?.fire), secondary: available && Boolean(player?.secondaryFire),
    recentMovement: [...new Set(recent.flatMap(row => row?.movement || []))],
    recentPrimary: recent.some(row => row?.fire), recentSecondary: recent.some(row => row?.secondaryFire),
  };
}

// Demos without user commands can still contain pawn motion and grenade state.
// This is an explicitly labelled reconstruction, never advertised as real keys:
// Grounded motion and the ground-to-air launch impulse are observable; ongoing
// air inertia is not a held key. Echo brief launch motion for 120ms separately.
// 无 usercmd 时只还原地面位移及离地瞬间方向，腾空惯性不推算持续按住。
// 鼠标提示来自武器拉栓/力度或投掷事件，界面始终标为“按动作还原”。
function observedInput(replay, tick, index, behavior) {
  const result = idle();
  const sample = replay.snapshots[index], player = sample?.players?.[0];
  const strength = Number.isFinite(player?.grenadeThrowStrength) ? player.grenadeThrowStrength : behavior?.throwStrength;
  const pinKnown = typeof player?.grenadePinPulled === 'boolean';
  Object.assign(result, jumpInput(replay, tick, index));
  result.movement = observedMovement(replay, index);
  result.mode = 'observed';
  const recent = new Set();
  for (let at = index; at >= 0 && replay.snapshots[at].tick >= tick - (replay.tickRate || 64) * .12; at--) {
    observedMovement(replay, at).forEach(action => recent.add(action));
    const recorded = replay.snapshots[at].players?.[0];
    if (recorded?.grenadePinPulled && Number.isFinite(recorded.grenadeThrowStrength)) {
      result.recentPrimary ||= recorded.grenadeThrowStrength > .25;
      result.recentSecondary ||= recorded.grenadeThrowStrength < .75;
    }
  }
  result.recentMovement = [...recent];
  const release = Number.isFinite(replay.throwTick) && tick >= replay.throwTick && tick < replay.throwTick + (replay.tickRate || 64) * .12;
  if (Number.isFinite(strength) && (pinKnown || release)) {
    result.mode = 'observed';
    const active = player?.grenadePinPulled === true;
    result.primary = active && strength > .25;
    result.secondary = active && strength < .75;
    result.recentPrimary ||= release && strength > .25;
    result.recentSecondary ||= release && strength < .75;
  }
  return result;
}

// Space follows recorded JUMP when available. Legacy clips only show a brief
// upward ground-to-air transition, never a held key inferred from air inertia.
// 空格优先使用真实 JUMP；旧录像仅提示向上离地瞬间，落台阶不当作跳跃。
function jumpInput(replay, tick, index) {
  const player = replay.snapshots[index]?.players?.[0];
  const recorded = typeof player?.jump === 'boolean';
  let recentJump = false;
  for (let at = index; at >= 0 && replay.snapshots[at].tick >= tick - (replay.tickRate || 64) * .12; at--) {
    const row = replay.snapshots[at].players?.[0];
    recentJump ||= recorded ? row?.jump === true : observedJump(replay, at);
  }
  return { jump: recorded ? player.jump : observedJump(replay, index), recentJump, jumpMode: recorded ? 'recorded' : 'observed' };
}

function observedJump(replay, index) {
  const sample = replay.snapshots[index], previous = replay.snapshots[index - 1];
  const player = sample?.players?.[0], before = previous?.players?.[0];
  if (!player?.isAirborne || before?.isAirborne !== false || !player.raw || !before.raw) return false;
  if (![player.raw.x, player.raw.y, player.raw.z, before.raw.x, before.raw.y, before.raw.z].every(Number.isFinite)) return false;
  const elapsed = (sample.tick - previous.tick) / (replay.tickRate || 64);
  const distance = Math.hypot(player.raw.x - before.raw.x, player.raw.y - before.raw.y, player.raw.z - before.raw.z);
  return elapsed > 0 && elapsed <= .125 && distance < 128 && (player.raw.z - before.raw.z) / elapsed > 5;
}

function observedMovement(replay, index) {
  const sample = replay.snapshots[index], player = sample?.players?.[0];
  const previous = replay.snapshots[index - 1], before = previous?.players?.[0];
  const valid = row => row?.raw && [row.raw.x, row.raw.y, row.raw.z].every(Number.isFinite);
  if (!valid(player) || !valid(before) || sample.tick <= previous.tick || sample.tick - previous.tick > (replay.tickRate || 64) * .125) return [];
  const takeoff = player.isAirborne && !before.isAirborne;
  if (player.isAirborne && !takeoff) return [];
  const elapsed = (sample.tick - previous.tick) / (replay.tickRate || 64);
  const dx = (player.raw.x - before.raw.x) / elapsed, dy = (player.raw.y - before.raw.y) / elapsed;
  const speed = Math.hypot(dx, dy), yaw = (player.yaw || 0) * Math.PI / 180;
  // A short forward jump can impart less than 20 units/s before leaving ground.
  // 离地瞬间允许 >5 单位/秒，仍排除静止噪声和 >400 的传送/异常位移。
  if (speed <= (takeoff ? 5 : 20) || speed >= 400) return [];
  const forward = (dx * Math.cos(yaw) + dy * Math.sin(yaw)) / speed;
  const right = (dx * Math.sin(yaw) - dy * Math.cos(yaw)) / speed;
  return [forward > .35 && 'FORWARD', forward < -.35 && 'BACK', right > .35 && 'RIGHT', right < -.35 && 'LEFT'].filter(Boolean);
}

export function utilityReplayInputMode(replay, behavior) {
  const players = replay?.snapshots?.flatMap(sample => sample.players || []) || [];
  if (players.some(player => player.inputAvailable === true || (player.inputAvailable !== false && (player.fire || player.secondaryFire || player.movement?.length || typeof player.jump === 'boolean')))) return 'recorded';
  if (players.some(player => typeof player.grenadePinPulled === 'boolean' || (player.raw && [player.raw.x, player.raw.y, player.raw.z].every(Number.isFinite))) || Number.isFinite(behavior?.throwStrength)) return 'observed';
  return 'unavailable';
}
