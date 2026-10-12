import { useEffect, useRef, useState } from 'react';
import { localize } from '../i18n.js';
import './demoFormat.css';

// UI supplies ports; package logic has no knowledge of Electron, React or Yjs.
export default function DemoFormatControls({ compute, cache, cacheId, fileName, recording, allowedMaps, language, disabled, onImported, onBusyChange }) {
  const input = useRef(null), active = useRef(null), mounted = useRef(true);
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current?.abort(); onBusyChange?.(false); }; }, []);
  const run = async (method, args) => {
    if (active.current || disabled) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setProgress(0); setNotice(''); setError('');
    let committed = false;
    let request;
    try {
      request = typeof args === 'function' ? await args() : args;
      controller.signal.throwIfAborted();
      const result = await compute(method, request, { signal: controller.signal, onProgress: value => { if (mounted.current) setProgress(value.percent); } });
      committed = true;
      if (!mounted.current) return;
      if (method === 'format.import') {
        await onImported(result.id);
        const missing = ['inputs', 'smokeVoxels', 'voice'].filter(key => result.capabilities?.[key]?.status === 'unavailable');
        setNotice(text(`已导入 ${result.segments} 个片段${missing.length ? '；部分输入、烟体或语音数据未提供' : ''}。`, `Imported ${result.segments} segments${missing.length ? '; some input, smoke or voice data is unavailable' : ''}.`, `Импортировано сегментов: ${result.segments}${missing.length ? '; часть данных ввода, дыма или голоса недоступна' : ''}.`));
      } else {
        const url = URL.createObjectURL(new Blob([result], { type: 'application/zip' }));
        const link = document.createElement('a'); link.href = url;
        link.download = `${String(recording?.data.demo.fileName || fileName || 'replay').replace(/\.dem$/i, '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 180)}.cs2df`;
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice(text('回放数据包已导出（格式草案）。', 'Replay package exported (draft profile).', 'Пакет повтора экспортирован (черновой профиль).'));
      }
    } catch (error) {
      if (mounted.current) controller.signal.aborted ? setNotice(text('已取消。', 'Cancelled.', 'Отменено.')) : setError(error.message);
    } finally {
      if (method === 'format.import' && !committed && request?.destinationId) await cache.deleteCachedDemo(request.destinationId).catch(() => {});
      active.current = null;
      if (mounted.current) setBusy(false);
    }
  };
  const importFile = async event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || disabled || active.current) return;
    if (file.size > 256 * 1024 ** 2) { setError(text('数据包超过 256 MiB。', 'Package exceeds 256 MiB.', 'Пакет превышает 256 MiB.')); return; }
    const destinationId = `format|${crypto.randomUUID()}`;
    try { await run('format.import', async () => ({ destinationId, bytes: new Uint8Array(await file.arrayBuffer()), allowedMaps })); }
    catch (error) { setError(error.message); }
  };
  return <div className="demo-format-controls" aria-busy={busy}>
    <button type="button" disabled={disabled || busy} onClick={() => input.current.click()}>{text('导入数据包', 'Import package', 'Импорт пакета')}</button>
    <button type="button" disabled={disabled || busy || (!cacheId && !recording)} onClick={() => run('format.export', { ids: cacheId ? [cacheId] : [], ...(recording ? { inline: recording } : {}) })}
      title={text('导出可保留投掷动作、实际烟体和语音的回放合同草案，不是 v3 完整统计包。', 'Exports the draft replay profile, including available inputs, actual smoke and voice; not a v3 statistics package.', 'Экспортирует черновой профиль повтора с доступными вводом, дымом и голосом; не статистический пакет v3.')}>
      {text('导出数据包', 'Export package', 'Экспорт пакета')}
    </button>
    <input ref={input} type="file" accept=".cs2df,.zip,application/zip" onChange={importFile} hidden />
    {busy && <><progress max="100" value={progress} aria-label={text('数据包处理进度', 'Package progress', 'Ход обработки')} /><button type="button" onClick={() => active.current?.abort()}>{text('取消', 'Cancel', 'Отмена')}</button></>}
    {(notice || error) && <span className={error ? 'demo-format-error' : ''} role={error ? 'alert' : 'status'} title={error || notice}>{error || notice}</span>}
  </div>;
}
