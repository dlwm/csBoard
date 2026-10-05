// Semantic workspace slots replace selector-based DOM lookup.
import { WorkspaceContribution } from './workspace/WorkspaceSlots.jsx';

export const CollabUtilityPortal = ({ children }) => <WorkspaceContribution slot="collab-utilities">{children}</WorkspaceContribution>;
export const UtilityNotesActionsPortal = ({ children }) => <WorkspaceContribution slot="utility-actions">{children}</WorkspaceContribution>;
export const AnalysisOptionsPortal = ({ children }) => <WorkspaceContribution slot="analysis-options">{children}</WorkspaceContribution>;
export const RoomPresencePortal = ({ children }) => <WorkspaceContribution slot="room-presence">{children}</WorkspaceContribution>;
export const CameraHintsPortal = ({ children }) => <WorkspaceContribution slot="camera-hints">{children}</WorkspaceContribution>;
export const ModelControlsPortal = ({ slot, children }) => <WorkspaceContribution slot={slot}>{children}</WorkspaceContribution>;
export const DemoPlaybackActionsPortal = ({ children }) => <WorkspaceContribution slot="playback-actions">{children}</WorkspaceContribution>;
