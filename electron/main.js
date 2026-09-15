import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createResourceStore } from './resource-store.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_HOST = '127.0.0.1'
const DESKTOP_PORT = Number(process.env.CSBOARD_DESKTOP_PORT) || 32145
const WEB_MCP_ENABLED = process.env.CSBOARD_WEBMCP === '1' || process.argv.includes('--enable-csboard-webmcp')
const mimeTypes = {
  '.css': 'text/css; charset=utf-8', '.glb': 'model/gltf-binary', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
}
let mainWindow = null
let resourceStore = null

// WebMCP is experimental in Chromium 152. Keep it opt-in until the API ships,
// while allowing the renderer to use progressive feature detection today.
if (WEB_MCP_ENABLED) app.commandLine.appendSwitch('enable-experimental-web-platform-features')

function isFileInside(root, filePath) {
  const relative = path.relative(root, filePath)
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}

function startDesktopServer() {
  const distRoot = path.resolve(__dirname, '..', 'dist')
  const server = http.createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method || '')) {
      response.writeHead(405).end('Method not allowed')
      return
    }
    let pathname
    try { pathname = decodeURIComponent(new URL(request.url, `http://${DESKTOP_HOST}:${DESKTOP_PORT}`).pathname) } catch {
      response.writeHead(400).end('Invalid resource path')
      return
    }
    const resource = pathname.match(/^\/resource-pack\/(icons|models)\/([a-z0-9_]+)\.(svg|glb)$/)
    let filePath
    try {
      filePath = resource ? await resourceStore.resolve(resource[1], resource[2]) : path.resolve(distRoot, pathname.replace(/^\/+/, '') || 'index.html')
    } catch { response.writeHead(500).end('Resource unavailable'); return }
    if (!filePath || (!resource && !isFileInside(distRoot, filePath)) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      response.writeHead(404, { 'Origin-Agent-Cluster': '?1' }).end('Resource not found')
      return
    }
    const stat = fs.statSync(filePath)
    response.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
      'Origin-Agent-Cluster': '?1',
      'X-Content-Type-Options': 'nosniff',
      ...(resource ? { 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}),
    })
    if (request.method === 'HEAD') response.end()
    else fs.createReadStream(filePath).on('error', () => response.destroy()).pipe(response)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(DESKTOP_PORT, DESKTOP_HOST, () => {
      server.off('error', reject)
      resolve(server)
    })
  })
}

app.setName('csBoard')
// A stable loopback origin preserves browser storage between launches and is
// required for WebMCP's origin isolation. Keep one owner for its fixed port.
const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()
else app.on('second-instance', () => {
  if (mainWindow?.isMinimized()) mainWindow.restore()
  mainWindow?.focus()
})

app.whenReady().then(async () => {
  // Release packages never read .local/official/maps. Only an explicit local-test package
  // or an unpackaged development run can supply these optional model files.
  const metadata = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'))
  const localModelsRoot = !app.isPackaged ? path.resolve(__dirname, '..', '.local', 'official', 'maps')
    : metadata.csboardLocalModels === true ? path.join(process.resourcesPath, 'maps') : null
  resourceStore = createResourceStore(path.join(app.getPath('userData'), 'resource-packs'), localModelsRoot)
  const authorize = event => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame
      || new URL(event.senderFrame.url).origin !== `http://${DESKTOP_HOST}:${DESKTOP_PORT}`) throw new Error('Invalid resource request')
  }
  ipcMain.handle('resources:status', event => { authorize(event); return resourceStore.status() })
  let importing = false
  ipcMain.handle('resources:import', async event => {
    authorize(event)
    if (importing) throw new Error('Import already running')
    importing = true
    try {
      const selection = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Resource files (SVG / GLB)', extensions: ['svg', 'glb'] }],
      })
      if (selection.canceled) return { results: [], status: await resourceStore.status() }
      return await resourceStore.importFiles(selection.filePaths)
    } finally { importing = false }
  })
  const server = await startDesktopServer()
  app.once('will-quit', () => server.close())
  console.log(app.getPath('userData'))
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })

  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.loadURL(`http://${DESKTOP_HOST}:${DESKTOP_PORT}/index.html`)
  if (!app.isPackaged) mainWindow.webContents.openDevTools()
}).catch((error) => {
  console.error(`Unable to start CSBoard desktop server on ${DESKTOP_HOST}:${DESKTOP_PORT}.`, error)
  app.quit()
})
