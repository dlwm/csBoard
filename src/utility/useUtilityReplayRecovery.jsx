import { useEffect, useRef, useState } from 'react';
import { localize } from '../i18n.js';
import { UTILITY_REPLAY_VERSION } from './replaySchema.js';

export default function useUtilityReplayRecovery({ active, mapName, compute, language, notesRef, persist, onPlay }) {
  const pending = useRef(null), ports = useRef(null);
  ports.current = { persist, onPlay };
  const [status, setStatus] = useState(null);
  useEffect(() => { setStatus(null); return () => { pending.current?.abort(); pending.current = null; }; }, [active, mapName]);
  const play = async (note, firstPerson = false, force = false) => {
    if (!active || !note.replay) return;
    pending.current?.abort(); pending.current = null;
    if (!force && (note.replay.version >= UTILITY_REPLAY_VERSION || !note.demoSource)) { setStatus(null); ports.current.onPlay(note, firstPerson); return; }
    const request = new AbortController(); pending.current = request;
    setStatus({ loading: true, note, firstPerson });
    try {
      const source = note.demoSource;
      const recorded = await compute('analysis.utilityReplay', { ids: source.demoId ? [source.demoId] : [], map: note.mapName, fileName: source.fileName,
        round: source.round, tick: source.tick, kind: note.grenadeType, thrower: note.thrower || '',
        throwerId: String(note.replay.events?.find(event => event.event_name === 'grenade_thrown')?.user_steamid || ''),
      }, { signal: request.signal });
      request.signal.throwIfAborted();
      const live = notesRef.current.find(item => item.id === note.id);
      if (!live) return;
      const updated = { ...live, position: recorded.position, angles: recorded.angles, startPlace: recorded.startPlace,
        throwPlace: recorded.throwPlace, behavior: recorded.behavior, replay: recorded.replay, demoSource: recorded.demoSource };
      const saved = await ports.current.persist(notesRef.current.map(item => item.id === updated.id ? updated : item));
      request.signal.throwIfAborted();
      setStatus(saved ? null : { note: updated, firstPerson, message: localize(language, { zh: '回放记录已更新，但保存失败。', en: 'Replay updated, but saving failed.', ru: 'Повтор обновлён, но не сохранён.' }) });
      ports.current.onPlay(updated, firstPerson);
    } catch (error) {
      if (request.signal.aborted) return;
      setStatus({ note, firstPerson, message: localize(language, {
        zh: '此速记的投掷时序或记录需要更新。请重新解析来源 Demo，再点击“更新记录”；当前仍可播放已有片段。',
        en: 'This note needs its throw timing or recorded data updated. Reparse the source Demo, then update its recording. Existing playback remains available.',
        ru: 'Нужно обновить время броска или записанные данные заметки. Разберите исходную Demo заново и обновите запись. Старый фрагмент доступен.',
      }) });
      ports.current.onPlay(note, firstPerson);
    } finally { if (pending.current === request) pending.current = null; }
  };
  return { play, status };
}

export function UtilityReplayRecoveryNotice({ status, onRetry, language }) {
  if (!status) return null;
  return <div className="utility-replay-notice" role="status">
    {status.loading ? <><i className="analysis-loading-spinner" aria-hidden="true" />{localize(language, { zh: '正在读取完整投掷记录…', en: 'Loading complete throw recording…', ru: 'Загрузка полной записи броска…' })}</> : <><span>{status.message}</span><button type="button" onClick={() => onRetry(status.note, status.firstPerson, true)}>{localize(language, { zh: '更新记录', en: 'Update recording', ru: 'Обновить запись' })}</button></>}
  </div>;
}
