import { normalizeRecording } from './recordings.js';
import { recordingRecordKey } from '../../shared/record-keys.js';

const CATALOGUE_KEY = 'recording-library';
const LEGACY_KEYS = ['saved-recordings', 'broadcast-archives'];
const metadataOf = recording => ({
  id: recording.id, kind: 'recording', name: recording.name || recording.data.demo.fileName,
  mapName: recording.data.demo.map, rounds: recording.data.rounds.length,
  createdAt: recording.createdAt, savedAt: recording.savedAt,
  durationSeconds: (recording.endTick - recording.startTick) / (recording.data.demo.tickRate || 64),
  sourceBytes: recording.data.demo.bytes || 0,
});

// User recordings are records, not evictable parser caches. The catalogue holds
// metadata only; each payload is read on selection and written independently.
// 自制片段属于用户数据，不受解析缓存清理影响。目录不常驻全部回放载荷；
// 单项保存不重新序列化其他片段。旧副本保留，目录在载荷落盘后才发布。
export function createSavedRecordingRepository(records, onError = () => {}) {
  let state = { entries: [], loading: true, error: '' };
  let initialization = null, pending = Promise.resolve();
  const listeners = new Set();
  const publish = changes => { state = { ...state, ...changes }; listeners.forEach(listener => listener()); };
  const failed = error => { publish({ error: error.message }); onError(error); };
  const initialize = () => {
    if (initialization) return initialization;
    initialization = (async () => {
      let entries = await records.get(CATALOGUE_KEY);
      if (!Array.isArray(entries)) {
        let legacy;
        for (const key of LEGACY_KEYS) {
          legacy = await records.get(key);
          if (Array.isArray(legacy)) break;
        }
        entries = [];
        for (const value of legacy || []) {
          const recording = normalizeRecording(value);
          if (!recording.roundData?.snapshots?.length) throw new Error('Legacy recording has no playback payload');
          await records.put(recordingRecordKey(recording.id), recording);
          entries.push(metadataOf(recording));
        }
        await records.put(CATALOGUE_KEY, entries);
      }
      // Validate namespaces before allowing catalogue entries to select records.
      for (const entry of entries) recordingRecordKey(entry.id);
      publish({ entries, loading: false, error: '' });
    })().catch(error => { initialization = null; publish({ loading: false }); failed(error); throw error; });
    return initialization;
  };
  const mutate = action => {
    const operation = pending.catch(() => {}).then(async () => { await initialize(); return action(); });
    pending = operation;
    return operation.catch(error => { failed(error); return false; });
  };
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    initialize,
    async load(id) {
      try {
        await initialize();
        if (!state.entries.some(entry => entry.id === id)) return null;
        const recording = normalizeRecording(await records.get(recordingRecordKey(id)));
        if (!recording.roundData?.snapshots?.length) throw new Error('Recording has no independent playback payload');
        return state.entries.some(entry => entry.id === id) ? recording : null;
      } catch (error) { failed(error); return null; }
    },
    save(value) {
      return mutate(async () => {
        const recording = normalizeRecording(value);
        if (!recording.roundData?.snapshots?.length) throw new Error('Recording has no independent playback payload');
        await records.put(recordingRecordKey(recording.id), recording);
        const metadata = metadataOf(recording);
        const entries = state.entries.some(entry => entry.id === recording.id)
          ? state.entries.map(entry => entry.id === recording.id ? metadata : entry)
          : [...state.entries, metadata];
        await records.put(CATALOGUE_KEY, entries);
        publish({ entries, error: '' });
        return true;
      });
    },
    remove(id) {
      return mutate(async () => {
        const key = recordingRecordKey(id);
        const entries = state.entries.filter(entry => entry.id !== id);
        await records.put(CATALOGUE_KEY, entries);
        publish({ entries, error: '' });
        // An interrupted cleanup leaves an unreachable payload, never a catalogue
        // pointing to missing data. 移除先提交目录，失败不产生损坏的可见条目。
        await records.put(key, null);
        return true;
      });
    },
  };
}
