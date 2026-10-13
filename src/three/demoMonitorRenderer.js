import { createMonitorRenderer } from '../../packages/viewer/src/three/monitorRenderer.js';
import { createDemoMonitorLayout } from './demoMonitorLayout.js';

// Legacy player shape and application DOM are adapted here. The renderer itself
// shares camera math, cache scheduling and resource cleanup with the library.
export default function createDemoMonitorRenderer({ mount, playersRef, modeRef, getModelCenter, ...options }) {
  const layout = createDemoMonitorLayout({ mount, renderer: options.renderer });
  const renderer = createMonitorRenderer({ ...options,
    getLayout: layout.read, isActive: () => modeRef.current === 'monitor',
    getPlayers: () => playersRef.current || [],
    getPlayerId: player => String(player.steamid || player.name || ''),
    getMonitorId: player => player.monitorId || String(player.steamid || player.name || ''),
    getPose: player => {
      if (!player.position || player.hasPosition === false) return null;
      const center = getModelCenter();
      return { position: [player.position.x - center.x, player.position.y - center.y, player.position.z - center.z],
        pitch: player.pitch ?? 0, yaw: player.yaw ?? 0, crouchAmount: player.duckAmount, scoped: player.scoped,
        alive: Number(player.health) <= 0 ? false : player.alive };
    },
  });
  return { ...renderer, invalidateLayout: layout.invalidate,
    render(now) { const rendered = renderer.render(now); if (!rendered) layout.dispose(); return rendered; },
    dispose() { layout.dispose(); renderer.dispose(); },
  };
}
