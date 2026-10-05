import { WorkspaceTarget } from '../components/workspace/WorkspaceSlots.jsx';
import { useRef } from 'react';
import useAnchoredMenuPosition from '../components/workspace/useAnchoredMenuPosition.js';
import { localize } from '../i18n.js';

// Match rounds and recording clips use one transport control. Only segment
// labels/economies/event markers differ; seeking and loading semantics match.
// 回合与录像片段共用播放控件，差异限定为片段标签与对局信息。
export default function ReplayTransportControls({ data, segment, tick, playing, loading, mapMismatch = false, recording, economies, events, menuOpen, onMenu, onSegment, onSeek, onToggle, onSaveFrame, showSaveFrame, language, t }) {
  const pickerRef = useRef(null);
  const { menuRef, style: menuStyle } = useAnchoredMenuPosition(menuOpen, pickerRef);
  const timelineStart = segment?.freezeStartTick ?? segment?.startTick ?? 0;
  const duration = Math.max(1, (segment?.endTick ?? 0) - timelineStart);
  const freezeWidth = segment ? Math.max(0, segment.startTick - timelineStart) / duration * 100 : 0;
  const label = recording ? localize(language, { zh: '片段', en: 'Clip', ru: 'Фрагмент' }) : t('round');
  return <div className="demo-playback-controls">
    {data && (!recording || data.rounds.length > 1) && <div ref={pickerRef} className={`demo-round-picker${menuOpen ? ' open' : ''}${recording ? ' recording-segments' : ''}`}>
      <button type="button" onClick={onMenu}>{segment ? `${label} ${segment.round}${recording ? '' : ` · ${economies.get(segment.round)?.T.label}/${economies.get(segment.round)?.CT.label}`}` : t('selectRound')}</button>
      {menuOpen && <div ref={menuRef} style={menuStyle} className="demo-round-list">{data.rounds.map(item => {
        const economy = economies.get(item.round);
        return <button type="button" key={item.round} className={segment?.round === item.round ? 'active' : ''} style={recording ? undefined : { '--economy-split': `${economy?.split ?? 50}%` }} onClick={() => onSegment(item)}>
          {!recording && <span className="economy-t">T {economy?.T.label}</span>}<strong>{item.round}</strong>
          {!recording && <><span className="economy-ct">CT {economy?.CT.label}</span><i /></>}
          {recording && <span>{((item.endTick - item.startTick) / data.demo.tickRate).toFixed(1)}s</span>}
        </button>;
      })}</div>}
    </div>}
    {data && segment && <div className="demo-scrub">
      <span className="demo-time">{((tick - segment.startTick) / data.demo.tickRate).toFixed(1)}s</span>
      <div className="timeline-track">{freezeWidth > 0 && <span className="timeline-freeze" style={{ width: `${freezeWidth}%` }} title={localize(language, { zh: '冻结阶段', en: 'Freeze time', ru: 'Время заморозки' })} />}<input className="demo-timeline" disabled={loading} style={{ '--timeline-progress': `${((tick - timelineStart) / duration) * 100}%` }} type="range" min={timelineStart} max={segment.endTick} step="1" value={tick} onPointerUp={event => event.currentTarget.blur()} onChange={event => onSeek(Number(event.target.value))} />
        {!recording && events.map((event, index) => <button type="button" className={`timeline-event event-${event.event_name}`} title={event.title} aria-label={event.title} style={{ left: `${((event.tick - timelineStart) / duration) * 100}%` }} key={`${event.event_name}-${event.tick}-${index}`} onClick={() => onSeek(event.tick)}>{event.label}</button>)}
      </div><span className="demo-duration">/ {((segment.endTick - segment.startTick) / data.demo.tickRate).toFixed(1)}s</span>
    </div>}
    {segment && <button type="button" className="demo-play" disabled={loading || mapMismatch} title={mapMismatch ? localize(language, { zh: '请切回录像对应地图后播放', en: 'Return to the recording’s map to play', ru: 'Вернитесь на карту записи для воспроизведения' }) : undefined} onClick={onToggle}>{loading ? t('loading') : playing ? t('pause') : t('play')}</button>}
    <WorkspaceTarget slot="playback-actions" />
    {showSaveFrame && <button type="button" className="demo-save-frame" disabled={loading || mapMismatch} onClick={onSaveFrame}>{t('saveFrame')}</button>}
  </div>;
}
