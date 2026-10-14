import { useEffect, useRef, useState } from 'react';
import { translate } from '../i18n.js';
import './demoFormat.css';

// UI supplies ports; package logic has no knowledge of Electron, React or Yjs.
export default function DemoFormatControls({ compute, cache, cacheId, fileName, recording, allowedMaps, language, disabled, onImported, onBusyChange }) {
  const input = useRef(null), active = useRef(null), mounted = useRef(true);
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const text = (key, values) => translate(language, key, values);
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
        setNotice({ key: 'formats.import.complete', values: { segments: result.segments, warning: missing.length > 0 } });
      } else {
        const url = URL.createObjectURL(new Blob([result], { type: 'application/zip' }));
        const link = document.createElement('a'); link.href = url;
        link.download = `${String(recording?.data.demo.fileName || fileName || 'replay').replace(/\.dem$/i, '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 180)}.cs2df`;
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice({ key: "formats.demoFormatControls.replayPackageExportedDraftProfile" });
      }
    } catch (error) {
      if (mounted.current) controller.signal.aborted ? setNotice({ key: "formats.demoFormatControls.cancelled" }) : setError(error.message);
    } finally {
      if (method === 'format.import' && !committed && request?.destinationId) await cache.deleteCachedDemo(request.destinationId).catch(() => {});
      active.current = null;
      if (mounted.current) setBusy(false);
    }
  };
  const importFile = async event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || disabled || active.current) return;
    if (file.size > 256 * 1024 ** 2) { setError(text("formats.demoFormatControls.packageExceeds256Mib")); return; }
    const destinationId = `format|${crypto.randomUUID()}`;
    try { await run('format.import', async () => ({ destinationId, bytes: new Uint8Array(await file.arrayBuffer()), allowedMaps })); }
    catch (error) { setError(error.message); }
  };
  const noticeText = notice?.key === 'formats.import.complete' ? text(notice, { warning: notice.values.warning ? text('formats.import.optionalMissing') : '' }) : text(notice);
  return <div className="demo-format-controls" aria-busy={busy}>
    <button type="button" disabled={disabled || busy} onClick={() => input.current.click()}>{text("formats.demoFormatControls.importPackage")}</button>
    <button type="button" disabled={disabled || busy || (!cacheId && !recording)} onClick={() => run('format.export', { ids: cacheId ? [cacheId] : [], ...(recording ? { inline: recording } : {}) })}
      title={text("formats.demoFormatControls.exportsTheDraftReplayProfileIncludingAvailableInputsActualSmoke")}>
      {text("formats.demoFormatControls.exportPackage")}
    </button>
    <input ref={input} type="file" accept=".cs2df,.zip,application/zip" onChange={importFile} hidden />
    {busy && <><progress max="100" value={progress} aria-label={text("formats.demoFormatControls.packageProgress")} /><button type="button" onClick={() => active.current?.abort()}>{text("formats.demoFormatControls.cancel")}</button></>}
    {(notice || error) && <span className={error ? 'demo-format-error' : ''} role={error ? 'alert' : 'status'} title={error || noticeText}>{error || noticeText}</span>}
  </div>;
}
