import { useState } from 'react';
import { localize } from '../i18n.js';
import { getPlatform } from '../platform/index.js';
import useDesktopUpdateState from './useDesktopUpdateState.js';

export default function DesktopUpdates({ language, working }) {
  const { api, state, error: statusError } = useDesktopUpdateState();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  const run = async action => {
    setPending(true); setError('');
    try { await action(); }
    catch (error) { setError(error.message); }
    finally { setPending(false); }
  };
  const phase = state?.phase || 'idle';
  const busy = ['checking', 'downloading', 'verifying', 'installing'].includes(phase);
  const labels = {
    idle: text('尚未检查更新', 'Updates have not been checked', 'Обновления ещё не проверены'),
    checking: text('正在检查更新…', 'Checking for updates…', 'Проверка обновлений…'),
    current: text('已是最新版本', 'You are up to date', 'Установлена последняя версия'),
    available: text('发现新版本', 'An update is available', 'Доступна новая версия'),
    downloading: text('正在下载…', 'Downloading…', 'Загрузка…'),
    verifying: text('正在校验更新文件…', 'Verifying the download…', 'Проверка файла…'),
    ready: text('更新已下载', 'The update is ready', 'Обновление загружено'),
    installing: text('正在打开安装程序…', 'Opening the installer…', 'Запуск установщика…'),
    error: text('更新未完成，可以重试', 'The update could not be completed; please retry', 'Обновление не завершено; повторите попытку'),
  };
  const errorLabels = {
    network: text('连接更新服务失败，请检查网络后重试。', 'Could not reach the update service. Check your connection and retry.', 'Не удалось подключиться к серверу обновлений. Проверьте сеть.'),
    metadata: text('发布信息不完整，请稍后重试。', 'Release information is invalid. Please try again later.', 'Некорректные сведения о выпуске. Повторите позже.'),
    incomplete: text('该版本的安装包尚未准备好，请稍后重试。', 'This release is missing its installer. Please try again later.', 'Установщик выпуска ещё не готов. Повторите позже.'),
    checksum: text('文件校验失败，请重新下载。', 'Verification failed. Download the update again.', 'Проверка не пройдена. Загрузите обновление заново.'),
    tasks: text('请等待后台任务完成，再安装更新。', 'Wait for background tasks before installing.', 'Дождитесь завершения фоновых задач.'),
    install: text('无法打开安装程序，请重试。', 'Could not open the installer. Please retry.', 'Не удалось открыть установщик. Повторите попытку.'),
  };
  return <section className="desktop-updates" aria-busy={busy}>
    <h3>{text('应用更新', 'Application updates', 'Обновления приложения')}</h3>
    <div className="desktop-update-version"><span>{text('当前版本', 'Current version', 'Текущая версия')}</span><strong>{state?.currentVersion || '—'}</strong>{state?.latestVersion && <><span>{text('新版本', 'New version', 'Новая версия')}</span><strong>{state.latestVersion}</strong></>}</div>
    <p role="status" aria-live="polite">{labels[phase]}</p>
    {state && !state.enabled && <p>{text('开发运行不安装更新，请使用正式桌面安装包。', 'Updates are available in the packaged desktop app.', 'Обновления доступны в установленном приложении.')}</p>}
    {(error || statusError || state?.error) && <p className="resource-pack-error" role="alert">{error || statusError || errorLabels[state.error.code] || state.error.message}</p>}
    <label className="desktop-awake"><input type="checkbox" checked={state?.autoCheck ?? true} disabled={!state || pending} onChange={event => { const autoCheck = event.target.checked; run(() => api.preferences({ autoCheck })); }} />{text('启动后自动检查更新', 'Check for updates after startup', 'Проверять обновления при запуске')}</label>
    {['downloading', 'verifying', 'ready'].includes(phase) && <div className="desktop-update-progress"><progress max="100" value={state?.progress || 0} aria-label={text('更新下载进度', 'Update download progress', 'Ход загрузки обновления')} /><span>{Math.floor(state?.progress || 0)}% · {((state?.transferredBytes || 0) / 1024 ** 2).toFixed(1)} / {((state?.packageBytes || 0) / 1024 ** 2).toFixed(1)} MB</span></div>}
    <div className="desktop-manager-actions">
      <button disabled={!state?.enabled || busy || pending} onClick={() => run(() => api.check())}>{text('检查更新', 'Check for updates', 'Проверить обновления')}</button>
      {state?.latestVersion && ['available', 'error'].includes(phase) && <button disabled={pending || !state.enabled} onClick={() => run(() => api.download())}>{text('下载更新', 'Download update', 'Загрузить обновление')}</button>}
      {phase === 'downloading' && <button onClick={() => { setError(''); api.cancel().catch(error => setError(error.message)); }}>{text('取消下载', 'Cancel download', 'Отменить загрузку')}</button>}
      {phase === 'ready' && <button disabled={pending || working} onClick={() => {
        if (state.platform !== 'darwin' && !window.confirm(text('应用将退出并打开安装向导，请先保存当前编辑内容。继续？', 'The app will close and open the installer. Save your edits first. Continue?', 'Приложение закроется и запустит установщик. Сохраните изменения. Продолжить?'))) return;
        run(async () => { await getPlatform().preferences.flush(); await api.install(); });
      }}>{state.platform === 'darwin' ? text('打开更新安装包', 'Open update package', 'Открыть пакет обновления') : text('退出并安装更新', 'Quit and install update', 'Выйти и установить')}</button>}
    </div>
    <p>{state?.platform === 'darwin' ? text('下载完成后打开 DMG，退出 CSBoard，再将新版拖入“应用程序”并替换旧版。', 'Open the downloaded DMG, quit CSBoard, then drag the new app into Applications and replace the old version.', 'Откройте DMG, закройте CSBoard и замените приложение в папке Applications.') : text('仅下载已发布的稳定版本，不会自动下载安装；安装更新前请保存编辑内容。', 'Only published stable releases are offered. Downloads and installation require your action; save your edits before installing.', 'Доступны только стабильные выпуски. Загрузка и установка запускаются вами; сначала сохраните изменения.')}</p>
    {state?.notes && <details className="desktop-update-notes"><summary>{text('更新说明', 'Release notes', 'Что нового')}</summary><div>{state.notes}</div></details>}
  </section>;
}
