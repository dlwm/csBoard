// Owns Demo utility trajectories, landing effects, playback progress, and cleanup.
import * as THREE from 'three';
import { createGrenadeEffect, disposeGrenadeEffect } from './grenadeEffects.js';
import { enableObjectFloorFade } from './floorFade.js';

export default function createDemoGrenadeSceneController({ scene, navData, refs, floorFadeRef, getModelCenter, getNav }) {
  const objects = new Map();

  const update = () => {
    const active = new Set();
    const tick = refs.tick.current;
    const segments = refs.segments.current;
    const grenadeEvents = refs.grenades.current;
    const modelCenter = getModelCenter();
    const nav = getNav();
    refs.projectileGroups.current.forEach((records, groupKey) => {
      const entityId = records[0].entity_id;
      const first = records[0];
      const last = records[records.length - 1];
      const detonation = grenadeEvents.find((event) => event.entityid === entityId && event.tick >= first.tick && event.tick <= last.tick + 64 && (event.event_name.endsWith('_detonate') || event.event_name === 'inferno_startburn'));
      const fadeStartTick = detonation?.tick ?? last.tick;
      const fadeTicks = 64;
      if (tick < first.tick || tick > fadeStartTick + fadeTicks) return;
      const key = `projectile-${groupKey}`;
      active.add(key);
      let trajectory = objects.get(key);
      const pathRecords = records.filter((record) => record.tick <= fadeStartTick);
      const points = pathRecords.map((record) => new THREE.Vector3(record.y * 0.0254 - modelCenter.x, record.z * 0.0254 - modelCenter.y, record.x * 0.0254 - modelCenter.z));
      if (!trajectory) {
        const color = first.grenade_type?.includes('Smoke') ? '#b9c7d6' : first.grenade_type?.includes('Flash') ? '#fff3a6' : first.grenade_type?.includes('Molotov') ? '#ff7a45' : first.grenade_type?.includes('Decoy') ? '#c8d0d4' : '#ffb36b';
        trajectory = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.length > 1 ? points : [points[0], points[0]]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
        trajectory.userData.demoTrajectory = { firstTick: first.tick, lastTick: fadeStartTick, fadeTicks, pointCount: points.length };
        trajectory.userData.demoGrenadeSegmentId = segments.find((segment) => segment.groupKey === groupKey)?.id;
        enableObjectFloorFade(trajectory, floorFadeRef.current);
        scene.add(trajectory);
        objects.set(key, trajectory);
      }
      const trajectoryData = trajectory.userData.demoTrajectory;
      if (tick <= trajectoryData.lastTick) {
        const progress = THREE.MathUtils.clamp((tick - trajectoryData.firstTick) / Math.max(1, trajectoryData.lastTick - trajectoryData.firstTick), 0, 1);
        trajectory.geometry.setDrawRange(0, Math.max(2, Math.ceil(progress * trajectoryData.pointCount)));
        trajectory.material.opacity = 0.9;
      } else {
        const fade = THREE.MathUtils.clamp((tick - trajectoryData.lastTick) / trajectoryData.fadeTicks, 0, 1);
        const start = Math.floor(fade * trajectoryData.pointCount * 0.85);
        trajectory.geometry.setDrawRange(start, Math.max(0, trajectoryData.pointCount - start));
        trajectory.material.opacity = 0.9 * (1 - fade);
      }
    });
    const durations = { smokegrenade_detonate: 1152, inferno_startburn: 448, flashbang_detonate: 20, hegrenade_detonate: 20 };
    segments.filter((segment) => !segment.groupKey).forEach((segment) => {
      const event = segment.throwEvent;
      const landing = segment.landing;
      if (!landing || tick < event.tick || tick > landing.tick) return;
      const key = `trajectory-${event.tick}-${event.user_steamid}-${event.weapon}`;
      active.add(key);
      let trajectory = objects.get(key);
      if (!trajectory) {
        const start = new THREE.Vector3(event.user_Y * 0.0254 - modelCenter.x, event.user_Z * 0.0254 - modelCenter.y + 0.2, event.user_X * 0.0254 - modelCenter.z);
        const end = new THREE.Vector3(landing.y * 0.0254 - modelCenter.x, landing.z * 0.0254 - modelCenter.y, landing.x * 0.0254 - modelCenter.z);
        const control = start.clone().lerp(end, 0.5);
        control.y += Math.max(0.8, start.distanceTo(end) * 0.22);
        const curve = new THREE.QuadraticBezierCurve3(start, control, end);
        const color = event.weapon?.includes('smoke') ? '#b9c7d6' : event.weapon?.includes('flash') ? '#fff3a6' : event.weapon?.includes('molotov') || event.weapon?.includes('inc') ? '#ff7a45' : '#ffb36b';
        trajectory = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(2)), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
        trajectory.userData.demoTrajectory = { curve, landingTick: landing.tick, throwTick: event.tick };
        trajectory.userData.demoGrenadeSegmentId = segment.id;
        enableObjectFloorFade(trajectory, floorFadeRef.current);
        scene.add(trajectory);
        objects.set(key, trajectory);
      }
      const trajectoryData = trajectory.userData.demoTrajectory;
      const progress = THREE.MathUtils.clamp((tick - trajectoryData.throwTick) / (trajectoryData.landingTick - trajectoryData.throwTick), 0, 1);
      // setFromPoints cannot grow an existing attribute buffer; rebuild to avoid truncation.
      trajectory.geometry.dispose();
      trajectory.geometry = new THREE.BufferGeometry().setFromPoints(trajectoryData.curve.getPoints(Math.max(2, Math.ceil(progress * 20))));
    });
    grenadeEvents.filter((event) => event.event_name !== 'grenade_thrown' && event.event_name !== 'decoy_detonate').forEach((event) => {
      const decoyEnd = event.event_name === 'decoy_started' ? grenadeEvents.find((candidate) => candidate.event_name === 'decoy_detonate' && candidate.tick > event.tick && candidate.tick - event.tick <= 1280 && (candidate.entityid == null || event.entityid == null || candidate.entityid === event.entityid)) : null;
      const duration = event.event_name === 'decoy_started' ? (decoyEnd?.tick - event.tick || 960) : durations[event.event_name] || 20;
      if (tick < event.tick || tick > event.tick + duration || event.x == null) return;
      const key = `${event.event_name}-${event.tick}-${event.entityid || event.user_steamid}`;
      active.add(key);
      let effect = objects.get(key);
      if (!effect) {
        const position = new THREE.Vector3(event.y * 0.0254 - modelCenter.x, event.z * 0.0254 - modelCenter.y, event.x * 0.0254 - modelCenter.z);
        const type = event.event_name === 'smokegrenade_detonate' ? 'smoke' : event.event_name === 'inferno_startburn' ? 'fire' : event.event_name === 'flashbang_detonate' ? 'flash' : event.event_name === 'decoy_started' ? 'decoy' : 'explosion';
        effect = createGrenadeEffect(position, type, navData, nav);
        effect.userData.demoGrenadeSegmentId = segments.find((segment) => {
          const landing = segment.landing;
          if (!landing || landing.tick !== event.tick || landing.event_name !== event.event_name) return false;
          if (landing.user_steamid != null && event.user_steamid != null) return String(landing.user_steamid) === String(event.user_steamid);
          return true;
        })?.id;
        enableObjectFloorFade(effect, floorFadeRef.current);
        scene.add(effect);
        objects.set(key, effect);
      }
      if (event.event_name === 'decoy_started') {
        const blink = effect.children.find((child) => child.userData.decoyBlink);
        if (blink?.material?.color) blink.material.color.set(performance.now() % 1000 < 250 ? '#ffffff' : '#7f8b91');
      }
    });
    objects.forEach((effect, key) => {
      if (!active.has(key)) {
        scene.remove(effect);
        disposeGrenadeEffect(effect);
        objects.delete(key);
      }
    });
  };

  const dispose = () => {
    objects.forEach((effect) => {
      scene.remove(effect);
      disposeGrenadeEffect(effect);
    });
    objects.clear();
  };

  return { objects, update, dispose };
}
