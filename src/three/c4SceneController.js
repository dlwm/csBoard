// Legacy field mapping and sampled-defuse fallback belong to the host adapter.
import createBombSceneController from '../../packages/viewer/src/three/c4SceneController.js';
import { getDemoBombState } from '../demo/bombTimeline.js';
export default function createC4SceneController({ scene, refs, getModelCenter, getNav, getTickRate = () => 64 }) {
  return createBombSceneController({ scene, getModelCenter, getNav, getState: () => {
    const tick = refs.tick.current, tickRate = getTickRate() || 64;
    const bomb = getDemoBombState(refs.events.current, refs.snapshots.current, tickRate, tick);
    return { tick, tickRate, bomb };
  } });
}
