// Build-time replacement for optional AI entry points; imports no AI dependencies.
export default function DisabledAiPanel() { return null; }
export function createAiTransport() { return null; }
export function createBoardObservation() { return null; }
