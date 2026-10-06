import { localize } from '../i18n.js';
const text = (language, values) => localize(language, values);

export default function BroadcastDownloadOverlay({ download, language, onCancel }) {
  if (!download) return null;
  const labels = {
    publishing: { zh: '正在上传演播片段…', en: 'Uploading broadcast…', ru: 'Загрузка трансляции…' },
    connecting: { zh: '正在连接房间…', en: 'Connecting…', ru: 'Подключение…' },
    downloading: { zh: '正在下载演播存档…', en: 'Downloading broadcast archive…', ru: 'Загрузка архива…' },
    processing: { zh: '正在整理回放数据…', en: 'Processing replay data…', ru: 'Обработка данных…' },
    saving: { zh: '正在保存到本地…', en: 'Saving locally…', ru: 'Сохранение…' },
    complete: { zh: '下载完成', en: 'Download complete', ru: 'Загрузка завершена' },
    failed: { zh: '下载失败', en: 'Download failed', ru: 'Ошибка загрузки' },
  };
  return <div className="broadcast-download" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={download.progress}><div><span>{download.name || 'CSBOARD'}</span><strong>{text(language, labels[download.status] || labels.downloading)}</strong><div><i style={{ width: `${download.progress}%` }} /></div><b>{download.progress}%</b>{download.status !== 'complete' && <button type="button" onClick={onCancel}>{text(language, { zh: '取消', en: 'Cancel', ru: 'Отмена' })}</button>}</div></div>;
}

