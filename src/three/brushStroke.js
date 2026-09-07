import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

// Centralizes brush-line allocation and disposal so live, restored, and remote strokes match.
export function createBrushLine(points, { id, color = '#a5e0ff', width = 3, rememberPoints = false } = {}) {
  const lineColor = color || '#a5e0ff';
  const lineWidth = width || 3;
  const geometry = new LineGeometry().setPositions(points.flatMap((point) => [point.x, point.y, point.z]));
  const material = new LineMaterial({ color: lineColor, linewidth: lineWidth, transparent: true, opacity: 0.9, resolution: new THREE.Vector2(1, 1) });
  const line = new Line2(geometry, material);
  line.userData.brushStrokeId = id || `brush-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  line.userData.brushColor = lineColor;
  line.userData.brushWidth = lineWidth;
  if (rememberPoints) line.userData.worldPoints = points.map((point) => point.clone());
  line.renderOrder = 7;
  return line;
}

export function updateBrushLine(line, points, rememberPoints = false) {
  line.geometry.dispose();
  line.geometry = new LineGeometry().setPositions(points.flatMap((point) => [point.x, point.y, point.z]));
  if (rememberPoints) line.userData.worldPoints = points.map((point) => point.clone());
}

export function disposeBrushLine(scene, line) {
  if (!line) return;
  scene.remove(line);
  line.geometry.dispose();
  line.material.dispose();
}

export function serializeBrushLine(line, points = line.userData.worldPoints || []) {
  return {
    id: line.userData.brushStrokeId,
    color: line.userData.brushColor,
    width: line.userData.brushWidth,
    points: points.map((point) => point.toArray()),
  };
}
