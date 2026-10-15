import { Raycaster, Vector2, Vector3, Matrix3 } from 'three';
import { ViewerError } from '../core/controller.js';
import { isMapModelOverlay } from '../data/mapModelMaterials.js';

export function createSurfaceQueries({ camera, canvas, readSurfaces, readViewport = () => canvas.getBoundingClientRect(), sourceToScene, sceneToSource, isDisposed }) {
  const raycaster = new Raycaster(), pointer = new Vector2();
  const guard = () => { if (isDisposed()) throw new ViewerError('disposed', 'Viewer is disposed'); };
  const visible = object => {
    for (let node = object; node; node = node.parent) if (!node.visible) return false;
    const source = object.userData.sourceMapMaterial;
    return !source || ![].concat(source).every(isMapModelOverlay);
  };
  return {
    pickSurface(input = {}) {
      guard();
      if (!input || typeof input !== 'object') throw new ViewerError('invalid_argument', 'pickSurface requires a pointer with clientX/clientY');
      const { clientX, clientY } = input;
      if (![clientX, clientY].every(Number.isFinite)) throw new ViewerError('invalid_argument', 'pickSurface requires finite clientX/clientY in CSS viewport pixels');
      const rect = readViewport();
      if (rect.width <= 0 || rect.height <= 0 || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
      camera.updateMatrixWorld();
      pointer.set((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2);
      raycaster.setFromCamera(pointer, camera);
      const { model, meshes, nav, floor } = readSurfaces();
      // A miss on an enabled model is a miss, not NAV behind the wall.
      // 中文：可见模型未命中时不穿墙回落到 NAV；模型隐藏/二维时才使用 NAV。
      const useModel = model?.visible && !camera.planView;
      const targets = useModel ? meshes.filter(visible) : [nav].filter(visible);
      if (useModel) model.updateMatrixWorld(); else nav.updateWorldMatrix(true, false);
      const hit = raycaster.intersectObjects(targets, false).find(hit => !floor.w || (hit.point.y >= floor.x && hit.point.y <= floor.y));
      if (!hit) return null;
      const normal = hit.face?.normal.clone().applyMatrix3(new Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
      return { surface: useModel ? 'model' : 'nav', sourcePosition: sceneToSource(hit.point.toArray()), scenePosition: hit.point.toArray(), sceneNormal: normal?.toArray() || null, distanceMetres: hit.distance };
    },
    projectSource(position) {
      guard(); const point = new Vector3().fromArray(sourceToScene(position));
      camera.updateMatrixWorld(); const projected = point.project(camera), rect = readViewport();
      return { clientX: rect.left + (projected.x + 1) * rect.width / 2, clientY: rect.top + (1 - projected.y) * rect.height / 2,
        visible: rect.width > 0 && rect.height > 0 && [projected.x, projected.y, projected.z].every(value => Number.isFinite(value) && value >= -1 && value <= 1) };
    },
  };
}
