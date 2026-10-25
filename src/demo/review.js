// Review references belong to user records, not evictable parser caches.
// 复盘记录保存稳定来源与时间，不复制整份 Demo；未知人物不会变成世界击杀者。
export const REVIEW_RECORD_KEY = 'replay-review-notes';
export function reviewSource(data, recordingId = '') {
  if (!data?.demo) return '';
  const demo = data.demo;
  return JSON.stringify([recordingId || null, demo.map, demo.fileName, demo.bytes ?? null, demo.maxTick ?? null]);
}
const actorId = (event, prefix) => String(event[`${prefix}_steamid`] && String(event[`${prefix}_steamid`]) !== '0' ? event[`${prefix}_steamid`] : event[`${prefix}_name`] || '');
export function deathReviewQueue(data) {
  if (!data?.rounds?.length || data.demo?.kind === 'recording') return [];
  return (data.events || []).filter(event => event.event_name === 'player_death' && Number.isFinite(event.tick)).flatMap((event, index) => {
    const round = data.rounds.find(item => event.tick >= item.startTick && event.tick <= item.endTick);
    if (!round) return [];
    return [{ id: `${round.round}:${event.tick}:${actorId(event, 'user')}:${index}`, round: round.round, tick: event.tick,
      victimId: actorId(event, 'user'), victim: event.user_name || '', attackerId: actorId(event, 'attacker'), attacker: event.attacker_name || '',
      weapon: event.weapon || '', headshot: Boolean(event.headshot), team: event.user_team_num }];
  }).sort((a, b) => a.tick - b.tick);
}
export function reviewClip(data, death, leadSeconds, perspective) {
  const round = data.rounds.find(item => item.round === death.round);
  if (!round) return null;
  const tickRate = data.demo?.tickRate || 64;
  return { round, tick: Math.max(round.freezeStartTick ?? round.startTick, death.tick - leadSeconds * tickRate),
    endTick: Math.min(round.endTick, death.tick + tickRate),
    povPlayerId: perspective === 'victim' ? death.victimId : perspective === 'attacker' ? death.attackerId : '' };
}
const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
export function normalizeReviewNote(value) {
  if (!value || typeof value.id !== 'string' || !/^[a-z0-9-]{1,80}$/i.test(value.id)
    || typeof value.source !== 'string' || value.source.length > 4096
    || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 4000
    || !Number.isInteger(value.round) || value.round < 1 || !Number.isFinite(value.tick) || value.tick < 0) throw Error('Invalid review note');
  const camera = value.camera;
  if (camera != null && (!vector(camera.position) || !vector(camera.target))) throw Error('Invalid review camera');
  const strokes = value.brushStrokes || [];
  if (!Array.isArray(strokes) || strokes.length > 200 || strokes.reduce((n, stroke) => n + (stroke?.points?.length || 0), 0) > 10000
    || strokes.some(stroke => typeof stroke.id !== 'string' || !/^#[0-9a-f]{6}$/i.test(stroke.color) || !Number.isFinite(stroke.width) || stroke.width < 1 || stroke.width > 32 || !Array.isArray(stroke.points) || stroke.points.some(point => !vector(point)))) throw Error('Invalid review drawing');
  return { id: value.id, source: value.source, text: value.text.trim(), round: value.round, tick: value.tick,
    povPlayerId: String(value.povPlayerId || '').slice(0, 128), deathId: String(value.deathId || '').slice(0, 256),
    viewMode: value.viewMode === '2d' ? '2d' : '3d',
    camera: camera ? { position: [...camera.position], target: [...camera.target], ...(Number.isFinite(camera.planZoom) && Number.isFinite(camera.planSpan) ? { planZoom: camera.planZoom, planSpan: camera.planSpan, planRotation: Number.isFinite(camera.planRotation) ? camera.planRotation : 0 } : {}), ...(Number.isFinite(camera.viewRange) ? { viewRange: Math.max(0, Math.min(1, camera.viewRange)) } : {}) } : null,
    brushStrokes: strokes.map(stroke => ({ id: stroke.id, color: stroke.color, width: stroke.width, points: stroke.points.map(point => [...point]) })),
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString() };
}

export function createReviewRepository(records) {
  let state = { notes: [], loading: true, error: false }, initialized, pending = Promise.resolve();
  const listeners = new Set();
  const publish = changes => { state = { ...state, ...changes }; for (const listener of listeners) listener(); };
  const initialize = () => initialized ||= records.get(REVIEW_RECORD_KEY).then(value => {
    if (value != null && (value.version !== 1 || !Array.isArray(value.notes) || value.notes.length > 1000)) throw Error('Invalid review store');
    publish({ notes: (value?.notes || []).map(normalizeReviewNote), loading: false, error: false });
  }).catch(error => { initialized = null; publish({ loading: false, error: true }); throw error; });
  const mutate = action => {
    const next = pending.catch(() => {}).then(async () => {
      await initialize();
      const notes = action(state.notes);
      if (notes.length > 1000 || JSON.stringify(notes).length > 4 * 1024 * 1024) throw Error('Review storage limit reached');
      await records.put(REVIEW_RECORD_KEY, { version: 1, notes });
      publish({ notes, error: false }); return true;
    });
    pending = next;
    return next.catch(() => { publish({ error: true }); return false; });
  };
  return { initialize, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }, getSnapshot: () => state,
    save: value => mutate(notes => { const note = normalizeReviewNote(value); return [note, ...notes.filter(item => item.id !== note.id)]; }),
    remove: id => mutate(notes => notes.filter(note => note.id !== id)) };
}
