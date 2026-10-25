import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createReviewRepository, deathReviewQueue, reviewClip, reviewSource } from './review.js';

export default function useReplayReview({ data, recordingId, records, enabled, round, onNavigate, capture }) {
  const [repository] = useState(() => createReviewRepository(records));
  const stored = useSyncExternalStore(repository.subscribe, repository.getSnapshot);
  const source = reviewSource(data, recordingId), sourceRef = useRef(source);
  sourceRef.current = source;
  const [open, setOpen] = useState(false), [player, setPlayer] = useState(''), [perspective, setPerspective] = useState('victim');
  const [lead, setLead] = useState(5), [selected, setSelected] = useState(null), [draft, setDraft] = useState(''), [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState(false);
  const all = useMemo(() => deathReviewQueue(data), [data]);
  const queue = useMemo(() => all.filter(item => !player || item.victimId === player), [all, player]);
  const notes = useMemo(() => stored.notes.filter(note => note.source === source), [stored.notes, source]);
  const active = selected?.source === source && selected.round === round?.round ? selected : null;
  useEffect(() => { if (enabled) void repository.initialize().catch(() => {}); }, [enabled, repository]);
  useEffect(() => { setPlayer(''); setSelected(null); setDraft(''); setActionError(false); }, [source]);
  const play = (death, mode = perspective) => {
    const clip = reviewClip(data, death, lead, mode);
    if (!clip) return;
    setSelected({ source, id: death.id, round: death.round, endTick: clip.endTick });
    onNavigate(clip);
  };
  return { open, setOpen, queue, all, notes, player, perspective, lead, draft, saving,
    loading: stored.loading, error: stored.error || actionError, active,
    setDraft, setLead, setPlayer: value => { setPlayer(value); setSelected(null); },
    setPerspective: value => { setPerspective(value); const death = queue.find(item => item.id === active?.id); if (death) play(death, value); },
    play, leave: () => setSelected(null),
    async save() {
      if (saving || !draft.trim() || !round || !source) return;
      setSaving(true); setActionError(false);
      try {
        const snapshot = capture();
        const ok = await repository.save({ ...snapshot, id: crypto.randomUUID(), source, text: draft, deathId: active?.id || '', createdAt: new Date().toISOString() });
        if (sourceRef.current === source) { if (ok) setDraft(''); else setActionError(true); }
      } catch { if (sourceRef.current === source) setActionError(true); }
      finally { setSaving(false); }
    },
    remove: repository.remove,
    restore(note) {
      if (note.source !== source) return;
      const target = data.rounds.find(item => item.round === note.round);
      if (!target) { setActionError(true); return; }
      setSelected(null); onNavigate({ ...note, round: target, tick: Math.max(target.freezeStartTick ?? target.startTick, Math.min(target.endTick, note.tick)) });
    } };
}
