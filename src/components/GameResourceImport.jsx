import { useEffect, useRef, useState } from 'react';
import { localize } from '../i18n.js';

const formatBytes = value => `${((value || 0) / 1024 ** 3).toFixed(1)} GB`;
const runningPhases = new Set(['preparing', 'extracting', 'converting', 'importing', 'cleaning']);
export default function GameResourceImport({ api, language, onBusy, onImported }) {
  const [installations, setInstallations] = useState([]);
  const [selected, setSelected] = useState('');
  const [maps, setMaps] = useState([]);
  const [icons, setIcons] = useState(true);
  const [estimate, setEstimate] = useState(null);
  const [progress, setProgress] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(false), seenCompletion = useRef(-1);
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  const installation = installations.find(item => item.id === selected);
  const active = runningPhases.has(progress?.phase);
  const importedCallback = useRef(onImported); importedCallback.current = onImported;
  const setInstallation = item => { setSelected(item.id); setMaps(item.maps.map(map => map.key)); setEstimate(null); };
  const detect = async () => {
    setChecking(true); setError('');
    try {
      const items = await api.detect();
      if (!alive.current) return;
      setInstallations(items);
      if (items.length) setInstallation(items[0]);
      else { setSelected(''); setMaps([]); }
    } catch (error) { if (alive.current) setError(error.message); }
    finally { if (alive.current) setChecking(false); }
  };
  useEffect(() => {
    alive.current = true;
    const accept = (value, notify = true) => {
      if (!alive.current) return;
      setProgress(previous => !previous || value.revision >= previous.revision ? value : previous);
      if (notify && ['complete', 'cancelled', 'failed'].includes(value.phase) && value.status && seenCompletion.current < value.revision) {
        seenCompletion.current = value.revision;
        importedCallback.current({ status: value.status, results: value.results });
      }
    };
    const off = api.subscribe(accept);
    api.status().then(value => { accept(value, false); if (!runningPhases.has(value.phase)) detect(); }).catch(error => { if (alive.current) setError(error.message); });
    return () => { alive.current = false; off(); };
  }, [api]);
  useEffect(() => { onBusy(active); return () => onBusy(false); }, [active, onBusy]);
  const selectionKey = JSON.stringify({ installationId: selected, maps, icons });
  useEffect(() => {
    let current = true;
    setEstimate(null);
    if (active || !selected || (!maps.length && !icons)) return undefined;
    api.estimate(JSON.parse(selectionKey)).then(value => { if (current) setEstimate({ ...value, key: selectionKey }); }).catch(error => { if (current) setError(error.message); });
    return () => { current = false; };
  }, [api, selectionKey, active]);
  const choose = async () => {
    setChecking(true); setError('');
    try {
      const item = await api.choose();
      if (item && alive.current) { setInstallations(current => [...current.filter(value => value.id !== item.id), item]); setInstallation(item); }
    } catch (error) { if (alive.current) setError(error.message); }
    finally { if (alive.current) setChecking(false); }
  };
  const start = async () => {
    setError(''); setChecking(true);
    try { await api.start(JSON.parse(selectionKey)); }
    catch (error) { if (alive.current) setError(error.message); }
    finally { if (alive.current) setChecking(false); }
  };
  const phases = {
    preparing: text('准备导入', 'Preparing import', 'Подготовка импорта'),
    extracting: text('正在提取', 'Extracting', 'Извлечение'),
    converting: text('正在转换', 'Converting', 'Преобразование'),
    importing: text('校验并保存', 'Validating and saving', 'Проверка и сохранение'),
    cleaning: text('清理临时文件', 'Cleaning temporary files', 'Удаление временных файлов'),
    complete: text('导入完成', 'Import finished', 'Импорт завершён'),
    cancelled: text('已取消，已保存的资源保留', 'Cancelled; imported resources are kept', 'Отменено; сохранённые ресурсы остаются'),
    failed: text('导入未完成', 'Import did not finish', 'Импорт не завершён'),
  };
  const phaseErrors = {
    space: text('磁盘空间不足，请释放空间后重试。', 'Free more disk space and retry.', 'Освободите место и повторите.'),
    timeout: text('转换超时，建议减少所选地图后重试。', 'Conversion timed out. Select fewer maps and retry.', 'Время истекло. Выберите меньше карт.'),
  };
  return <section className="game-resource-import" aria-busy={active || checking}>
    <header><h3>{text('导入游戏资源包', 'Import game resources', 'Импорт ресурсов игры')}</h3><div><button disabled={active || checking} onClick={detect}>{text('重新检测', 'Detect again', 'Найти снова')}</button><button disabled={active || checking} onClick={choose}>{text('选择游戏目录…', 'Choose game folder…', 'Выбрать папку игры…')}</button></div></header>
    <p>{text('读取 Steam 安装信息和 CS2 资源，不修改游戏文件。地图移除贴图并统一简洁显示，结果保存到 CSBoard 数据目录。', 'Reads Steam installation information and CS2 resources without changing game files. Map textures are removed for a simplified display; resources are saved in CSBoard’s data folder.', 'Читает сведения об установке Steam и ресурсы CS2, не меняя файлы игры. Текстуры карт удаляются для упрощённого вида; результаты сохраняются в папке данных CSBoard.')}</p>
    {checking && !active && <p role="status">{text('正在检查…', 'Checking…', 'Проверка…')}</p>}
    {!checking && !installations.length && !active && <p>{text('未找到可用的 CS2 资源，可手动选择游戏目录；macOS 可选择复制过来的 CS2 目录。', 'No CS2 resources found. Choose a game folder manually; on macOS you can select a copied CS2 folder.', 'Ресурсы CS2 не найдены. Выберите папку вручную; на macOS можно выбрать скопированную папку CS2.')}</p>}
    {installations.length > 0 && <>
      <label className="game-installation-select">{text('读取目录', 'Source folder', 'Исходная папка')}<select disabled={active || checking} value={selected} onChange={event => setInstallation(installations.find(item => item.id === event.target.value))}>{installations.map(item => <option key={item.id} value={item.id}>{item.directory}</option>)}</select></label>
      <fieldset disabled={active || checking}><legend>{text('选择资源', 'Select resources', 'Выберите ресурсы')}</legend><label><input type="checkbox" checked={icons} onChange={event => setIcons(event.target.checked)} />{text('界面图标', 'UI icons', 'Значки интерфейса')}</label><div className="game-map-selection">{installation?.maps.map(item => <label key={item.key}><input type="checkbox" checked={maps.includes(item.key)} onChange={event => setMaps(current => event.target.checked ? [...current, item.key] : current.filter(key => key !== item.key))} />{item.key}</label>)}</div></fieldset>
      {estimate && <div className="game-import-space"><span>{text('建议预留', 'Recommended free space', 'Рекомендуется свободно')}: <b>{formatBytes(estimate.requiredBytes)}</b></span><span>{text('数据盘可用', 'Available on data disk', 'Доступно на диске данных')}: <b>{formatBytes(estimate.availableBytes)}</b></span><small>{text('含临时转换空间，实际占用以结果为准。', 'Includes temporary conversion files; final size may differ.', 'Включает временные файлы; итоговый размер может отличаться.')}</small></div>}
      {estimate && estimate.availableBytes < estimate.requiredBytes && <p className="resource-pack-error">{phaseErrors.space}</p>}
    </>}
    {(active || progress?.total > 0) && <div className="game-import-progress" role="status" aria-live="polite"><div><strong>{phases[progress.phase]}</strong><span>{progress.current === 'icons' ? text('界面图标', 'UI icons', 'Значки интерфейса') : progress.current} · {progress.completed} / {progress.total}</span></div><progress max={progress.total || 1} value={progress.completed || 0} aria-label={text('总进度', 'Overall progress', 'Общий ход')} />{active && <div className="game-import-current"><progress aria-label={text('当前步骤', 'Current step', 'Текущий этап')} />{progress.filesTotal > 1 && <span>{progress.filesCompleted} / {progress.filesTotal} {text('文件', 'files', 'файлов')}</span>}</div>}</div>}
    {(error || progress?.error) && <p className="resource-pack-error" role="alert">{error || phaseErrors[progress.error.code] || progress.error.message}</p>}
    <div className="game-import-actions">{active ? <button onClick={() => api.cancel().catch(error => setError(error.message))}>{text('取消导入', 'Cancel import', 'Отменить импорт')}</button> : <button className="resource-pack-primary" disabled={checking || !estimate || estimate.key !== selectionKey || estimate.availableBytes < estimate.requiredBytes} onClick={start}>{text('开始导入', 'Start import', 'Начать импорт')}</button>}</div>
  </section>;
}
