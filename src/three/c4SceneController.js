// Owns C4 dropped/planted markers, toss trajectory, pulse, and defuse progress.
import * as THREE from 'three';

export default function createC4SceneController({ scene, refs, getModelCenter, getNav }) {
  const group = new THREE.Group();
  const block = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.18, 0.28),
    new THREE.MeshBasicMaterial({ color: '#ff3b30', depthTest: true, depthWrite: false }),
  );
  const wave = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 0.9, 48),
    new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.8, depthTest: true, depthWrite: false, side: THREE.DoubleSide }),
  );
  wave.rotation.x = -Math.PI / 2;
  const trajectory = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: '#ff5a4f', transparent: true, opacity: 0.8, depthTest: true, depthWrite: false }),
  );
  const defuseProgress = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(Array.from({ length: 65 }, (_, index) => {
      const angle = -Math.PI / 2 + index / 64 * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * 0.62, 0.09, Math.sin(angle) * 0.62);
    })),
    new THREE.LineBasicMaterial({ color: '#72d4ff', transparent: true, opacity: 0.95, depthTest: true, depthWrite: false }),
  );
  const groundRaycaster = new THREE.Raycaster();

  defuseProgress.geometry.setDrawRange(0, 0);
  defuseProgress.visible = false;
  trajectory.visible = false;
  trajectory.renderOrder = 4;
  group.add(block, wave, defuseProgress);
  group.traverse((object) => {
    object.renderOrder = 4;
    if (object.material) {
      object.material.depthTest = true;
      object.material.depthWrite = false;
    }
  });
  group.visible = false;
  scene.add(group, trajectory);

  const eventPosition = (event) => {
    const x = event?.x ?? event?.user_X;
    const y = event?.y ?? event?.user_Y;
    const z = event?.z ?? event?.user_Z;
    if (x == null || y == null || z == null) return null;
    const modelCenter = getModelCenter();
    const position = new THREE.Vector3(y * 0.0254 - modelCenter.x, z * 0.0254 - modelCenter.y, x * 0.0254 - modelCenter.z);
    const nav = getNav();
    if (nav?.mesh) {
      nav.mesh.updateWorldMatrix(true, false);
      groundRaycaster.set(position.clone().add(new THREE.Vector3(0, 1.2, 0)), new THREE.Vector3(0, -1, 0));
      groundRaycaster.far = 2.4;
      const hit = groundRaycaster.intersectObject(nav.mesh, true).find((candidate) => Math.abs(candidate.point.y - position.y) <= 1.25);
      if (hit) position.y = hit.point.y;
    }
    return position;
  };

  const update = () => {
    const events = refs.events.current;
    const tick = refs.tick.current;
    const planted = [...events].reverse().find((event) => event.event_name === 'bomb_planted' && event.tick <= tick && !events.some((end) => ['bomb_exploded', 'bomb_defused', 'round_end'].includes(end.event_name) && end.tick >= event.tick && end.tick <= tick));
    const dropped = !planted ? [...events].reverse().find((event) => event.event_name === 'bomb_dropped' && event.tick <= tick && !events.some((end) => ['bomb_pickup', 'bomb_planted'].includes(end.event_name) && end.tick >= event.tick && end.tick <= tick)) : null;
    const event = planted || dropped;
    let position = eventPosition(event);
    trajectory.visible = false;
    if (dropped) {
      const next = events.find((candidate) => ['bomb_pickup', 'bomb_planted'].includes(candidate.event_name) && candidate.tick > dropped.tick);
      const end = eventPosition(next);
      const start = eventPosition(dropped);
      if (start && end) {
        const control = start.clone().lerp(end, 0.5);
        control.y += Math.max(0.35, start.distanceTo(end) * 0.18);
        const curve = new THREE.QuadraticBezierCurve3(start, control, end);
        const flightTicks = Math.min(32, Math.max(8, next.tick - dropped.tick));
        const flight = THREE.MathUtils.clamp((tick - dropped.tick) / flightTicks, 0, 1);
        position = curve.getPoint(flight);
        trajectory.geometry.setFromPoints(curve.getPoints(24));
        trajectory.visible = flight < 1;
        trajectory.geometry.setDrawRange(0, Math.max(2, Math.ceil(flight * 25)));
        wave.visible = flight >= 1;
      } else wave.visible = true;
    } else wave.visible = true;
    if (!event || !position) {
      group.visible = false;
      trajectory.visible = false;
      return;
    }
    group.visible = true;
    group.position.copy(position).add(new THREE.Vector3(0, 0.12, 0));
    const defuseStartEvent = planted ? [...events].reverse().find((candidate) => candidate.event_name === 'bomb_begindefuse' && candidate.tick >= planted.tick && candidate.tick <= tick && !events.some((end) => ['bomb_abortdefuse', 'bomb_defused'].includes(end.event_name) && end.tick >= candidate.tick && end.tick <= tick)) : null;
    const snapshots = refs.snapshots.current;
    const currentRecordIndex = snapshots.findLastIndex((record) => record.tick <= tick);
    const currentDefuser = currentRecordIndex >= 0 ? snapshots[currentRecordIndex].players.find((player) => player.defusing) : null;
    let sampledDefuseStart = null;
    // Older Demo payloads may lack begin-defuse events; reconstruct the start from snapshots.
    if (!defuseStartEvent && currentDefuser) {
      sampledDefuseStart = { tick: snapshots[currentRecordIndex].tick, hasKit: currentDefuser.hasDefuser };
      for (let index = currentRecordIndex - 1; index >= 0; index -= 1) {
        const record = snapshots[index];
        const samePlayer = record.players.find((player) => player.name === currentDefuser.name && player.defusing);
        if (!samePlayer) break;
        sampledDefuseStart = { tick: record.tick, hasKit: samePlayer.hasDefuser };
      }
    }
    const defuseStart = defuseStartEvent || sampledDefuseStart;
    if (defuseStart) {
      const hasKit = Boolean(defuseStart.hasKit ?? defuseStart.haskit ?? defuseStart.has_kit ?? defuseStart.has_defuser);
      const progress = THREE.MathUtils.clamp((tick - defuseStart.tick) / ((hasKit ? 5 : 10) * 64), 0, 1);
      defuseProgress.geometry.setDrawRange(0, Math.max(2, Math.ceil(progress * 65)));
      defuseProgress.material.color.set(hasKit ? '#72d4ff' : '#ffd166');
      defuseProgress.visible = true;
    } else defuseProgress.visible = false;
    const pulse = ((tick - event.tick) % 64) / 64;
    wave.scale.setScalar((0.35 + pulse * 1.65) * (planted ? 2 : 1));
    wave.material.color.set(planted ? '#ff3b30' : '#ffd166');
    wave.material.opacity = 0.75 * (1 - pulse);
  };

  const dispose = () => {
    const geometries = new Set();
    const materials = new Set();
    group.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
    });
    if (trajectory.geometry) geometries.add(trajectory.geometry);
    if (trajectory.material) materials.add(trajectory.material);
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    scene.remove(group, trajectory);
  };

  return { update, dispose };
}
