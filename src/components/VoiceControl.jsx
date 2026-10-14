import { useState } from 'react';
import { translate, translateError } from '../i18n.js';
import { unlockVoiceAudio, useVoiceSettings } from '../demo/voice/settings.js';
import SpeakerIcon from './SpeakerIcon.jsx';
import './voiceControl.css';

export default function VoiceControl({ language, onChange }) {
  const { muted, volume, side } = useVoiceSettings();
  const [error, setError] = useState(null);
  const errorText = error?.key ? translate(language, error.key) : translateError(language, error);
  const label = translate(language, "view.voiceControl.voice");
  const title = translate(language, muted ? "view.voice.unmute" : "view.voice.mute");
  const change = async values => {
    const result = await onChange?.(values);
    if (!result || result.status !== 'succeeded') throw result?.error || { key: "view.voiceControl.voiceControlsAreNotReady" };
    setError('');
  };
  const request = values => { change(values).catch(reason => setError(reason)); };
  const toggle = async () => {
    try { if (muted) await unlockVoiceAudio(); await change({ muted: !muted }); }
    catch (reason) { setError(reason?.code ? reason : { key: "view.voiceControl.unableToStartVoicePlayback" }); }
  };
  return <div className="voice-control"><button type="button" className={`voice-toggle${muted ? '' : ' active'}`} title={errorText || title} aria-label={title} aria-pressed={!muted} onClick={toggle}><SpeakerIcon muted={muted || volume === 0} /></button><div className="voice-volume"><span>{label}</span><div className="voice-side-filter" role="group" aria-label={translate(language, "view.voiceControl.voiceSide")}>{["all", "T", "CT"].map(value => <button type="button" key={value} aria-pressed={side === value} onClick={() => request({ side: value })}>{value === "all" ? translate(language, "view.voiceControl.all") : value}</button>)}</div><input type="range" min="0" max="100" step="1" value={Math.round(volume * 100)} aria-label={label} aria-valuetext={`${Math.round(volume * 100)}%`} onChange={event => request({ volume: Number(event.target.value) / 100 })} /><output>{Math.round(volume * 100)}</output>{errorText && <small role="alert" title={error?.message}>{errorText}</small>}</div></div>;
}
