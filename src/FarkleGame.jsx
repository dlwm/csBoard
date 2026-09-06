import { useEffect, useMemo, useRef, useState } from 'react';
import { chooseAiMove, FARKLE_TARGET, rollDice, scoreDice, scoringSelections } from './farkle.js';
import { localize } from './i18n.js';

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function Die({ value, selected, scoring, disabled, onClick }) {
  return <button type="button" className={`farkle-die${selected ? ' selected' : ''}${scoring ? ' scoring' : ''}`} disabled={disabled} onClick={onClick} aria-label={`Die ${value}`}>
    {Array.from({ length: 9 }, (_, index) => <i className={PIPS[value]?.includes(index) ? 'pip' : ''} key={index} />)}
  </button>;
}

export default function FarkleGame({ language = 'zh', stopped = false, onClose, embedded = false }) {
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  const [scores, setScores] = useState({ player: 0, ai: 0 });
  const [turn, setTurn] = useState('player');
  const [phase, setPhase] = useState('ready');
  const [dice, setDice] = useState([]);
  const [selected, setSelected] = useState([]);
  const [remaining, setRemaining] = useState(6);
  const [turnScore, setTurnScore] = useState(0);
  const [message, setMessage] = useState(() => text('你的回合，投出六颗骰子。', 'Your turn. Roll all six dice.', 'Ваш ход. Бросьте все шесть костей.'));
  const [showRules, setShowRules] = useState(false);
  const timerRef = useRef(null);
  const selectedScore = useMemo(() => scoreDice(selected.map((index) => dice[index])), [dice, selected]);
  const scoringIndexes = useMemo(() => new Set(scoringSelections(dice).flatMap((option) => option.indexes)), [dice]);

  const playerRoll = (count = remaining) => {
    const next = rollDice(count);
    setDice(next); setSelected([]);
    if (!scoringSelections(next).length) { setPhase('bust'); setMessage(text('爆骰！本回合分数归零。', 'Farkle! Turn score lost.', 'Фаркл! Очки хода потеряны.')); timerRef.current = window.setTimeout(() => { setTurnScore(0); setRemaining(6); setTurn('ai'); setPhase('ai-roll'); setMessage(text('AI 正在计算风险…', 'AI is calculating risk...', 'AI оценивает риск…')); }, 900); }
    else { setPhase('selecting'); setMessage(text('选择计分骰，然后继续或存分。', 'Select scoring dice, then roll or bank.', 'Выберите зачётные кости, затем бросайте снова или сохраните очки.')); }
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
    if (move.nextRemaining === 6) setMessage(text('热骰！重新投掷全部六颗。', 'Hot dice! Roll all six again.', 'Горячие кости! Бросайте все шесть снова.'));
    playerRoll(move.nextRemaining);
  };

  const bankPlayer = () => {
    const move = commitSelection();
    if (!move) return;
    const total = scores.player + move.accumulated;
    setScores((current) => ({ ...current, player: total }));
    if (total >= FARKLE_TARGET) { setPhase('finished'); setMessage(text('你赢了。Demo 还在继续解析。', 'You win. The Demo is still parsing.', 'Вы победили. Разбор Demo продолжается.')); return; }
    setTurnScore(0); setRemaining(6); setTurn('ai'); setSelected([]); setPhase('ai-roll'); setMessage(text('AI 正在计算风险…', 'AI is calculating risk...', 'AI оценивает риск…'));
  };

  useEffect(() => {
    if (turn !== 'ai' || !phase.startsWith('ai-') || stopped) return undefined;
    timerRef.current = window.setTimeout(() => {
      if (phase === 'ai-roll') {
        const next = rollDice(remaining);
        const move = chooseAiMove(next, turnScore, scores.ai, scores.player);
        setDice(next); setSelected(move?.indexes || []);
        if (!move) { setPhase('ai-bust'); setMessage(text('AI 爆骰，本回合归零。', 'AI farkled and lost the turn.', 'AI получил фаркл и потерял очки хода.')); }
        else { setPhase('ai-choice'); setMessage(move.bank ? text(`AI 决定存下 ${move.accumulated} 分。`, `AI banks ${move.accumulated}.`, `AI сохраняет ${move.accumulated} очков.`) : text(`AI 保留 ${move.score} 分并继续冒险。`, `AI keeps ${move.score} and rolls again.`, `AI оставляет ${move.score} очков и рискует снова.`)); }
        return;
      }
      if (phase === 'ai-bust') { setTurnScore(0); setRemaining(6); setTurn('player'); setPhase('ready'); setDice([]); setSelected([]); setMessage(text('你的回合。', 'Your turn.', 'Ваш ход.')); return; }
      const move = chooseAiMove(dice, turnScore, scores.ai, scores.player);
      if (!move) return;
      if (move.bank) {
        const total = scores.ai + move.accumulated;
        setScores((current) => ({ ...current, ai: total }));
        if (total >= FARKLE_TARGET) { setPhase('finished'); setMessage(text('AI 达到 2000 分。再来一局？', 'AI reached 2000. Try another game?', 'AI набрал 2000 очков. Сыграть ещё?')); }
        else { setTurnScore(0); setRemaining(6); setTurn('player'); setPhase('ready'); setDice([]); setSelected([]); setMessage(text('你的回合。', 'Your turn.', 'Ваш ход.')); }
      } else { setTurnScore(move.accumulated); setRemaining(move.remaining); setPhase('ai-roll'); setSelected([]); }
    }, phase === 'ai-roll' ? 520 : 760);
    return () => window.clearTimeout(timerRef.current);
  }, [phase, turn, remaining, turnScore, dice, scores, stopped, language]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  const reset = () => { setScores({ player: 0, ai: 0 }); setTurn('player'); setPhase('ready'); setDice([]); setSelected([]); setRemaining(6); setTurnScore(0); setMessage(text('你的回合，投出六颗骰子。', 'Your turn. Roll all six dice.', 'Ваш ход. Бросьте все шесть костей.')); };

  return <section className={`farkle-game${phase === 'bust' || phase === 'ai-bust' ? ' bust' : ''}${embedded ? ' embedded' : ''}`}>
    {!embedded && <header><div><span>{text('解析等待游戏', 'PARSING SIDE GAME', 'ИГРА НА ВРЕМЯ РАЗБОРА')}</span><h2>FARKLE · 2000</h2></div><small>{stopped ? text('解析已停止', 'Parsing stopped', 'Разбор остановлен') : text('解析在后台继续', 'Parsing continues in background', 'Разбор продолжается в фоне')}</small><div className="farkle-header-actions">{onClose && <button type="button" className="farkle-close" aria-label={text('关闭', 'Close', 'Закрыть')} onClick={onClose}>×</button>}<button type="button" className="farkle-rules-toggle" aria-label={text('规则', 'Rules', 'Правила')} title={text('查看规则', 'View rules', 'Показать правила')} onClick={() => setShowRules((value) => !value)}>?</button></div></header>}
    {!embedded && showRules && <div className="farkle-rules"><h3>{text('玩法规则', 'How to Play', 'Как играть')}</h3><ul><li>{text('投掷六颗骰子，选择计分骰。', 'Roll six dice and select scoring dice.', 'Бросьте шесть костей и выберите зачётные.')}</li><li>{text(<><b>1</b> = 100 分，<b>5</b> = 50 分，三枚相同 = 面值 × 100（三个 1 = 1000）。</>, <><b>1</b> = 100, <b>5</b> = 50, three of a kind = face value × 100 (three 1s = 1000).</>, <><b>1</b> = 100, <b>5</b> = 50, три одинаковых = номинал × 100 (три единицы = 1000).</>)}</li><li>{text('1–5、2–6 与 1–6 顺子均可计分；五骰顺子还能叠加额外的单 1 或单 5。', 'The 1–5, 2–6, and 1–6 straights score; a five-die straight can also include an extra scoring 1 or 5.', 'Стриты 1–5, 2–6 и 1–6 дают очки; к стриту из пяти костей можно добавить отдельную 1 или 5.')}</li><li>{text('三对和六枚相同也是特殊组合。', 'Three pairs and six of a kind are also special combinations.', 'Три пары и шесть одинаковых — особые комбинации.')}</li><li>{text('至少有一枚骰子可计分才能继续，否则爆骰归零。', 'You must keep at least one scoring die, otherwise it is a Farkle.', 'Для продолжения нужна хотя бы одна зачётная кость, иначе это фаркл.')}</li><li>{text('可随时"存下分数"；若六颗全部计分（热骰）可重掷。', 'Bank any time; if all six score (hot dice), roll all six again.', 'Очки можно сохранить в любой момент; если зачётны все шесть костей, бросьте все снова.')}</li><li>{text('先达到 2000 分者获胜。', `First to reach ${FARKLE_TARGET} points wins.`, `Побеждает первый, кто наберёт ${FARKLE_TARGET} очков.`)}</li></ul></div>}
    <div className="farkle-score"><div className={turn === 'player' ? 'active' : ''}><span>PLAYER</span><strong>{scores.player}</strong></div><i>/ {FARKLE_TARGET}</i><div className={turn === 'ai' ? 'active' : ''}><span>AI · EXPERT</span><strong>{scores.ai}</strong></div></div>
    <div className="farkle-table">{dice.length ? dice.map((die, index) => <Die value={die} key={`${index}-${die}`} selected={selected.includes(index)} scoring={scoringIndexes.has(index)} disabled={turn !== 'player' || phase !== 'selecting'} onClick={() => setSelected((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])} />) : <div className="farkle-idle" />}</div>
    <div className="farkle-status"><p>{message}</p><dl><div><dt>{text('本回合', 'TURN', 'ХОД')}</dt><dd>{turnScore + selectedScore}</dd></div><div><dt>{text('已选择', 'SELECTED', 'ВЫБРАНО')}</dt><dd>{selectedScore}</dd></div><div><dt>{text('剩余骰', 'DICE LEFT', 'ОСТАЛОСЬ КОСТЕЙ')}</dt><dd>{remaining}</dd></div></dl></div>
    <footer>{phase === 'finished' ? <button type="button" onClick={reset}>{text('再来一局', 'PLAY AGAIN', 'ЕЩЁ РАЗ')}</button> : turn === 'player' && phase === 'ready' ? <button type="button" disabled={stopped} onClick={() => playerRoll(remaining)}>{text('投掷', 'ROLL', 'БРОСИТЬ')}</button> : turn === 'player' && phase === 'selecting' ? <><button type="button" disabled={!selectedScore || stopped} onClick={continuePlayer}>{text('继续投掷', 'ROLL AGAIN', 'БРОСИТЬ СНОВА')}</button><button type="button" className="bank" disabled={!selectedScore || stopped} onClick={bankPlayer}>{text('存下分数', 'BANK SCORE', 'СОХРАНИТЬ ОЧКИ')}</button></> : <span>{text('AI 回合', 'AI TURN', 'ХОД AI')}</span>}</footer>
  </section>;
}
