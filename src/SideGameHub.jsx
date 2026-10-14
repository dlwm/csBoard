import { useEffect, useRef, useState } from 'react';
import FarkleGame from './FarkleGame.jsx';
import { translate } from './i18n.js';

const shuffledNumbers = (size) => {
  const numbers = Array.from({ length: size * size }, (_value, index) => index + 1);
  for (let index = numbers.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [numbers[index], numbers[swapIndex]] = [numbers[swapIndex], numbers[index]];
  }
  return numbers;
};

function SchulteGame({ language, stopped }) {
  const text = (key, values) => translate(language, key, values);
  const [size, setSize] = useState(4);
  const [numbers, setNumbers] = useState(() => shuffledNumbers(4));
  const [next, setNext] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [bestBySize, setBestBySize] = useState({});
  const [mistake, setMistake] = useState(null);
  const startedAtRef = useRef(0);
  const mistakeTimerRef = useRef(null);
  const complete = next > size * size;

  const reset = (nextSize = size) => {
    window.clearTimeout(mistakeTimerRef.current);
    setNumbers(shuffledNumbers(nextSize));
    setNext(1);
    setElapsed(0);
    setRunning(false);
    setMistake(null);
    startedAtRef.current = 0;
  };

  useEffect(() => {
    if (!running || stopped) return undefined;
    const timer = window.setInterval(() => setElapsed(performance.now() - startedAtRef.current), 40);
    return () => window.clearInterval(timer);
  }, [running, stopped]);

  useEffect(() => {
    if (stopped) setRunning(false);
    return () => window.clearTimeout(mistakeTimerRef.current);
  }, [stopped]);

  const choose = (number) => {
    if (stopped || complete) return;
    if (number !== next) {
      setMistake(number);
      window.clearTimeout(mistakeTimerRef.current);
      mistakeTimerRef.current = window.setTimeout(() => setMistake(null), 260);
      return;
    }
    const now = performance.now();
    if (next === 1) {
      startedAtRef.current = now;
      setRunning(true);
    }
    if (next === size * size) {
      const result = now - startedAtRef.current;
      setElapsed(result);
      setRunning(false);
      setBestBySize((scores) => ({ ...scores, [size]: scores[size] == null ? result : Math.min(scores[size], result) }));
    }
    setNext((value) => value + 1);
  };

  return <div className="schulte-game">
    <div className="schulte-toolbar">
      <div><span>{text("common.sideGameHub.grid")}</span>{[3, 4, 5, 6].map((value) => <button type="button" key={value} className={size === value ? 'active' : ''} onClick={() => { setSize(value); reset(value); }}>{value}×{value}</button>)}</div>
      <button type="button" className="schulte-reset" onClick={() => reset()}>{text("common.sideGameHub.reshuffle")}</button>
    </div>
    <div className="schulte-status"><div><span>{complete ? text("common.sideGameHub.complete") : text("common.sideGameHub.next")}</span><strong>{complete ? '✓' : next}</strong></div><div><span>{text("common.sideGameHub.time")}</span><strong>{(elapsed / 1000).toFixed(2)}s</strong></div><div><span>{text("common.sideGameHub.best")}</span><strong>{bestBySize[size] == null ? '—' : `${(bestBySize[size] / 1000).toFixed(2)}s`}</strong></div></div>
    <div className="schulte-grid" style={{ '--schulte-size': size }}>{numbers.map((number) => <button type="button" key={number} className={`${number < next ? 'done ' : ''}${mistake === number ? 'mistake' : ''}`.trim()} disabled={stopped} onClick={() => choose(number)}>{number}</button>)}</div>
    <p>{stopped ? text("common.sideGameHub.parsingStopped") : complete ? text("common.sideGameHub.completeReshuffleForAnotherRun") : next === 1 ? text("common.sideGameHub.startAt1AndFindEveryNumberInOrderTiming") : text("common.sideGameHub.findNext", { next: next })}</p>
  </div>;
}

