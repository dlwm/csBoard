// Producer-specific userid matching stays outside the reusable viewer.
// 导播原始 userid 只在这个适配器中解析，输出稳定 playerId 与场景米坐标。
import { readCsboardProducerFields } from '../formats/replayAdapter.js';
const idsByFrames = new WeakMap();
export function readCsboardDirectorEvent(event, { frames, origin }) {
  if (!['hltv_fixed', 'hltv_chase'].includes(event.type)) return null;
  let ids = idsByFrames.get(frames);
  if (!ids) {
    ids = new Map(); const low = new Map();
    for (const frame of frames) for (const player of frame.players || []) {
      const userId = readCsboardProducerFields(player.producerFields)?.userId;
      if (userId == null || !Number.isFinite(Number(userId))) continue;
      const id = Number(userId); ids.set(id, player.playerId);
      const key = id & 255;
      if (!low.has(key)) low.set(key, player.playerId); else if (low.get(key) !== player.playerId) low.set(key, null);
    }
    ids.low = low; idsByFrames.set(frames, ids);
  }
  const resolve = id => id == null || !Number.isFinite(Number(id)) || Number(id) === 65535 ? null : ids.get(Number(id)) || ids.low.get(Number(id) & 255) || null;
  const fields = readCsboardProducerFields(event.producerFields) || {}, fixed = event.type === 'hltv_fixed';
  const sourcePosition = event.position || [fields.posx, fields.posy, fields.posz];
  return { type: event.type, tick: event.tick,
    position: fixed && sourcePosition.every(Number.isFinite) ? [sourcePosition[1] * .0254 - origin[0], sourcePosition[2] * .0254 - origin[1], sourcePosition[0] * .0254 - origin[2]] : null,
    targetId: resolve(fields.target1), secondaryId: resolve(fields.target2),
    pitch: fixed ? Number(fields.theta) || 0 : Number(fields.phi) || 20,
    yaw: fixed ? Number(fields.phi) || 0 : Number(fields.theta) || 0,
    distanceMetres: (Number(fields.distance) || 112) * .0254, fov: Number(fields.fov) || 55,
    inEye: Number(fields.ineye) > 0, inertia: Number(fields.inertia) || 0 };
}
