// Small portal-based UI surfaces mounted outside the main panel hierarchy.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

function SelectorPortal({ selector, children }) {
  const [target, setTarget] = useState(null);
  useEffect(() => setTarget(selector ? document.querySelector(selector) : null), [selector]);
  return target ? createPortal(children, target) : null;
}

export const CollabUtilityPortal = ({ children }) => <SelectorPortal selector=".collab-objects .collab-utility">{children}</SelectorPortal>;
export const UtilityNotesActionsPortal = ({ children }) => <SelectorPortal selector=".utility-notes-heading">{children}</SelectorPortal>;
export const AnalysisOptionsPortal = ({ children }) => <SelectorPortal selector=".analysis-panel">{children}</SelectorPortal>;
export const RoomPresencePortal = ({ children }) => <SelectorPortal selector=".room-open">{children}</SelectorPortal>;
export const CameraHintsPortal = ({ children }) => <SelectorPortal selector=".key-hints .key-group:last-child">{children}</SelectorPortal>;
export const ModelControlsPortal = ({ selector, children }) => <SelectorPortal selector={selector}>{children}</SelectorPortal>;
export const DemoPlaybackActionsPortal = ({ children }) => <SelectorPortal selector=".demo-playback-controls">{children}</SelectorPortal>;
