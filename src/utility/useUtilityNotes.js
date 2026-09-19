import { useEffect, useRef, useState } from 'react';
import { DEFAULT_UTILITY_NOTES, initialLocalRecords } from '../app/defaultRecords.js';
import { loadUtilityNotes, storeUtilityNotes } from '../app/persistentStore.js';
import { UTILITY_NOTES_VERSION, compatibleUtilityNotes } from './noteSchema.js';

// Owns utility-note hydration and serialized writes; UI only receives records and persistence results.
export default function useUtilityNotes(onWriteError) {
  const errorRef = useRef(onWriteError);
  errorRef.current = onWriteError;
  const [utilityNotes, setUtilityNotes] = useState(() => {
    const version = Number(localStorage.getItem('csboard-utility-notes-version') || 0);
    const notes = initialLocalRecords('csboard-utility-notes', DEFAULT_UTILITY_NOTES, false);
    return compatibleUtilityNotes(notes, version);
  });
  const utilityNotesRef = useRef(utilityNotes);
  const utilityNotesWriteRef = useRef(Promise.resolve());
  const utilityNotesRevisionRef = useRef(0);
  utilityNotesRef.current = utilityNotes;
  const queueUtilityNotesWrite = (notes) => {
    const write = utilityNotesWriteRef.current.catch(() => {}).then(() => storeUtilityNotes(notes, UTILITY_NOTES_VERSION));
    utilityNotesWriteRef.current = write;
    return write;
  };
  const persistUtilityNotes = async (notes) => {
    utilityNotesRevisionRef.current += 1;
    utilityNotesRef.current = notes;
    setUtilityNotes(notes);
    try {
      await queueUtilityNotesWrite(notes);
      localStorage.removeItem('csboard-utility-notes');
      localStorage.removeItem('csboard-utility-notes-version');
      return true;
    } catch (error) {
      console.error('utility notes storage', error);
      errorRef.current?.();
      return false;
    }
  };
  useEffect(() => {
    let cancelled = false;
    const revisionAtStart = utilityNotesRevisionRef.current;
    loadUtilityNotes().then(async (stored) => {
      if (cancelled) return;
      if (utilityNotesRevisionRef.current !== revisionAtStart) {
        await queueUtilityNotesWrite(utilityNotesRef.current);
      } else if (Array.isArray(stored?.notes)) {
        const notes = compatibleUtilityNotes(stored.notes, stored.version);
        utilityNotesRef.current = notes;
        setUtilityNotes(notes);
        if (stored.version !== UTILITY_NOTES_VERSION) await queueUtilityNotesWrite(notes);
      } else {
        await queueUtilityNotesWrite(utilityNotesRef.current);
      }
      // Remove legacy large records only after their IndexedDB copy is durable.
      localStorage.removeItem('csboard-utility-notes');
      localStorage.removeItem('csboard-utility-notes-version');
    }).catch((error) => console.error('utility notes migration', error));
    // Old room snapshots were never read; discard them so they cannot retain quota.
    try {
      Object.keys(localStorage).filter((key) => key.startsWith('csboard-room-')).forEach((key) => localStorage.removeItem(key));
    } catch { /* Stale-room cleanup is optional. */ }
    return () => { cancelled = true; };
  }, []);
 
  return { utilityNotes, utilityNotesRef, persistUtilityNotes };
}
