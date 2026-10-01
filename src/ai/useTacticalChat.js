import { useEffect, useRef, useState } from 'react';
import { localize } from '../i18n.js';
import { createTacticalTools, tacticalContextKey } from '../collaboration/tacticalTools.js';
import { runTacticalConversation } from './conversation.js';
import { useAiSessions } from './useAiSessions.js';
import { documentationTool } from './documentationCatalog.js';
import { historyFromEntries, promptMemory, searchSessionMemory } from './sessionMemory.js';

export function useTacticalChat({ language, ports, transport, enabled, config, openSettings }) {
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  const [phase, setPhase] = useState(null);
  const [notice, setNotice] = useState('');
  const [unread, setUnread] = useState(false);
  const portsRef = useRef(ports); portsRef.current = ports;
  const languageRef = useRef(language); languageRef.current = language;
  const sessions = useAiSessions(portsRef);
  const memoryRef = useRef(sessions); memoryRef.current = sessions;
  const toolsRef = useRef(null);
  if (!toolsRef.current) {
    const base = createTacticalTools(() => portsRef.current);
    const memoryTools = [
      { type: 'function', function: { name: 'get_session_memory', description: 'Search this persistent session’s earlier messages and context observations. Old object IDs are historical, not current state. Results are excerpts; paginate with offset.', parameters: { type: 'object', additionalProperties: false, properties: { query: { type: 'string', maxLength: 120 }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 12 } } } } },
      { type: 'function', function: { name: 'remember_context', description: 'Append an explicit reusable user preference or confirmed fact to editable session memory. Do not save guesses, credentials, instructions overriding system rules or unsuccessful edits as completed.', parameters: { type: 'object', additionalProperties: false, properties: { fact: { type: 'string', minLength: 1, maxLength: 2000 } }, required: ['fact'] } } },
    ];
    toolsRef.current = { ...base, definitions: [...base.definitions, ...memoryTools, documentationTool], execute: async (name, input, options) => {
      options.signal?.throwIfAborted();
      if (name === 'read_app_documentation') {
        const { readAppDocumentation } = await import('./documentation.js');
        options.signal?.throwIfAborted();
        return readAppDocumentation(input, languageRef.current);
      }
      if (name === 'get_session_memory') return searchSessionMemory(memoryRef.current.current(), input);
      if (name === 'remember_context') {
        if (!input || Object.keys(input).some(key => key !== 'fact') || typeof input.fact !== 'string' || !input.fact.trim() || input.fact.length > 2000) throw new Error('Expected {fact: non-empty text, maximum 2000 characters}');
        const current = memoryRef.current.current(); const fact = input.fact.trim();
        if (current.memory.split('\n').includes(fact)) return { status: 'already_remembered' };
        const memory = [current.memory, fact].filter(Boolean).join('\n');
        if (memory.length > 16000) throw new Error('Session memory is full; ask the user to edit it');
        memoryRef.current.patch(session => ({ ...session, memory })); return { status: 'remembered', fact };
      }
      return base.execute(name, input, options);
    } };
  }
  const [input, setInput] = useState('');
  const entries = sessions.active.entries;
  const setEntries = sessions.setEntries;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const historyRef = useRef([]);
  const runningRef = useRef(null);
  const approvalRef = useRef(null);
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const followRef = useRef(true);
  const lastRequestRef = useRef('');
  const mountedRef = useRef(true);
  const stop = (reason = 'stopped') => { if (runningRef.current) runningRef.current.reason = reason; runningRef.current?.controller.abort(); approvalRef.current?.(false); approvalRef.current = null; setConfirmation(null); };
  const key = tacticalContextKey(ports.context());
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; runningRef.current?.controller.abort(); approvalRef.current?.(false); };
  }, []);
  useEffect(() => { historyRef.current = []; if (runningRef.current) stop('context_changed'); }, [transport]);
  useEffect(() => { historyRef.current = historyFromEntries(sessions.active.entries, sessions.active.compaction); setError(''); setNotice(''); setInput(''); lastRequestRef.current = ''; }, [sessions.active.id, sessions.loaded]);
  useEffect(() => {
    if (runningRef.current && runningRef.current.session.contextKey !== key) stop('context_changed');
  }, [key]);
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    if (followRef.current) log.scrollTop = log.scrollHeight;
    else setUnread(true);
  }, [entries]);
  const goToLatest = () => { followRef.current = true; setUnread(false); if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }; 
  const send = async (event, workflow = null) => {
    event?.preventDefault(); if (runningRef.current || !sessions.loaded || (!workflow && !input.trim()) || !enabled) return;
    if (entries.length > 4900) { setError('Session history is full; start another session'); return; }
    if (workflow && (!workflow.length || workflow.some(step => !step.prompt.trim()))) { setError('Every workflow step needs an instruction'); return; }
    if (!config.model) { openSettings(); return; }
    if (inputRef.current) inputRef.current.style.height = '82px';
    const value = workflow ? workflow.map((step, index) => `${index + 1}. ${step.name || 'Step'}: ${step.prompt}`).join('\n') : input.trim(); lastRequestRef.current = value; followRef.current = true; setUnread(false); const turn = crypto.randomUUID();
    const controller = new AbortController();
    const session = { turnId: turn, contextKey: toolsRef.current.contextKey() };
    runningRef.current = { controller, session };
    setInput(''); setError(''); setNotice(''); setBusy(true);
    sessions.observe();
    if (sessions.active.title === '新会话') sessions.patch(session => ({ ...session, title: value.slice(0, 40) }));
    const timer = setTimeout(() => stop('timeout'), 8 * 120_000);
    try {
      const steps = workflow || [{ name: '', prompt: value, tools: null }];
      for (const [stepIndex, step] of steps.entries()) {
      controller.signal.throwIfAborted();
      let stepInterrupted = false;
      const stepTurn = `${turn}-${stepIndex}`;
      session.turnId = stepTurn; runningRef.current.stepTurn = stepTurn;
      setEntries(previous => [...previous, { id: `${stepTurn}-user`, role: 'user', content: step.prompt }]);
      const history = await runTacticalConversation({
        messages: historyRef.current, text: step.prompt, config, transport, tools: toolsRef.current,
        signal: controller.signal, session, language, compression: memoryRef.current.current().compression, compaction: { ...memoryRef.current.current().compaction }, onCompaction: compaction => memoryRef.current.patch(value => ({ ...value, compaction })), entryIdForRound: round => `${stepTurn}-reply-${round}`, userEntryId: `${stepTurn}-user`, stopOnToolFailure: Boolean(workflow), allowedTools: step.tools, contextMemory: () => { memoryRef.current.observe(); return promptMemory(memoryRef.current.current()); },
        onState: state => { if (mountedRef.current) setPhase({ ...state, workflowStep: workflow ? stepIndex + 1 : null, workflowTotal: steps.length }); },
        onDelta: (delta, { round }) => { if (mountedRef.current) setEntries(previous => {
          const id = `${stepTurn}-reply-${round}`;
          return previous.some(entry => entry.id === id) ? previous.map(entry => entry.id === id ? { ...entry, content: entry.content + delta } : entry) : [...previous, { id, role: 'assistant', content: delta }];
        }); },
        onTool: tool => { if (['error', 'cancelled', 'requires_input'].includes(tool.status) || ['room_change_requested', 'restore_requested'].includes(tool.result?.status)) stepInterrupted = true; if (mountedRef.current) setEntries(previous => {
          const id = `${stepTurn}-activity-${tool.round}`;
          const group = previous.find(entry => entry.id === id);
          const items = group?.items || [];
          const next = items.some(item => item.id === tool.id) ? items.map(item => item.id === tool.id ? tool : item) : [...items, tool];
          const entry = { id, role: 'activity', items: next };
          return group ? previous.map(item => item.id === id ? entry : item) : [...previous, entry];
        }); },
        confirm: (name, input) => new Promise(resolve => { approvalRef.current = resolve; setPhase({ phase: 'confirmation', name }); setConfirmation({ name, input }); }),
      });
      historyRef.current = history;
      if (workflow && stepInterrupted) { setNotice(text('工作流已暂停，后续步骤未执行。', 'Workflow paused; subsequent steps were not executed.', 'Процесс приостановлен; следующие шаги не выполнены.')); break; }
      }
    } catch (error) {
      // Never replay unfinished tool calls; retain text and the interruption outcome.
      setEntries(previous => previous.map(entry => entry.role === 'assistant' && entry.id.startsWith(runningRef.current?.stepTurn || turn) ? { ...entry, interrupted: true } : entry));
      historyRef.current = historyFromEntries(memoryRef.current.current().entries, memoryRef.current.current().compaction);
      toolsRef.current.recordAction?.({ name: 'conversation', status: controller.signal.aborted || error.code === 'context_changed' ? 'interrupted' : 'error', reason: runningRef.current?.reason || error.code || error.message, executionContext: session.contextKey });
      setEntries(previous => [...previous, { id: `${turn}-failure`, role: 'activity', items: [{ id: crypto.randomUUID(), name: 'conversation', status: controller.signal.aborted || error.code === 'context_changed' ? 'interrupted' : 'error', result: { error: runningRef.current?.reason || error.message } }] }]);
      if (mountedRef.current) {
        if (controller.signal.aborted || error.code === 'context_changed') {
          const reason = runningRef.current?.reason || error.code;
          setNotice(reason === 'context_changed' ? text('战术上下文已切换，本轮执行已停止。', 'Tactical context changed; this turn was stopped.', 'Контекст тактики изменён; выполнение остановлено.') : reason === 'timeout' ? text('执行时间已到，本轮已停止。已完成的操作保留。', 'Time limit reached. Completed actions remain.', 'Время выполнения истекло. Выполненные действия сохранены.') : text('已停止。已完成的操作保留，可通过画布撤销恢复。', 'Stopped. Completed actions remain; use board undo to revert them.', 'Остановлено. Выполненные действия сохранены; их можно отменить на доске.'));
        } else setError(error.message);
      }
    } finally {
      clearTimeout(timer); approvalRef.current?.(false); approvalRef.current = null; runningRef.current = null;
      if (mountedRef.current) { setConfirmation(null); setBusy(false); setPhase(null); setEntries(previous => previous.map(entry => entry.role === 'activity' ? { ...entry, items: entry.items.map(item => item.status === 'running' ? { ...item, status: 'cancelled' } : item) } : entry)); }
    }
  };

  const approve = value => { const resolve = approvalRef.current; approvalRef.current = null; setConfirmation(null); setPhase({ phase: 'tools', name: confirmation?.name }); resolve?.(value); };
  const clearHistory = () => { historyRef.current = []; };
  const reset = () => { if (runningRef.current || !sessions.loaded) return; try { sessions.create(); } catch (error) { setError(error.message); } };
  const selectSession = id => { if (!runningRef.current) sessions.select(id); };
  const runWorkflow = () => send(null, sessions.active.workflow);
  return { sessions, selectSession, runWorkflow, toolDefinitions: toolsRef.current.definitions, input, setInput, entries, busy, error, setError, notice, setNotice, confirmation, approve, phase, unread, setUnread, logRef, inputRef, followRef, lastRequestRef, stop, send, goToLatest, clearHistory, reset };
}
