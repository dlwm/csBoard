// Reuse one renderer/player while retaining each menu's playback state.
// 各菜单保存独立播放状态，共用同一个播放器和场景。
export function createPlaybackSessions(initial = 'demo') {
  let active = initial;
  const sessions = new Map(), pending = new Set();
  return {
    get active() { return active; },
    set(context, session) { sessions.set(context, session); pending.add(context); },
    acknowledge: context => pending.delete(context),
    switchTo(next, current) {
      if (next === active && !pending.has(next)) return { changed: false };
      if (next !== active && !pending.has(active)) sessions.set(active, current);
      pending.delete(next);
      active = next;
      return { changed: true, session: sessions.get(next) || null };
    },
  };
}
