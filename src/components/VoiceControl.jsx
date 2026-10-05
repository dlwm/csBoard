import { useState } from 'react';
import { localize } from '../i18n.js';
import { setVoiceSettings, unlockVoiceAudio, useVoiceSettings } from '../demo/voice/settings.js';
import SpeakerIcon from './SpeakerIcon.jsx';
import './voiceControl.css';

export default function VoiceControl({ language }) {
  const { muted, volume } = useVoiceSettings();
  const [error, setError] = useState('');
  const label = localize(language, { zh: '语音', en: 'Voice', ru: 'Голос' });
  const title = localize(language, { zh: muted ? '开启 Demo 语音' : '静音 Demo 语音', en: muted ? 'Unmute demo voice' : 'Mute demo voice', ru: muted ? 'Включить голос' : 'Выключить голос' });
  const toggle = async () => {
    if (!muted) { setVoiceSettings({ muted: true }); return; }
    try { await unlockVoiceAudio(); setError(''); setVoiceSettings({ muted: false }); }
    catch { setError(localize(language, { zh: '无法开启语音播放', en: 'Unable to start voice playback', ru: 'Не удалось включить голос' })); }
  };
  return <div className="voice-control"><button type="button" className={`voice-toggle${muted ? '' : ' active'}`} title={error || title} aria-label={title} aria-pressed={!muted} onClick={toggle}><SpeakerIcon muted={muted || volume === 0} /></button><div className="voice-volume"><span>{label}</span><input type="range" min="0" max="100" step="1" value={Math.round(volume * 100)} aria-label={label} aria-valuetext={`${Math.round(volume * 100)}%`} onChange={event => setVoiceSettings({ volume: Number(event.target.value) / 100 })} /><output>{Math.round(volume * 100)}</output>{error && <small role="alert">{error}</small>}</div></div>;
}
