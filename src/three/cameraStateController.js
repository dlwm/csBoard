// Persists camera presets and the last manual view for one map.
import * as THREE from 'three';

const serializeSlot = (slot) => slot ? {
  position: slot.position.toArray(),
  target: slot.target.toArray(),
} : null;

const parseSlot = (slot) => {
  if (!slot?.position || !slot?.target) return null;
  return {
    position: new THREE.Vector3(...slot.position),
    target: new THREE.Vector3(...slot.target),
  };
};

export default function createCameraStateController({
  mapName,
  camera,
  controls,
  onSlotsChange,
  onRestoreSlot,
  isPersistenceBlocked,
}) {
  const slotsStorageKey = `csboard-camera-slots-${mapName}`;
  const currentStorageKey = `csboard-camera-current-${mapName}`;
  let storedSlots = [];
  try { storedSlots = JSON.parse(localStorage.getItem(slotsStorageKey) || '[]'); } catch { storedSlots = []; }
  const slots = Array.from({ length: 10 }, (_, index) => parseSlot(storedSlots[index]));
  let saveTimer;
  let persistenceReady = false;

  const serializeSlots = () => slots.map(serializeSlot);
  const notifySlots = (active = null) => onSlotsChange?.(slots.map(Boolean), active);
  const persistSlots = () => localStorage.setItem(slotsStorageKey, JSON.stringify(serializeSlots()));

  const saveSlot = (slot) => {
    slots[slot] = { position: camera.position.clone(), target: controls.target.clone() };
    persistSlots();
    notifySlots(slot);
  };

  const restoreSlot = (slot) => {
    const saved = slots[slot];
    if (!saved) return;
    onRestoreSlot(saved);
    notifySlots(slot);
  };

  const replaceSlots = (savedSlots = []) => {
    savedSlots.slice(0, slots.length).forEach((slot, index) => { slots[index] = parseSlot(slot); });
    persistSlots();
    notifySlots();
  };

  const getCameraState = () => ({
    position: camera.position.toArray(),
    target: controls.target.toArray(),
  });

  const saveCurrent = () => {
    // Never overwrite the user's manual view with a director or first-person camera.
    if (!persistenceReady || isPersistenceBlocked()) return;
    try { localStorage.setItem(currentStorageKey, JSON.stringify(getCameraState())); } catch { /* Camera persistence is optional. */ }
  };

  const scheduleCurrentSave = () => {
    // OrbitControls emits continuously while moving; persist once motion settles.
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveCurrent, 180);
  };

  const restoreCurrent = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(currentStorageKey) || 'null');
      if (!saved?.position?.every(Number.isFinite) || !saved?.target?.every(Number.isFinite) || saved.position.length !== 3 || saved.target.length !== 3) return false;
      camera.position.fromArray(saved.position);
      controls.target.fromArray(saved.target);
      controls.update();
      return true;
    } catch {
      return false;
    }
  };

  const enablePersistence = () => { persistenceReady = true; };
  const dispose = () => {
    saveCurrent();
    window.clearTimeout(saveTimer);
    controls.removeEventListener('change', scheduleCurrentSave);
  };

  controls.addEventListener('change', scheduleCurrentSave);
  notifySlots();

  return {
    saveSlot,
    restoreSlot,
    replaceSlots,
    serializeSlots,
    getCameraState,
    restoreCurrent,
    enablePersistence,
    clearActiveSlot: () => notifySlots(),
    dispose,
    slotCount: slots.length,
  };
}
