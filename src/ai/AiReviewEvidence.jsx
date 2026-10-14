import { WorkspaceButton } from '../components/workspace/WorkspaceControls.jsx';
import { translate, formatDuration } from '../i18n.js';
export default function AiReviewEvidence({ result, language, busy, onApply, limit = 6 }) {
  if (!result) return null;
  const evidence = result.evidence || [];
  return <div className="ai-review-evidence">
    {evidence.slice(0, limit).map((item, index) => <WorkspaceButton type="button" key={item.id || index} disabled={busy} onClick={() => onApply({ kind: 'replay', demoId: item.demoId, round: item.round, tick: item.tick, player: item.attacker || item.player || undefined })}>
      <span>{item.secondsFromRoundStart == null ? translate(language, 'assistant.review.round', { round: item.round }) : translate(language, 'assistant.review.roundEvidence', { round: item.round, time: formatDuration(item.secondsFromRoundStart * 1000, language) })}</span>
      <small>{translate(language, 'assistant.review.events.' + item.type)} · {item.attacker || item.player || '—'}{item.attacker && item.player ? ` → ${item.player}` : ''}</small>
      <small>{item.fileName}</small>
    </WorkspaceButton>)}
    {result.action && <WorkspaceButton type="button" disabled={busy} onClick={() => onApply(result.action)}>{translate(language, result.action.kind === 'replay' ? 'assistant.review.openPreparedView' : 'assistant.review.applyPreparedFilter')}</WorkspaceButton>}
    {evidence.length > limit && <small>{translate(language, 'assistant.review.moreEvidence', { count: evidence.length - limit })}</small>}
  </div>;
}
