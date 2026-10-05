import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createResourceStore } from './resource-store.js'
import { registerNativeServices } from './native-services.js'
import { applyPendingRestore } from './storage-management.js'
import { registerUpdateService } from './update-service.js'
import { registerGameResourceService } from './game-resource-service.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_HOST = '127.0.0.1'
const DESKTOP_PORT = Number(process.env.CSBOARD_DESKTOP_PORT) || 32145
const mimeTypes = {
  '.css': 'text/css; charset=utf-8', '.glb': 'model/gltf-binary', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
}
let mainWindow = null
let resourceStore = null
let nativeServices = null


function isFileInside(root, filePath) {
  const relative = path.relative(root, filePath)
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}

function startDesktopServer() {
  const distRoot = path.resolve(__dirname, '..', 'build', 'renderer')
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
    if (pathname.startsWith('/native-cache/')) { await nativeServices.serveCache(request, response, pathname); return }
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
// Keep the existing storage location when changing the displayed product name.
const existingUserData = app.getPath('userData')
const metadata = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'))
const aiEnabled = app.isPackaged ? metadata.csboardAiEnabled !== false : process.env.CSBOARD_AI_ENABLED !== 'false'
const productName = metadata.productName || metadata.build?.productName || 'CSBoard'
app.setName(productName)
app.setPath('userData', existingUserData)
// A stable loopback origin preserves browser storage between launches.
// Keep one owner for its fixed port.
const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()
else app.on('second-instance', () => {
  if (mainWindow?.isMinimized()) mainWindow.restore()
  mainWindow?.focus()
})

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return
  await applyPendingRestore(app.getPath('userData'))
  // Release packages never read .local/official/maps. Only an explicit local-test package
  // or an unpackaged development run can supply these optional model files.
  const localModelsRoot = !app.isPackaged ? path.resolve(__dirname, '..', '.local', 'official', 'maps')
    : metadata.csboardLocalModels === true ? path.join(process.resourcesPath, 'maps') : null
  resourceStore = createResourceStore(path.join(app.getPath('userData'), 'resource-packs'), localModelsRoot)
  const authorize = event => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame
      || new URL(event.senderFrame.url).origin !== `http://${DESKTOP_HOST}:${DESKTOP_PORT}`) throw new Error('Invalid resource request')
  }
  const aiService = aiEnabled ? (await import('./ai-service.js')).registerAiService({ app, authorize }) : null
  ipcMain.handle('resources:status', event => { authorize(event); return resourceStore.status() })
  ipcMain.handle('resources:model-objects', (event, key) => { authorize(event); return resourceStore.modelObjects(key) })
  let importing = false
  nativeServices = registerNativeServices({ app, authorize, getWindow: () => mainWindow, resourceBusy: () => importing })
  registerUpdateService({ app, authorize, getWindow: () => mainWindow, isBusy: () => nativeServices.busy || importing })
  registerGameResourceService({ app, authorize, getWindow: () => mainWindow, store: resourceStore,
    begin: () => {
      nativeServices.assertAvailable()
      if (importing || nativeServices.busy) throw new Error('Wait for background tasks or resource imports to finish')
      importing = true
    },
    end: () => { importing = false },
  })
  ipcMain.handle('desktop:presentation', event => { authorize(event); return mainWindow.isVisible() && !mainWindow.isMinimized() })
  ipcMain.handle('resources:remove', async (event, kind, key) => {
    authorize(event)
    nativeServices.assertAvailable()
    if (importing) throw new Error('Wait for resource imports to finish')
    importing = true
    try { return await resourceStore.remove(kind, key) }
    finally { importing = false }
  })
  ipcMain.handle('resources:import', async event => {
    authorize(event)
    nativeServices.assertAvailable()
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
  if (!app.isPackaged) app.dock?.setIcon(path.join(__dirname, '../build/icons/icon.png'))
  mainWindow = new BrowserWindow({
    title: productName,
    icon: path.join(__dirname, '../build/icons/icon.png'),
    width: 1440,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: aiEnabled ? ['--csboard-ai-enabled'] : [],
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })

  mainWindow.on('closed', () => { aiService?.cancelAll(); mainWindow = null })
  mainWindow.webContents.on('did-start-navigation', (_event, _url, _inPlace, isMainFrame) => { if (isMainFrame) aiService?.cancelAll() })
  for (const name of ['minimize', 'restore', 'hide', 'show']) mainWindow.on(name, () => {
    if (mainWindow && !mainWindow.webContents.isDestroyed()) mainWindow.webContents.send('desktop:presentation', mainWindow.isVisible() && !mainWindow.isMinimized())
  })
  mainWindow.loadURL(`http://${DESKTOP_HOST}:${DESKTOP_PORT}/index.html`)
  if (!app.isPackaged) mainWindow.webContents.openDevTools()
}).catch((error) => {
  console.error(`Unable to start CSBoard desktop server on ${DESKTOP_HOST}:${DESKTOP_PORT}.`, error)
  app.quit()
})
