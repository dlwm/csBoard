// Recording policy is independent of the parser transport and UI.
// 自制录像策略：不依赖宿主，不用人数或回合编号切分录制片段。
export const RECORDING_KIND = 'recording';
export const NON_STANDARD_DEMO = 'non_standard_demo';
export const isRecording = entry => entry?.kind === RECORDING_KIND || entry?.demo?.kind === RECORDING_KIND || entry?.data?.demo?.kind === RECORDING_KIND || String(entry?.id || '').startsWith('recording|');
export function matchCompatibility(header, rounds) {
  if (header.is_hltv === 'false') return 'client_recording';
  if (!rounds.length) return 'no_complete_rounds';
  // Only use roster evidence if the decoder supplied it. Short/incomplete clips
  // must still be accessible through the recording loader; corrupt data is not
  // silently reclassified as a recording. 仅使用明确解码证据，不把损坏泛化为非标准。
  if (header.standard_teams_seen === 'false') return 'non_standard_roster';
  return null;
}
export function recordingSegments(headers, offsets) {
  return headers.map((header, index) => {
    const first = Math.max(0, Number(header.first_tick) || 0);
    const last = Number(header.last_tick);
    if (!Number.isFinite(last) || last <= first) throw new Error('Recording contains no playable tick range');
    return { round: index + 1, sourceRound: null, startTick: first + offsets[index], endTick: last + offsets[index], freezeStartTick: first + offsets[index], winner: null, reason: null };
  });
}
