import { useEffect, useMemo, useRef, useState } from 'react';
import { chooseAiMove, FARKLE_TARGET, rollDice, scoreDice, scoringSelections } from './farkle.js';

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function Die({ value, selected, scoring, disabled, onClick }) {
  return <button type="button" className={`farkle-die${selected ? ' selected' : ''}${scoring ? ' scoring' : ''}`} disabled={disabled} onClick={onClick} aria-label={`Die ${value}`}>
    {Array.from({ length: 9 }, (_, index) => <i className={PIPS[value]?.includes(index) ? 'pip' : ''} key={index} />)}
  </button>;
}

export default function FarkleGame({ language = 'zh', stopped = false, onClose, embedded = false }) {
  const zh = language === 'zh';
  const [scores, setScores] = useState({ player: 0, ai: 0 });
  const [turn, setTurn] = useState('player');
  const [phase, setPhase] = useState('ready');
  const [dice, setDice] = useState([]);
  const [selected, setSelected] = useState([]);
  const [remaining, setRemaining] = useState(6);
  const [turnScore, setTurnScore] = useState(0);
  const [message, setMessage] = useState(zh ? '你的回合，投出六颗骰子。' : 'Your turn. Roll all six dice.');
  const [showRules, setShowRules] = useState(false);
  const timerRef = useRef(null);
  const selectedScore = useMemo(() => scoreDice(selected.map((index) => dice[index])), [dice, selected]);
  const scoringIndexes = useMemo(() => new Set(scoringSelections(dice).flatMap((option) => option.indexes)), [dice]);

  const playerRoll = (count = remaining) => {
    const next = rollDice(count);
    setDice(next); setSelected([]);
    if (!scoringSelections(next).length) { setPhase('bust'); setMessage(zh ? '爆骰！本回合分数归零。' : 'Farkle! Turn score lost.'); timerRef.current = window.setTimeout(() => { setTurnScore(0); setRemaining(6); setTurn('ai'); setPhase('ai-roll'); setMessage(zh ? 'AI 正在计算风险…' : 'AI is calculating risk...'); }, 900); }
    else { setPhase('selecting'); setMessage(zh ? '选择计分骰，然后继续或存分。' : 'Select scoring dice, then roll or bank.'); }
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
    if (move.nextRemaining === 6) setMessage(zh ? '热骰！重新投掷全部六颗。' : 'Hot dice! Roll all six again.');
    playerRoll(move.nextRemaining);
  };

  const bankPlayer = () => {
    const move = commitSelection();
    if (!move) return;
    const total = scores.player + move.accumulated;
    setScores((current) => ({ ...current, player: total }));
    if (total >= FARKLE_TARGET) { setPhase('finished'); setMessage(zh ? '你赢了。Demo 还在继续解析。' : 'You win. The Demo is still parsing.'); return; }
    setTurnScore(0); setRemaining(6); setTurn('ai'); setSelected([]); setPhase('ai-roll'); setMessage(zh ? 'AI 正在计算风险…' : 'AI is calculating risk...');
  };

  useEffect(() => {
    if (turn !== 'ai' || !phase.startsWith('ai-') || stopped) return undefined;
    timerRef.current = window.setTimeout(() => {
      if (phase === 'ai-roll') {
        const next = rollDice(remaining);
        const move = chooseAiMove(next, turnScore, scores.ai, scores.player);
        setDice(next); setSelected(move?.indexes || []);
        if (!move) { setPhase('ai-bust'); setMessage(zh ? 'AI 爆骰，本回合归零。' : 'AI farkled and lost the turn.'); }
        else { setPhase('ai-choice'); setMessage(move.bank ? zh ? `AI 决定存下 ${move.accumulated} 分。` : `AI banks ${move.accumulated}.` : zh ? `AI 保留 ${move.score} 分并继续冒险。` : `AI keeps ${move.score} and rolls again.`); }
        return;
      }
      if (phase === 'ai-bust') { setTurnScore(0); setRemaining(6); setTurn('player'); setPhase('ready'); setDice([]); setSelected([]); setMessage(zh ? '你的回合。' : 'Your turn.'); return; }
      const move = chooseAiMove(dice, turnScore, scores.ai, scores.player);
      if (!move) return;
      if (move.bank) {
        const total = scores.ai + move.accumulated;
        setScores((current) => ({ ...current, ai: total }));
        if (total >= FARKLE_TARGET) { setPhase('finished'); setMessage(zh ? 'AI 达到 2000 分。再来一局？' : 'AI reached 2000. Try another game?'); }
        else { setTurnScore(0); setRemaining(6); setTurn('player'); setPhase('ready'); setDice([]); setSelected([]); setMessage(zh ? '你的回合。' : 'Your turn.'); }
      } else { setTurnScore(move.accumulated); setRemaining(move.remaining); setPhase('ai-roll'); setSelected([]); }
    }, phase === 'ai-roll' ? 520 : 760);
    return () => window.clearTimeout(timerRef.current);
  }, [phase, turn, remaining, turnScore, dice, scores, stopped, zh]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  const reset = () => { setScores({ player: 0, ai: 0 }); setTurn('player'); setPhase('ready'); setDice([]); setSelected([]); setRemaining(6); setTurnScore(0); setMessage(zh ? '你的回合，投出六颗骰子。' : 'Your turn. Roll all six dice.'); };

  return <section className={`farkle-game${phase === 'bust' || phase === 'ai-bust' ? ' bust' : ''}${embedded ? ' embedded' : ''}`}>
    {!embedded && <header><div><span>{zh ? '解析等待游戏' : 'PARSING SIDE GAME'}</span><h2>FARKLE · 2000</h2></div><small>{stopped ? zh ? '解析已停止' : 'Parsing stopped' : zh ? '解析在后台继续' : 'Parsing continues in background'}</small><div className="farkle-header-actions">{onClose && <button type="button" className="farkle-close" aria-label={zh ? '关闭' : 'Close'} onClick={onClose}>×</button>}<button type="button" className="farkle-rules-toggle" aria-label={zh ? '规则' : 'Rules'} title={zh ? '查看规则' : 'View rules'} onClick={() => setShowRules((value) => !value)}>?</button></div></header>}
    {!embedded && showRules && <div className="farkle-rules"><h3>{zh ? '玩法规则' : 'How to Play'}</h3><ul><li>{zh ? '投掷六颗骰子，选择计分骰。' : 'Roll six dice and select scoring dice.'}</li><li><b>1</b> = 100 分，<b>5</b> = 50 分，三枚相同 = 面值 × 100（三个 1 = 1000）。</li><li>{zh ? '1–5、2–6 与 1–6 顺子均可计分；五骰顺子还能叠加额外的单 1 或单 5。' : 'The 1–5, 2–6, and 1–6 straights score; a five-die straight can also include an extra scoring 1 or 5.'}</li><li>{zh ? '三对和六枚相同也是特殊组合。' : 'Three pairs and six of a kind are also special combinations.'}</li><li>{zh ? '至少有一枚骰子可计分才能继续，否则爆骰归零。' : 'You must keep at least one scoring die, otherwise it is a Farkle.'}</li><li>{zh ? '可随时"存下分数"；若六颗全部计分（热骰）可重掷。' : 'Bank any time; if all six score (hot dice), roll all six again.'}</li><li>{zh ? '先达到 2000 分者获胜。' : `First to reach ${FARKLE_TARGET} points wins.`}</li></ul></div>}
    <div className="farkle-score"><div className={turn === 'player' ? 'active' : ''}><span>PLAYER</span><strong>{scores.player}</strong></div><i>/ {FARKLE_TARGET}</i><div className={turn === 'ai' ? 'active' : ''}><span>AI · EXPERT</span><strong>{scores.ai}</strong></div></div>
    <div className="farkle-table">{dice.length ? dice.map((die, index) => <Die value={die} key={`${index}-${die}`} selected={selected.includes(index)} scoring={scoringIndexes.has(index)} disabled={turn !== 'player' || phase !== 'selecting'} onClick={() => setSelected((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])} />) : <div className="farkle-idle" />}</div>
    <div className="farkle-status"><p>{message}</p><dl><div><dt>{zh ? '本回合' : 'TURN'}</dt><dd>{turnScore + selectedScore}</dd></div><div><dt>{zh ? '已选择' : 'SELECTED'}</dt><dd>{selectedScore}</dd></div><div><dt>{zh ? '剩余骰' : 'DICE LEFT'}</dt><dd>{remaining}</dd></div></dl></div>
    <footer>{phase === 'finished' ? <button type="button" onClick={reset}>{zh ? '再来一局' : 'PLAY AGAIN'}</button> : turn === 'player' && phase === 'ready' ? <button type="button" disabled={stopped} onClick={() => playerRoll(remaining)}>{zh ? '投掷' : 'ROLL'}</button> : turn === 'player' && phase === 'selecting' ? <><button type="button" disabled={!selectedScore || stopped} onClick={continuePlayer}>{zh ? '继续投掷' : 'ROLL AGAIN'}</button><button type="button" className="bank" disabled={!selectedScore || stopped} onClick={bankPlayer}>{zh ? '存下分数' : 'BANK SCORE'}</button></> : <span>{zh ? 'AI 回合' : 'AI TURN'}</span>}</footer>
  </section>;
}
