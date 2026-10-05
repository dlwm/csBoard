import { localize } from '../../i18n.js';

const messages = {
  loading: { zh: '语音准备中…', en: 'Preparing voice…', ru: 'Подготовка голоса…' },
  empty: { zh: '此录像未包含语音', en: 'This recording contains no voice', ru: 'В записи нет голоса' },
  unsupported: { zh: '此录像的语音格式暂不支持', en: 'This voice format is not supported', ru: 'Формат голоса не поддерживается' },
  error: { zh: '此段语音无法播放', en: 'Voice playback unavailable', ru: 'Голос недоступен' },
  partial: { zh: '部分语音未能载入', en: 'Some voice could not be loaded', ru: 'Часть голоса недоступна' },
  limited: { zh: '语音数据超出当前回合的播放容量，部分内容未载入', en: 'Some voice exceeds the playback capacity for this round', ru: 'Часть голоса превышает лимит воспроизведения' },
};
export default function VoicePlaybackStatus({ status, language }) {
  return <span className="voice-playback-status" role="status">{localize(language, messages[status] || messages.error)}</span>;
}
