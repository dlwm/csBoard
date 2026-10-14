import { translate } from '../i18n.js';
import { portableReviewResult } from './reviewResults.js';
import AiReviewEvidence from './AiReviewEvidence.jsx';

export default function AiReviewResult({ result, language, busy, onApply }) {
  const safe = portableReviewResult(result);
  if (!safe) return null;
  const text = key => translate(language, 'assistant.results.' + key);
  const supported = safe.schemaVersion === '1';
  return <section className="ai-review-result" aria-label={text('heading')}>
    <small>{text('disclaimer')}{result.historical ? ` · ${text('historical')}` : ''}</small>
    {!supported && <small>{text('unsupported')}</small>}
    {safe.cards.map((card, index) => <article className="ai-review-card" key={index}>
      <header><b>{card.title}</b><small>{text(card.basis === 'observed' ? 'observed' : 'inferred')}</small></header>
      <p>{card.description}</p>
      {supported && ['finding', 'clips'].includes(card.type) && <AiReviewEvidence result={{ evidence: card.evidence }} language={language} busy={busy} onApply={onApply} limit={12} />}
      {supported && card.type === 'comparison' && <div className="ai-review-comparison">{card.columns.map((column, columnIndex) => <div key={columnIndex}><b>{column.label}</b><AiReviewEvidence result={{ evidence: column.evidence }} language={language} busy={busy} onApply={onApply} limit={12} /></div>)}</div>}
      {!!card.limitations.length && <ul className="ai-review-limitations">{card.limitations.map((item, i) => <li key={i}>{item}</li>)}</ul>}
    </article>)}
  </section>;
}
