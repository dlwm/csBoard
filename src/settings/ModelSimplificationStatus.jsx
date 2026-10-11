import { localize } from '../i18n.js';
export default function ModelSimplificationStatus({ status, language }) {
  if (!status) return null;
  const label = localize(language, { zh: '正在简化模型', en: 'Simplifying model', ru: 'Упрощение модели' });
  return <div className="model-simplification-status" role="status">{status.error || `${label} ${status.percent}%`}</div>;
}
