import { DialogFrame } from './AppDialogs.jsx';

// Native dialog provides focus trapping, Escape and the top layer on every shell.
export default function JoinRoomDialog({ code, onChange, onClose, onJoin, t }) {
  const valid = /^[0-9A-F]{6}$/i.test(code.trim());
  return <DialogFrame title={t('joinRoom')} onCancel={onClose} className="join-room-dialog">
    <form onSubmit={event => { event.preventDefault(); if (valid) onJoin(code.trim().toUpperCase()); }}>
      <header><strong id="join-room-title">{t('joinRoom')}</strong><button type="button" onClick={onClose} aria-label={t('cancel')}>×</button></header>
      <label className="collab-utility-search"><span>{t('roomPrompt')}</span><input autoFocus required autoComplete="off" spellCheck={false}
        maxLength={6} pattern="[0-9A-Fa-f]{6}" value={code} placeholder="A1B2C3"
        onChange={event => onChange(event.target.value.replace(/[^0-9a-f]/gi, '').toUpperCase())} /></label>
      <div className="save-archive-actions"><button type="button" onClick={onClose}>{t('cancel')}</button><button type="submit" disabled={!valid}>{t('joinRoom')}</button></div>
    </form>
  </DialogFrame>;
}
