import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createNativeClient } from '../electron/native-client.js';
const file = process.argv[2];
if (!file) throw new Error('Usage: node scripts/verify-native-parser.js /path/to/file.dem [--threads 4]');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const platform = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : process.platform;
const native = createNativeClient(path.join(root, 'build/go-parser/native', `${platform}-${process.arch}`, `csboard-go-parser${process.platform === 'win32' ? '.exe' : ''}`));
const plain = value => value instanceof Map ? Object.fromEntries([...value].map(([k,v])=>[k,plain(v)])) : ArrayBuffer.isView(value) ? Array.from(value) : Array.isArray(value) ? value.map(plain) : value && typeof value==='object' ? Object.fromEntries(Object.entries(value).map(([k,v])=>[k,plain(v)])) : value;
function compare(a,b,where='root') {
 if (a == null && b == null) return;
 if (typeof a === 'number' && typeof b === 'number') { assert.ok(Math.abs(a-b) <= Math.max(1e-4, Math.abs(a)*1e-6),`${where}: ${a} != ${b}`); return; }
 if (a && b && typeof a==='object' && typeof b==='object') { assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort(),where); for(const key of Object.keys(a)) compare(a[key],b[key],`${where}.${key}`); return; }
 assert.deepEqual(a,b,where);
}
try {
 await native.ready();
 if (process.argv.includes('--threads')) await native.request('configure', { threads: Number(process.argv[process.argv.indexOf('--threads') + 1]) });
 await native.request('source',{paths:[file]});
 await import(path.join(root, 'build/go-parser/web/wasm_exec.js'));
 const go = new globalThis.Go();
 const { instance } = await WebAssembly.instantiate(fs.readFileSync(path.join(root, 'build/go-parser/web/parser.wasm')), go.importObject);
 void go.run(instance);
 const unwrap = encoded => { const response = JSON.parse(encoded); if (response.error) throw new Error(response.error); return response.result; };
 unwrap(globalThis.csboardGoParserSource([new Uint8Array(fs.readFileSync(file))]));
 const cases = [
  ['header', {}],
  ['events', { events: ['round_start', 'round_end', 'player_death', 'weapon_fire'], props: ['X','Y','Z','pitch','yaw','team_num'] }],
  ['ticks', { props: ['X','Y','Z','health','team_num','is_alive'], ticks: [1024,2048,4096] }],
  ['grenades', {}],
 ].map(([method,args]) => [method,args,() => unwrap(globalThis.csboardGoParserRequest(method, JSON.stringify({part:0,...args})))]);
 for (const [method,args,wasm] of cases) {
  const start=performance.now(); const actual=await native.request(method,{part:0,...args}); const nativeMs=performance.now()-start;
  const wasmStart=performance.now(); const expected=plain(wasm()); const wasmMs=performance.now()-wasmStart;
  compare(actual,expected); console.log(JSON.stringify({method,rows:actual.length,nativeMs:Math.round(nativeMs),wasmMs:Math.round(wasmMs),equal:true}));
 }
} finally {native.close();}
