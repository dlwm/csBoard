// Neutral director records use stable actor IDs; parser user-ID heuristics
// remain in the application adapter. 导播不在核心里猜测 userid 低字节。
export function createDirectorTimeline({ events = [], readEvent = event => event } = {}) {
  const rows = events.map(readEvent).filter(event => ['hltv_fixed', 'hltv_chase'].includes(event?.type) && Number.isFinite(event.tick)).map(event => ({ ...event, position: event.position ? [...event.position] : null })).sort((a, b) => a.tick - b.tick);
  const modes = { follow: rows, fixed: rows.filter(event => event.type === 'hltv_fixed'), chase: rows.filter(event => event.type === 'hltv_chase') };
  return { at(tick, mode = 'follow') {
    if (!Number.isFinite(tick)) throw new TypeError('Director query requires a finite tick');
    const events = modes[mode]; if (!events) throw new TypeError('Unknown director mode');
    let lo = 0, hi = events.length; while (lo < hi) { const mid = (lo + hi) >>> 1; if (events[mid].tick <= tick) lo = mid + 1; else hi = mid; }
    const event = events[lo - 1]; return event ? { ...event, position: event.position ? [...event.position] : null } : null;
  } };
}
