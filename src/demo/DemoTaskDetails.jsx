import { conciseDemoError } from './diagnostics.js';
import { useState } from 'react';
import { formatBytes } from '../components/ModelLoadIndicator.jsx';
import { localize } from '../i18n.js';

const phases = {
  source: ['读取文件', 'Read files', 'Чтение файлов'],
  input: ['检查文件', 'Inspect input', 'Проверка файлов'],
  parser: ['初始化解析器', 'Initialize parser', 'Запуск парсера'],
  wasm: ['初始化解析器', 'Initialize parser', 'Запуск парсера'],
  configure: ['配置解析器', 'Configure parser', 'Настройка парсера'],
  grenades: ['解析道具轨迹', 'Parse utility trajectories', 'Разбор траекторий гранат'],
  prepareTicks: ['准备人员数据', 'Prepare player data', 'Подготовка данных игроков'],
  header: ['读取 Demo 信息', 'Read Demo header', 'Чтение заголовка'],
  events: ['解析事件与道具', 'Parse events and utilities', 'Разбор событий и гранат'],
  ticks: ['解析回合与人员', 'Parse rounds and players', 'Разбор раундов и игроков'],
  analysis: ['生成分析数据', 'Build analysis data', 'Подготовка анализа'],
};

export default function DemoTaskDetails({ task, batch, language }) {
  const [mode, setMode] = useState('display');
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  const phaseName = phase => {
    const labels = phases[phase];
    return labels ? text(...labels) : text('其他阶段', 'Other stage', 'Другой этап');
  };
  const result = task.summary || {};
  const diagnostic = task.diagnostic || {};
  const elapsed = result.elapsedMs ?? diagnostic.elapsedMs ?? (task.finishedAt && task.startedAt ? Date.parse(task.finishedAt) - Date.parse(task.startedAt) : null);
  const seconds = value => `${(Number(value) / 1000).toFixed(1)} s`;
  const count = value => Array.isArray(value) ? value.length : value;
  const rows = [
    [text('解析耗时', 'Parsing time', 'Время разбора'), elapsed == null ? null : seconds(elapsed)],
    [text('地图', 'Map', 'Карта'), result.map],
    [text('源文件大小', 'Source size', 'Размер файлов'), formatBytes(task.sourceBytes)],
    [text('结果大小（估算）', 'Estimated result size', 'Оценка размера результата'), result.estimatedOutputBytes == null ? null : formatBytes(result.estimatedOutputBytes)],
    [text('采样频率', 'Sampling rate', 'Частота выборки'), diagnostic.input?.sampleRate == null ? null : `${diagnostic.input.sampleRate} Hz`],
    [text('回合', 'Rounds', 'Раунды'), result.rounds],
    [text('选手', 'Players', 'Игроки'), count(result.players)],
    [text('击杀事件', 'Kill events', 'События убийств'), result.kills],
    [text('伤害事件', 'Damage events', 'События урона'), result.damageEvents],
    [text('已保存回合', 'Rounds saved', 'Сохранено раундов'), task.cachedRounds],
    [text('解析线程', 'Parser threads', 'Потоки разбора'), task.allocation?.threads],
    [text('解析器内存峰值', 'Parser peak memory', 'Пиковая память парсера'), result.performance?.nativePeakBytes == null ? null : formatBytes(result.performance.nativePeakBytes)],
    [text('缓存进程内存峰值', 'Cache process peak memory', 'Пиковая память процесса кэша'), result.performance?.workerPeakBytes == null ? null : formatBytes(result.performance.workerPeakBytes)],
  ].filter(([, value]) => value != null && value !== '');
  const failure = diagnostic.failure?.parser || diagnostic.failure;
  const timings = [...(diagnostic.phases || []).filter(phase => phase.elapsedMs != null),
    ...Object.entries(result.performance?.timings || {}).map(([phase, timing]) => ({ phase, ...timing }))];
  const raw = { batchId: batch.id, startedAt: batch.startedAt, finishedAt: batch.finishedAt, concurrency: batch.concurrency, environment: batch.environment,
    task: { id: task.id, label: task.label, status: task.status, attempt: task.attempt || 1, startedAt: task.startedAt, finishedAt: task.finishedAt,
      allocation: task.allocation, error: task.error, diagnostic: task.diagnostic, result: task.summary } };
  return <details className="demo-task-details">
    <summary>{text('解析详情', 'Parsing details', 'Подробности разбора')}</summary>
    <div className="demo-detail-modes" aria-label={text('详情展示方式', 'Details view', 'Вид подробностей')}>
      <button type="button" aria-pressed={mode === 'display'} onClick={() => setMode('display')}>{text('展示', 'Display', 'Обзор')}</button>
      <button type="button" aria-pressed={mode === 'json'} onClick={() => setMode('json')}>JSON</button>
    </div>
    {mode === 'json' ? <pre>{JSON.stringify(raw, null, 2)}</pre> : <div className="demo-detail-display">
      <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {failure?.phase && <p className="error">{text('失败阶段：', 'Failed stage: ', 'Этап сбоя: ')}{phaseName(failure.phase)}</p>}
      {task.error && <p className="error">{conciseDemoError(task.error.message)}</p>}
      {!!result.warnings?.length && <ul>{result.warnings.map((warning, index) => <li key={index}>{typeof warning === 'string' ? warning : warning.message || warning.code || text('解析器警告', 'Parser warning', 'Предупреждение парсера')}</li>)}</ul>}
      {!!timings.length && <section><h4>{text('阶段耗时', 'Stage timings', 'Время этапов')}</h4><dl>{timings.map((phase, index) => <div key={index}><dt>{phaseName(phase.phase)}</dt><dd>{seconds(phase.elapsedMs)}</dd></div>)}</dl></section>}
    </div>}
  </details>;
}
