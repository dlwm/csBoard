const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises'), sync = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const root = process.argv.at(-1), output = path.join(root, 'build/qa/mobile-workspace');
const profile = sync.mkdtempSync(path.join(os.tmpdir(), 'csboard-mobile-check-'));
app.setPath('userData', profile); app.setPath('sessionData', profile);
app.on('window-all-closed', () => {});
if (process.platform === 'linux') { app.commandLine.appendSwitch('use-angle', 'swiftshader'); app.commandLine.appendSwitch('enable-unsafe-swiftshader'); }
let window, server, failure;
const captures = [], exceptions = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  const timer = setTimeout(() => { failure = Error('Mobile workspace timed out'); window?.destroy(); }, 60000);
  try {
    await fs.access(path.join(root, 'dist/index.html'));
    server = http.createServer(async (req, res) => {
      try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const file = path.resolve(root, 'dist', '.' + (pathname === '/' ? '/index.html' : pathname));
        if (path.relative(path.join(root, 'dist'), file).startsWith('..')) throw Error('Invalid path');
        const body = await fs.readFile(file);
        res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
        res.end(body);
      } catch { res.writeHead(404); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    window = new BrowserWindow({ width: 1024, height: 620, show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    window.webContents.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1');
    const cdp = window.webContents.debugger; cdp.attach('1.3');
    cdp.on('message', (_, method, params) => { if (method === 'Runtime.exceptionThrown') exceptions.push(params.exceptionDetails); });
    // Load before applying metrics: Chromium may wait for navigation during the
    // first metrics command. This still detects the mobile host from its UA.
    window.loadURL(`http://127.0.0.1:${server.address().port}/`).catch(error => exceptions.push({ message: error.message }));
    window.showInactive();
    await cdp.sendCommand('Runtime.enable');
    const size = height => cdp.sendCommand('Emulation.setDeviceMetricsOverride', { width: 844, height, deviceScaleFactor: 1, mobile: true });
    await size(390);
    await cdp.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    const evaluate = expression => window.webContents.executeJavaScript(expression);
    const wait = async expression => { const deadline = Date.now() + 15000; while (!await evaluate(expression)) { if (Date.now() > deadline) throw Error('Mobile readiness: ' + expression); await pause(50); } };
    const touch = async selector => {
      const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e?.getBoundingClientRect();if(!r)throw Error('Missing mobile control');return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
      await cdp.sendCommand('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
      await cdp.sendCommand('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const capture = async name => {
      await pause(250);
      const state = await evaluate(`(()=>{const v=document.querySelector('.workspace-viewport').getBoundingClientRect(),board=document.querySelector('.three-board'),c=board.querySelector('canvas').getBoundingClientRect();return {width:innerWidth,height:innerHeight,visualHeight:visualViewport.height,mobileHeight:document.documentElement.style.getPropertyValue('--mobile-viewport-height'),h5:document.querySelector('.workspace-frame').classList.contains('is-mobile-h5'),overflow:document.documentElement.scrollWidth>innerWidth,canvas:{width:c.width,height:c.height},board:{width:board.clientWidth,height:board.clientHeight},viewport:{width:v.width,height:v.height},errors:[...document.querySelectorAll('.board-error')].map(e=>e.textContent),menus:[...document.querySelectorAll('.topbar-panels button')].map(e=>e.textContent)}})()`);
      if (!state.h5 || state.overflow || state.errors.length || state.canvas.width <= 0 || Math.abs(state.canvas.height - state.board.height) > 1 || Math.abs(state.canvas.width - state.board.width) > 1 || parseFloat(state.mobileHeight) !== state.visualHeight || state.menus.length !== 2) throw Error(JSON.stringify(state));
      captures.push({ name, ...state });
      await fs.writeFile(path.join(output, name + '.png'), (await window.webContents.capturePage()).toPNG());
    };
    await wait("!!document.querySelector('.workspace-frame[data-mobile-workspace]')");
    await evaluate("document.querySelector('.operation-offer footer button')?.click()");
    await wait("!!document.querySelector('.three-board canvas')");
    await capture('landscape');
    await touch('.mobile-view-tools-toggle');
    await wait("document.querySelector('.mobile-view-tools-toggle')?.getAttribute('aria-expanded')==='true'");
    await capture('map-controls');
    const popup = await evaluate("(()=>{const e=document.querySelector('.mobile-view-tools .view-tools-content'),r=e.getBoundingClientRect(),v=document.querySelector('.workspace-viewport').getBoundingClientRect();return {visible:e.contains(document.elementFromPoint(r.left+8,r.top+8)),fits:r.bottom<=v.bottom,scrollable:e.scrollHeight>e.clientHeight}})()");
    if (!popup.visible || !popup.fits || !popup.scrollable) throw Error('Mobile map popup clipped: ' + JSON.stringify(popup));
    const controls = await evaluate("(()=>{const map=document.querySelector('.map-preview-slot').getBoundingClientRect(),slots=document.querySelector('.camera-slots').getBoundingClientRect(),colors=[...document.querySelectorAll('.brush-swatch')].map(e=>e.getBoundingClientRect().top);return {overlap:map.right>slots.left,colorRows:new Set(colors).size}})()");
    if (controls.overlap || controls.colorRows !== 1) throw Error('Mobile map controls overlap or squeezed palette: ' + JSON.stringify(controls));
    await evaluate("document.querySelector('.mobile-view-tools .view-tools-content').scrollTop=10000");
    await capture('map-controls-scrolled');
    await touch('.desktop-manager-button');
    await wait("!!document.querySelector('.desktop-manager')");
    await capture('settings');
    await touch('.desktop-manager .resource-pack-close');
    await wait("!document.querySelector('.desktop-manager')");
    await touch('.topbar-panels button:last-child');
    await wait("!!document.querySelector('.collab-panel')");
    await capture('collaboration');
    await size(260); await capture('reduced-height');
    await wait("document.querySelector('.mobile-view-tools-toggle')?.getAttribute('aria-expanded')==='false'");
    const overlap = await evaluate("(()=>{const a=document.querySelector('.workspace-corner-top-right')?.getBoundingClientRect(),b=document.querySelector('.workspace-corner-bottom-right')?.getBoundingClientRect();return a&&b&&a.width&&b.width&&a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom})()");
    if (overlap) throw Error('Corner actions overlap in reduced viewport');
    await size(390); await capture('restored-height');
    if (exceptions.length) throw Error(JSON.stringify(exceptions));
  } catch (error) { failure = error; if (window && !window.isDestroyed()) await fs.writeFile(path.join(output, 'failure.png'), (await window.webContents.capturePage()).toPNG()); }
  finally {
    clearTimeout(timer);
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, captures, exceptions, error: failure?.stack }, null, 2));
    window?.destroy(); if (server) await new Promise(resolve => server.close(resolve));
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    app.exit(failure ? 1 : 0);
  }
}).catch(error => { console.error(error); app.exit(1); });
