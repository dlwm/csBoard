import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import catalog from '../../electron/resource-catalog.json';
import { localize } from '../i18n.js';
import './resourcePack.css';

// Native multi-file selection stays in Electron; the page only receives results,
// never disk paths or the model bytes. Missing entries retain built-in fallbacks.
export default function ResourcePackModal({ language, onClose }) {
  const ref = useRef(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [changed, setChanged] = useState(false);
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  const inspect = () => window.csboardDesktop.resources.status().then(setStatus).catch(error => setError(error.message));
  useEffect(() => { ref.current.showModal(); inspect(); }, []);
  const importFiles = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await window.csboardDesktop.resources.importFiles();
      setStatus(result.status);
      setResults(result.results);
      if (result.results.some(item => item.ok)) setChanged(true);
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  };
  return createPortal(<dialog ref={ref} className="resource-pack-dialog" onClose={onClose} onCancel={event => { if (busy) event.preventDefault(); }} onKeyDown={event => event.stopPropagation()} aria-labelledby="resource-pack-title">
    <header><h2 id="resource-pack-title">{text('资源包', 'Resource pack', 'Пакет ресурсов')}</h2><button type="button" disabled={busy} onClick={onClose}>{text('关闭', 'Close', 'Закрыть')}</button></header>
    <p>{text('多选 SVG 图标和 GLB 地图模型，可分批补齐。同名文件将覆盖已导入版本；无效文件不会替换旧资源。', 'Select multiple SVG icons and GLB maps; partial imports are supported. Matching names replace imported versions; invalid files leave old resources intact.', 'Выберите несколько SVG и GLB; можно добавлять частями. Совпадающие имена заменяют импортированные файлы; ошибки не удаляют старые ресурсы.')}</p>
    <p>{text('缺失图标使用默认 UI；缺失模型仅显示 NAV，不提供模型操作、不自动下载。训练场不需要资源包。模型须使用原地图坐标并内置所需数据。', 'Missing icons use the default UI. Missing models use NAV without model controls or automatic downloads. Training Ground is built in. GLBs must use original map coordinates and embed required data.', 'Для отсутствующих значков используется стандартный UI; без моделей доступна NAV, без управления моделями и загрузок. Учебная карта встроена. GLB должны сохранять координаты карты и содержать необходимые данные.')}</p>
    <div className="resource-pack-actions"><button type="button" disabled={busy} onClick={importFiles}>{busy ? text('正在导入…', 'Importing…', 'Импорт…') : text('选择多个文件导入', 'Import multiple files', 'Импорт файлов')}</button><button type="button" disabled={busy} onClick={inspect}>{text('重新检测', 'Check again', 'Проверить')}</button>{status && <button type="button" disabled={busy} onClick={() => { if (window.confirm(text('重新加载页面以应用资源？请先保存未保存的协作内容。', 'Reload to apply resources? Save unsaved collaboration work first.', 'Перезагрузить для применения? Сначала сохраните совместную работу.'))) location.reload(); }}>{text('重新加载并应用', 'Reload and apply', 'Применить с перезагрузкой')}</button>}</div>
    {changed && <p role="status">{text('资源已保存。重新加载页面后生效，关闭此窗口不会丢失导入结果。', 'Resources saved. Reload the page to apply them; closing this dialog keeps imported files.', 'Ресурсы сохранены. Перезагрузите страницу для применения; закрытие окна не удаляет импорт.')}</p>}
    {error && <p role="alert">{error}</p>}
    {results.length > 0 && <details open><summary>{text('本次导入', 'Import results', 'Результат импорта')} · ✅ {results.filter(item => item.ok).length} · ❌ {results.filter(item => !item.ok).length}</summary><ul>{results.map((item, index) => <li key={index}>{item.ok ? '✅' : '❌'} {item.name}{item.target && item.target !== item.name ? ` → ${item.target}` : ''}{item.error ? ` — ${item.error}` : ''}</li>)}</ul></details>}
    {!status ? <p>{text('正在检测…', 'Checking…', 'Проверка…')}</p> : ['icons', 'models'].map(kind => <details key={kind} open={kind === 'models'}><summary>{kind === 'icons' ? text('UI 图标', 'UI icons', 'Значки UI') : text('地图模型', 'Map models', 'Модели карт')} · {Object.keys(status[kind]).length}/{catalog[kind === 'icons' ? 'icons' : 'maps'].length}</summary><ul className="resource-pack-list">{catalog[kind === 'icons' ? 'icons' : 'maps'].map(key => <li key={key}><span>{status[kind][key] ? '✅' : '⬜'} {key}.{kind === 'icons' ? 'svg' : 'glb'}</span><small>{status[kind][key] === 'local' ? text('本地测试', 'Local test', 'Локальный тест') : !status[kind][key] ? text('未导入', 'Missing', 'Отсутствует') : ''}</small></li>)}</ul></details>)}
  </dialog>, document.body);
}
