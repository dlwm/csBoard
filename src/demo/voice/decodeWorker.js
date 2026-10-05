import { OpusDecoder } from 'opus-decoder';

// Separate decoder state per speaker. Decode only the active round, off the UI thread.
// 每位说话者独立解码；仅在开启声音时解码当前回合，切换回合直接销毁 Worker。
self.onmessage = async ({ data: { frames, tickRate } }) => {
  const decoders = new Map();
  const clips = [];
  const chunks = new Map();
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
      // Demo delivery ticks are quantized and may jitter by one tick. Within
      // 25ms keep a speaker's PCM continuous; preserve longer intentional pauses.
      // Demo 到包时间有 tick 量化误差；25ms 内贴合上一包结尾，更长停顿保留。
      const start = Math.abs(frame.tick - speaker.end) <= tickRate * 0.025 ? speaker.end : frame.tick;
      speaker.end = start + decoded.samplesDecoded / decoded.sampleRate * tickRate;
      let chunk = chunks.get(id);
      if (!chunk || chunk.sampleRate !== decoded.sampleRate || Math.abs(start - chunk.end) > tickRate * 0.0001 || chunk.length >= decoded.sampleRate * 2) {
        chunk = { tick: start, end: start, length: 0, sampleRate: decoded.sampleRate, parts: [] };
        chunks.set(id, chunk);
        clips.push(chunk);
      }
      chunk.parts.push(samples);
      chunk.length += samples.length;
      chunk.end = speaker.end;
    }
    // Merge contiguous packets into bounded buffers rather than starting one
    // AudioBufferSource per 10–20ms packet. Different speakers remain separate.
    // 每段最多约两秒；合并连续包减少启动断点，不混合不同选手。
    const merged = clips.map(chunk => {
      const samples = new Float32Array(chunk.length);
      let offset = 0;
      for (const part of chunk.parts) { samples.set(part, offset); offset += part.length; }
      return { tick: chunk.tick, samples, sampleRate: chunk.sampleRate };
    }).sort((left, right) => left.tick - right.tick);
    self.postMessage({ clips: merged, skipped, limited }, merged.map(clip => clip.samples.buffer));
  } catch (error) { self.postMessage({ error: error.message }); }
  finally { for (const { decoder } of decoders.values()) decoder.free(); }
};
