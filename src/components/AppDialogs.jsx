import { WorkspaceButton } from './workspace/WorkspaceControls.jsx';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { translate } from '../i18n.js';

const Dialogs = createContext(null);

// Dialogs belong to the application, not a browser-specific blocking API.
// Queue requests and settle cancellation on unmount so async actions never hang.
// 弹窗由应用统一托管；排队显示，退出时取消未完成请求，不阻塞渲染/解析线程。
export function AppDialogs({ children }) {
  const queue = useRef([]), sequence = useRef(0);
  const [active, setActive] = useState(null);
  const request = useCallback(options => new Promise(resolve => {
    const item = { ...options, id: ++sequence.current, resolve };
    queue.current.push(item);
    if (queue.current.length === 1) setActive(item);
  }), []);
  const finish = useCallback(accepted => {
    queue.current.shift()?.resolve(accepted);
    setActive(queue.current[0] || null);
  }, []);
  useEffect(() => () => { for (const item of queue.current.splice(0)) item.resolve(false); }, []);
  return <Dialogs.Provider value={request}>{children}{active && <RequestDialog key={active.id} request={active} onFinish={finish} />}</Dialogs.Provider>;
}

export function useAppDialogs(language) {
  const request = useContext(Dialogs);
  if (!request) throw new Error('AppDialogs provider is missing');
  return useMemo(() => ({
    confirm: message => request({ kind: 'confirm', message, language }),
    alert: message => request({ kind: 'alert', message, language }),
    showText: (title, value) => request({ kind: 'text', title, value, language }),
  }), [request, language]);
}

export function DialogFrame({ title, onCancel, children, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    element.showModal();
    const focus = element.querySelector('[data-dialog-focus], input, textarea');
    focus?.focus();
    if (focus?.readOnly && typeof focus.select === 'function') focus.select();
    return () => element.close();
  }, []);
  return createPortal(<dialog ref={ref} className={`save-archive-dialog app-dialog ${className}`}
    aria-label={title} onCancel={event => { event.preventDefault(); onCancel(); }} onKeyDown={event => event.stopPropagation()}>
    {children}
  </dialog>, document.body);
}

function RequestDialog({ request, onFinish }) {
  const { language, kind, title, message, value } = request;
  const text = (key, values) => translate(language, key, values);
  const heading = title || (kind === 'confirm' ? text("common.appDialogs.confirmAction") : text("common.appDialogs.notice"));
  return <DialogFrame title={heading} onCancel={() => onFinish(false)}>
    <header><strong>{heading}</strong></header>
    {message && <p>{message}</p>}
    {kind === 'text' && <textarea className="workspace-input" readOnly aria-label={heading} value={value} onFocus={event => event.target.select()} />}
    <div className="save-archive-actions">
      {kind === 'confirm' && <WorkspaceButton type="button" data-dialog-focus onClick={() => onFinish(false)}>{text("common.appDialogs.cancel")}</WorkspaceButton>}
      <WorkspaceButton type="button" onClick={() => onFinish(true)}>{kind === 'confirm' ? text("common.appDialogs.confirm") : text("common.appDialogs.close")}</WorkspaceButton>
    </div>
  </DialogFrame>;
}
