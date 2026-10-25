import { useEffect, useMemo, useRef, useState } from 'react';
import { createRecordedThrowRepository } from '../utility/recordedThrowRepository.js';

// Prepare every real replay first; publish all notes in one durable write.
// 先准备整组真实回放，再一次保存全部速记；资料缺失不生成假烟或半组记录。
export default function useSaveUtilityCombination({ compute, utilities, scope, active, ports }) {
  const repository = useMemo(() => createRecordedThrowRepository(compute), [compute, scope, utilities]);
  const callbacks = useRef(ports); callbacks.current = ports;
  const running = useRef(null);
  const [savedGroups, setSavedGroups] = useState(() => new Set());
  const [state, setState] = useState({ id: '', loading: false, completed: 0, error: '', savedId: '' });
  useEffect(() => {
    setSavedGroups(new Set());
    setState({ id: '', loading: false, completed: 0, error: '', savedId: '' });
    return () => { running.current?.abort(); running.current = null; repository.clear(); };
  }, [repository, active]);
  return { state, savedGroups, async save(group, name) {
    if (!active || running.current) return;
    const controller = new AbortController(); running.current = controller;
    setState({ id: group.id, loading: true, completed: 0, error: '', savedId: '' });
    const batchId = crypto.randomUUID(), prepared = [];
    try {
      for (const [index, member] of [...group.representative.members].sort((a, b) => a.throwOffsetSeconds - b.throwOffsetSeconds || a.effectOffsetSeconds - b.effectOffsetSeconds).entries()) {
        const utility = utilities.find(item => item.id === member.utilityId);
        if (!utility) throw Object.assign(new Error('Combination source changed'), { code: 'combination_unavailable' });
        const recorded = await repository.read(utility, { signal: controller.signal, requireSmokeVoxels: utility.kind === 'smoke' });
        controller.signal.throwIfAborted();
        prepared.push({ ...structuredClone(recorded), summary: [recorded.summary, callbacks.current.describeTiming?.(member)].filter(Boolean).join(' · '), id: crypto.randomUUID(), createdAt: new Date().toISOString(),
          combination: { id: batchId, name, index, size: group.representative.members.length,
            throwOffsetSeconds: member.throwOffsetSeconds, effectOffsetSeconds: member.effectOffsetSeconds } });
        setState(current => ({ ...current, completed: index + 1 }));
      }
      controller.signal.throwIfAborted();
      const saved = await callbacks.current.persist(prepared);
      if (!saved) throw Object.assign(new Error('Combination write failed'), { code: 'combination_storage' });
      if (!controller.signal.aborted) setSavedGroups(current => new Set([...current, group.id]));
      controller.signal.throwIfAborted();
      if (!await callbacks.current.group(name, prepared)) throw Object.assign(new Error('Notes saved, folder assignment failed'), { code: 'combination_folder' });
      if (!controller.signal.aborted) setState({ id: group.id, loading: false, completed: prepared.length, error: '', savedId: group.id });
    } catch (error) {
      if (!controller.signal.aborted) setState(current => ({ ...current, loading: false, error: error.code === 'combination_folder' ? 'folder' : error.code === 'smoke_voxels_missing' ? 'smoke' : 'save' }));
    } finally { if (running.current === controller) running.current = null; }
  } };
}
