import { readCsboardProducerFields } from '../../formats/replayAdapter.js';

// Worker/Opus implementation stays in the host; output uses neutral PCM clips.
export function createVoiceDecoder() {
  return (frames, { signal, tickRate }) => new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const worker = new Worker(new URL('./decodeWorker.js', import.meta.url), { type: 'module' });
    const finish = (error, result) => { worker.terminate(); signal.removeEventListener('abort', cancel); error ? reject(error) : resolve(result); };
    const cancel = () => finish(signal.reason || new Error('Voice decoding cancelled'));
    signal.addEventListener('abort', cancel, { once: true });
    let skipped = 0;
    const supported = frames.filter(frame => { if (frame.codec === 'opus') return true; skipped++; return false; });
    const legacy = supported.map(frame => { const fields = readCsboardProducerFields(frame.producerFields) || {}; return { tick: frame.tick, data: frame.dataBase64,
      steamid: frame.playerId || '0', name: fields.name || frame.playerId || 'unknown-speaker', team: frame.side ?? fields.team }; });
    worker.onmessage = ({ data }) => {
      try {
        if (data.error) { finish(new Error(data.error)); return; }
        finish(null, { limited: data.limited, skipped: skipped + (data.skipped || 0),
          clips: data.clips.map(clip => ({ tick: clip.tick, playerId: String(clip.id || clip.name || 'unknown-speaker'), side: clip.team || null, samples: clip.samples, sampleRate: clip.sampleRate })) });
      } catch (error) { finish(error); }
    };
    worker.onerror = event => finish(new Error(event.message || 'Voice worker failed'));
    try { worker.postMessage({ frames: legacy, tickRate }); } catch (error) { finish(error); }
  });
}
