// Mutable bridges for scene callbacks that must stay current without rebuilding ThreeBoard.
export const utilityRuntime = { notes: [], enabled: false, onHover: null };
export const demoRosterRuntime = { snapshots: [], reloads: new Map() };
export const demoPovRuntime = { player: null, playerId: '', toggle: null, interrupt: null };
export const demoFrameSourceRuntime = { current: {} };
export const analysisUtilityRuntime = { onSelect: null, onHover: null };
