import { useEffect, useRef, useState } from 'react';
import FarkleGame from './FarkleGame.jsx';

const shuffledNumbers = (size) => {
  const numbers = Array.from({ length: size * size }, (_value, index) => index + 1);
  for (let index = numbers.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [numbers[index], numbers[swapIndex]] = [numbers[swapIndex], numbers[index]];
  }
  return numbers;
};

function SchulteGame({ zh, stopped }) {
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
      <div><span>{zh ? '网格' : 'GRID'}</span>{[3, 4, 5, 6].map((value) => <button type="button" key={value} className={size === value ? 'active' : ''} onClick={() => { setSize(value); reset(value); }}>{value}×{value}</button>)}</div>
      <button type="button" className="schulte-reset" onClick={() => reset()}>{zh ? '重新洗牌' : 'RESHUFFLE'}</button>
    </div>
    <div className="schulte-status"><div><span>{complete ? zh ? '完成' : 'COMPLETE' : zh ? '下一个' : 'NEXT'}</span><strong>{complete ? '✓' : next}</strong></div><div><span>{zh ? '用时' : 'TIME'}</span><strong>{(elapsed / 1000).toFixed(2)}s</strong></div><div><span>{zh ? '最佳' : 'BEST'}</span><strong>{bestBySize[size] == null ? '—' : `${(bestBySize[size] / 1000).toFixed(2)}s`}</strong></div></div>
    <div className="schulte-grid" style={{ '--schulte-size': size }}>{numbers.map((number) => <button type="button" key={number} className={`${number < next ? 'done ' : ''}${mistake === number ? 'mistake' : ''}`.trim()} disabled={stopped} onClick={() => choose(number)}>{number}</button>)}</div>
    <p>{stopped ? zh ? '解析已停止。' : 'Parsing stopped.' : complete ? zh ? '完成！重新洗牌再来一轮。' : 'Complete! Reshuffle for another run.' : next === 1 ? zh ? '从 1 开始，按顺序找到所有数字。首次点击开始计时。' : 'Start at 1 and find every number in order. Timing begins on the first tap.' : zh ? `继续寻找 ${next}` : `Find ${next} next`}</p>
  </div>;
}

function ReactionGame({ zh, stopped }) {
  const [phase, setPhase] = useState('idle');
  const [successfulCount, setSuccessfulCount] = useState(0);
  const [best, setBest] = useState(null);
  const [lastMs, setLastMs] = useState(null);
  const [latestAverage, setLatestAverage] = useState(null);
  const [message, setMessage] = useState(zh ? '按下开始，等它变绿后再次按下。' : 'Press to start, then press again once it turns green.');
  const timeoutRef = useRef(null);
  const goAtRef = useRef(0);
  const groupRef = useRef([]);

  useEffect(() => {
    if (stopped) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setPhase('idle');
      setMessage(zh ? '解析已停止。' : 'Parsing stopped.');
    }
    return () => window.clearTimeout(timeoutRef.current);
  }, [stopped, zh]);

  const handleDown = () => {
    if (stopped) return;
    if (phase === 'idle') {
      window.clearTimeout(timeoutRef.current);
      setPhase('waiting');
      setMessage(zh ? '等待变绿… 不要提前按下！' : 'Wait for green… do not press early!');
      const delay = 700 + Math.random() * 1600;
      timeoutRef.current = window.setTimeout(() => {
        setPhase('go');
        setMessage(zh ? '按下！' : 'PRESS!');
        goAtRef.current = performance.now();
      }, delay);
      return;
    }
    if (phase === 'waiting') {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setPhase('idle');
      setMessage(zh ? '太早了，再试一次。' : 'Too early — try again.');
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
      setMessage(zh ? `反应时间 ${ms.toFixed(0)}ms` : `Reaction ${ms.toFixed(0)}ms`);
      setPhase('idle');
    }
  };

  const handleCancel = () => {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    setPhase('idle');
    setMessage(zh ? '已取消。' : 'Cancelled.');
  };

  const groupNumber = Math.floor(successfulCount / 3) + 1;
  const attemptNumber = successfulCount % 3 + 1;

  return <div className="reaction-game">
    <div className={`reaction-area reaction-${phase}`} role="button" tabIndex="0" onPointerDown={handleDown} onPointerCancel={handleCancel}>
      {phase === 'idle' && <span className="reaction-hint">{successfulCount ? (zh ? '按下再试一次' : 'Press to try again') : (zh ? '按下开始' : 'Press to start')}</span>}
      {phase === 'waiting' && <span className="reaction-hint">{zh ? '等待…' : 'Wait…'}</span>}
      {phase === 'go' && <span className="reaction-hint">{zh ? '按下!' : 'PRESS!'}</span>}
    </div>
    <div className="reaction-stats"><dl><div><dt>{zh ? '最新' : 'LATEST'}</dt><dd>{lastMs != null ? `${lastMs.toFixed(0)}ms` : '—'}</dd></div><div><dt>{zh ? '最佳' : 'BEST'}</dt><dd>{best != null ? `${best.toFixed(0)}ms` : '—'}</dd></div><div><dt>{zh ? '组/次' : 'GROUP / ATTEMPT'}</dt><dd>{groupNumber} / {attemptNumber}</dd></div><div><dt>{zh ? '上组平均' : 'LATEST 3 AVG'}</dt><dd>{latestAverage != null ? `${latestAverage.toFixed(0)}ms` : '—'}</dd></div></dl></div>
    <p className="reaction-msg">{message}</p>
  </div>;
}

export default function SideGameHub({ language = 'zh', stopped = false, manual = false, onClose }) {
  const zh = language === 'zh';
  const [game, setGame] = useState('reaction');
  const games = [
    { id: 'farkle', label: 'FARKLE' },
    { id: 'reaction', label: zh ? '反应测试' : 'REACTION' },
    { id: 'schulte', label: zh ? '舒尔特方块' : 'SCHULTE' },
  ];
  return <section className="side-games">
    <header>
      <div className="side-games-tabs">{games.map((g) => <button type="button" key={g.id} className={game === g.id ? 'active' : ''} onClick={() => setGame(g.id)}>{g.label}</button>)}</div>
      <small>{manual ? zh ? '专注训练' : 'FOCUS TRAINING' : stopped ? zh ? '解析已停止' : 'Parsing stopped' : zh ? '解析在后台继续' : 'Parsing continues in background'}</small>
      {onClose && <button type="button" className="farkle-close" aria-label={zh ? '关闭' : 'Close'} onClick={onClose}>×</button>}
    </header>
    <div className="side-games-body">
      {game === 'farkle' ? <FarkleGame language={language} stopped={stopped} onClose={null} embedded /> : null}
      {game === 'reaction' ? <ReactionGame zh={zh} stopped={stopped} /> : null}
      {game === 'schulte' ? <SchulteGame zh={zh} stopped={stopped} /> : null}
    </div>
  </section>;
}