function ReactionGame({ language, stopped }) {
  const text = (key, values) => translate(language, key, values);
  const [phase, setPhase] = useState('idle');
  const [successfulCount, setSuccessfulCount] = useState(0);
  const [best, setBest] = useState(null);
  const [lastMs, setLastMs] = useState(null);
  const [latestAverage, setLatestAverage] = useState(null);
  const [message, setMessage] = useState(() => text("common.sideGameHub.pressToStartThenPressAgainOnceItTurnsGreen"));
  const timeoutRef = useRef(null);
  const goAtRef = useRef(0);
  const groupRef = useRef([]);

  useEffect(() => {
    if (stopped) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setPhase('idle');
      setMessage(text("common.sideGameHub.parsingStopped"));
    }
    return () => window.clearTimeout(timeoutRef.current);
  }, [stopped, language]);

  const handleDown = () => {
    if (stopped) return;
    if (phase === 'idle') {
      window.clearTimeout(timeoutRef.current);
      setPhase('waiting');
      setMessage(text("common.sideGameHub.waitForGreenDoNotPressEarly"));
      const delay = 700 + Math.random() * 1600;
      timeoutRef.current = window.setTimeout(() => {
        setPhase('go');
        setMessage(text("common.sideGameHub.press"));
        goAtRef.current = performance.now();
      }, delay);
      return;
    }
    if (phase === 'waiting') {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setPhase('idle');
      setMessage(text("common.sideGameHub.tooEarlyTryAgain"));
      return;
    }
    if (phase === 'go') {
      const ms = performance.now() - goAtRef.current;
      const group = [...groupRef.current, ms];
      setSuccessfulCount((count) => count + 1);
      setBest((b) => (b == null ? ms : Math.min(b, ms)));
      setLastMs(ms);
      if (group.length === 3) {
        setLatestAverage(group.reduce((sum, result) => sum + result, 0) / 3);
        groupRef.current = [];
      } else {
        groupRef.current = group;
      }
      setMessage(text("common.sideGameHub.reactionMs", { value1: ms.toFixed(0) }));
      setPhase('idle');
    }
  };

  const handleCancel = () => {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    setPhase('idle');
    setMessage(text("common.sideGameHub.cancelled"));
  };

  const groupNumber = Math.floor(successfulCount / 3) + 1;
  const attemptNumber = successfulCount % 3 + 1;

  return <div className="reaction-game">
    <div className={`reaction-area reaction-${phase}`} role="button" tabIndex="0" onPointerDown={handleDown} onPointerCancel={handleCancel}>
      {phase === 'idle' && <span className="reaction-hint">{successfulCount ? text("common.sideGameHub.pressToTryAgain") : text("common.sideGameHub.pressToStart")}</span>}
      {phase === 'waiting' && <span className="reaction-hint">{text("common.sideGameHub.wait")}</span>}
      {phase === 'go' && <span className="reaction-hint">{text("common.sideGameHub.press")}</span>}
    </div>
    <div className="reaction-stats"><dl><div><dt>{text("common.sideGameHub.latest")}</dt><dd>{lastMs != null ? `${lastMs.toFixed(0)}ms` : '—'}</dd></div><div><dt>{text("common.sideGameHub.best")}</dt><dd>{best != null ? `${best.toFixed(0)}ms` : '—'}</dd></div><div><dt>{text("common.sideGameHub.groupAttempt")}</dt><dd>{groupNumber} / {attemptNumber}</dd></div><div><dt>{text("common.sideGameHub.latest3Avg")}</dt><dd>{latestAverage != null ? `${latestAverage.toFixed(0)}ms` : '—'}</dd></div></dl></div>
    <p className="reaction-msg">{message}</p>
  </div>;
}

export default function SideGameHub({ language = 'zh', stopped = false, manual = false, onClose }) {
  const text = (key, values) => translate(language, key, values);
  const [game, setGame] = useState('reaction');
  const games = [
    { id: 'farkle', label: 'FARKLE' },
    { id: 'reaction', label: text("common.sideGameHub.reaction") },
    { id: 'schulte', label: text("common.sideGameHub.schulte") },
  ];
  return <section className="side-games">
    <header>
      <div className="side-games-tabs">{games.map((g) => <button type="button" key={g.id} className={game === g.id ? 'active' : ''} onClick={() => setGame(g.id)}>{g.label}</button>)}</div>
      <small>{manual ? text("common.sideGameHub.focusTraining") : stopped ? text("common.sideGameHub.parsingStopped2") : text("common.sideGameHub.demoParsing")}</small>
      {onClose && <button type="button" className="farkle-close" aria-label={text("common.sideGameHub.close")} onClick={onClose}>×</button>}
    </header>
    {!manual && !stopped && <p className="parse-foreground-hint">{text("common.sideGameHub.keepThisPageInTheForegroundSwitchingTabsMinimizingThe")}</p>}
    <div className="side-games-body">
      {game === 'farkle' ? <FarkleGame language={language} stopped={stopped} onClose={null} embedded /> : null}
      {game === 'reaction' ? <ReactionGame language={language} stopped={stopped} /> : null}
      {game === 'schulte' ? <SchulteGame language={language} stopped={stopped} /> : null}
    </div>
  </section>;
}
