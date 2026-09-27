// Timers schedule paints; elapsed monotonic time determines playback position.
// A delayed/background callback catches up instead of slowing the Demo down.
export function startPlaybackClock(advance, { delayMs = 0, hz = 30 } = {}) {
  let previous = performance.now() + Math.max(0, delayMs);
  const timer = setInterval(() => {
    const now = performance.now();
    if (now <= previous) return;
    const seconds = (now - previous) / 1000;
    previous = now;
    advance(seconds);
  }, 1000 / hz);
  return () => clearInterval(timer);
}
