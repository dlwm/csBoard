import { WorkspaceButton } from '../components/workspace/WorkspaceControls.jsx';
import { translate } from '../i18n.js';

export default function AnalysisTransport({ language, playing, loading, time, duration, onTogglePlay, onTimeChange }) {
  return <div className="analysis-transport">
    <WorkspaceButton variant="primary" disabled={loading} onClick={onTogglePlay}><span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span>{translate(language, playing ? 'replay.pause' : 'replay.play')}</WorkspaceButton>
    <div className="analysis-bottom-timeline"><span>{(time / 64).toFixed(1)}s</span><input type="range" min="0" max={duration} value={time} aria-label={translate(language, 'analysis.visual.timeline')} onChange={event => onTimeChange(Number(event.target.value))} /><span>{(duration / 64).toFixed(1)}s</span></div>
  </div>;
}
