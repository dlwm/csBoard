import { WorkspaceButton } from './workspace/WorkspaceControls.jsx';
import { useId, useRef } from 'react';
import { translate } from '../i18n.js';
import { ModelControlsPortal } from './Portals.jsx';
import ModelLoadIndicator from './ModelLoadIndicator.jsx';

// A modal keeps touch settings out of the timeline while preserving keyboard focus.
export default function MobileViewSettings({ slot, language, t, showGrid, setShowGrid,
  trackpadDetection, setTrackpadDetection, showNav, setShowNav, hasNav, hasModel,
  modelOpacity, onModelOpacity, modelViewRange, setModelViewRange, selectedMode,
  modeOptions, onModelMode, modelLoadState, onReset }) {
  const dialog = useRef(null);
  const titleId = useId();
  const text = (key, values) => translate(language, key, values);
  const title = text("settings.mobileViewSettings.viewSettings");
  return <>
    <ModelControlsPortal slot={slot}><WorkspaceButton type="button" className="mobile-view-settings-toggle" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>{title}</WorkspaceButton></ModelControlsPortal>
    <dialog ref={dialog} className="mobile-view-dialog" aria-labelledby={titleId}>
      <header><h2 id={titleId}>{title}</h2><WorkspaceButton type="button" autoFocus onClick={() => dialog.current?.close()}>{text("settings.mobileViewSettings.close")}</WorkspaceButton></header>
      <div className="mobile-view-settings-body">
        <div className="mobile-view-switches">
          <WorkspaceButton type="button" aria-pressed={showGrid} onClick={() => setShowGrid(value => !value)}>{t("view.grid")} · {showGrid ? t("common.on") : t("common.off")}</WorkspaceButton>
          {hasNav && <WorkspaceButton type="button" aria-pressed={showNav} onClick={() => setShowNav(value => !value)}>{t("view.navGround")} · {showNav ? t("common.on") : t("common.off")}</WorkspaceButton>}
          <WorkspaceButton type="button" aria-pressed={trackpadDetection} onClick={() => setTrackpadDetection(value => !value)}>{t("view.trackpad")} · {trackpadDetection ? t("common.on") : t("common.off")}</WorkspaceButton>
          <WorkspaceButton type="button" onClick={() => { onReset(); dialog.current?.close(); }}>{t("view.resetView")}</WorkspaceButton>
        </div>
        {hasModel && <section className="mobile-model-settings">
          <ModelLoadIndicator state={modelLoadState} language={language} />
          <label><span>{t("view.model")}</span><input type="range" min="0" max="1" step="0.01" value={modelOpacity} onChange={event => onModelOpacity(Number(event.target.value))} /><output>{Math.round(modelOpacity * 100)}%</output></label>
          <label><span>{t("view.viewRange")}</span><input type="range" min="0" max="1" step="0.01" value={modelViewRange} onChange={event => setModelViewRange(Number(event.target.value))} /><output>{Math.round(modelViewRange * 100)}%</output></label>
          <label><span>{text("settings.mobileViewSettings.modelView")}</span><select className="workspace-input" value={selectedMode} onChange={event => onModelMode(Number(event.target.value))}>{modeOptions.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select></label>
        </section>}
      </div>
    </dialog>
  </>;
}
