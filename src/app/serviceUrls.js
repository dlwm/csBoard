import { BACKEND_BASE } from './buildConfig.js';
import { getHost } from '../platform/index.js';

// Native asset servers are not API servers. Web can use a same-origin backend.
// 原生壳只在本地提供资源；联网服务必须显式配置，网页支持同源后端。
export function resolveHttpServiceUrl(value) {
  const origin = globalThis.location?.origin;
  // Capacitor's custom scheme can have an opaque ("null") origin. Absolute
  // backend URLs must not depend on whether that origin is a valid URL base.
  // Capacitor 自定义协议可能没有可用 origin；绝对服务地址无需本地 origin。
  let url;
  try { url = new URL(value); }
  catch { url = new URL(value || '/', origin); }
  if (['ws:', 'wss:'].includes(url.protocol)) url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || (getHost().kind !== 'web' && url.origin === origin)) throw new Error('SERVICE_BACKEND_REQUIRED');
  url.search = ''; url.hash = '';
  return url;
}

export function backendServiceUrl(route) {
  return resolveHttpServiceUrl(`${BACKEND_BASE}/${route.replace(/^\/+/, '')}`);
}
