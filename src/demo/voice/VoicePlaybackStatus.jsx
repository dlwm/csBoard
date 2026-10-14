import { translate } from '../../i18n.js';

const messages = {
  loading: "replay.voicePlaybackStatus.preparingVoice",
  empty: "replay.voicePlaybackStatus.thisRecordingContainsNoVoice",
  unsupported: "replay.voicePlaybackStatus.thisVoiceFormatIsNotSupported",
  error: "replay.voicePlaybackStatus.voicePlaybackUnavailable",
  partial: "replay.voicePlaybackStatus.someVoiceCouldNotBeLoaded",
  limited: "replay.voicePlaybackStatus.someVoiceExceedsThePlaybackCapacityForThisRound",
};
export default function VoicePlaybackStatus({ status, language }) {
  return <span className="voice-playback-status" role="status">{translate(language, messages[status] || messages.error)}</span>;
}
