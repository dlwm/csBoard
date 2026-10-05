import { useEffect, useRef, useState } from 'react';
import { localize } from '../i18n.js';
import { useTacticalChat } from './useTacticalChat.js';
import { aiProviders, completionEndpoint, findAiProvider } from '../../shared/ai-providers.js';
import AiMessage from './AiMessage.jsx';
import AiSessionManager from './AiSessionManager.jsx';
import { toolDisplay } from './toolLabels.js';
import './ai.css';

export default function AiPanel({ language, ports, transport, enabled, visible = true }) {
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  const experimentalLabel = text('实验性', 'Experimental', 'Экспериментально');
  const assistantLabel = text('操作助手（实验性功能）', 'Operation assistant (experimental)', 'Помощник по операциям (экспериментальная функция)');
  const experimentalBadge = <span className="ai-experimental">{experimentalLabel}</span>;
  const toolLabel = name => toolDisplay(name, language).label;
  const statusLabel = status => ({ running: text('执行中', 'Running', 'Выполняется'), done: text('已完成', 'Completed', 'Завершено'), error: text('失败', 'Failed', 'Ошибка'), cancelled: text('已取消', 'Cancelled', 'Отменено'), interrupted: text('已中断', 'Interrupted', 'Прервано'), requires_input: text('等待用户操作', 'Awaiting user action', 'Ожидает действия пользователя') })[status];
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [viewPreview, setViewPreview] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [config, setConfig] = useState({ endpoint: 'https://api.openai.com/v1', model: '', hasKey: false, imageInput: false });
  const [draft, setDraft] = useState(config);
  const [draftProvider, setDraftProvider] = useState('openai');
  const confirmRef = useRef(null);
  const [saving, setSaving] = useState(false);
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
    try { if (!navigator.clipboard) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(content); setNotice(text('回复已复制。', 'Reply copied.', 'Ответ скопирован.')); }
    catch { setError(text('无法复制，请手动选择文本。', 'Unable to copy; select the text manually.', 'Не удалось скопировать; выделите текст вручную.')); }
  };
  const keepsKey = config.hasKey && completionEndpoint(config.endpoint) === completionEndpoint(draft.endpoint);
  const confirmationSummary = () => {
    const { name, input: args } = confirmation;
    if (name === 'apply_tactical_changes') return text(`删除 ${args.changes.filter(change => change.kind.startsWith('delete_')).length} 项内容，并提交本批次其余修改。`, `Delete ${args.changes.filter(change => change.kind.startsWith('delete_')).length} items and apply the remaining changes in this batch.`, `Удалить ${args.changes.filter(change => change.kind.startsWith('delete_')).length} элементов и применить остальные изменения.`);
    if (name === 'clear_board') return text('清空当前战术帧中的内容。', 'Clear the contents of the current tactical frame.', 'Очистить содержимое текущего кадра тактики.');
    if (name === 'edit_history') return args.action === 'redo' ? text('重做最近一次画布操作。', 'Redo the last board action.', 'Повторить последнее действие на доске.') : text('撤销最近一次画布操作，可能包含手动编辑。', 'Undo the last board action, which may be a manual edit.', 'Отменить последнее действие на доске, включая ручное редактирование.');
    if (name === 'request_room_action') return text(`协作房间操作：${({ open: '创建房间', join: '加入房间', leave: '离开房间' })[args.action] || args.action}${args.code ? `（${args.code}）` : ''}。`, `Room action: ${args.action}${args.code ? ` (${args.code})` : ''}.`, `Действие с комнатой: ${args.action}.`);
    const id = args.archiveId || args.frameId || args.folderId;
    const archive = ports.archives?.().find(item => item.id === id);
    const frameIndex = ports.frames?.().findIndex(item => item.id === id);
    const folder = ports.folders?.()?.stateRef?.current?.folders?.find(item => item.id === id);
    if (name === 'manage_archive_folders') return text(`删除文件夹“${folder?.name || id}”，内容移至上级文件夹，存档保留。`, `Delete folder “${folder?.name || id}”; move its contents to the parent and keep archives.`, `Удалить папку «${folder?.name || id}»; перенести содержимое выше, сохранив архивы.`);
    const target = archive?.name || (frameIndex >= 0 ? text(`第 ${frameIndex + 1} 帧`, `Frame ${frameIndex + 1}`, `Кадр ${frameIndex + 1}`) : id);
    return text(`${args.action === 'restore' ? '恢复存档并替换当前战术' : '删除内容'}：${target || '当前选择'}。`, `${args.action === 'restore' ? 'Restore archive and replace the current tactic' : 'Delete'}: ${target || 'current selection'}.`, `${args.action === 'restore' ? 'Восстановить архив и заменить тактику' : 'Удалить'}: ${target || 'текущий выбор'}.`);
  };
  if (!visible) return null;
  return <aside className={`ai-panel${open ? ' open' : ''}${expanded ? ' expanded' : ''}`} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); if (viewPreview) setViewPreview(null); else if (confirmation) approve(false); else setOpen(false); } }} aria-label={assistantLabel}>
    <button type="button" className="ai-toggle" onClick={() => { setOpen(value => !value); if (!open) requestAnimationFrame(() => inputRef.current?.focus()); }} aria-expanded={open}>{text('操作助手', 'Operation assistant', 'Помощник по операциям')}{experimentalBadge}{busy ? ' · …' : ''}</button>
    {viewPreview && <div className="ai-view-dialog" role="dialog" aria-modal="true" aria-label={text('画布截图', 'Board screenshot', 'Снимок доски')} onClick={() => setViewPreview(null)}><div onClick={event => event.stopPropagation()}><button autoFocus type="button" onClick={() => setViewPreview(null)}>{text('关闭截图', 'Close screenshot', 'Закрыть снимок')}</button><img src={viewPreview.dataUrl} alt={text('带编号的画布视图', 'Numbered board view', 'Вид доски с номерами')} /></div></div>}
    {open && <div className="ai-body">
      <header><strong>{text('操作助手', 'Operation assistant', 'Помощник по операциям')}{experimentalBadge}</strong><button type="button" disabled={busy || saving} onClick={() => { setError(''); setDraft({ ...config, apiKey: '' }); setDraftProvider(findAiProvider(config.endpoint)?.id || 'custom'); setSettings(value => !value); }}>{text('设置', 'Settings', 'Настройки')}</button><button type="button" disabled={busy || saving || !sessions.loaded} onClick={reset}>{text('新会话', 'New chat', 'Новый чат')}</button><button type="button" onClick={() => setExpanded(value => !value)} aria-label={text('调整面板宽度', 'Resize panel', 'Изменить ширину')}>{expanded ? '↙' : '↗'}</button><button type="button" onClick={() => setOpen(false)} aria-label={text('关闭面板', 'Close panel', 'Закрыть панель')}>×</button></header>
      {settings && <form className="ai-settings" onSubmit={save}><fieldset disabled={saving}>
        <p className="ai-experimental-note">{text('实验性功能，仍在持续改进。', 'Experimental feature under active development.', 'Экспериментальная функция в активной разработке.')}</p>
        <label>{text('服务商', 'Provider', 'Провайдер')}<select value={draftProvider} onChange={event => chooseProvider(event.target.value)}>{aiProviders.map(provider => <option key={provider.id} value={provider.id}>{localize(language, provider.name)}</option>)}<option value="custom">{text('自定义（兼容 Chat Completions）', 'Custom (Chat Completions compatible)', 'Свой (совместимый с Chat Completions)')}</option></select></label>
        <label>{text('服务地址', 'Service URL', 'Адрес сервиса')}<input required type="url" value={draft.endpoint} onChange={event => { setDraft({ ...draft, endpoint: event.target.value }); setDraftProvider('custom'); }} /></label>
        <small>{text('请选择支持工具调用的模型；API Key 需与服务商及地域匹配。百炼专属地址可使用自定义。', 'Choose a model with tool calling; the API key must match the provider and region. Use Custom for dedicated Model Studio endpoints.', 'Выберите модель с вызовом инструментов; ключ должен соответствовать провайдеру и региону. Для отдельного адреса Model Studio выберите свой сервис.')}</small>
        <label>{text('模型 ID', 'Model ID', 'ID модели')}<input required placeholder={text('填写服务商 API 模型 ID', 'API model ID from your provider', 'ID модели из API сервиса')} value={draft.model} onChange={event => setDraft({ ...draft, model: event.target.value, imageInput: false })} /></label>
        <label className="ai-key-clear"><input type="checkbox" checked={Boolean(draft.imageInput)} onChange={event => setDraft({ ...draft, imageInput: event.target.checked })} />{text('模型支持图像输入', 'Model supports image input', 'Модель поддерживает изображения')}</label>
        <small>{text('开启后，助手可将带编号的画布截图发送给所选模型。纯文本模型请保持关闭，仍可读取三维坐标、楼层与 NAV 连接。', 'Enable to send numbered board screenshots to this model. Leave off for text-only models; coordinates, floors and NAV connections remain available.', 'Включите для отправки модели снимков доски с номерами. Для текстовых моделей оставьте выключенным; координаты, этажи и связи NAV доступны.')}</small>
        <label>API Key<input type="password" autoComplete="off" value={draft.apiKey || ''} placeholder={keepsKey ? text('已配置，留空保留', 'Configured; leave blank to keep', 'Настроен; пустое поле сохраняет ключ') : text('输入密钥，本地服务可留空', 'API key; optional for local services', 'Ключ; для локального сервиса необязателен')} onChange={event => setDraft({ ...draft, apiKey: event.target.value })} /></label>
        <label className="ai-key-clear"><input type="checkbox" checked={Boolean(draft.clearKey)} onChange={event => setDraft({ ...draft, clearKey: event.target.checked })} />{text('清除已保存的密钥', 'Clear saved key', 'Удалить сохранённый ключ')}</label>
        <small>{text('对话与当前战术信息会发送到你配置的服务。网页密钥仅保留到刷新；桌面密钥由系统加密保存。', 'Chat and tactical context are sent to your configured service. Web keys last until refresh; desktop keys use system encryption.', 'Чат и тактика отправляются выбранному сервису. Веб-ключ действует до обновления; ключ приложения зашифрован системой.')}</small>
        <button disabled={saving} type="submit">{text('保存配置', 'Save settings', 'Сохранить')}</button><button type="button" disabled={saving} onClick={() => setSettings(false)}>{text('取消', 'Cancel', 'Отмена')}</button></fieldset>{error && <p className="ai-error" role="alert">{error}</p>}
      </form>}
      {!settings && <>
      <AiSessionManager language={language} sessions={sessions} busy={busy} selectSession={selectSession} toolDefinitions={toolDefinitions} runWorkflow={runWorkflow} onError={setError} />
      <small className="ai-service">{config.model || text('尚未配置模型', 'No model configured', 'Модель не настроена')}</small>
      <div className="ai-log" ref={logRef} onScroll={event => { const node = event.currentTarget; followRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48; if (followRef.current) setUnread(false); }}>
        {!entries.length && <p className="ai-empty">{text('描述需要执行的操作。助手可以查询地图与投掷记录，调整人员、道具和战术帧。', 'Describe the operation to perform: query map references and saved throws, or edit players, utilities and frames.', 'Опишите нужную операцию: поиск мест и бросков, изменение игроков, гранат и кадров.')}</p>}
        {entries.map(entry => entry.role === 'activity' ? <details className="ai-activity" key={entry.id}>
          <summary>{text('操作记录', 'Activity', 'Действия')} · {entry.items.length}{entry.items.some(item => item.status === 'error') ? ` · ${text('包含失败操作', 'Contains failed actions', 'Есть ошибки')}` : entry.items.some(item => item.status === 'running') ? ` · ${statusLabel('running')}` : ''}</summary>
          {entry.items.map(item => <div className={`ai-tool ${item.status}`} key={item.id} tabIndex={0} title={toolDisplay(item.name, language).description}><span>{toolLabel(item.name)} · {statusLabel(item.status)}{item.reused ? ` · ${text('复用查询结果', 'Reused result', 'Повторное использование')}` : ''}</span><code className="ai-tool-id">{item.name}</code>{item.image && <button type="button" className="ai-view-button" onClick={() => setViewPreview(item.image)} aria-label={text('查看完整截图', 'View full screenshot', 'Полный снимок')}><img className="ai-view-preview" src={item.image.dataUrl} alt={text('带编号的画布视图', 'Numbered board view', 'Вид доски с номерами')} /></button>}{item.result?.error && <small>{item.result.error}</small>}</div>)}
        </details> : <div className={`ai-message ${entry.role}`} key={entry.id}><div className="ai-message-heading"><b>{entry.role === 'user' ? text('用户', 'User', 'Пользователь') : text('助手', 'Assistant', 'Помощник')}</b>{entry.role === 'assistant' && <button type="button" onClick={() => copyReply(entry.content)}>{text('复制', 'Copy', 'Копировать')}</button>}</div>{entry.role === 'assistant' ? <AiMessage content={entry.content} /> : <p>{entry.content}</p>}</div>)}

      </div>
      {unread && <button type="button" className="ai-latest" onClick={goToLatest}>{text('返回最新消息', 'Latest messages', 'Последние сообщения')}</button>}
      {busy && <p className="ai-progress" role="status">{phase?.phase === 'confirmation' ? text('等待操作确认', 'Awaiting confirmation', 'Ожидает подтверждения') : phase?.phase === 'compressing' ? text('正在压缩上下文', 'Compressing context', 'Сжатие контекста') : phase?.phase === 'tools' ? toolLabel(phase.name) : text('正在生成回复', 'Generating response', 'Подготовка ответа')}{phase?.workflowStep ? ` · ${text('步骤', 'Step', 'Шаг')} ${phase.workflowStep}/${phase.workflowTotal}` : ''}{phase?.round != null ? ` · ${text('第', 'Round', 'Шаг')} ${phase.round + 1}` : ''}</p>}
      {confirmation && <div className="ai-confirm" role="alert"><p>{confirmationSummary()}</p><strong>{toolLabel(confirmation.name)}</strong><div><button ref={confirmRef} type="button" onClick={() => { approve(false); inputRef.current?.focus(); }}>{text('取消操作', 'Cancel action', 'Отменить действие')}</button><button type="button" onClick={() => { approve(true); inputRef.current?.focus(); }}>{text('确认执行', 'Confirm action', 'Подтвердить')}</button></div></div>}
      {notice && <p className="ai-notice" role="status">{notice}</p>}
      {error && <div className="ai-error" role="alert"><p>{error}</p>{lastRequestRef.current && <button type="button" disabled={busy} onClick={() => { setInput(lastRequestRef.current); inputRef.current?.focus(); }}>{text('重新编辑请求', 'Edit request', 'Изменить запрос')}</button>}</div>}
      {!enabled && <small>{text('请先打开或新建一个战术存档。', 'Open or create a tactical archive first.', 'Сначала откройте или создайте тактический архив.')}</small>}
      <form className="ai-compose" onSubmit={send}><textarea ref={inputRef} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); if (!busy) send(event); } }} aria-label={text('战术消息', 'Tactical message', 'Сообщение')} value={input} maxLength={6000} placeholder={text('说明要做的操作，或让助手学习当前上下文。', 'Describe an operation or ask the assistant to learn from the current context.', 'Опишите позиции игроков, гранаты или изменения тактики.')} onChange={event => { setInput(event.target.value); event.target.style.height = 'auto'; event.target.style.height = `${Math.min(140, Math.max(65, event.target.scrollHeight))}px`; }} disabled={!enabled} />{busy && <button type="button" onClick={() => stop()}>{text('停止', 'Stop', 'Стоп')}</button>}<button type="submit" disabled={busy || !sessions.loaded || !enabled || !input.trim()}>{text('发送', 'Send', 'Отправить')}</button></form>
      <footer><button type="button" disabled={busy || !enabled || !ports.board()?.canUndoCollab?.()} onClick={() => { ports.commands.execute('board.undo'); ports.flush(); }}>{text('撤销画布操作', 'Undo board action', 'Отменить действие на доске')}</button><small>{text('Enter 发送 · Shift+Enter 换行', 'Enter to send · Shift+Enter for newline', 'Enter — отправить · Shift+Enter — новая строка')}</small></footer>
      </>}
    </div>}
  </aside>;
}
