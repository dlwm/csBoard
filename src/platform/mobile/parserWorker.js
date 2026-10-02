import { createDemoParser } from '../../demo/parserRuntime.js';
import { createGoParserAdapter } from '../../demo/goParserAdapter.js';

let sequence = 0;
const pending = new Map();
const request = (method, args) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  self.postMessage({ type: 'parser-request', id, method, args });
});
const parse = createDemoParser({
  ...createGoParserAdapter({ init: async () => null, openSources: async data => data.sources, request }),
  postMessage: message => self.postMessage(message),
});
self.onmessage = ({ data }) => {
  if (data.type === 'parser-response') {
    const callback = pending.get(data.id);
    pending.delete(data.id);
    if (callback) data.error ? callback.reject(new Error(data.error)) : callback.resolve(data.result);
    return;
  }
  parse(data);
};
