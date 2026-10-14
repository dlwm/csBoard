import { WorkspaceButton } from './workspace/WorkspaceControls.jsx';
import { translate } from '../i18n.js';
import { useDesktopFontScale } from './useDesktopFontScale.js';

export default function DesktopAppearance({ language }) {
  const [fontScale, setFontScale] = useDesktopFontScale();
  const text = (key, values) => translate(language, key, values);
  return <section className="desktop-appearance"><h3>{text("settings.desktopAppearance.interfaceTextSize")}</h3>
    <p>{text("settings.desktopAppearance.adjustTextSizeImmediatelyChangesAreSavedAutomatically")}</p>
    <label>{text("settings.desktopAppearance.textScale")}<input type="range" min="80" max="150" step="5" value={fontScale} onChange={event => setFontScale(event.target.value)} /><output>{fontScale}%</output></label>
    <div className="desktop-manager-actions"><WorkspaceButton onClick={() => setFontScale(100)}>{text("settings.desktopAppearance.resetToDefault")}</WorkspaceButton></div>
  </section>;
}
