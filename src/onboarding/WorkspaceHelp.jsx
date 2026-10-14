import { useId, useState } from 'react';
import { translate } from '../i18n.js';
import { WorkspaceContribution } from '../components/workspace/WorkspaceSlots.jsx';
import './operationGuide.css';

export default function WorkspaceHelp({ language, mobile, onTutorial, children }) {
  const id = useId(), [open, setOpen] = useState(false);
  const text = (key, values) => translate(language, key, values);
  return <WorkspaceContribution slot="viewport-top-right"><div className="workspace-help" onPointerEnter={event => { if (event.pointerType !== 'touch') setOpen(true); }} onPointerLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button type="button" className="workspace-help-trigger" aria-label={text("onboarding.workspaceHelp.controlsAndOperationGuide")} aria-controls={id} aria-expanded={open} title={text("onboarding.workspaceHelp.clickToStartTheGuide")} onClick={() => { setOpen(false); onTutorial(); }}>?</button>
    <section id={id} className="workspace-help-content" hidden={!open} aria-label={text("onboarding.workspaceHelp.quickControls")}>
      {mobile && <p>{text("onboarding.workspaceHelp.oneFingerRotatesTwoFingersPanOrPinchToZoom")}</p>}
      <div className="help-shortcuts">{children}</div>
      <button type="button" onClick={() => { setOpen(false); onTutorial(); }}>{text("onboarding.workspaceHelp.restartOperationGuide")}</button>
    </section>
  </div></WorkspaceContribution>;
}
