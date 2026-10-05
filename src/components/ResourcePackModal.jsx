import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import catalog from '../resources/catalog.json';
import { getPlatform } from '../platform/index.js';
import { markResourcesChanged, resourceReloadPending } from '../app/resourcePacks.js';
import { localize } from '../i18n.js';
import './resourcePack.css';
import GameResourceImport from './GameResourceImport.jsx';

export default function ResourcePackModal({ language, onClose }) {
  const ref = useRef(null);
  const mounted = useRef(false);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [kind, setKind] = useState('models');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [changed, setChanged] = useState(resourceReloadPending);
  const [gameOpen, setGameOpen] = useState(false);
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  const resources = getPlatform().resources;
  const inspect = async () => {
    setChecking(true);
    setError('');
    try { const value = await resources.status(); if (mounted.current) setStatus(value); }
    catch (error) { if (mounted.current) setError(error.message); }
    finally { if (mounted.current) setChecking(false); }
  };
  useEffect(() => {
    mounted.current = true;
    ref.current.showModal();
    inspect();
    return () => { mounted.current = false; };
  }, []);
  const importFiles = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await resources.importFiles();
      if (!mounted.current) return;
      setStatus(result.status);
      setResults(result.results);
      if (result.results.some(item => item.ok)) { markResourcesChanged(); setChanged(true); }
    } catch (error) { if (mounted.current) setError(error.message); }
    finally { if (mounted.current) setBusy(false); }
  };
  const removeResource = async key => {
    if (!window.confirm(text(`移除 ${key}？重新加载后将使用默认图标或 NAV 地图。`, `Remove ${key}? Reload to use the default icon or NAV map.`, `Удалить ${key}? После перезагрузки будет использован стандартный значок или NAV.`))) return;
    setBusy(true); setError('');
    try {
      const result = await resources.remove(kind, key);
      if (!mounted.current) return;
      setStatus(result.status);
      markResourcesChanged(); setChanged(true);
    } catch (error) { if (mounted.current) setError(error.message); }
    finally { if (mounted.current) setBusy(false); }
  };
  const keys = catalog[kind === 'icons' ? 'icons' : 'maps'];
  const entries = useMemo(() => keys.filter(key => {
    const installed = Boolean(status?.[kind]?.[key]);
    return key.includes(query.trim().toLowerCase()) && (filter === 'all' || (filter === 'installed' ? installed : !installed));
  }), [keys, kind, status, query, filter]);
  const installedCount = keys.filter(key => status?.[kind]?.[key]).length;
  const succeeded = results.filter(item => item.ok).length;
  const reload = () => {
    if (window.confirm(text('重新加载以应用资源？请先保存未保存的协作内容。', 'Reload to apply resources? Save unsaved collaboration work first.', 'Перезагрузить для применения? Сначала сохраните совместную работу.'))) location.reload();
  };
  return createPortal(<dialog ref={ref} className="resource-pack-dialog" onClose={onClose} onCancel={event => { if (busy) event.preventDefault(); }} onKeyDown={event => event.stopPropagation()} aria-labelledby="resource-pack-title">
    <header className="resource-pack-header">
      <div><small>CSBOARD / RESOURCES</small><h2 id="resource-pack-title">{text('资源管理', 'Resource library', 'Библиотека ресурсов')}</h2></div>
      <button className="resource-pack-close" type="button" disabled={busy} onClick={onClose} aria-label={text('关闭', 'Close', 'Закрыть')}>×</button>
    </header>
    <div className="resource-pack-body">
      <nav className="resource-pack-nav" aria-label={text('资源类型', 'Resource type', 'Тип ресурсов')}>
        {['models', 'icons'].map(value => <button key={value} type="button" aria-pressed={kind === value} onClick={() => { setKind(value); setQuery(''); }}>
          <span>{value === 'models' ? text('地图模型', 'Map models', 'Модели карт') : text('界面图标', 'UI icons', 'Значки UI')}</span>
          <b>{status ? catalog[value === 'models' ? 'maps' : 'icons'].filter(key => status[value]?.[key]).length : '—'}<small> / {catalog[value === 'models' ? 'maps' : 'icons'].length}</small></b>
          <i>{value === 'models' ? 'GLB' : 'SVG'}</i>
        </button>)}
        <p>{text('按需补齐，支持分批导入。', 'Add resources as you need them.', 'Добавляйте ресурсы по мере необходимости.')}</p>
      </nav>
      <section className="resource-pack-content" aria-busy={busy || checking}>
        <div className="resource-pack-section-heading"><h3>{kind === 'models' ? text('地图模型', 'Map models', 'Модели карт') : text('界面图标', 'UI icons', 'Значки UI')}</h3><span>{status ? `${installedCount} / ${keys.length}` : '—'}</span></div>
        <p className="resource-pack-hint">{kind === 'models'
          ? text('未导入的地图仍可使用 NAV。模型需保留原地图坐标并内置数据；训练场已内置。', 'Maps without models use NAV. GLBs need original map coordinates and embedded data. Training Ground is built in.', 'Без моделей используется NAV. GLB должны сохранять координаты карты и содержать данные. Учебная карта встроена.')
          : text('未导入的图标使用默认样式。导入文件名需与下方名称对应。', 'Missing icons use the default style. Match filenames to the names below.', 'Для отсутствующих значков используется стандартный стиль. Имена файлов указаны ниже.')}</p>
        {changed && <div className="resource-pack-apply-notice" role="status">
          <div><strong>{text('资源已更改，尚未应用', 'Resources changed; not yet applied', 'Ресурсы изменены, но ещё не применены')}</strong><p>{text('建议重启应用，也可重新加载立即应用。请先保存未保存的协作内容。', 'Restart the app, or reload to apply now. Save unsaved collaboration work first.', 'Перезапустите приложение или перезагрузите для применения сейчас. Сначала сохраните совместную работу.')}</p></div>
          <button type="button" disabled={busy} onClick={reload}>{text('重新加载并应用', 'Reload and apply', 'Применить')}</button>
        </div>}
        {gameOpen && <GameResourceImport api={resources.game} language={language} onBusy={setBusy} onImported={result => {
          setStatus(result.status); setResults(result.results);
          if (result.results.some(item => item.ok)) { markResourcesChanged(); setChanged(true); }
        }} />}
        <div className="resource-pack-toolbar">
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={text('搜索文件名…', 'Search filenames…', 'Поиск файлов…')} aria-label={text('搜索资源', 'Search resources', 'Поиск ресурсов')} />
          <select value={filter} onChange={event => setFilter(event.target.value)} aria-label={text('导入状态', 'Import status', 'Статус импорта')}>
            <option value="all">{text('全部', 'All', 'Все')}</option><option value="installed">{text('已就绪', 'Ready', 'Готово')}</option><option value="missing">{text('未导入', 'Missing', 'Отсутствует')}</option>
          </select>
          <button type="button" disabled={busy || checking} onClick={inspect}>{text('刷新', 'Refresh', 'Обновить')}</button>
        </div>
        {error && <p className="resource-pack-error" role="alert">{error}</p>}
        <div className="resource-pack-scroll">
          {!status ? <p className="resource-pack-empty">{checking ? text('正在读取资源…', 'Loading resources…', 'Загрузка ресурсов…') : text('无法读取资源，请重试。', 'Unable to load resources. Try again.', 'Не удалось загрузить ресурсы. Повторите попытку.')}</p> : <ul className={`resource-pack-list resource-pack-${kind}`}>
            {entries.map(key => <li key={key} data-installed={Boolean(status[kind]?.[key])}>
              <span className="resource-pack-mark" aria-hidden="true">{kind === 'icons' && status.icons[key] ? <img src={`/resource-pack/icons/${key}.svg`} alt="" /> : kind === 'models' ? '◇' : '◈'}</span>
              <div><strong>{key}</strong><small>{key}.{kind === 'icons' ? 'svg' : 'glb'}</small></div>
              <span className="resource-pack-badge">{status[kind]?.[key] === 'local' ? text('本地测试', 'Local test', 'Локальный') : status[kind]?.[key] ? text('已就绪', 'Ready', 'Готово') : text('未导入', 'Missing', 'Нет')}</span>
              {resources.remove && status[kind]?.[key] && status[kind][key] !== 'local' && <button className="resource-pack-remove" type="button" disabled={busy || checking} aria-label={text(`移除 ${key}`, `Remove ${key}`, `Удалить ${key}`)} onClick={() => removeResource(key)}>{text('移除', 'Remove', 'Удалить')}</button>}
            </li>)}
          </ul>}
          {status && !entries.length && <p className="resource-pack-empty">{text('没有匹配的资源', 'No matching resources', 'Ресурсы не найдены')}</p>}
        </div>
        {results.length > 0 && <details className="resource-pack-results" open={succeeded !== results.length}>
          <summary>{text('本次导入', 'Import results', 'Результат импорта')} · {text(`${succeeded} 成功 / ${results.length - succeeded} 未导入`, `${succeeded} imported / ${results.length - succeeded} skipped`, `${succeeded} импортировано / ${results.length - succeeded} пропущено`)}</summary>
          <ul>{results.map((item, index) => <li key={index} data-success={item.ok}><b>{item.ok ? text('已导入', 'Imported', 'Готово') : text('未导入', 'Skipped', 'Пропущено')}</b><span>{item.name}{item.target && item.target !== item.name ? ` → ${item.target}` : ''}{item.error ? ` — ${item.error}` : ''}</span></li>)}</ul>
        </details>}
      </section>
    </div>
    <footer className="resource-pack-footer">
      <p role="status">{changed ? text('资源已更改，重新加载后生效。', 'Resources changed. Reload to apply.', 'Ресурсы изменены. Перезагрузите для применения.') : text('同名文件验证通过后覆盖。支持多选 SVG / GLB。', 'Validated files replace matching names. Select multiple SVG / GLB files.', 'Проверенные файлы заменяют одноимённые. Можно выбрать несколько SVG / GLB.')}</p>
      <div>{changed && <button type="button" disabled={busy} onClick={reload}>{text('重新加载并应用', 'Reload and apply', 'Применить')}</button>}{resources.game && <button type="button" disabled={busy || checking} aria-expanded={gameOpen} onClick={() => setGameOpen(value => !value)}>{text('导入游戏资源包', 'Import game resources', 'Импорт ресурсов игры')}</button>}<button className="resource-pack-primary" type="button" disabled={busy || checking} onClick={importFiles}>{busy ? text('正在导入…', 'Importing…', 'Импорт…') : text('＋ 导入资源', '＋ Import resources', '＋ Импорт')}</button></div>
    </footer>
  </dialog>, document.body);
}
