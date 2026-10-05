import { useEffect, useRef, useState } from 'react';
import { createDemoLibrary } from './library.js';
import { demoCacheId } from './cacheIdentity.js';
import { groupDemoFiles } from './batch.js';
import { conciseDemoError } from './diagnostics.js';
import { RECORDING_KIND } from './recordings.js';

// Custom-category parsing shares match playback but skips match analysis. Sources
// are owned by this hook until loading finishes, including transferred failures.
// 自制类别解析管理自己的来源与生命周期，不生成对局分析数据。
export default function useCustomRecordings({ platform, schema, sampleRate, onLoaded, onChanged }) {
  const [state, setState] = useState({ loading: false, progress: 0, fileName: '', error: '' });
  const task = useRef(null), generation = useRef(0), loading = useRef(false);
  const callbacks = useRef({ onLoaded, onChanged });
  callbacks.current = { onLoaded, onChanged };
  useEffect(() => () => { generation.current++; task.current?.terminate(); }, []);
  const load = async files => {
    if (!files?.length) return;
    const revision = ++generation.current;
    task.current?.terminate();
    loading.current = true;
    const library = createDemoLibrary(platform.cache, schema);
    try {
      for (const group of groupDemoFiles(files)) {
        if (revision !== generation.current) break;
        const cacheId = demoCacheId(group, sampleRate, RECORDING_KIND);
        setState({ loading: true, progress: 0, fileName: group.map(file => file.name).join(' + '), error: '' });
        let entry = await library.open(cacheId);
        if (!entry) {
          if (revision !== generation.current) break;
          const handle = platform.demos.start({ id: `recording-${crypto.randomUUID()}`, cacheId, files: group, kind: RECORDING_KIND, sampleRate, batchSize: 1,
            onMessage: message => {
              if (revision !== generation.current) return;
              if (message.type === 'progress') setState(state => ({ ...state, progress: Math.max(state.progress, Math.min(99, Number(message.percent) || 0)) }));
            },
          });
          task.current = handle;
          await handle.promise;
          if (revision !== generation.current) break;
          entry = await library.open(cacheId);
          if (!entry) throw new Error('Recording playback data is unavailable');
        }
        if (revision !== generation.current) break;
        callbacks.current.onLoaded(entry);
        await callbacks.current.onChanged?.();
      }
      if (revision === generation.current) setState(state => ({ ...state, loading: false, progress: 100 }));
    } catch (error) {
      if (revision === generation.current) setState(state => ({ ...state, loading: false, error: conciseDemoError(error.message) }));
    } finally {
      await platform.demos.releaseFiles(files).catch(error => console.warn('Recording source cleanup failed', error));
      if (revision === generation.current) { task.current = null; loading.current = false; }
    }
  };
  const cancel = () => {
    generation.current++; task.current?.terminate(); task.current = null;
    loading.current = false;
    setState(state => ({ ...state, loading: false, error: '' }));
  };
  return { ...state, load, cancel };
}
