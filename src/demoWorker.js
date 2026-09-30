import { createBrowserGoParser } from './demo/goParserBrowser.js';
import { createDemoParser } from './demo/parserRuntime.js';

const parse = createDemoParser({ ...createBrowserGoParser(), postMessage: message => self.postMessage(message) });
self.onmessage = ({ data }) => parse(data);
