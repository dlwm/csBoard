import AiReviewResult from './AiReviewResult.jsx';
import AiReviewEvidence from './AiReviewEvidence.jsx';
import { useEffect, useRef, useState } from 'react';
import { translate } from '../i18n.js';
import { useTacticalChat } from './useTacticalChat.js';
import { aiProviders, completionEndpoint, findAiProvider } from '../../shared/ai-providers.js';
import AiMessage from './AiMessage.jsx';
import AiSessionManager from './AiSessionManager.jsx';
import { toolDisplay } from './toolLabels.js';
import './ai.css';

export default function AiPanel({ language, ports, transport, enabled, visible = true }) {
  const text = (key, values) => translate(language, key, values);
  const experimentalLabel = text("assistant.aiPanel.experimental");
  const assistantLabel = text("assistant.aiPanel.operationAssistantExperimental");
  const experimentalBadge = <span className="ai-experimental">{experimentalLabel}</span>;
  const reviewContext = ports.context();
  const reviewMode = reviewContext.panel !== 'collab';
  const toolLabel = name => toolDisplay(name, language).label;
  const statusLabel = status => ({ running: text("assistant.aiPanel.running"), done: text("assistant.aiPanel.completed"), error: text("assistant.aiPanel.failed"), cancelled: text("assistant.aiPanel.cancelled"), interrupted: text("assistant.aiPanel.interrupted"), requires_input: text("assistant.aiPanel.awaitingUserAction") })[status];
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [viewPreview, setViewPreview] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [config, setConfig] = useState({ endpoint: 'https://api.openai.com/v1', model: '', hasKey: false, imageInput: false });
  const [draft, setDraft] = useState(config);
  const [draftProvider, setDraftProvider] = useState('openai');
  const confirmRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [applyingReview, setApplyingReview] = useState(false);
  const { sessions, selectSession, runWorkflow, toolDefinitions, input, setInput, entries, busy, error, setError, notice, setNotice, confirmation, approve, phase, unread, setUnread, logRef, inputRef, followRef, lastRequestRef, stop, send, goToLatest, clearHistory, reset } = useTacticalChat({ language, ports, transport, enabled, config, openSettings: () => setSettings(true) });
  useEffect(() => {
    let active = true;
    transport.config().then(value => {
      if (!active) return;
      setConfig(previous => ({ ...previous, ...value }));
      setDraft(previous => ({ ...previous, ...value, apiKey: '' }));
      setDraftProvider(findAiProvider(value.endpoint || 'https://api.openai.com/v1')?.id || 'custom');
    }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [transport]);
  useEffect(() => { if (open && !settings && followRef.current) goToLatest(); }, [open, settings]);
  useEffect(() => { if (confirmation) confirmRef.current?.focus(); }, [confirmation]);
  const applyReview = async action => {
    if (busy || applyingReview) return;
    setError(''); setApplyingReview(true);
    try { await ports.review.apply(action); }
    catch (error) { setError(error.message); }
    finally { setApplyingReview(false); }
  };
  const save = async event => {
    event.preventDefault(); if (saving) return;
    setError(''); setSaving(true);
    try { const result = await transport.save(draft); if (result.endpoint !== config.endpoint || result.model !== config.model || result.imageInput !== config.imageInput) clearHistory(); setConfig(result); setDraft({ ...result, apiKey: '' }); setSettings(false); }
    catch (error) { setError(error.message); }
    finally { setSaving(false); }
  };
  const chooseProvider = id => {
    setDraftProvider(id);
    const provider = aiProviders.find(value => value.id === id);
    if (!provider) return;
    const changed = completionEndpoint(draft.endpoint) !== completionEndpoint(provider.baseUrl);
    setDraft(previous => ({ ...previous, endpoint: provider.baseUrl, ...(changed ? { model: '', apiKey: '', clearKey: false, imageInput: false } : {}) }));
  };
  const copyReply = async content => {
    try { if (!navigator.clipboard) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(content); setNotice({ key: "assistant.aiPanel.replyCopied" }); }
    catch { setError(text("assistant.aiPanel.unableToCopySelectTheTextManually")); }
  };
  const keepsKey = config.hasKey && completionEndpoint(config.endpoint) === completionEndpoint(draft.endpoint);
  const confirmationSummary = () => {
    const { name, input: args } = confirmation;
    if (name === 'apply_tactical_changes') return text("assistant.aiPanel.deleteItemsAndApplyTheRemainingChangesInThisBatch", { length: args.changes.filter(change => change.kind.startsWith('delete_')).length });
    if (name === 'clear_board') return text("assistant.aiPanel.clearTheContentsOfTheCurrentTacticalFrame");
    if (name === 'edit_history') return args.action === 'redo' ? text("assistant.aiPanel.redoTheLastBoardAction") : text("assistant.aiPanel.undoTheLastBoardActionWhichMayBeAManual");
    if (name === 'request_room_action') return text('assistant.confirm.room', { action: text(({ open: 'collaboration.openRoom', join: 'collaboration.joinRoom', leave: 'collaboration.leaveRoom' })[args.action] || args.action), code: args.code ? ' (' + args.code + ')' : '' });
    const id = args.archiveId || args.frameId || args.folderId;
    const archive = ports.archives?.().find(item => item.id === id);
    const frameIndex = ports.frames?.().findIndex(item => item.id === id);
    const folder = ports.folders?.()?.stateRef?.current?.folders?.find(item => item.id === id);
    if (name === 'manage_archive_folders') return text("assistant.aiPanel.deleteFolderMoveItsContentsToTheParentAndKeep", { value1: folder?.name || id });
    const target = archive?.name || (frameIndex >= 0 ? text("assistant.aiPanel.frame", { value1: frameIndex + 1 }) : id);
    return text(args.action === 'restore' ? 'assistant.confirm.restore' : 'assistant.confirm.delete', { target: target || text('assistant.confirm.currentSelection') });
  };
  if (!visible) return null;
  return <aside className={`ai-panel${open ? ' open' : ''}${expanded ? ' expanded' : ''}`} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); if (viewPreview) setViewPreview(null); else if (confirmation) approve(false); else setOpen(false); } }} aria-label={assistantLabel}>
    <button type="button" className="ai-toggle" onClick={() => { setOpen(value => !value); if (!open) requestAnimationFrame(() => inputRef.current?.focus()); }} aria-expanded={open}>{text("assistant.aiPanel.operationAssistant")}{experimentalBadge}{busy ? ' · …' : ''}</button>
    {viewPreview && <div className="ai-view-dialog" role="dialog" aria-modal="true" aria-label={text("assistant.aiPanel.boardScreenshot")} onClick={() => setViewPreview(null)}><div onClick={event => event.stopPropagation()}><button autoFocus type="button" onClick={() => setViewPreview(null)}>{text("assistant.aiPanel.closeScreenshot")}</button><img src={viewPreview.dataUrl} alt={text("assistant.aiPanel.numberedBoardView")} /></div></div>}
    {open && <div className="ai-body">
      <header><strong>{text("assistant.aiPanel.operationAssistant")}{experimentalBadge}</strong><button type="button" disabled={busy || saving} onClick={() => { setError(''); setDraft({ ...config, apiKey: '' }); setDraftProvider(findAiProvider(config.endpoint)?.id || 'custom'); setSettings(value => !value); }}>{text("assistant.aiPanel.settings")}</button><button type="button" disabled={busy || saving || !sessions.loaded} onClick={reset}>{text("assistant.aiPanel.newChat")}</button><button type="button" onClick={() => setExpanded(value => !value)} aria-label={text("assistant.aiPanel.resizePanel")}>{expanded ? '↙' : '↗'}</button><button type="button" onClick={() => setOpen(false)} aria-label={text("assistant.aiPanel.closePanel")}>×</button></header>
      {settings && <form className="ai-settings" onSubmit={save}><fieldset disabled={saving}>
        <p className="ai-experimental-note">{text("assistant.aiPanel.experimentalFeatureUnderActiveDevelopment")}</p>
        <label>{text("assistant.aiPanel.provider")}<select value={draftProvider} onChange={event => chooseProvider(event.target.value)}>{aiProviders.map(provider => <option key={provider.id} value={provider.id}>{translate(language, provider.name)}</option>)}<option value="custom">{text("assistant.aiPanel.customChatCompletionsCompatible")}</option></select></label>
        <label>{text("assistant.aiPanel.serviceUrl")}<input required type="url" value={draft.endpoint} onChange={event => { setDraft({ ...draft, endpoint: event.target.value }); setDraftProvider('custom'); }} /></label>
        <small>{text("assistant.aiPanel.chooseAModelWithToolCallingTheApiKeyMust")}</small>
        <label>{text("assistant.aiPanel.modelId")}<input required placeholder={text("assistant.aiPanel.apiModelIdFromYourProvider")} value={draft.model} onChange={event => setDraft({ ...draft, model: event.target.value, imageInput: false })} /></label>
        <label className="ai-key-clear"><input type="checkbox" checked={Boolean(draft.imageInput)} onChange={event => setDraft({ ...draft, imageInput: event.target.checked })} />{text("assistant.aiPanel.modelSupportsImageInput")}</label>
        <small>{text("assistant.aiPanel.enableToSendNumberedBoardScreenshotsToThisModelLeave")}</small>
        <label>API Key<input type="password" autoComplete="off" value={draft.apiKey || ''} placeholder={keepsKey ? text("assistant.aiPanel.configuredLeaveBlankToKeep") : text("assistant.aiPanel.apiKeyOptionalForLocalServices")} onChange={event => setDraft({ ...draft, apiKey: event.target.value })} /></label>
        <label className="ai-key-clear"><input type="checkbox" checked={Boolean(draft.clearKey)} onChange={event => setDraft({ ...draft, clearKey: event.target.checked })} />{text("assistant.aiPanel.clearSavedKey")}</label>
        <small>{text("assistant.aiPanel.chatAndTacticalContextAreSentToYourConfiguredService")}</small>
        <button disabled={saving} type="submit">{text("assistant.aiPanel.saveSettings")}</button><button type="button" disabled={saving} onClick={() => setSettings(false)}>{text("assistant.aiPanel.cancel")}</button></fieldset>{error && <p className="ai-error" role="alert">{error}</p>}
      </form>}
      {!settings && <>
      <AiSessionManager contextTool={reviewMode ? 'get_review_context' : 'get_board_state'} language={language} sessions={sessions} busy={busy} selectSession={selectSession} toolDefinitions={toolDefinitions} runWorkflow={runWorkflow} onError={setError} />
      {reviewMode && <div className="ai-review-context"><b>{text(reviewContext.panel === 'demo' ? 'assistant.review.replayContext' : 'assistant.review.analysisContext')}</b><small>{reviewContext.panel === 'demo' ? `${reviewContext.review?.fileName || '—'} · ${text('assistant.review.round', { round: reviewContext.review?.round ?? '—' })}` : text('assistant.review.selection', { players: reviewContext.review?.selectedPlayers.length || 0, demos: reviewContext.review?.selectedDemoIds.length || 0 })}</small><div>{(reviewContext.panel === 'demo' ? ['summarizeRound', 'findKeyEvents'] : ['summarizeSelection', 'findUsefulUtilities']).map(key => <button type="button" key={key} disabled={busy || !enabled} onClick={() => { setInput(text('assistant.review.prompts.' + key)); inputRef.current?.focus(); }}>{text('assistant.review.suggestions.' + key)}</button>)}</div></div>}
      <small className="ai-service">{config.model || text("assistant.aiPanel.noModelConfigured")}</small>
      <div className="ai-log" ref={logRef} onScroll={event => { const node = event.currentTarget; followRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48; if (followRef.current) setUnread(false); }}>
        {!entries.length && <p className="ai-empty">{text(reviewMode ? "assistant.review.empty" : "assistant.aiPanel.describeTheOperationToPerformQueryMapReferencesAndSaved")}</p>}
        {entries.map(entry => entry.role === 'activity' ? <div key={entry.id}><details className="ai-activity" key={entry.id}>
          <summary>{text("assistant.aiPanel.activity")} · {entry.items.length}{entry.items.some(item => item.status === 'error') ? ` · ${text("assistant.aiPanel.containsFailedActions")}` : entry.items.some(item => item.status === 'running') ? ` · ${statusLabel('running')}` : ''}</summary>
          {entry.items.map(item => <div className={`ai-tool ${item.status}`} key={item.id} tabIndex={0} title={toolDisplay(item.name, language).description}><span>{toolLabel(item.name)} · {statusLabel(item.status)}{item.reused ? ` · ${text("assistant.aiPanel.reusedResult")}` : ''}</span><code className="ai-tool-id">{item.name}</code>{item.image && <button type="button" className="ai-view-button" onClick={() => setViewPreview(item.image)} aria-label={text("assistant.aiPanel.viewFullScreenshot")}><img className="ai-view-preview" src={item.image.dataUrl} alt={text("assistant.aiPanel.numberedBoardView")} /></button>}{item.result?.error && <small>{item.result.error}</small>}{reviewMode && <AiReviewEvidence result={item.result} language={language} busy={busy || applyingReview} onApply={applyReview} />}</div>)}
        </details>{entry.items.filter(item => item.result?.reviewResult).map(item => <AiReviewResult key={item.id} result={item.result.reviewResult} language={language} busy={busy || applyingReview || !reviewMode} onApply={applyReview} />)}</div> : <div className={`ai-message ${entry.role}`} key={entry.id}><div className="ai-message-heading"><b>{entry.role === 'user' ? text("assistant.aiPanel.user") : text("assistant.aiPanel.assistant")}</b>{entry.role === 'assistant' && <button type="button" onClick={() => copyReply(entry.content)}>{text("assistant.aiPanel.copy")}</button>}</div>{entry.role === 'assistant' ? <AiMessage content={entry.content} /> : <p>{entry.content}</p>}</div>)}

      </div>
      {unread && <button type="button" className="ai-latest" onClick={goToLatest}>{text("assistant.aiPanel.latestMessages")}</button>}
      {busy && <p className="ai-progress" role="status">{phase?.phase === 'confirmation' ? text("assistant.aiPanel.awaitingConfirmation") : phase?.phase === 'compressing' ? text("assistant.aiPanel.compressingContext") : phase?.phase === 'tools' ? toolLabel(phase.name) : text("assistant.aiPanel.generatingResponse")}{phase?.workflowStep ? ` · ${text("assistant.aiPanel.step")} ${phase.workflowStep}/${phase.workflowTotal}` : ''}{phase?.round != null ? ` · ${text("assistant.aiPanel.round")} ${phase.round + 1}` : ''}</p>}
      {confirmation && <div className="ai-confirm" role="alert"><p>{confirmationSummary()}</p><strong>{toolLabel(confirmation.name)}</strong><div><button ref={confirmRef} type="button" onClick={() => { approve(false); inputRef.current?.focus(); }}>{text("assistant.aiPanel.cancelAction")}</button><button type="button" onClick={() => { approve(true); inputRef.current?.focus(); }}>{text("assistant.aiPanel.confirmAction")}</button></div></div>}
      {notice && <p className="ai-notice" role="status">{notice}</p>}
      {error && <div className="ai-error" role="alert"><p>{error}</p>{lastRequestRef.current && <button type="button" disabled={busy} onClick={() => { setInput(lastRequestRef.current); inputRef.current?.focus(); }}>{text("assistant.aiPanel.editRequest")}</button>}</div>}
      {!enabled && <small>{text(reviewMode ? "assistant.review.loadDataFirst" : "assistant.aiPanel.openOrCreateATacticalArchiveFirst")}</small>}
      <form className="ai-compose" onSubmit={send}><textarea ref={inputRef} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); if (!busy) send(event); } }} aria-label={text("assistant.aiPanel.tacticalMessage")} value={input} maxLength={6000} placeholder={text("assistant.aiPanel.describeAnOperationOrAskTheAssistantToLearnFrom")} onChange={event => { setInput(event.target.value); event.target.style.height = 'auto'; event.target.style.height = `${Math.min(140, Math.max(65, event.target.scrollHeight))}px`; }} disabled={!enabled} />{busy && <button type="button" onClick={() => stop()}>{text("assistant.aiPanel.stop")}</button>}<button type="submit" disabled={busy || !sessions.loaded || !enabled || !input.trim()}>{text("assistant.aiPanel.send")}</button></form>
      <footer>{!reviewMode && <button type="button" disabled={busy || !enabled || !ports.board()?.canUndoCollab?.()} onClick={() => { ports.commands.execute('board.undo'); ports.flush(); }}>{text("assistant.aiPanel.undoBoardAction")}</button>}<small>{text("assistant.aiPanel.enterToSendShiftEnterForNewline")}</small></footer>
      </>}
    </div>}
  </aside>;
}
