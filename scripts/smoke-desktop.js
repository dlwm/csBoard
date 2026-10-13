import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { desktopPackagePaths } from './lib/desktop-paths.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const { executable, target } = desktopPackagePaths(root, metadata, process.argv[2]);
const artifacts = path.join(root, 'build/qa', `desktop-${target}`);
await fs.mkdir(artifacts, { recursive: true });
for (const name of ['result.json', 'window.png', 'failure.txt']) await fs.rm(path.join(artifacts, name), { force: true });
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'csboard-smoke-'));
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer(); server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const appPort = await freePort();
let debugPort = await freePort();
while (debugPort === appPort) debugPort = await freePort();
let child, socket, failure, exited = false, log = '';
const deadline = Date.now() + 60000;
const pending = new Map(); let sequence = 0;
const pause = () => new Promise(resolve => setTimeout(resolve, 100));
function checkDeadline() {
  if (exited) throw new Error(`Packaged app exited before readiness.\n${log.slice(-6000)}`);
  if (Date.now() > deadline) throw new Error(`Packaged app did not become ready within 60 seconds.\n${log.slice(-6000)}`);
}
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 15000);
  pending.set(id, {resolve, reject, timer}); socket.send(JSON.stringify({id,method,params}));
});
try {
  child = spawn(executable, ['--csboard-smoke-test', `--remote-debugging-port=${debugPort}`], {
    cwd:root, env:{...process.env, CSBOARD_SMOKE_PROFILE:profile, CSBOARD_DESKTOP_PORT:String(appPort)}, stdio:['ignore','pipe','pipe'],
  });
  child.on('error', error => { log += error.stack; exited = true; });
  child.on('exit', (code, signal) => { log += `\nexit=${code} signal=${signal}\n`; exited = true; });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { log += chunk.toString(); });
  let page;
  while (!page) {
    checkDeadline();
    try { const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`, {signal:AbortSignal.timeout(1000)})).json(); page = pages.find(value => value.url === `http://127.0.0.1:${appPort}/index.html`); } catch {}
    if (!page) await pause();
  }
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out attaching to packaged renderer')), 15000);
    socket.onopen = () => { clearTimeout(timer); resolve(); };
    socket.onerror = () => { clearTimeout(timer); reject(new Error('Cannot attach to packaged renderer')); };
  });
  const exceptions = [];
  socket.onclose = () => {
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('Packaged renderer disconnected')); }
    pending.clear();
  };
  socket.onmessage = event => {
    const value = JSON.parse(event.data);
    if (value.method === 'Runtime.exceptionThrown') exceptions.push(value.params.exceptionDetails);
    if (!value.id) return;
    const task = pending.get(value.id); if (!task) return;
    pending.delete(value.id); clearTimeout(task.timer);
    value.error ? task.reject(new Error(JSON.stringify(value.error))) : task.resolve(value.result);
  };
  await call('Runtime.enable');
  let state;
  do {
    checkDeadline();
    const result = await call('Runtime.evaluate', {expression:'({title:document.title,canvas:document.querySelectorAll("canvas").length,bridge:typeof window.csboardDesktop?.native?.storage,text:document.body?.innerText.includes("CSBOARD")})',returnByValue:true});
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    state = result.result.value;
    if (!(state.canvas && state.bridge === 'function' && state.text)) await pause();
  } while (!(state.canvas && state.bridge === 'function' && state.text));
  // Exercise real renderer -> preload -> IPC -> packaged native storage.
  // 用真实桥接与原生二进制读写隔离记录，避免“窗口出现就算通过”。
  const storage = await call('Runtime.evaluate', {expression:'(async()=>{const storage=window.csboardDesktop.native.storage; const value=JSON.stringify([{id:"smoke-archive",name:"Smoke check"}]);await storage("record.put",{key:"recording-data-desktop-smoke-check",value});const restored=await storage("record.get",{key:"recording-data-desktop-smoke-check"});if(restored.value!==value)throw Error("Packaged IPC storage round-trip failed");return {roundTrip:true};})()',awaitPromise:true,returnByValue:true});
  if (storage.exceptionDetails) throw new Error(JSON.stringify(storage.exceptionDetails));
  const screenshot = await call('Page.captureScreenshot', {format:'png'});
  await fs.writeFile(path.join(artifacts,'window.png'),Buffer.from(screenshot.data,'base64'));
  if (exceptions.length) throw new Error(`Renderer exceptions: ${JSON.stringify(exceptions)}`);
  await fs.writeFile(path.join(artifacts,'result.json'),JSON.stringify({target,state,storage:storage.result.value,exceptions},null,2)+'\n');
  console.log(`Packaged desktop opened, rendered and completed native IPC storage: ${target}`);
} catch (error) { failure = error; }
finally {
  socket?.close();
  for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('Desktop smoke check closed')); }
  if (child && !exited) {
    const closed = new Promise(resolve => child.once('exit',resolve));
    child.kill();
    const timeout = setTimeout(() => child.kill('SIGKILL'),5000);
    await closed; clearTimeout(timeout);
  }
  await fs.writeFile(path.join(artifacts,'process.log'),log);
  if (failure) await fs.writeFile(path.join(artifacts,'failure.txt'),failure.stack+'\n');
  else await fs.rm(path.join(artifacts,'failure.txt'),{force:true});
  await fs.rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});
}
if (failure) throw failure;
