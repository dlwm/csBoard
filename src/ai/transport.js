import { normalizeAiConfig, readChatResponse } from '../../shared/ai-protocol.js';

const KEY = 'csboard-ai-preferences';
export function createAiTransport(bridge, backendUrl) {
  if (bridge) return {
    config: () => bridge.config(),
    save: value => bridge.save(value),
    async complete(_config, payload, { signal, onDelta }) {
      signal.throwIfAborted();
      const id = crypto.randomUUID();
      const unsubscribe = bridge.onDelta(event => { if (event.id === id && !signal.aborted) onDelta(event.text); });
      const cancel = () => { bridge.cancel(id).catch(() => {}); };
      signal.addEventListener('abort', cancel, { once: true });
      try {
        const result = await bridge.complete(id, payload);
        signal.throwIfAborted(); return result;
      } catch (error) {
        throw new Error(String(error.message || error).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, ''));
      } finally { unsubscribe(); signal.removeEventListener('abort', cancel); }
    },
  };
  let apiKey = '';
  return {
    async config() {
      try { return { ...JSON.parse(localStorage.getItem(KEY) || '{}'), hasKey: Boolean(apiKey) }; }
      catch { return { hasKey: false }; }
    },
    async save(value) {
      const config = normalizeAiConfig(value);
      const previous = await this.config();
      if (value.clearKey || previous.endpoint !== config.endpoint) apiKey = '';
      if (config.apiKey) apiKey = config.apiKey;
      localStorage.setItem(KEY, JSON.stringify({ endpoint: config.endpoint, model: config.model, imageInput: config.imageInput }));
      return { endpoint: config.endpoint, model: config.model, imageInput: config.imageInput, hasKey: Boolean(apiKey) };
    },
    async complete(config, payload, { signal, onDelta }) {
      signal = AbortSignal.any([signal, AbortSignal.timeout(120_000)]);
      const response = await fetch(backendUrl, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: { ...config, apiKey }, payload }) });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `AI proxy returned HTTP ${response.status}`);
      }
      return readChatResponse(response, { signal, onDelta });
    },
  };
}
