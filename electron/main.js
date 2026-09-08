import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

// WebMCP is experimental in Chromium 152. Keep it opt-in until the API ships,
// while allowing the renderer to use progressive feature detection today.
if (WEB_MCP_ENABLED) app.commandLine.appendSwitch('enable-experimental-web-platform-features')

function isFileInside(root, filePath) {
  const relative = path.relative(root, filePath)
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}

function startDesktopServer() {
  const distRoot = path.resolve(__dirname, '..', 'dist')
  const mapRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'maps')
    : path.resolve(__dirname, '..', '.local', 'maps')
  const server = http.createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method || '')) {
      response.writeHead(405).end('Method not allowed')
      return
    }
    let pathname
    try { pathname = decodeURIComponent(new URL(request.url, `http://${DESKTOP_HOST}:${DESKTOP_PORT}`).pathname) } catch {
      response.writeHead(400).end('Invalid resource path')
      return
    }
    const isMap = pathname.startsWith('/maps/')
    const root = isMap ? mapRoot : distRoot
    const relativePath = isMap ? pathname.replace(/^\/maps\/+/, '') : pathname.replace(/^\/+/, '') || 'index.html'
    const filePath = path.resolve(root, relativePath)
    if (!isFileInside(root, filePath) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      response.writeHead(404, { 'Origin-Agent-Cluster': '?1' }).end('Resource not found')
      return
    }
    const stat = fs.statSync(filePath)
    response.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
      'Origin-Agent-Cluster': '?1',
      'X-Content-Type-Options': 'nosniff',
    })
    if (request.method === 'HEAD') response.end()
    else fs.createReadStream(filePath).pipe(response)
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
  const server = await startDesktopServer()
  app.once('will-quit', () => server.close())
  console.log(app.getPath('userData'))
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    webPreferences: {
      backgroundThrottling: false,
    },
  })

  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.loadURL(`http://${DESKTOP_HOST}:${DESKTOP_PORT}/index.html`)
  mainWindow.webContents.openDevTools()
}).catch((error) => {
  console.error(`Unable to start CSBoard desktop server on ${DESKTOP_HOST}:${DESKTOP_PORT}.`, error)
  app.quit()
})
