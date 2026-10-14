import { WebsocketProvider } from 'y-websocket';
import { translate } from '../i18n.js';

export const roomConnectionMessage = (language, reason = 'unavailable') => translate(language, reason === 'configuration' ? "collaboration.roomProvider.noCollaborationServerIsConfiguredForThisApp" : "collaboration.roomProvider.couldNotConnectToTheCollaborationServerRetriesStoppedCheck");

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
