import { WorkspaceContribution } from '../components/workspace/WorkspaceSlots.jsx';
import { localize } from '../i18n.js';

export default function UtilityPlaybackControls({ playback, setPlayback, display, setDisplay, language, t }) {
  const label = values => localize(language, values);
  const rate = playback?.note.replay.tickRate || 64;
  const end = playback?.note.replay.endTick || 0;
  return <>
    <WorkspaceContribution slot="bottom-settings">
    <div className="utility-display-options">
      {[
        ['trajectories', { zh: '展示轨迹', en: 'Show trajectory', ru: 'Показать траекторию' }],
        ['effects', { zh: '展示道具效果', en: 'Show utility effects', ru: 'Показать эффекты гранат' }],
      ].map(([key, text]) => <label key={key} title={label(key === 'trajectories' ? { zh: '展示当前地图全部速记的记录轨迹', en: 'Show recorded trajectories for all notes on this map', ru: 'Показать записанные траектории всех заметок карты' } : { zh: '展示当前地图速记的烟雾、燃烧与其他道具效果', en: 'Show recorded smoke, fire and other utility effects for notes on this map', ru: 'Показать дым, огонь и другие эффекты гранат заметок карты' })}><input type="checkbox" checked={display[key]} onChange={event => setDisplay(current => ({ ...current, [key]: event.target.checked }))} />{label(text)}</label>)}
    </div>
    </WorkspaceContribution>
    <WorkspaceContribution slot="bottom-transport">{playback && <div className="utility-bottom-playback">
      <strong title={playback.note.name}>{playback.note.name}</strong>
      <button type="button" onClick={() => setPlayback(current => current && ({ ...current, tick: current.playing ? current.tick : current.tick >= end ? 0 : current.tick, playing: !current.playing, delayUntil: 0 }))}>{playback.playing ? t('pause') : t('play')}</button>
      <span>{(playback.tick / rate).toFixed(1)}s</span>
      <input className="utility-playback-timeline" type="range" min="0" max={end} step="1" value={playback.tick} aria-label={label({ zh: '道具播放进度', en: 'Utility playback position', ru: 'Позиция воспроизведения гранаты' })} onChange={event => { const tick = Number(event.target.value); setPlayback(current => current && ({ ...current, tick, playing: false, delayUntil: 0 })); }} />
      <span>/ {(end / rate).toFixed(1)}s</span>
      <button type="button" onClick={() => setPlayback(null)} aria-label={label({ zh: '结束播放', en: 'Stop playback', ru: 'Завершить воспроизведение' })}>×</button>
    </div>}</WorkspaceContribution>
  </>;
}
