import * as THREE from 'three';
import { effectEndTick } from '../demo/effectLifetime.js';
import { floorVisibilityAtY } from './floorFade.js';

// Small screen-space badges use the same recorded expiration as the effect.
// Rebuild lifetimes only when events change; project at 10 Hz, not React paint rate.
// 与烟体共用实际消散时间；事件不变时复用索引，仅以 10Hz 更新轻量屏幕标牌。
export function createSmokeCountdownOverlay({ mount, camera, getState, getModelCenter, floorFadeRef, getViewport }) {
  const layer = document.createElement('div'); layer.className = 'smoke-countdown-layer'; layer.setAttribute('aria-hidden', 'true'); mount.append(layer);
  let events, lifetimes = [], updatedAt = 0;
  const badges = new Map(), point = new THREE.Vector3();
  return {
    update(now) {
      const state = getState();
      layer.hidden = !state.enabled;
      if (!state.enabled || now - updatedAt < 100) return;
      updatedAt = now;
      if (events !== state.events) {
        events = state.events;
        lifetimes = (events || []).filter(e => e.event_name === 'smokegrenade_detonate' && [e.x, e.y, e.z].every(Number.isFinite))
          .map((event, index) => ({ event, key: `${event.tick}:${event.entityid ?? index}`, end: effectEndTick(event, events) }));
      }
      const active = new Set(), occupied = [], center = getModelCenter();
      const wall = mount.parentElement?.querySelector('.demo-monitor-wall');
      const width = wall?.offsetWidth ? Math.max(1, Math.min(mount.clientWidth, wall.getBoundingClientRect().left - mount.getBoundingClientRect().left - 10)) : mount.clientWidth;
      const height = mount.clientHeight;
      for (const { event, key, end } of lifetimes) {
        if (state.tick < event.tick || state.tick >= end) continue;
        const worldY = event.z * .0254 - center.y;
        if (!camera.planView && floorVisibilityAtY(worldY, floorFadeRef.current) < .05) continue;
        point.set(event.y * .0254 - center.x, worldY, event.x * .0254 - center.z);
        const view=camera.planView && getViewport ? getViewport(point) : {x:0,width,height};
        point.y+=2;point.project(camera);
        if (point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1) continue;
        const x = view.x+Math.max(32, Math.min(view.width - 32, (point.x + 1) * view.width / 2));
        let y = Math.max(18, Math.min(height - 18, (1 - point.y) * height / 2));
        if (!camera.planView && camera.fov >= 60 && Math.abs(x - width / 2) < 45 && Math.abs(y - height / 2) < 35) y -= 48;
        // Offset nearby badges vertically instead of covering the smoke with a large panel.
        // 临近标牌错开排列，不用大面积面板遮挡烟体。
        for (let tries = 0; tries < 4 && occupied.some(p => Math.abs(p.x - x) < 65 && Math.abs(p.y - y) < 26); tries++) y -= 26;
        if (y < 18) continue;
        occupied.push({ x, y }); active.add(key);
        let badge = badges.get(key);
        if (!badge) {
          badge = document.createElement('span'); badge.className = 'smoke-countdown';
          badge.innerHTML = '<i></i><b></b>'; layer.append(badge); badges.set(key, badge);
        }
        const seconds = (end - state.tick) / (state.tickRate || 64);
        badge.style.transform = `translate(${x}px, ${y}px)`;
        badge.style.setProperty('--remaining', Math.max(0, Math.min(1, (end - state.tick) / (end - event.tick))));
        badge.classList.toggle('ending', seconds <= 3);
        badge.lastElementChild.textContent = `${seconds.toFixed(1)}s`;
        badge.title = event.user_name || '';
      }
      for (const [key, badge] of badges) if (!active.has(key)) { badge.remove(); badges.delete(key); }
    },
    dispose() { layer.remove(); badges.clear(); },
  };
}
