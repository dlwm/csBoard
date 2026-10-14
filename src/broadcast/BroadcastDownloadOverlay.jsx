import { translate } from '../i18n.js';
const text = (language, values) => translate(language, values);

export default function BroadcastDownloadOverlay({ download, language, onCancel }) {
  if (!download) return null;
  const labels = {
    publishing: "broadcast.broadcastDownloadOverlay.uploadingBroadcast",
    connecting: "broadcast.broadcastDownloadOverlay.connecting",
    downloading: "broadcast.broadcastDownloadOverlay.downloadingBroadcastArchive",
    processing: "broadcast.broadcastDownloadOverlay.processingReplayData",
    saving: "broadcast.broadcastDownloadOverlay.savingLocally",
    complete: "broadcast.broadcastDownloadOverlay.downloadComplete",
    failed: "broadcast.broadcastDownloadOverlay.downloadFailed",
  };
  return <div className="broadcast-download" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={download.progress}><div><span>{download.name || 'CSBOARD'}</span><strong>{text(language, labels[download.status] || labels.downloading)}</strong><div><i style={{ width: `${download.progress}%` }} /></div><b>{download.progress}%</b>{download.status !== 'complete' && <button type="button" onClick={onCancel}>{text(language, "broadcast.broadcastDownloadOverlay.cancel")}</button>}</div></div>;
}

