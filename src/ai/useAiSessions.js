import { useEffect, useRef, useState } from 'react';
import { aiSessionRecordKey, isAiSessionId } from '../../shared/record-keys.js';
import { createSession, sessionRecords, SESSION_STORE_KEY, storedEntries, readContextSnapshot, contextDifference, importSessionFile } from './sessionMemory.js';

let saveQueue = Promise.resolve();
const saved = new Map();
const sessionKey = aiSessionRecordKey;
const saveSessions = value => {
  const pending = saveQueue.catch(() => {}).then(async () => {
    try {
      const records = sessionRecords();
      for (const session of value.sessions) {
        if (saved.get(session.id) === session) continue;
        await records.put(sessionKey(session.id), { ...session, entries: storedEntries(session.entries) });
        saved.set(session.id, session);
      }
      // Publish the index only after all referenced sessions have been saved.
      await records.put(SESSION_STORE_KEY, { version: 2, activeId: value.activeId, ids: value.sessions.map(session => session.id) });
      for (const id of saved.keys()) if (!value.sessions.some(session => session.id === id)) { await records.put(sessionKey(id), null); saved.delete(id); }
    } catch (error) { saved.clear(); throw error; }
  });
  saveQueue = pending; return pending;
};
async function loadSessions() {
  const records = sessionRecords(); const index = await records.get(SESSION_STORE_KEY);
  if (!index || index.version === 1) return index;
  if (index.version !== 2 || !Array.isArray(index.ids) || !index.ids.length || index.ids.length > 50 || new Set(index.ids).size !== index.ids.length || index.ids.some(id => !isAiSessionId(id))) throw new Error('Invalid session index; storage was not overwritten');
  const sessions = await Promise.all(index.ids.map(id => records.get(sessionKey(id))));
  if (sessions.some((session, position) => !session || session.id !== index.ids[position] || !Array.isArray(session.entries) || !Array.isArray(session.events) || !Array.isArray(session.workflow) || typeof session.memory !== 'string')) throw new Error('Session data is missing or invalid; storage was not overwritten');
  for (const session of sessions) saved.set(session.id, session);
  return { version: 1, activeId: index.activeId, sessions };
}

export function useAiSessions(portsRef) {
  const initial = useRef(null); if (!initial.current) { const session = createSession(); initial.current = { version: 1, activeId: session.id, sessions: [session] }; }
  const [store, setStore] = useState(initial.current);
  const storeRef = useRef(store); const [loaded, setLoaded] = useState(false); const [storageError, setStorageError] = useState('');
  const hydrated = useRef(false);
  const update = fn => { const next = fn(storeRef.current); storeRef.current = next; setStore(next); };
  useEffect(() => {
    let active = true;
    loadSessions().then(value => {
      if (!active) return;
      if (value != null && (value.version !== 1 || !Array.isArray(value.sessions) || !value.sessions.length || !value.sessions.some(session => session.id === value.activeId))) throw new Error('Invalid stored AI sessions; storage was not overwritten');
      if (value) { storeRef.current = value; setStore(value); }
      hydrated.current = true; setLoaded(true);
    }).catch(error => { if (active) setStorageError(error.message); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => saveSessions(store).then(() => setStorageError('')).catch(error => setStorageError(error.message)), 500);
    return () => clearTimeout(timer);
  }, [store, loaded]);
  useEffect(() => () => { if (hydrated.current) saveSessions(storeRef.current).catch(error => console.error('AI session save failed', error)); }, []);
  const patch = fn => update(previous => ({ ...previous, sessions: previous.sessions.map(session => session.id === previous.activeId ? { ...fn(session), updatedAt: new Date().toISOString() } : session) }));
  const observe = () => {
    if (!hydrated.current) return;
    try {
      const current = readContextSnapshot(portsRef.current);
      const session = storeRef.current.sessions.find(item => item.id === storeRef.current.activeId);
      const difference = contextDifference(session.snapshot, current);
      if (difference) patch(value => ({ ...value, snapshot: current, events: [...value.events, { id: crypto.randomUUID(), timestamp: new Date().toISOString(), ...difference }].slice(-500) }));
    } catch (error) { console.warn('AI context observation unavailable', error.message); }
  };
  useEffect(() => {
    if (!loaded) return;
    let timer;
    const changed = () => { clearTimeout(timer); timer = setTimeout(observe, 250); };
    const clicked = event => {
      const button = event.target instanceof Element ? event.target.closest('button') : null;
      if (!button || button.closest('.ai-panel') || !button.closest('.board-shell')) return;
      const label = (button.getAttribute('aria-label') || button.textContent || button.title || '').trim().slice(0, 120);
      if (!label) return;
      patch(session => ({ ...session, events: [...session.events, { id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'ui_action_requested', label, context: portsRef.current.context(), meaning: 'Observed button activation, not proof that the action succeeded' }].slice(-500) }));
      changed();
    };
    window.addEventListener('click', clicked, true);
    window.addEventListener('csboard:context-change', changed);
    const interval = setInterval(observe, 1500); observe();
    return () => { clearTimeout(timer); clearInterval(interval); window.removeEventListener('csboard:context-change', changed); window.removeEventListener('click', clicked, true); };
  }, [loaded, store.activeId]);
  const addSession = session => { if (storeRef.current.sessions.length >= 50) throw new Error('Maximum 50 sessions; export and delete an unused session first'); update(previous => ({ ...previous, activeId: session.id, sessions: [...previous.sessions, session] })); };
  const active = store.sessions.find(session => session.id === store.activeId);
  return { active, sessions: store.sessions, loaded, storageError, observe,
    current: () => storeRef.current.sessions.find(session => session.id === storeRef.current.activeId),
    setEntries: fn => patch(session => ({ ...session, entries: typeof fn === 'function' ? fn(session.entries) : fn })),
    patch,
    create: () => addSession(createSession()),
    select: id => { if (storeRef.current.sessions.some(session => session.id === id)) update(previous => ({ ...previous, activeId: id })); },
    remove: () => update(previous => { const sessions = previous.sessions.filter(session => session.id !== previous.activeId); if (!sessions.length) sessions.push(createSession()); return { ...previous, sessions, activeId: sessions[0].id }; }),
    importFile: async (file, toolNames, canSwitch = () => true) => { if (file.size > 10_000_000) throw new Error('Session file exceeds 10 MB'); const session = importSessionFile(JSON.parse(await file.text()), toolNames); if (!canSwitch()) throw new Error('Stop execution before importing a session'); addSession(session); },
    exportFile: () => {
      const session = storeRef.current.sessions.find(session => session.id === storeRef.current.activeId);
      const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'csboard-ai-session', version: 1, exportedAt: new Date().toISOString(), session: { ...session, entries: storedEntries(session.entries) } }, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `csboard-session-${session.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
}
