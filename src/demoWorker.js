import init, { parseEvents, parseGrenades, parseHeader, parseTicks } from './wasm/demoparser2.js';
import { createDemoParser } from './demo/parserRuntime.js';

const parse = createDemoParser({ init, parseEvents, parseGrenades, parseHeader, parseTicks, postMessage: message => self.postMessage(message) });
self.onmessage = ({ data }) => parse(data);
