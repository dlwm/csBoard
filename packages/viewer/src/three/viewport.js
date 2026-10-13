import * as THREE from 'three';
import { BoardCamera } from './boardCamera.js';

// Own only the rendering surface and scene. Content/controllers own their
// geometry, subscriptions and loaders, so shared resources are not double-freed.
export function createThreeViewport({ container, camera = new BoardCamera(38, 1, .1, 200),
  pixelRatioLimit = 2, background = '#090d0d', canvasLabel = '3D viewer', onResize } = {}) {
  if (!container?.appendChild) throw new TypeError('Viewer container is required');
  if (!Number.isFinite(pixelRatioLimit) || pixelRatioLimit <= 0) throw new TypeError('pixelRatioLimit must be positive');
  const win = container.ownerDocument?.defaultView || globalThis.window;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  const scene = new THREE.Scene(); scene.background = new THREE.Color(background);
  const listeners = new Set(); if (onResize) listeners.add(onResize);
  let disposed = false;
  renderer.domElement.setAttribute('aria-label', canvasLabel);
  container.appendChild(renderer.domElement);
  const resize = () => {
    if (disposed) return;
    const { width, height } = container.getBoundingClientRect();
    if (!(width > 0 && height > 0)) return;
    renderer.setPixelRatio(Math.min(win?.devicePixelRatio || 1, pixelRatioLimit));
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
    for (const listener of listeners) listener({ width, height });
  };
  const Observer = win?.ResizeObserver || globalThis.ResizeObserver;
  const observer = Observer ? new Observer(resize) : null;
  observer?.observe(container); win?.addEventListener('resize', resize); resize();
  return Object.freeze({ renderer, scene, camera, resize,
    onResize(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    render() { if (!disposed) renderer.render(scene, camera); },
    dispose() {
      if (disposed) return; disposed = true;
      observer?.disconnect(); win?.removeEventListener('resize', resize); listeners.clear();
      renderer.dispose(); renderer.domElement.remove();
    },
  });
}
