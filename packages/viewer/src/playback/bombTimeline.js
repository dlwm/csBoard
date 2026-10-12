// C4 state is a time query, not a mutable playback state machine.
// C4 按 tick 二分查询，倒退无需撤销；缺失坐标/事件不凭空补全。
const TYPES = new Set(['bomb_dropped', 'bomb_pickup', 'bomb_planted', 'bomb_begindefuse', 'bomb_abortdefuse', 'bomb_exploded', 'bomb_defused', 'round_end']);
const upper = (rows, tick) => { let lo = 0, hi = rows.length; while (lo < hi) { const mid = (lo + hi) >>> 1; if (rows[mid].tick <= tick) lo = mid + 1; else hi = mid; } return lo; };
const clamp = value => Math.max(0, Math.min(1, value));
export function createBombTimeline({ events = [], tickRate, timerSeconds = 40, readEvent = event => event } = {}) {
  if (!Number.isFinite(tickRate) || tickRate <= 0) throw new TypeError('Bomb timeline requires a positive tick rate');
  if (!Number.isFinite(timerSeconds) || timerSeconds <= 0) throw new TypeError('Bomb timer must be positive');
  const rows = events.map(readEvent).filter(event => event && TYPES.has(event.type) && Number.isFinite(event.tick)).map(event => ({ type: event.type, tick: event.tick, position: Array.isArray(event.position) && event.position.length === 3 && event.position.every(Number.isFinite) ? [...event.position] : null, hasKit: event.hasKit === true ? true : event.hasKit === false ? false : null })).sort((a, b) => a.tick - b.tick);
  const durations = []; let plant = null;
  for (const event of rows) { if (event.type === 'bomb_planted') plant = event; else if (event.type === 'bomb_exploded' && plant) { if (event.tick > plant.tick) durations.push(event.tick - plant.tick); plant = null; } else if (['round_end', 'bomb_defused'].includes(event.type)) plant = null; }
  durations.sort((a, b) => a - b);
  const timerTicks = durations.length ? durations[Math.floor(durations.length / 2)] : timerSeconds * tickRate;
  const states = []; let state = { status: 'unknown', event: null, plant: null, terminal: null, defuse: null, nextPickup: null };
  // Future pickup positions only describe an illustrative dropped-bomb arc.
  // 后续拾取坐标用于示意抛物线，并非 Demo 记录的真实物理轨迹。
  let nextPickup = null; const pickups = new Map();
  for (let index = rows.length - 1; index >= 0; index--) { const event = rows[index]; if (['bomb_pickup', 'bomb_planted'].includes(event.type)) nextPickup = event; else if (event.type === 'bomb_dropped') pickups.set(event, nextPickup); }
  const terminals = new Map(); plant = null;
  for (const event of rows) { if (event.type === 'bomb_planted') plant = event; else if (['bomb_exploded', 'bomb_defused', 'round_end'].includes(event.type) && plant) { terminals.set(plant, event); plant = null; } }
  for (const event of rows) {
    state = { ...state };
    if (event.type === 'bomb_planted') state = { status: 'planted', event, plant: event, terminal: null, defuse: null, nextPickup: null };
    else if (event.type === 'bomb_dropped') state = { status: 'dropped', event, plant: null, terminal: null, defuse: null, nextPickup: pickups.get(event) || null };
    else if (event.type === 'bomb_pickup') state = { status: 'carried', event, plant: null, terminal: null, defuse: null, nextPickup: null };
    else if (event.type === 'bomb_begindefuse' && state.status === 'planted') state.defuse = event;
    else if (event.type === 'bomb_abortdefuse') state.defuse = null;
    else if (['bomb_exploded', 'bomb_defused', 'round_end'].includes(event.type)) { state.status = event.type === 'round_end' ? 'ended' : event.type === 'bomb_defused' ? 'defused' : 'exploded'; state.terminal = event; state.defuse = null; }
    states.push({ tick: event.tick, ...state });
  }
  return { tickRate, timerTicks, at(tick) {
    if (!Number.isFinite(tick)) throw new TypeError('Bomb query requires a finite tick');
    const current = states[upper(states, tick) - 1];
    if (!current) return { status: 'unknown', event: null, plant: null, terminal: null, position: null, nextPickup: null, countdownSeconds: null, defuseProgress: null, defuse: null, timerEstimated: !durations.length, defuseDurationEstimated: null };
    const future = current.plant && terminals.get(current.plant);
    const explosion = future?.type === 'bomb_exploded' ? future.tick : current.plant ? current.plant.tick + timerTicks : null;
    const displayTick = current.status === 'defused' ? current.terminal.tick : tick;
    const countdownSeconds = current.plant && ['planted', 'defused'].includes(current.status) ? Math.max(0, (explosion - displayTick) / tickRate) : null;
    const defuseProgress = current.defuse ? clamp((tick - current.defuse.tick) / ((current.defuse.hasKit === true ? 5 : 10) * tickRate)) : null;
    const copy = event => event ? { ...event, position: event.position ? [...event.position] : null } : null;
    return { status: current.status, event: copy(current.event), plant: copy(current.plant), terminal: copy(current.terminal), nextPickup: copy(current.nextPickup), position: current.event?.position ? [...current.event.position] : null, defuse: copy(current.defuse), defuseProgress, countdownSeconds, timerEstimated: !durations.length, defuseDurationEstimated: current.defuse ? current.defuse.hasKit == null : null };
  } };
}
