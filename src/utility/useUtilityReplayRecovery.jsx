import { WorkspaceButton } from '../components/workspace/WorkspaceControls.jsx';
import { useEffect, useRef, useState } from 'react';
import { translate } from '../i18n.js';
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
        throwPlace: recorded.throwPlace, landingPlace: recorded.landingPlace, landingPosition: recorded.landingPosition, landingRegionId: recorded.landingRegionId, landingPlaceSource: recorded.landingPlaceSource, behavior: recorded.behavior, replay: recorded.replay, demoSource: recorded.demoSource };
      const saved = await ports.current.persist(notesRef.current.map(item => item.id === updated.id ? updated : item));
      request.signal.throwIfAborted();
      setStatus(saved ? null : { note: updated, firstPerson, message: "utility.utilityReplayRecovery.replayUpdatedButSavingFailed" });
      ports.current.onPlay(updated, firstPerson);
    } catch (error) {
      if (request.signal.aborted) return;
      setStatus({ note, firstPerson, message: "utility.utilityReplayRecovery.thisNoteNeedsItsThrowTimingOrRecordedDataUpdated" });
      ports.current.onPlay(note, firstPerson);
    } finally { if (pending.current === request) pending.current = null; }
  };
  return { play, status };
}

export function UtilityReplayRecoveryNotice({ status, onRetry, language }) {
  if (!status) return null;
  return <div className="utility-replay-notice" role="status">
    {status.loading ? <><i className="analysis-loading-spinner" aria-hidden="true" />{translate(language, "utility.utilityReplayRecovery.loadingCompleteThrowRecording")}</> : <><span>{translate(language, status.message)}</span><WorkspaceButton type="button" onClick={() => onRetry(status.note, status.firstPerson, true)}>{translate(language, "utility.utilityReplayRecovery.updateRecording")}</WorkspaceButton></>}
  </div>;
}
