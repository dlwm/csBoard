import { useState } from 'react';
import { WorkspacePanel } from '../components/workspace/WorkspaceSlots.jsx';
import { WorkspaceButton, WorkspacePanelHeading, WorkspaceSection } from '../components/workspace/WorkspaceControls.jsx';
import { translate } from '../i18n.js';
import './review.css';

export default function ReplayReviewPanel({ review, data, language, loading, onClose }) {
  const t = (key, values) => translate(language, `replay.review.${key}`, values);
  const [deleteId, setDeleteId] = useState('');
  const names = new Map(review.all.filter(item => item.victimId).map(item => [item.victimId, item.victim]));
  const index = review.queue.findIndex(item => item.id === review.active?.id);
  const canMove = offset => index + offset >= 0 && index + offset < review.queue.length;
  const label = item => `R${item.round} · ${((item.tick - (data.rounds.find(round => round.round === item.round)?.startTick || 0)) / (data.demo.tickRate || 64)).toFixed(1)}s`;
  return <WorkspacePanel className="replay-review" aria-busy={loading || review.loading}>
    <WorkspacePanelHeading title={t('title')} actions={<WorkspaceButton compact onClick={onClose}>{t('close')}</WorkspaceButton>} />
    <WorkspaceSection title={t('deaths')}>
      <label>{t('player')}<select className="workspace-input" value={review.player} onChange={event => review.setPlayer(event.target.value)}>
        <option value="">{t('allPlayers')}</option>{[...names].map(([id, name]) => <option key={id} value={id}>{name || t('unknown')}</option>)}
      </select></label>
      <div className="replay-review-options"><label>{t('lead')}<select className="workspace-input" value={review.lead} onChange={event => review.setLead(Number(event.target.value))}>{[3, 5, 8, 10, 15].map(value => <option key={value} value={value}>{t('seconds', { count: value })}</option>)}</select></label>
        <label>{t('perspective')}<select className="workspace-input" value={review.perspective} disabled={loading} onChange={event => review.setPerspective(event.target.value)}>{['victim', 'attacker', 'overview'].map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label></div>
      <div className="replay-review-actions"><WorkspaceButton disabled={loading || !canMove(-1)} onClick={() => review.play(review.queue[index - 1])}>{t('previous')}</WorkspaceButton><WorkspaceButton disabled={loading || !canMove(1)} onClick={() => review.play(review.queue[index + 1])}>{t('next')}</WorkspaceButton>{review.active && <WorkspaceButton onClick={review.leave}>{t('leaveClip')}</WorkspaceButton>}</div>
      <small>{t('count', { count: review.queue.length })}</small>
      {loading && <p role="status">{t('loading')}</p>}
      <div className="replay-review-list">{review.queue.map(item => <WorkspaceButton key={item.id} selected={review.active?.id === item.id} disabled={loading} onClick={() => review.play(item)}>
        <strong>{label(item)}</strong><span>{item.victim || t('unknown')} ← {item.attacker || t('world')}</span><small>{item.weapon}</small>
      </WorkspaceButton>)}</div>
      {!review.queue.length && <p>{t('empty')}</p>}
      <p className="replay-review-hint">{t('reconstructed')}</p>
    </WorkspaceSection>
    <WorkspaceSection title={t('notes')}>
      <label>{t('draft')}<textarea className="workspace-input" maxLength={4000} rows={3} value={review.draft} disabled={review.saving} onChange={event => review.setDraft(event.target.value)} /></label>
      <WorkspaceButton variant="primary" disabled={loading || review.loading || review.saving || !review.draft.trim()} onClick={review.save}>{review.saving ? t('saving') : t('save')}</WorkspaceButton>
      <small>{t('captures')}</small>
      {review.error && <p role="alert">{t('storageError')}</p>}
      {review.notes.map(note => <article className="replay-review-note" key={note.id}>
        <WorkspaceButton variant="quiet" disabled={loading} onClick={() => review.restore(note)}><strong>{label(note)}</strong><span>{note.text}</span></WorkspaceButton>
        <div className="replay-review-actions">{deleteId === note.id ? <><WorkspaceButton disabled={review.saving} onClick={async () => { if (await review.remove(note.id)) setDeleteId(''); }}>{t('confirmDelete')}</WorkspaceButton><WorkspaceButton onClick={() => setDeleteId('')}>{t('cancel')}</WorkspaceButton></> : <WorkspaceButton compact onClick={() => setDeleteId(note.id)}>{t('delete')}</WorkspaceButton>}</div>
      </article>)}
      {!review.loading && !review.notes.length && <p>{t('noNotes')}</p>}
    </WorkspaceSection>
  </WorkspacePanel>;
}
