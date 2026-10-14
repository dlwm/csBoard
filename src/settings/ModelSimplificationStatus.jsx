import { translate } from '../i18n.js';
export default function ModelSimplificationStatus({ status, language }) {
  if (!status) return null;
  const label = translate(language, "settings.modelSimplificationStatus.simplifyingModel");
  return <div className="model-simplification-status" role="status">{status.error || `${label} ${status.percent}%`}</div>;
}
