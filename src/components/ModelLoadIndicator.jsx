import { localize } from '../i18n.js';

export const formatBytes = (bytes = 0) => bytes >= 1024 ** 3
  ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
  : bytes >= 1024 ** 2
    ? `${(bytes / 1024 ** 2).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(0)} KB`;

// Compact status shared by every workspace model-control portal.
export default function ModelLoadIndicator({ state, language }) {
  if (!state || state.status === 'ready') return null;
  const percent = state.total > 0 ? Math.min(100, Math.round(state.loaded / state.total * 100)) : null;
  const failed = state.status === 'error';
  const label = failed
    ? localize(language, { zh: '模型加载失败', en: 'MODEL UNAVAILABLE', ru: 'МОДЕЛЬ НЕДОСТУПНА' })
    : percent === 100
      ? localize(language, { zh: '正在处理模型', en: 'PROCESSING MODEL', ru: 'ОБРАБОТКА МОДЕЛИ' })
      : localize(language, { zh: '正在下载模型', en: 'DOWNLOADING MODEL', ru: 'ЗАГРУЗКА МОДЕЛИ' });
  return <div className={`model-load-indicator${failed ? ' failed' : ''}`} role={failed ? 'status' : 'progressbar'} aria-label={label} aria-valuemin={failed ? undefined : 0} aria-valuemax={failed ? undefined : 100} aria-valuenow={failed || percent == null ? undefined : percent}>
    <span>{label}</span>
    {!failed && <i className={percent == null ? 'indeterminate' : ''}><b style={percent == null ? undefined : { width: `${percent}%` }} /></i>}
    <strong>{failed ? '!' : percent == null ? formatBytes(state.loaded) : `${percent}%`}</strong>
  </div>;
}
