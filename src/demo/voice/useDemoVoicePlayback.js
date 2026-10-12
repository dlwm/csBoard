import { createVoicePlaybackController } from '../../../packages/viewer/src/playback/voiceController.js';
import { createWebAudioVoiceDriver } from '../../../packages/viewer/src/audio/webAudioDriver.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getVoiceSettings, setVoiceSettings, useVoiceSettings, voiceAudioContext } from './settings.js';
import { createVoiceDecoder } from './createVoiceDecoder.js';
import { attachVoiceRuntime, publishVoiceRuntime } from './runtime.js';

const EMPTY = [];
export default function useDemoVoicePlayback({ frames = EMPTY, tick, tickRate = 64, playing, enabled, summary, players = EMPTY, seekRevision = 0 }) {
  const settings = useVoiceSettings(), [state, setState] = useState(null), runtime = useRef(null), current = useRef(null), lastSeek = useRef(null);
  current.current = { tick, playing, enabled, summary, players };
  const neutralFrames = useMemo(() => frames.map(frame => ({ tick: frame.tick,
    playerId: frame.steamid && frame.steamid !== '0' ? String(frame.steamid) : frame.name || 'unknown-speaker',
    durationSeconds: frame.duration, codec: 'opus', dataBase64: frame.data,
    producerFields: { csboard: { name: frame.name, team: frame.team } },
  })), [frames]);
  useEffect(() => {
    const driver = createWebAudioVoiceDriver({ getContext: voiceAudioContext }), decoder = createVoiceDecoder();
    const controller = createVoicePlaybackController({ driver,
      decode: (rows, options) => { const metadata = current.current.summary; return decoder(rows, options).then(result => ({ ...result, limited: result.limited || metadata?.limited, skipped: (result.skipped || 0) + (metadata?.skipped ? 1 : 0) })); },
      resolveSide: id => current.current.players.find(player => String(player.steamid) === id || player.name === id)?.team,
      emit: (type, value) => { setState(value); publishVoiceRuntime(type, value); },
    });
    runtime.current = controller;
    const detach = attachVoiceRuntime({ controller, configure: changes => {
      const next = setVoiceSettings(changes);
      controller.configure({ ...next, enabled: current.current.enabled && next.enabled });
    } });
    setState(controller.getState());
    return () => { detach(); controller.dispose(); driver.dispose(); if (runtime.current === controller) runtime.current = null; };
  }, []);
  useEffect(() => {
    const capability = frames.length ? 'available' : summary?.skipped ? 'unsupported' : summary?.frames === 0 ? 'empty' : 'unknown';
    runtime.current.setTracks(neutralFrames, { tickRate, status: capability });
  }, [neutralFrames, tickRate, summary?.skipped, summary?.limited, summary?.frames]);
  useEffect(() => {
    runtime.current.configure({ ...settings, enabled: enabled && settings.enabled });
  }, [settings, enabled]);
  useEffect(() => {
    runtime.current.sync({ tick, playing, speed: 1, discontinuity: lastSeek.current !== seekRevision });
    lastSeek.current = seekRevision;
  }, [tick, playing, seekRevision]);
  const speakingIds = useMemo(() => new Set(state?.speakingIds || []), [state?.speakingIds]);
  const displayStatus = ['loading', 'empty', 'unsupported', 'partial', 'limited', 'error'].includes(state?.status) ? state.status : '';
  return { speakingIds, status: enabled && settings.enabled && !settings.muted && settings.volume > 0 ? displayStatus : '' };
}
