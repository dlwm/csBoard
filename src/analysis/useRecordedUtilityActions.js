import { useEffect, useMemo, useRef, useState } from 'react';
import { localize } from '../i18n.js';
import { createRecordedThrowRepository } from '../utility/recordedThrowRepository.js';
import { analysisUtilityPreviewNote, hasRecordedSmokeVoxels } from './utilityPreview.js';

const idle = () => ({ utilityId: '', loading: false, error: '' });

// Feature orchestration. Scene, persistence and draft editing are ports supplied
// by the application root; this hook never imports a renderer or storage driver.
// 功能编排：场景、保存、草稿均由应用注入；不依赖 ThreeBoard 或存储实现。
export default function useRecordedUtilityActions({ utilities, compute, contextKey, active, previewRevision, selectedId, savedIds, language, ports }) {
  const repository = useMemo(() => createRecordedThrowRepository(compute), [compute, utilities, contextKey]);
  const callbacks = useRef(ports);
  callbacks.current = ports;
  const saveRequest = useRef(null);
  const previewRequest = useRef({ id: '', timer: null, controller: null });
  const [saveState, setSaveState] = useState(idle);
  const [previewState, setPreviewState] = useState(idle);
  const message = (error, saving = false) => error.code === 'smoke_voxels_missing'
    ? localize(language, {
      zh: saving ? '该代表烟缺少实际烟雾体素，无法添加；请重新解析此 Demo。' : '该代表烟缺少实际烟雾体素，请重新解析此 Demo。',
      en: 'This representative smoke has no recorded voxels; reparse this Demo.',
      ru: 'У образца дыма нет записанных вокселей; повторно разберите Demo.',
    }) : error.message;
  const clearPreview = () => {
    const request = previewRequest.current;
    clearTimeout(request.timer);
    request.controller?.abort(); request.id = '';
    callbacks.current.onPreview?.('');
    callbacks.current.scene()?.clearCollabUtilityPreview?.();
  };
  useEffect(() => {
    setSaveState(idle());
    return () => { saveRequest.current?.abort(); saveRequest.current = null; repository.clear(); };
  }, [repository, active]);
  useEffect(() => {
    setPreviewState(idle());
    return clearPreview;
  }, [repository, active, previewRevision]);
  useEffect(() => {
    setSaveState(idle());
    saveRequest.current?.abort(); saveRequest.current = null;
  }, [selectedId]);

  const prepare = async (utility, quickSave = false) => {
    if (!active || !utility || saveRequest.current || (quickSave && savedIds.has(utility.id))) return;
    const controller = new AbortController();
    saveRequest.current = controller;
    setSaveState({ utilityId: utility.id, loading: true, error: '' });
    try {
      const recorded = await repository.read(utility, { signal: controller.signal, requireSmokeVoxels: quickSave && utility.kind === 'smoke' });
      controller.signal.throwIfAborted();
      // New saves own their identity and mutable draft. Do not mutate cached
      // preview records or accidentally reuse an existing saved note ID.
      // 新保存拥有独立 ID 与草稿，避免污染资料缓存或复用已有记录的身份。
      const note = { ...structuredClone(recorded), id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      if (quickSave) await callbacks.current.save(note);
      else callbacks.current.draft(note);
      if (!controller.signal.aborted) setSaveState(idle());
    } catch (error) {
      if (!controller.signal.aborted) setSaveState({ utilityId: utility.id, loading: false, error: message(error, true) });
    } finally { if (saveRequest.current === controller) saveRequest.current = null; }
  };
  const preview = id => {
    const request = previewRequest.current;
    if (request.id === id) return;
    clearTimeout(request.timer); request.controller?.abort(); request.id = id;
    callbacks.current.onPreview?.(id);
    setPreviewState({ utilityId: id, loading: false, error: '' });
    if (!id || !active) { callbacks.current.scene()?.clearCollabUtilityPreview?.(); return; }
    const utility = utilities.find(utility => utility.id === id);
    if (!utility) { callbacks.current.scene()?.clearCollabUtilityPreview?.(); return; }
    const cached = repository.peek(utility);
    const recorded = cached && (utility.kind !== 'smoke' || hasRecordedSmokeVoxels(cached)) ? cached : null;
    if (recorded || utility.kind !== 'smoke') callbacks.current.scene()?.focusUtilityNote?.(recorded || analysisUtilityPreviewNote(utility));
    else callbacks.current.scene()?.clearCollabUtilityPreview?.();
    if (recorded) return;
    setPreviewState({ utilityId: id, loading: true, error: '' });
    request.timer = setTimeout(async () => {
      const controller = new AbortController();
      request.controller = controller;
      try {
        const note = await repository.read(utility, { signal: controller.signal, requireSmokeVoxels: utility.kind === 'smoke' });
        if (controller.signal.aborted || request.id !== id) return;
        callbacks.current.scene()?.focusUtilityNote?.(note);
        setPreviewState({ utilityId: id, loading: false, error: '' });
      } catch (error) {
        if (!controller.signal.aborted && request.id === id) setPreviewState({ utilityId: id, loading: false, error: message(error) });
      }
    }, 180);
  };
  return { prepare, preview, saveState, previewState };
}
