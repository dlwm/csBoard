import { useEffect, useRef, useState } from 'react';
import FarkleGame from './FarkleGame.jsx';

function ReactionGame({ zh, stopped }) {
  const [phase, setPhase] = useState('idle');
  const [successfulCount, setSuccessfulCount] = useState(0);
  const [best, setBest] = useState(null);
  const [lastMs, setLastMs] = useState(null);
  const [latestAverage, setLatestAverage] = useState(null);
  const [message, setMessage] = useState(zh ? '按下开始，等它变绿后松开。' : 'Press to start, release once it turns green.');
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

  const handleDown = (event) => {
    if (stopped) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (phase === 'idle') {
      window.clearTimeout(timeoutRef.current);
      setPhase('waiting');
      setMessage(zh ? '按住… 变绿时立即松开！' : 'Hold… release the instant it turns green!');
      const delay = 700 + Math.random() * 1600;
      timeoutRef.current = window.setTimeout(() => {
        setPhase('go');
        setMessage(zh ? '松开！' : 'RELEASE!');
        goAtRef.current = performance.now();
      }, delay);
    }
  };

  const handleUp = () => {
    if (stopped) return;
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
    <div className={`reaction-area reaction-${phase}`} role="button" tabIndex="0" onPointerDown={handleDown} onPointerUp={handleUp} onPointerCancel={handleCancel}>
      {phase === 'idle' && <span className="reaction-hint">{successfulCount ? (zh ? '按下再试一次' : 'Press to try again') : (zh ? '按下开始' : 'Press to start')}</span>}
      {phase === 'waiting' && <span className="reaction-hint">{zh ? '按住…' : 'Hold…'}</span>}
      {phase === 'go' && <span className="reaction-hint">{zh ? '松开!' : 'RELEASE!'}</span>}
    </div>
    <div className="reaction-stats"><dl><div><dt>{zh ? '最新' : 'LATEST'}</dt><dd>{lastMs != null ? `${lastMs.toFixed(0)}ms` : '—'}</dd></div><div><dt>{zh ? '最佳' : 'BEST'}</dt><dd>{best != null ? `${best.toFixed(0)}ms` : '—'}</dd></div><div><dt>{zh ? '组/次' : 'GROUP / ATTEMPT'}</dt><dd>{groupNumber} / {attemptNumber}</dd></div><div><dt>{zh ? '上组平均' : 'LATEST 3 AVG'}</dt><dd>{latestAverage != null ? `${latestAverage.toFixed(0)}ms` : '—'}</dd></div></dl></div>
    <p className="reaction-msg">{message}</p>
  </div>;
}

export default function SideGameHub({ language = 'zh', stopped = false, onClose }) {
  const zh = language === 'zh';
  const [game, setGame] = useState('reaction');
  const games = [
    { id: 'farkle', label: 'FARKLE' },
    { id: 'reaction', label: zh ? '反应测试' : 'REACTION' },
  ];
  return <section className="side-games">
    <header>
      <div className="side-games-tabs">{games.map((g) => <button type="button" key={g.id} className={game === g.id ? 'active' : ''} onClick={() => setGame(g.id)}>{g.label}</button>)}</div>
      <small>{stopped ? zh ? '解析已停止' : 'Parsing stopped' : zh ? '解析在后台继续' : 'Parsing continues in background'}</small>
      {onClose && <button type="button" className="farkle-close" aria-label={zh ? '关闭' : 'Close'} onClick={onClose}>×</button>}
    </header>
    <div className="side-games-body">
      {game === 'farkle' ? <FarkleGame language={language} stopped={stopped} onClose={null} embedded /> : null}
      {game === 'reaction' ? <ReactionGame zh={zh} stopped={stopped} /> : null}
    </div>
  </section>;
}
