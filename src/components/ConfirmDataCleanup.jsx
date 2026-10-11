import { useEffect, useRef, useState } from 'react';
import { DialogFrame } from './AppDialogs.jsx';
import { localize } from '../i18n.js';

// Native Electron does not support window.prompt; use the same typed dialog everywhere.
// Electron 不支持 window.prompt，各平台统一使用输入确认对话框。
export function useDataCleanupConfirmation(language) {
  const [request, setRequest] = useState(null);
  const pending = useRef(null);
  const finish = accepted => { pending.current?.(accepted); pending.current = null; setRequest(null); };
  useEffect(() => () => { pending.current?.(false); }, []);
  const confirm = description => new Promise(resolve => {
    pending.current?.(false);
    pending.current = resolve;
    setRequest({ description });
  });
  return { confirm, confirmation: request && <ConfirmDataCleanup language={language} description={request.description} onFinish={finish} /> };
}

function ConfirmDataCleanup({ language, description, onFinish }) {
  const [value, setValue] = useState('');
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  return <DialogFrame title={text('确认清空数据', 'Confirm data cleanup', 'Подтвердите очистку')} className="resource-pack-dialog data-cleanup-confirmation" onCancel={() => onFinish(false)}>
    <form onSubmit={event => { event.preventDefault(); if (value === 'CLEAR') onFinish(true); }}>
      <h2 id="data-cleanup-title">{text('确认清空数据', 'Confirm data cleanup', 'Подтвердите очистку')}</h2>
      <p>{description}</p>
      <label>{text('输入 CLEAR 确认', 'Type CLEAR to confirm', 'Введите CLEAR для подтверждения')}<input autoFocus autoComplete="off" spellCheck={false} value={value} onChange={event => setValue(event.target.value)} /></label>
      <div className="desktop-manager-actions"><button type="button" onClick={() => onFinish(false)}>{text('取消', 'Cancel', 'Отмена')}</button><button type="submit" disabled={value !== 'CLEAR'}>{text('确认清空', 'Confirm cleanup', 'Очистить')}</button></div>
    </form>
  </DialogFrame>;
}
