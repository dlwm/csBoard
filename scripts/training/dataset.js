import { createHmac } from 'node:crypto';

export const STUDY_SCHEMA = 2;
// Only factual observations are exported. No geometric proxy becomes a causal label.
// 仅导出观察事实；未投掷、未知库存、未记录致盲不可替换成“无效”。
export function createStudyEncoder(salt) {
  const token = value => createHmac('sha256', salt).update(String(value)).digest('hex').slice(0, 24);
  const identity = (value, name) => value && String(value) !== '0' ? token(`player:${value}`) : name ? token(`name:${name}`) : null;
  const finite = value => Number.isFinite(value) ? value : null;
  const point = value => value && ['x', 'y', 'z'].every(axis => Number.isFinite(value[axis])) ? { x: value.x, y: value.y, z: value.z } : null;
  const player = value => ({ id: identity(value.steamid, value.name), team: value.team,
    alive: typeof value.alive === 'boolean' ? value.alive : null,
    position: value.hasPosition === false ? null : point(value.position),
    health: finite(value.health), armor: finite(value.armor), yaw: finite(value.yaw), pitch: finite(value.pitch),
    weapon: value.activeWeapon || null, inventory: Array.isArray(value.inventory) ? value.inventory : null,
    balance: finite(value.balance), equipValue: finite(value.currentEquipValue),
    flashDuration: finite(value.flashDuration) });
  const event = value => {
    const result = { type: value.event_name, tick: value.tick,
      user: identity(value.user_steamid, value.user_name), attacker: identity(value.attacker_steamid, value.attacker_name),
      assister: identity(value.assister_steamid, value.assister_name) };
    for (const field of ['user_team_num', 'attacker_team_num', 'weapon', 'dmg_health', 'health', 'blind_duration', 'blind_source', 'projectile_id', 'winner', 'reason', 'entityid',
      'user_X', 'user_Y', 'user_Z', 'attacker_X', 'attacker_Y', 'attacker_Z', 'x', 'y', 'z']) {
      if (value[field] != null && ['string', 'number', 'boolean'].includes(typeof value[field])) result[field] = value[field];
    }
    return result;
  };
  return { token, player, event };
}

// One team decision window, with strictly earlier state and separately marked future labels.
// 队伍级决策窗口：特征严格早于锚点；未来动作和结果单独存放，禁止训练时泄漏。
export function* decisionWindows({ round, snapshots, events, tickRate, config, encode, demoId, split }) {
  let before = -1;
  const step = Math.round(config.windowSeconds * tickRate);
  const inRound = events.filter(event => event.tick >= round.startTick && event.tick <= round.endTick);
  for (let tick = round.startTick + step; tick < round.endTick; tick += step) {
    while (before + 1 < snapshots.length && snapshots[before + 1].tick < tick) before++;
    const snapshot = snapshots[before];
    if (!snapshot || tick - snapshot.tick > tickRate) continue;
    const throws = inRound.filter(event => event.event_name === 'grenade_thrown' && event.tick >= tick && event.tick < tick + tickRate);
    for (const team of [2, 3]) {
      const own = snapshot.players.filter(player => player.team === team);
      if (!own.some(player => player.alive === true)) continue;
      const ids = new Set(own.map(player => String(player.steamid && String(player.steamid) !== '0' ? player.steamid : player.name)));
      const isOwn = event => ids.has(String(event.user_steamid && String(event.user_steamid) !== '0' ? event.user_steamid : event.user_name));
      const outcomes = Object.fromEntries(config.horizonsSeconds.map(seconds => {
        const end = tick + Math.round(seconds * tickRate);
        const observedEnd = Math.min(end, round.endTick);
        const future = inRound.filter(event => event.tick >= tick && event.tick <= observedEnd);
        // Unobserved remainder is censored, never labelled as safe survival.
        return [seconds, { censored: end > round.endTick, observedSeconds: (observedEnd - tick) / tickRate,
          deaths: future.filter(event => event.event_name === 'player_death' && event.user_team_num === team).length,
          opponentDeaths: future.filter(event => event.event_name === 'player_death' && event.user_team_num === (team === 2 ? 3 : 2)).length,
          missingDeathTeams: future.filter(event => event.event_name === 'player_death' && ![2, 3].includes(event.user_team_num)).length,
          plants: future.filter(event => event.event_name === 'bomb_planted').length,
          defuses: future.filter(event => event.event_name === 'bomb_defused').length }];
      }));
      yield { schemaVersion: STUDY_SCHEMA, demoId, split, round: round.round, tick, team,
        features: { snapshotTick: snapshot.tick, elapsedSeconds: (tick - round.startTick) / tickRate,
          bombPlanted: inRound.some(event => event.event_name === 'bomb_planted' && event.tick < tick), players: own.map(encode.player) },
        privileged: { visibility: 'omniscient-demo-only-not-online-input', opponents: snapshot.players.filter(player => player.team !== team && [2, 3].includes(player.team)).map(encode.player) },
        observedActionNextSecond: throws.filter(isOwn).map(encode.event), outcomes,
        limitations: ['observational-not-causal', 'no-throw-is-not-no-active-utility', 'player-knowledge-not-reconstructed'] };
    }
  }
}
