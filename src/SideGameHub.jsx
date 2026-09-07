import { useEffect, useRef, useState } from 'react';
import FarkleGame from './FarkleGame.jsx';
import { localize } from './i18n.js';

const shuffledNumbers = (size) => {
  const numbers = Array.from({ length: size * size }, (_value, index) => index + 1);
  for (let index = numbers.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [numbers[index], numbers[swapIndex]] = [numbers[swapIndex], numbers[index]];
  }
  return numbers;
};

function SchulteGame({ language, stopped }) {
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
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
      <div><span>{text('网格', 'GRID', 'СЕТКА')}</span>{[3, 4, 5, 6].map((value) => <button type="button" key={value} className={size === value ? 'active' : ''} onClick={() => { setSize(value); reset(value); }}>{value}×{value}</button>)}</div>
      <button type="button" className="schulte-reset" onClick={() => reset()}>{text('重新洗牌', 'RESHUFFLE', 'ПЕРЕМЕШАТЬ')}</button>
    </div>
    <div className="schulte-status"><div><span>{complete ? text('完成', 'COMPLETE', 'ГОТОВО') : text('下一个', 'NEXT', 'ДАЛЕЕ')}</span><strong>{complete ? '✓' : next}</strong></div><div><span>{text('用时', 'TIME', 'ВРЕМЯ')}</span><strong>{(elapsed / 1000).toFixed(2)}s</strong></div><div><span>{text('最佳', 'BEST', 'РЕКОРД')}</span><strong>{bestBySize[size] == null ? '—' : `${(bestBySize[size] / 1000).toFixed(2)}s`}</strong></div></div>
    <div className="schulte-grid" style={{ '--schulte-size': size }}>{numbers.map((number) => <button type="button" key={number} className={`${number < next ? 'done ' : ''}${mistake === number ? 'mistake' : ''}`.trim()} disabled={stopped} onClick={() => choose(number)}>{number}</button>)}</div>
    <p>{stopped ? text('解析已停止。', 'Parsing stopped.', 'Разбор остановлен.') : complete ? text('完成！重新洗牌再来一轮。', 'Complete! Reshuffle for another run.', 'Готово! Перемешайте и попробуйте снова.') : next === 1 ? text('从 1 开始，按顺序找到所有数字。首次点击开始计时。', 'Start at 1 and find every number in order. Timing begins on the first tap.', 'Начните с 1 и найдите все числа по порядку. Таймер запустится при первом нажатии.') : text(`继续寻找 ${next}`, `Find ${next} next`, `Найдите ${next}`)}</p>
  </div>;
}

