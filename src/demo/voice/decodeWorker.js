import { OpusDecoder } from 'opus-decoder';

// Separate decoder state per speaker. Decode only the active round, off the UI thread.
// 每位说话者独立解码；仅在开启声音时解码当前回合，切换回合直接销毁 Worker。
self.onmessage = async ({ data: { frames, tickRate } }) => {
  const decoders = new Map();
  const clips = [];
  let bytes = 0;
  let skipped = 0;
  let limited = false;
  try {
    for (const frame of frames) {
      const id = frame.steamid && frame.steamid !== '0' ? frame.steamid : frame.name;
      let speaker = decoders.get(id);
      if (!speaker) {
        speaker = { decoder: new OpusDecoder({ channels: 1, sampleRate: 48000 }), end: -Infinity };
        decoders.set(id, speaker);
        await speaker.decoder.ready;
      }
      if ((frame.tick - speaker.end) / tickRate > 0.5) await speaker.decoder.reset();
      const raw = Uint8Array.from(atob(frame.data), char => char.charCodeAt(0));
      const decoded = speaker.decoder.decodeFrame(raw);
      if (decoded.errors.length || !decoded.samplesDecoded) { skipped++; continue; }
      const samples = decoded.channelData[0];
      bytes += samples.byteLength;
      if (bytes > 128 * 1024 * 1024) { limited = true; break; }
      speaker.end = frame.tick + decoded.samplesDecoded / decoded.sampleRate * tickRate;
      clips.push({ tick: frame.tick, samples, sampleRate: decoded.sampleRate });
    }
    self.postMessage({ clips, skipped, limited }, clips.map(clip => clip.samples.buffer));
  } catch (error) { self.postMessage({ error: error.message }); }
  finally { for (const { decoder } of decoders.values()) decoder.free(); }
};
