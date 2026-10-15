import { ensureElectronRuntime } from './lib/electron-runtime.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startScreenshotRooms } from './lib/screenshot-rooms.js';
import { seedGuideExample } from './lib/guide-example-fixture.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('make readme-shots [ARGS="--template path --out path --model path --keep-profile --build --publish | --no-publish"]\nUses the current desktop renderer, an isolated profile and the bundled real replay example. The Make command builds the current application; collaboration scenes use a temporary local server. Inactive windows need no foreground focus. Images stay in .local; interactive runs ask before replacing README assets (default No).');
  process.exit(0);
}
const options = {};
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (key === '--keep-profile') options.keep = true;
  else if (key === '--build') options.build = true;
  else if (key === '--publish') options.publish = true;
  else if (key === '--no-publish') options.noPublish = true;
  else if (['--template', '--out', '--model'].includes(key) && args[i + 1]) options[key.slice(2)] = path.resolve(args[++i]);
  else throw Error(`Unknown or incomplete argument: ${key}`);
}
const localOptions = path.join(root, '.local/readme-screenshots.json');
if (!options.model) { try { const saved=JSON.parse(await fs.readFile(localOptions,'utf8')); if(saved.version===1&&typeof saved.model==='string') options.model=saved.model; } catch(error) {if(error.code!=='ENOENT')throw error;} }
const template = JSON.parse(await fs.readFile(options.template || path.join(root, 'config/screenshots/readme.json'), 'utf8'));
if (template.version !== 1 || !Array.isArray(template.scenes) || !template.scenes.length) throw Error('Unsupported screenshot template. Keep version 1 or add an explicit migration.');
const names = template.scenes.map(scene => scene.file);
if (names.some(name => !/^[a-z0-9-]+\.png$/.test(name)) || new Set(names).size !== names.length) throw Error('Screenshot names must be unique PNG basenames.');

