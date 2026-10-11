import { WebsocketProvider } from 'y-websocket';
import { localize } from '../i18n.js';

export const roomConnectionMessage = (language, reason = 'unavailable') => localize(language, reason === 'configuration' ? {
  zh: '此应用未配置协作服务器，暂时无法联网协作。',
  en: 'No collaboration server is configured for this app.',
  ru: 'Для приложения не настроен сервер совместной работы.',
} : {
  zh: '无法连接协作服务器，已停止重试。请检查网络或服务器配置后重新加入房间。',
  en: 'Could not connect to the collaboration server. Retries stopped; check the connection or server configuration and rejoin.',
  ru: 'Не удалось подключиться к серверу. Повторы остановлены; проверьте сеть и настройки, затем войдите снова.',
});

// Bound failed handshakes, not normal connected sessions. A successful Yjs sync
// resets the budget. Disable BroadcastChannel so local peers cannot falsely
// report a synchronized room while the actual server is unavailable.
// 最多连续失败三次，单次等待同步最长 25 秒；成功同步后重新计数。
export function createRoomProvider(endpoint, code, doc, onFailure) {
  let timer, stopped = false, disposed = false;
  const clear = () => { clearTimeout(timer); timer = null; };
  const fail = () => {
    if (stopped || disposed) return;
    stopped = true; clear(); provider.disconnect(); onFailure();
  };
  const provider = new WebsocketProvider(endpoint, code, doc, {
    connect: false, disableBc: true,
    shouldReconnect: (event, current) => current.wsUnsuccessfulReconnects < 3 && event.code !== 1008 && !(event.code >= 4400 && event.code <= 4499),
  });
  const status = ({ status }) => {
    if (status === 'connecting' && timer == null && !stopped) timer = setTimeout(fail, 25_000);
  };
  const sync = value => { if (value) clear(); };
  provider.on('status', status); provider.on('sync', sync); provider.on('closed', fail);
  return {
    provider,
    start: () => provider.connect(),
    dispose: () => { disposed = true; clear(); provider.off('status', status); provider.off('sync', sync); provider.off('closed', fail); },
  };
}
