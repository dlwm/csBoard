// Owns analysis movement paths, player markers, and utility trajectory lines.
import * as THREE from 'three';
import { ANALYSIS_UTILITY_COLORS, ANALYSIS_UTILITY_KINDS, ECONOMY_CATEGORIES } from '../analysis/constants.js';
import { buildAnalysisTracks, getAnalysisTrackSignature } from '../analysis/buildAnalysisTracks.js';
import { createCollabPlayer, setCollabPlayerCrouch, setCollabPlayerPitch } from './collabPlayer.js';
import { lerpAngleDegrees } from '../demo/interpolation.js';

const disposeLine = (line) => {
  line.geometry.dispose();
  line.material.dispose();
  line.removeFromParent();
};

const disposeTrack = ({ line, marker }) => {
  disposeLine(line);
  marker.traverse((object) => {
    object.geometry?.dispose();
    object.material?.dispose();
  });
  marker.removeFromParent();
};

export default function createAnalysisSceneController({ scene, refs, getModelCenter }) {
  const pathGroup = new THREE.Group();
  const utilityGroup = new THREE.Group();
  const paths = new Map();
  const utilityPaths = new Map();
  let signature = '';
  scene.add(pathGroup, utilityGroup);

  const clearPaths = () => {
    paths.forEach(disposeTrack);
    paths.clear();
  };
  const clearUtilityPaths = () => {
    utilityPaths.forEach(disposeLine);
    utilityPaths.clear();
  };

  const updateUtilities = () => {
    const flags = refs.flags.current;
    const enabled = refs.enabled.current && flags.analysisMetric === 'utility' && flags.heatStyle === 'points';
    utilityGroup.visible = enabled;
    if (!enabled) {
      if (utilityPaths.size) clearUtilityPaths();
      return;
    }
    const utilities = refs.utilities.current.filter((utility) => {
      const [own, opponent] = String(utility.economyMatchup || '').split(':');
      return (flags.utilityKinds || ANALYSIS_UTILITY_KINDS).includes(utility.kind)
        && (flags.economyOwn || ECONOMY_CATEGORIES).includes(own)
        && (flags.economyOpponent || ECONOMY_CATEGORIES).includes(opponent)
        && (refs.side.current === 'ALL' || utility.side === refs.side.current);
    });
    const active = new Set(utilities.map((utility) => utility.id));
    const modelCenter = getModelCenter();
    utilities.forEach((utility) => {
      if (utilityPaths.has(utility.id)) return;
      // Fall back to a straight throw-to-landing line when projectile samples are absent.
      const sourcePoints = utility.projectiles?.length >= 2 ? utility.projectiles : [utility.throwPosition, utility.landing].filter(Boolean);
      if (sourcePoints.length < 2) return;
      const points = sourcePoints.map((point) => new THREE.Vector3(point.x - modelCenter.x, point.y - modelCenter.y + 0.08, point.z - modelCenter.z));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: ANALYSIS_UTILITY_COLORS[utility.kind] || '#c9f76b', transparent: true, opacity: 0.82, depthTest: true, depthWrite: false }));
      line.renderOrder = 5;
      utilityGroup.add(line);
      utilityPaths.set(utility.id, line);
    });
    utilityPaths.forEach((line, id) => {
      if (active.has(id)) return;
      disposeLine(line);
      utilityPaths.delete(id);
    });
  };

  const update = () => {
    if (!refs.enabled.current || !refs.rows.current.length) {
      if (pathGroup.visible) {
        clearPaths();
        signature = '';
      }
      pathGroup.visible = false;
      return;
    }
    pathGroup.visible = true;
    const trackOptions = {
      rows: refs.rows.current,
      selectedPlayers: refs.selectedPlayers.current,
      side: refs.side.current,
      economyOwn: refs.flags.current.economyOwn,
      economyOpponent: refs.flags.current.economyOpponent,
      modelCenter: getModelCenter(),
    };
    const nextSignature = getAnalysisTrackSignature(trackOptions);
    if (nextSignature !== signature) {
      clearPaths();
      buildAnalysisTracks(trackOptions).forEach((track) => {
        const records = track.records.map((record) => ({ ...record, position: new THREE.Vector3(record.position.x, record.position.y, record.position.z) }));
        const geometry = new THREE.BufferGeometry().setFromPoints(records.map((record) => record.position));
        geometry.setDrawRange(0, 0);
        geometry.computeBoundingSphere();
        const line = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color: '#c9f76b', dashSize: 0.28, gapSize: 0.16, transparent: true, opacity: 0.9, depthTest: true, depthWrite: false }));
        line.renderOrder = 5;
        line.computeLineDistances();
        const marker = createCollabPlayer({ position: new THREE.Vector3(), id: `analysis-${track.key}`, name: track.name, team: track.team === 2 ? 'T' : 'CT', crouched: records[0].crouched, pitch: records[0].pitch, weapon: records[0].weapon, showName: false });
        marker.geometry = { dispose() {} };
        marker.material = { dispose() {} };
        marker.renderOrder = 5;
        pathGroup.add(line, marker);
        paths.set(track.key, { line, marker, records });
      });
      signature = nextSignature;
    }
    paths.forEach(({ line, marker, records }) => {
      let visibleCount = 0;
      let current = records[0];
      records.forEach((record, index) => {
        if (record.time <= refs.time.current) {
          visibleCount = index + 1;
          current = record;
        }
      });
      line.geometry.setDrawRange(0, Math.max(0, visibleCount));
      const next = records[visibleCount] || current;
      if (next !== current && next.time > current.time) {
        const amount = THREE.MathUtils.clamp((refs.time.current - current.time) / (next.time - current.time), 0, 1);
        marker.position.copy(current.position).lerp(next.position, amount);
        const yaw = lerpAngleDegrees(current.yaw || 0, next.yaw || 0, amount);
        marker.rotation.y = Math.atan2(-Math.sin(THREE.MathUtils.degToRad(yaw)), -Math.cos(THREE.MathUtils.degToRad(yaw)));
        setCollabPlayerPitch(marker, THREE.MathUtils.lerp(current.pitch || 0, next.pitch || 0, amount));
        setCollabPlayerCrouch(marker, amount < 0.5 ? current.crouched : next.crouched);
      } else {
        marker.position.copy(current.position);
        marker.rotation.y = Math.atan2(-Math.sin(THREE.MathUtils.degToRad(current.yaw || 0)), -Math.cos(THREE.MathUtils.degToRad(current.yaw || 0)));
        setCollabPlayerPitch(marker, current.pitch || 0);
        setCollabPlayerCrouch(marker, current.crouched);
      }
      marker.visible = visibleCount > 0;
    });
  };

  const dispose = () => {
    clearPaths();
    clearUtilityPaths();
    pathGroup.removeFromParent();
    utilityGroup.removeFromParent();
  };

  return { update, updateUtilities, dispose };
}