if(options.publish && options.noPublish)throw Error('Choose --publish or --no-publish');
const output = options.out;
const artifactRoot = path.join(root, '.local/readme-screenshots');
await fs.mkdir(artifactRoot, {recursive:true});
const run = await fs.mkdtemp(path.join(artifactRoot, 'run-'));
const profile = path.join(run, 'profile');
await fs.mkdir(profile);
if (options.model) {
  const destination = path.join(profile, 'resource-packs/models');
  await fs.mkdir(destination, {recursive:true});
  await fs.copyFile(options.model, path.join(destination, 'de_dust2.glb'));
}
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer(); server.on('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const appPort = await freePort();
let debugPort = await freePort();
while(debugPort===appPort)debugPort=await freePort();
const launcher = path.join(run, 'launch.cjs');
await fs.writeFile(launcher, `const {app}=require('electron');\napp.setPath('userData',${JSON.stringify(profile)});\napp.commandLine.appendSwitch('remote-debugging-port',${JSON.stringify(String(debugPort))});\napp.commandLine.appendSwitch('disable-renderer-backgrounding');\napp.on('browser-window-created',(_,w)=>{w.setContentSize(${template.width || 1600},${template.height || 1000});w.once('ready-to-show',()=>w.showInactive());w.webContents.on('devtools-opened',()=>w.webContents.closeDevTools())});\nprocess.env.CSBOARD_DESKTOP_PORT=${JSON.stringify(String(appPort))};\nimport(${JSON.stringify(pathToFileURL(path.join(root,'electron/main.js')).href)});\n`);
const electron = await ensureElectronRuntime();
let socket, child, guestChild, guestSocket, roomServer, rendererBackup, exited = false, log = '', failure;
const pending = new Map(); let sequence = 0;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const exceptions = [];
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 45000);
  pending.set(id, {resolve, reject, timer}); socket.send(JSON.stringify({id,method,params}));
});
async function evaluate(expression) {
  let response;
  try { response = await call('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true}); }
  catch (error) { throw Error(`${error.message}: ${expression.slice(0, 240)}`, {cause:error}); }
  if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}
async function wait(expression, label, timeout = 30000) {
  const end = Date.now() + timeout;
  do {
    if (exited) throw Error('Screenshot desktop exited unexpectedly');
    if (await evaluate(expression)) return;
    await delay(150);
  } while (Date.now() < end);
  throw Error(`Scene is not ready: ${label}`);
}
function attachDebugger(connection) {
  connection.onmessage=event=>{const message=JSON.parse(event.data);if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails);const task=pending.get(message.id);if(!task)return;pending.delete(message.id);clearTimeout(task.timer);message.error?task.reject(Error(JSON.stringify(message.error))):task.resolve(message.result);};
  connection.onclose=()=>{for(const task of pending.values()){clearTimeout(task.timer);task.reject(Error('Screenshot debugger disconnected'));}pending.clear();};
}
async function collaborate() {
  if(!roomServer)throw Error('The collaborate action requires template.collaboration=true');
  await action({action:'click',text:['Open Room']});
  await wait('!!document.querySelector(".room-open strong")','local room');
  const sharedBrushCount=await evaluate('window.csboardAutomation.getState().workspace.brushStrokes.length');
  const code=await evaluate('document.querySelector(".room-open strong").textContent.match(/[0-9A-F]{6}/)[0]');
  const guestProfile=path.join(run,'guest-profile');
  await fs.mkdir(guestProfile);
  if(options.model){await fs.mkdir(path.join(guestProfile,'resource-packs/models'),{recursive:true});await fs.copyFile(options.model,path.join(guestProfile,'resource-packs/models/de_dust2.glb'));}
  const port=await freePort(), debug=await freePort();
  const guestLauncher=path.join(run,'guest.cjs');
  await fs.writeFile(guestLauncher,(await fs.readFile(launcher,'utf8')).replaceAll(JSON.stringify(profile),JSON.stringify(guestProfile)).replaceAll(JSON.stringify(String(debugPort)),JSON.stringify(String(debug))).replaceAll(JSON.stringify(String(appPort)),JSON.stringify(String(port))));
  guestChild=spawn(electron,[guestLauncher],{cwd:root,env:{...process.env,CSBOARD_AUTOMATION:'1'},stdio:['ignore','pipe','pipe']});
  for(const stream of [guestChild.stdout,guestChild.stderr])stream.on('data',data=>{log+='[guest] '+data;});
  let page;const end=Date.now()+45000;
  while(!page&&Date.now()<end){try{page=(await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json()).find(p=>p.url.includes(`:${port}/`));}catch{}if(!page)await delay(150);}
  if(!page)throw Error('Cannot attach to the second desktop client');
  guestSocket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Guest debugger timeout')),15000);guestSocket.onopen=()=>{clearTimeout(timer);resolve();};guestSocket.onerror=()=>{clearTimeout(timer);reject(Error('Guest debugger failed'));};});
  attachDebugger(guestSocket);
  const owner=socket;
  try {
    socket=guestSocket;
    await call('Runtime.enable');
    await call('Emulation.setDeviceMetricsOverride',{width:template.width||1600,height:template.height||1000,deviceScaleFactor:1,mobile:false});
    await call('Emulation.setFocusEmulationEnabled',{enabled:true});
    await wait('!!document.querySelector(".language-switch")','guest startup');
    await action({action:'click',text:['暂不开启','Not now'],optional:true});
    await action({action:'click',selector:'.language-switch',text:['中'],optional:true});
    await action({action:'click',text:['Collaboration']});
    await action({action:'click',text:['Join Room']});
    await action({action:'input',selector:'.join-room-dialog input',value:code});
    await action({action:'click',selector:'.join-room-dialog button[type=submit]'});
    await wait('document.querySelectorAll(".room-user-list > div").length === 2 && document.body.innerText.includes("m0NESY")','shared workspace and two real participants');
    await wait(`window.csboardAutomation?.getState().ready && window.csboardAutomation.getState().workspace.brushStrokes.length === ${sharedBrushCount}`,'shared brush state through public viewer query');
    const before=await evaluate('document.querySelectorAll(".collab-frame-dot").length');
    // A real edit from the guest must synchronize back to the owner.
    await action({action:'click',text:['Duplicate frame','Duplicate Frame']});
    socket=owner;
    await wait(`document.querySelectorAll('.collab-frame-dot').length === ${before+1} && document.querySelectorAll('.room-user-list > div').length === 2`,'remote frame edit');
    manifest.collaboration={participants:2,transport:'local Yjs WebSocket',verifiedRemoteFrameCount:before+1,verifiedSharedBrushCount:sharedBrushCount};
  } finally {socket=owner;}
}
// Stable template actions prefer selectors; bilingual aliases tolerate wording
// changes. Missing required controls fail instead of publishing an empty scene.
// 模板版本与输出文件名稳定；界面变化应改模板，失败不覆盖旧截图。
async function action(step) {
  if (step.action === 'resize') {
    if (![step.width, step.height].every(value => Number.isInteger(value) && value >= 320 && value <= 4096)) throw Error('Resize requires width/height between 320 and 4096');
    await call('Emulation.setDeviceMetricsOverride', { width: step.width, height: step.height, deviceScaleFactor: 1, mobile: false });
    await wait(`innerWidth === ${step.width} && innerHeight === ${step.height}`, 'viewport resize');
    await delay(500); manifest.interactions.push({type:'resize',width:step.width,height:step.height}); return;
  }
  if (step.action === 'collaborate') return collaborate();
  if (step.action === 'command') {
    await wait('!!window.csboardAutomation?.getState().ready','public viewer ready');
    const baseline=step.expectDelta ? await evaluate(step.expectDelta.expression) : null;
    if(step.expectDelta && (!Number.isFinite(baseline)||!Number.isFinite(step.expectDelta.delta)))throw Error('Delta assertion needs finite numbers');
    const result=await evaluate(`window.csboardAutomation.execute(${JSON.stringify(step.command)})`);
    manifest.operations.push({command:step.command,result});
    if(result.status!=='succeeded')throw Error(`Viewer command failed: ${JSON.stringify(result)}`);
    if(step.expect)await wait(step.expect,'viewer command postcondition');
    if(step.expectDelta)await wait(`(${step.expectDelta.expression}) === ${baseline+step.expectDelta.delta}`,'viewer command state delta');
    await delay(250);return;
  }
  if (step.action === 'key') {
    await evaluate('document.activeElement?.blur()');
    await call('Input.dispatchKeyEvent',{type:step.up?'keyUp':'keyDown',key:step.key,code:step.code,windowsVirtualKeyCode:step.keyCode});await delay(250);return;
  }
  if (step.action === 'draw') {
    if(!Array.isArray(step.points)||step.points.length<2)throw Error('Draw needs at least two viewport points');
    const before=await evaluate('window.csboardAutomation.getState().workspace.brushStrokes?.length || 0');
    const [first,...rest]=step.points;
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:first[0],y:first[1]});
    await call('Input.dispatchMouseEvent',{type:'mousePressed',x:first[0],y:first[1],button:'left',buttons:1,clickCount:1});
    try { for(const [x,y] of rest){await call('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,button:'left',buttons:1});await delay(30);} }
    finally {const [x,y]=rest.at(-1);await call('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1});}
    await wait(`(window.csboardAutomation.getState().workspace.brushStrokes?.length || 0)>${before}`,'real brush stroke');
    manifest.interactions.push({type:'draw',before,after:await evaluate('window.csboardAutomation.getState().workspace.brushStrokes.length')});return;
  }
  if (step.action === 'hover') { const point=await evaluate(`(()=>{const e=document.querySelectorAll(${JSON.stringify(step.selector)})[${step.index||0}];if(!e)throw Error('Missing hover control');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await call('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await delay(600);return; }
  if (step.action === 'pointer') { await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:step.x,y:step.y}); await delay(250); return; }
  if (step.action === 'repeat') { if (!Number.isInteger(step.count) || step.count < 1 || step.count > 50) throw Error('Invalid repeat count'); for(let i=0;i<step.count;i++)for(const child of step.steps)await action(child);return; }
  if (step.action === 'wait') return wait(step.expression, step.label || step.expression, step.timeout);
  if (step.action === 'wheel') { await call('Input.dispatchMouseEvent',{type:'mouseWheel',x:step.x || (template.width||1600)*0.55,y:step.y || (template.height||1000)*0.5,deltaX:0,deltaY:step.deltaY});await delay(500);return; }
  if (step.action === 'pause') return delay(Math.min(step.ms || 500, 5000));
  const code = `(()=>{const s=${JSON.stringify(step)}; const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';let list=[...document.querySelectorAll(s.selector||'button')].filter(visible);if(s.text)list=list.filter(e=>s.text.some(t=>s.contains?e.textContent.includes(t):e.textContent.trim()===t));const e=list[s.index||0];if(!e){${step.optional ? 'return false' : "throw Error('Missing screenshot control: '+JSON.stringify(s))"}}if(s.action==='focus')e.focus();else if(s.action==='blur')e.blur();else if(s.action==='click'){if(e.disabled)throw Error('Screenshot control is disabled');e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));e.click()}else if(s.action==='range'||s.action==='input'){let value=s.value;if(s.action==='range'&&s.fraction!==undefined)value=Number(e.min)+(Number(e.max)-Number(e.min))*s.fraction;if(s.action==='range'&&s.offset!==undefined)value=Number(e.min)+s.offset;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,String(value));e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}else if(s.action==='select'){e.value=s.value;e.dispatchEvent(new Event('change',{bubbles:true}))}else throw Error('Unknown screenshot action: '+s.action);return true})()`;
  await evaluate(code); await delay(250);
}
const manifest = {templateVersion:1, appVersion:JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version, capturedAt:new Date().toISOString(), source:'bundled operation-guide real replay', hiddenWindow:false, foregroundRequired:false, model:options.model ? path.basename(options.model) : null, operations:[], interactions:[], scenes:[]};
try {
  if(template.collaboration) {
    roomServer=await startScreenshotRooms();
    const current=path.join(root,'build/renderer');
    try {await fs.access(current);rendererBackup=path.join(run,'original-renderer');await fs.cp(current,rendererBackup,{recursive:true});} catch(error){if(error.code!=='ENOENT')throw error;}
  }
  if(options.build || template.collaboration) {
    const build=spawn(process.execPath,[path.join(root,'scripts/build-frontend.js'),'--desktop'],{cwd:root,env:{...process.env,...(roomServer ? {VITE_BACKEND_BASE_URL:roomServer.url}: {})},stdio:'inherit'});
    await new Promise((resolve,reject)=>{build.once('error',reject);build.once('exit',code=>code===0?resolve():reject(Error('Screenshot renderer build failed')));});
  }
  await fs.access(path.join(root,'build/renderer/index.html'));
  child = spawn(electron, [launcher], {cwd:root, env:{...process.env,CSBOARD_AUTOMATION:'1'}, stdio:['ignore','pipe','pipe']});
  child.on('error', error => {log += error.stack; exited = true;}); child.on('exit',()=>{exited=true;});
  for (const stream of [child.stdout,child.stderr]) stream.on('data',data=>{log+=data.toString();});
  let page; const deadline = Date.now()+45000;
  while (!page && Date.now()<deadline && !exited) {
    try {const pages=await(await fetch(`http://127.0.0.1:${debugPort}/json/list`,{signal:AbortSignal.timeout(1000)})).json();page=pages.find(p=>p.url.includes(`:${appPort}/`));}catch{}
    if(!page)await delay(150);
  }
  if(!page)throw Error('Cannot attach to screenshot desktop');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Cannot open screenshot debugger')),15000);socket.onopen=()=>{clearTimeout(timer);resolve();};socket.onerror=()=>{clearTimeout(timer);reject(Error('Cannot open screenshot debugger'));};});
  attachDebugger(socket);
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:template.width||1600,height:template.height||1000,deviceScaleFactor:1,mobile:false});
  await call('Emulation.setFocusEmulationEnabled',{enabled:true});
  await wait('typeof window.csboardDesktop?.native?.storage === "function" && !!document.querySelector("canvas")','desktop startup');
  await action({action:'click',text:['暂不开启','Not now'],optional:true});
  await seedGuideExample(root, evaluate);
  await call('Page.reload'); await delay(1200);
  await wait('[...document.querySelectorAll("button")].some(e=>/本地 Demo|Local Demo/.test(e.textContent))','replay library');
  await wait('!!window.csboardAutomation?.getState().ready','northbound viewer bridge');
  manifest.contract=await evaluate('window.csboardAutomation.getContract()');
  for(const step of template.setup || [])await action(step);
  for(const scene of template.scenes){
    console.log(`Preparing ${scene.file}...`);
    for(const [index,step] of (scene.steps || []).entries()) {
      console.log(`  ${index+1}. ${step.action} ${step.selector || step.command?.type || step.label || ''}`);
      await action(step);
    }
    if(scene.ready)await wait(scene.ready,scene.file,scene.timeout);
    await evaluate('document.fonts.ready');await delay(1000);
    if(exceptions.length)throw Error(`Renderer failed: ${JSON.stringify(exceptions)}`);
    const shot=await call('Page.captureScreenshot',{format:'png'});
    await fs.writeFile(path.join(run,scene.file),Buffer.from(shot.data,'base64'));
    manifest.scenes.push({file:scene.file,description:scene.description, viewport:await evaluate('({width:innerWidth,height:innerHeight})'),text:await evaluate('document.body.innerText'), state:await evaluate('window.csboardAutomation.getState()'), events:await evaluate('window.csboardAutomation.drainEvents()')});
    for(const step of scene.after || [])await action(step);
  }
  // Stage first. Documentation assets change only after explicit selection.
  if(output){await fs.mkdir(output,{recursive:true});for(const name of names)await fs.copyFile(path.join(run,name),path.join(output,name));}
  if(options.model){await fs.mkdir(path.dirname(localOptions),{recursive:true});await fs.writeFile(localOptions,JSON.stringify({version:1,model:options.model},null,2)+'\n');}
  await fs.writeFile(path.join(run,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(`Generated ${names.length} screenshots in ${output || run}\nCapture report: ${path.join(run,'manifest.json')}`);
}catch(error){failure=error;if(socket?.readyState===1)try{const shot=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(run,'failure.png'),Buffer.from(shot.data,'base64'));await fs.writeFile(path.join(run,'failure.txt'),`${error.stack}\n${await evaluate('document.body.innerText')}`);}catch{}}
finally{
  socket?.close(); guestSocket?.close();
  if(guestChild && guestChild.exitCode===null){const closed=new Promise(resolve=>guestChild.once('exit',resolve));guestChild.kill();const timer=setTimeout(()=>guestChild.kill('SIGKILL'),5000);await closed;clearTimeout(timer);}
  await roomServer?.close();
  if(child&&!exited){const closed=new Promise(resolve=>child.once('exit',resolve));child.kill();const timer=setTimeout(()=>child.kill('SIGKILL'),5000);await closed;clearTimeout(timer);}
  // Do not leave normal desktop development pointing at the temporary room server.
  if(rendererBackup){await fs.cp(rendererBackup,path.join(root,'build/renderer'),{recursive:true});await fs.rm(rendererBackup,{recursive:true,force:true});}
  else if(roomServer){const restore=spawn(process.execPath,[path.join(root,'scripts/build-frontend.js'),'--desktop'],{cwd:root,env:process.env,stdio:'inherit'});await new Promise((resolve,reject)=>{restore.once('error',reject);restore.once('exit',code=>code===0?resolve():reject(Error('Could not restore normal renderer configuration')));});}
  await fs.writeFile(path.join(run,'process.log'),log);
  manifest.status=failure?'failed':'passed';manifest.finishedAt=new Date().toISOString();
  if(failure)manifest.error=failure.message;
  await fs.writeFile(path.join(run,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  if(!options.keep)await fs.rm(path.join(run,'guest-profile'),{recursive:true,force:true,maxRetries:10,retryDelay:200});
  if(!options.keep)await fs.rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});
}
if(failure)throw failure;
const escapeHtml=value=>String(value || '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
await fs.writeFile(path.join(run,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><title>CSBoard screenshot preview</title><style>body{margin:32px;background:#101815;color:#e8ede6;font:16px system-ui}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(480px,1fr));gap:24px}img{width:100%;height:auto}figure{margin:0}a{color:inherit}figcaption{padding:12px 0}</style><h1>Screenshot preview</h1><p>README assets are replaced only when selected.</p><main>${manifest.scenes.map(scene=>`<figure><a href="${scene.file}"><img src="${scene.file}" alt="${escapeHtml(scene.description)}"></a><figcaption>${escapeHtml(scene.description)}</figcaption></figure>`).join('')}</main></html>`);
console.log('Preview gallery: '+path.join(run,'index.html'));


// Ask only after desktop clients and temporary servers have been closed.
// 完成后再决定覆盖；无终端的 CI 默认保留预览，不等待输入。
let publish=Boolean(options.publish);
if(!publish && !options.noPublish && process.stdin.isTTY && process.stdout.isTTY){
  const prompt=createInterface({input:process.stdin,output:process.stdout});
  try {publish=/^(y|yes|是)$/i.test((await prompt.question('Overwrite README images in docs/img? [y/N] / 覆盖 README 图片？默认保留预览：')).trim());}
  finally {prompt.close();}
}
if(publish){
  const destination=path.join(root,'docs/img');await fs.mkdir(destination,{recursive:true});
  for(const name of names)await fs.copyFile(path.join(run,name),path.join(destination,name));
  console.log(`Updated ${names.length} README images in ${destination}`);
}else console.log('README images unchanged. Preview remains in '+(output || run));

manifest.publication={published:publish,destination:publish?'docs/img':null};
await fs.writeFile(path.join(run,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
