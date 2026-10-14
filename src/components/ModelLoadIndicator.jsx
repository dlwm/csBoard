import { translate, formatBytes } from '../i18n.js';

export { formatBytes } from '../i18n.js';

// Compact status shared by every workspace model-control portal.
export default function ModelLoadIndicator({ state, language }) {
  if (!state || state.status === 'idle' || state.status === 'ready' || state.status === 'absent') return null;
  const percent = state.total > 0 ? Math.min(100, Math.round(state.loaded / state.total * 100)) : null;
  const failed = state.status === 'error';
  const label = failed
    ? translate(language, "view.modelLoadIndicator.modelUnavailable")
    : percent === 100
      ? translate(language, "view.modelLoadIndicator.processingModel")
      : translate(language, "view.modelLoadIndicator.downloadingModel");
  return <div className={`model-load-indicator${failed ? ' failed' : ''}`} role={failed ? 'status' : 'progressbar'} aria-label={label} aria-valuemin={failed ? undefined : 0} aria-valuemax={failed ? undefined : 100} aria-valuenow={failed || percent == null ? undefined : percent}>
    <span>{label}</span>
    {!failed && <i className={percent == null ? 'indeterminate' : ''}><b style={percent == null ? undefined : { width: `${percent}%` }} /></i>}
    <strong>{failed ? '!' : percent == null ? formatBytes(state.loaded, language) : `${percent}%`}</strong>
  </div>;
}
