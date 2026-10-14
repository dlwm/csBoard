import { WorkspaceContribution } from '../components/workspace/WorkspaceSlots.jsx';
import { translate } from '../i18n.js';

export default function UtilityPlaybackControls({ playback, setPlayback, display, setDisplay, language, t }) {
  const label = values => translate(language, values);
  const rate = playback?.note.replay.tickRate || 64;
  const end = playback?.note.replay.endTick || 0;
  return <>
    <WorkspaceContribution slot="bottom-settings">
    <div className="utility-display-options">
      {[
        ['trajectories', "utility.utilityPlaybackControls.showTrajectory"],
        ['effects', "utility.utilityPlaybackControls.showUtilityEffects"],
      ].map(([key, text]) => <label key={key} title={label(key === 'trajectories' ? "utility.utilityPlaybackControls.showRecordedTrajectoriesForAllNotesOnThisMap" : "utility.utilityPlaybackControls.showRecordedSmokeFireAndOtherUtilityEffectsForNotes")}><input type="checkbox" checked={display[key]} onChange={event => setDisplay(current => ({ ...current, [key]: event.target.checked }))} />{label(text)}</label>)}
    </div>
    </WorkspaceContribution>
    <WorkspaceContribution slot="bottom-transport">{playback && <div className="utility-bottom-playback">
      <strong title={playback.note.name}>{playback.note.name}</strong>
      <button type="button" onClick={() => setPlayback(current => current && ({ ...current, tick: current.playing ? current.tick : current.tick >= end ? 0 : current.tick, playing: !current.playing, delayUntil: 0 }))}>{playback.playing ? t("replay.pause") : t("replay.play")}</button>
      <span>{(playback.tick / rate).toFixed(1)}s</span>
      <input className="utility-playback-timeline" type="range" min="0" max={end} step="1" value={playback.tick} aria-label={label("utility.utilityPlaybackControls.utilityPlaybackPosition")} onChange={event => { const tick = Number(event.target.value); setPlayback(current => current && ({ ...current, tick, playing: false, delayUntil: 0 })); }} />
      <span>/ {(end / rate).toFixed(1)}s</span>
      <button type="button" onClick={() => setPlayback(null)} aria-label={label("utility.utilityPlaybackControls.stopPlayback")}>×</button>
    </div>}</WorkspaceContribution>
  </>;
}
