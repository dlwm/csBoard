import { useState } from 'react';
import { localize } from '../i18n.js';
import { unlockVoiceAudio, useVoiceSettings } from '../demo/voice/settings.js';
import SpeakerIcon from './SpeakerIcon.jsx';
import './voiceControl.css';

export default function VoiceControl({ language, onChange }) {
  const { muted, volume, side } = useVoiceSettings();
  const [error, setError] = useState('');
  const label = localize(language, { zh: '语音', en: 'Voice', ru: 'Голос' });
  const title = localize(language, { zh: muted ? '开启 Demo 语音' : '静音 Demo 语音', en: muted ? 'Unmute demo voice' : 'Mute demo voice', ru: muted ? 'Включить голос' : 'Выключить голос' });
  const change = async values => {
    const result = await onChange?.(values);
    if (!result || result.status !== 'succeeded') throw new Error(result?.error?.message || localize(language, { zh: '语音控制尚未就绪', en: 'Voice controls are not ready', ru: 'Управление голосом ещё не готово' }));
    setError('');
  };
  const request = values => { change(values).catch(reason => setError(reason.message)); };
  const toggle = async () => {
    try { if (muted) await unlockVoiceAudio(); await change({ muted: !muted }); }
    catch { setError(localize(language, { zh: '无法开启语音播放', en: 'Unable to start voice playback', ru: 'Не удалось включить голос' })); }
  };
  return <div className="voice-control"><button type="button" className={`voice-toggle${muted ? '' : ' active'}`} title={error || title} aria-label={title} aria-pressed={!muted} onClick={toggle}><SpeakerIcon muted={muted || volume === 0} /></button><div className="voice-volume"><span>{label}</span><div className="voice-side-filter" role="group" aria-label={localize(language, { zh: "语音阵营", en: "Voice side", ru: "Сторона голоса" })}>{["all", "T", "CT"].map(value => <button type="button" key={value} aria-pressed={side === value} onClick={() => request({ side: value })}>{value === "all" ? localize(language, { zh: "全部", en: "All", ru: "Все" }) : value}</button>)}</div><input type="range" min="0" max="100" step="1" value={Math.round(volume * 100)} aria-label={label} aria-valuetext={`${Math.round(volume * 100)}%`} onChange={event => request({ volume: Number(event.target.value) / 100 })} /><output>{Math.round(volume * 100)}</output>{error && <small role="alert">{error}</small>}</div></div>;
}
