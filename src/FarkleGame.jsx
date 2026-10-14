import { useEffect, useMemo, useRef, useState } from 'react';
import { chooseAiMove, FARKLE_TARGET, rollDice, scoreDice, scoringSelections } from './farkle.js';
import { translate, translateParts } from './i18n.js';

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function Die({ value, selected, scoring, disabled, onClick }) {
  return <button type="button" className={`farkle-die${selected ? ' selected' : ''}${scoring ? ' scoring' : ''}`} disabled={disabled} onClick={onClick} aria-label={`Die ${value}`}>
    {Array.from({ length: 9 }, (_, index) => <i className={PIPS[value]?.includes(index) ? 'pip' : ''} key={index} />)}
  </button>;
}

export default function FarkleGame({ language = 'zh', stopped = false, onClose, embedded = false }) {
  const text = (key, values) => translate(language, key, values);
  const [scores, setScores] = useState({ player: 0, ai: 0 });
  const [turn, setTurn] = useState('player');
  const [phase, setPhase] = useState('ready');
  const [dice, setDice] = useState([]);
  const [selected, setSelected] = useState([]);
  const [remaining, setRemaining] = useState(6);
  const [turnScore, setTurnScore] = useState(0);
  const [message, setMessage] = useState({ key: "common.farkleGame.yourTurnRollAllSixDice" });
  const [showRules, setShowRules] = useState(false);
  const timerRef = useRef(null);
  const selectedScore = useMemo(() => scoreDice(selected.map((index) => dice[index])), [dice, selected]);
  const scoringIndexes = useMemo(() => new Set(scoringSelections(dice).flatMap((option) => option.indexes)), [dice]);

  const playerRoll = (count = remaining) => {
    const next = rollDice(count);
    setDice(next); setSelected([]);
    if (!scoringSelections(next).length) { setPhase('bust'); setMessage({ key: "common.farkleGame.farkleTurnScoreLost" }); timerRef.current = window.setTimeout(() => { setTurnScore(0); setRemaining(6); setTurn('ai'); setPhase('ai-roll'); setMessage({ key: "common.farkleGame.aiIsCalculatingRisk" }); }, 900); }
    else { setPhase('selecting'); setMessage({ key: "common.farkleGame.selectScoringDiceThenRollOrBank" }); }
  };

  const commitSelection = () => {
    if (!selectedScore) return null;
    const accumulated = turnScore + selectedScore;
    const nextRemaining = dice.length - selected.length || 6;
    return { accumulated, nextRemaining };
  };

  const continuePlayer = () => {
    const move = commitSelection();
    if (!move) return;
    setTurnScore(move.accumulated); setRemaining(move.nextRemaining);
    if (move.nextRemaining === 6) setMessage({ key: "common.farkleGame.hotDiceRollAllSixAgain" });
    playerRoll(move.nextRemaining);
  };

  const bankPlayer = () => {
    const move = commitSelection();
    if (!move) return;
    const total = scores.player + move.accumulated;
    setScores((current) => ({ ...current, player: total }));
    if (total >= FARKLE_TARGET) { setPhase('finished'); setMessage({ key: "common.farkleGame.youWinTheDemoIsStillParsing" }); return; }
    setTurnScore(0); setRemaining(6); setTurn('ai'); setSelected([]); setPhase('ai-roll'); setMessage({ key: "common.farkleGame.aiIsCalculatingRisk" });
  };

  useEffect(() => {
    if (turn !== 'ai' || !phase.startsWith('ai-') || stopped) return undefined;
    timerRef.current = window.setTimeout(() => {
      if (phase === 'ai-roll') {
        const next = rollDice(remaining);
        const move = chooseAiMove(next, turnScore, scores.ai, scores.player);
        setDice(next); setSelected(move?.indexes || []);
        if (!move) { setPhase('ai-bust'); setMessage({ key: "common.farkleGame.aiFarkledAndLostTheTurn" }); }
        else { setPhase('ai-choice'); setMessage(move.bank ? { key: "common.farkleGame.aiBanks", values: { accumulated: move.accumulated } } : { key: "common.farkleGame.aiKeepsAndRollsAgain", values: { score: move.score } }); }
        return;
      }
      if (phase === 'ai-bust') { setTurnScore(0); setRemaining(6); setTurn('player'); setPhase('ready'); setDice([]); setSelected([]); setMessage({ key: "common.farkleGame.yourTurn" }); return; }
      const move = chooseAiMove(dice, turnScore, scores.ai, scores.player);
      if (!move) return;
      if (move.bank) {
        const total = scores.ai + move.accumulated;
        setScores((current) => ({ ...current, ai: total }));
        if (total >= FARKLE_TARGET) { setPhase('finished'); setMessage({ key: "common.farkleGame.aiReached2000TryAnotherGame" }); }
        else { setTurnScore(0); setRemaining(6); setTurn('player'); setPhase('ready'); setDice([]); setSelected([]); setMessage({ key: "common.farkleGame.yourTurn" }); }
      } else { setTurnScore(move.accumulated); setRemaining(move.remaining); setPhase('ai-roll'); setSelected([]); }
    }, phase === 'ai-roll' ? 520 : 760);
    return () => window.clearTimeout(timerRef.current);
  }, [phase, turn, remaining, turnScore, dice, scores, stopped]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  const reset = () => { setScores({ player: 0, ai: 0 }); setTurn('player'); setPhase('ready'); setDice([]); setSelected([]); setRemaining(6); setTurnScore(0); setMessage({ key: "common.farkleGame.yourTurnRollAllSixDice" }); };

  return <section className={`farkle-game${phase === 'bust' || phase === 'ai-bust' ? ' bust' : ''}${embedded ? ' embedded' : ''}`}>
    {!embedded && <header><div><span>{text("common.farkleGame.parsingSideGame")}</span><h2>FARKLE · 2000</h2></div><small>{stopped ? text("common.farkleGame.parsingStopped") : text("common.farkleGame.parsingContinuesInBackground")}</small><div className="farkle-header-actions">{onClose && <button type="button" className="farkle-close" aria-label={text("common.farkleGame.close")} onClick={onClose}>×</button>}<button type="button" className="farkle-rules-toggle" aria-label={text("common.farkleGame.rules")} title={text("common.farkleGame.viewRules")} onClick={() => setShowRules((value) => !value)}>?</button></div></header>}
    {!embedded && showRules && <div className="farkle-rules"><h3>{text("common.farkleGame.howToPlay")}</h3><ul><li>{text("common.farkleGame.rollSixDiceAndSelectScoringDice")}</li><li>{translateParts(language, "common.farkle.rules.scoring", { one: <b key="one">1</b>, five: <b key="five">5</b> })}</li><li>{text("common.farkleGame.the1526And16StraightsScore")}</li><li>{text("common.farkleGame.threePairsAndSixOfAKindAreAlsoSpecial")}</li><li>{text("common.farkleGame.youMustKeepAtLeastOneScoringDieOtherwiseIt")}</li><li>{text("common.farkleGame.bankAnyTimeIfAllSixScoreHotDiceRoll")}</li><li>{text("common.farkleGame.firstToReachPointsWins", { FARKLE_TARGET: FARKLE_TARGET })}</li></ul></div>}
    <div className="farkle-score"><div className={turn === 'player' ? 'active' : ''}><span>PLAYER</span><strong>{scores.player}</strong></div><i>/ {FARKLE_TARGET}</i><div className={turn === 'ai' ? 'active' : ''}><span>AI · EXPERT</span><strong>{scores.ai}</strong></div></div>
    <div className="farkle-table">{dice.length ? dice.map((die, index) => <Die value={die} key={`${index}-${die}`} selected={selected.includes(index)} scoring={scoringIndexes.has(index)} disabled={turn !== 'player' || phase !== 'selecting'} onClick={() => setSelected((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])} />) : <div className="farkle-idle" />}</div>
    <div className="farkle-status"><p>{text(message)}</p><dl><div><dt>{text("common.farkleGame.turn")}</dt><dd>{turnScore + selectedScore}</dd></div><div><dt>{text("common.farkleGame.selected")}</dt><dd>{selectedScore}</dd></div><div><dt>{text("common.farkleGame.diceLeft")}</dt><dd>{remaining}</dd></div></dl></div>
    <footer>{phase === 'finished' ? <button type="button" onClick={reset}>{text("common.farkleGame.playAgain")}</button> : turn === 'player' && phase === 'ready' ? <button type="button" disabled={stopped} onClick={() => playerRoll(remaining)}>{text("common.farkleGame.roll")}</button> : turn === 'player' && phase === 'selecting' ? <><button type="button" disabled={!selectedScore || stopped} onClick={continuePlayer}>{text("common.farkleGame.rollAgain")}</button><button type="button" className="bank" disabled={!selectedScore || stopped} onClick={bankPlayer}>{text("common.farkleGame.bankScore")}</button></> : <span>{text("common.farkleGame.aiTurn")}</span>}</footer>
  </section>;
}