function ReactionGame({ language, stopped }) {
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  const [phase, setPhase] = useState('idle');
  const [successfulCount, setSuccessfulCount] = useState(0);
  const [best, setBest] = useState(null);
  const [lastMs, setLastMs] = useState(null);
  const [latestAverage, setLatestAverage] = useState(null);
  const [message, setMessage] = useState(() => text('按下开始，等它变绿后再次按下。', 'Press to start, then press again once it turns green.', 'Нажмите для старта, затем нажмите снова, когда поле станет зелёным.'));
  const timeoutRef = useRef(null);
  const goAtRef = useRef(0);
  const groupRef = useRef([]);

  useEffect(() => {
    if (stopped) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setPhase('idle');
      setMessage(text('解析已停止。', 'Parsing stopped.', 'Разбор остановлен.'));
    }
    return () => window.clearTimeout(timeoutRef.current);
  }, [stopped, language]);

  const handleDown = () => {
    if (stopped) return;
    if (phase === 'idle') {
      window.clearTimeout(timeoutRef.current);
      setPhase('waiting');
      setMessage(text('等待变绿… 不要提前按下！', 'Wait for green… do not press early!', 'Ждите зелёного… не нажимайте раньше!'));
      const delay = 700 + Math.random() * 1600;
      timeoutRef.current = window.setTimeout(() => {
        setPhase('go');
        setMessage(text('按下！', 'PRESS!', 'ЖМИТЕ!'));
        goAtRef.current = performance.now();
      }, delay);
      return;
    }
    if (phase === 'waiting') {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setPhase('idle');
      setMessage(text('太早了，再试一次。', 'Too early — try again.', 'Слишком рано — попробуйте ещё раз.'));
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
      setMessage(text(`反应时间 ${ms.toFixed(0)}ms`, `Reaction ${ms.toFixed(0)}ms`, `Реакция: ${ms.toFixed(0)} мс`));
      setPhase('idle');
    }
  };

  const handleCancel = () => {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    setPhase('idle');
    setMessage(text('已取消。', 'Cancelled.', 'Отменено.'));
  };

  const groupNumber = Math.floor(successfulCount / 3) + 1;
  const attemptNumber = successfulCount % 3 + 1;

  return <div className="reaction-game">
    <div className={`reaction-area reaction-${phase}`} role="button" tabIndex="0" onPointerDown={handleDown} onPointerCancel={handleCancel}>
      {phase === 'idle' && <span className="reaction-hint">{successfulCount ? text('按下再试一次', 'Press to try again', 'Нажмите, чтобы повторить') : text('按下开始', 'Press to start', 'Нажмите для старта')}</span>}
      {phase === 'waiting' && <span className="reaction-hint">{text('等待…', 'Wait…', 'Ждите…')}</span>}
      {phase === 'go' && <span className="reaction-hint">{text('按下!', 'PRESS!', 'ЖМИТЕ!')}</span>}
    </div>
    <div className="reaction-stats"><dl><div><dt>{text('最新', 'LATEST', 'ПОСЛЕДНЯЯ')}</dt><dd>{lastMs != null ? `${lastMs.toFixed(0)}ms` : '—'}</dd></div><div><dt>{text('最佳', 'BEST', 'ЛУЧШАЯ')}</dt><dd>{best != null ? `${best.toFixed(0)}ms` : '—'}</dd></div><div><dt>{text('组/次', 'GROUP / ATTEMPT', 'ГРУППА / ПОПЫТКА')}</dt><dd>{groupNumber} / {attemptNumber}</dd></div><div><dt>{text('上组平均', 'LATEST 3 AVG', 'СРЕДНЕЕ ЗА 3')}</dt><dd>{latestAverage != null ? `${latestAverage.toFixed(0)}ms` : '—'}</dd></div></dl></div>
    <p className="reaction-msg">{message}</p>
  </div>;
}

export default function SideGameHub({ language = 'zh', stopped = false, manual = false, onClose }) {
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  const [game, setGame] = useState('reaction');
  const games = [
    { id: 'farkle', label: 'FARKLE' },
    { id: 'reaction', label: text('反应测试', 'REACTION', 'РЕАКЦИЯ') },
    { id: 'schulte', label: text('舒尔特方块', 'SCHULTE', 'ТАБЛИЦА ШУЛЬТЕ') },
  ];
  return <section className="side-games">
    <header>
      <div className="side-games-tabs">{games.map((g) => <button type="button" key={g.id} className={game === g.id ? 'active' : ''} onClick={() => setGame(g.id)}>{g.label}</button>)}</div>
      <small>{manual ? text('专注训练', 'FOCUS TRAINING', 'ТРЕНИРОВКА ВНИМАНИЯ') : stopped ? text('解析已停止', 'Parsing stopped', 'Разбор остановлен') : text('Demo 正在解析', 'Demo parsing', 'Разбор Demo')}</small>
      {onClose && <button type="button" className="farkle-close" aria-label={text('关闭', 'Close', 'Закрыть')} onClick={onClose}>×</button>}
    </header>
    {!manual && !stopped && <p className="parse-foreground-hint">{text('请保持本页在前台；切换标签页、最小化窗口或锁屏可能让解析明显变慢。', 'Keep this page in the foreground; switching tabs, minimizing the window, or locking the screen may significantly slow parsing.', 'Держите эту страницу на переднем плане: переключение вкладок, сворачивание окна или блокировка экрана могут заметно замедлить разбор.')}</p>}
    <div className="side-games-body">
      {game === 'farkle' ? <FarkleGame language={language} stopped={stopped} onClose={null} embedded /> : null}
      {game === 'reaction' ? <ReactionGame language={language} stopped={stopped} /> : null}
      {game === 'schulte' ? <SchulteGame language={language} stopped={stopped} /> : null}
    </div>
  </section>;
}
