import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.setName('csBoard')
app.whenReady().then(() => {
  console.log(app.getPath('userData'))
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    webPreferences: {
      backgroundThrottling: false,
    },
  })

  win.loadFile(path.join(__dirname, '../dist/index.html'))
  win.webContents.openDevTools()
})