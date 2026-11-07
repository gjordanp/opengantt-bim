import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { closeDatabase, connectDatabase } from './database'
import { registerIpc } from './ipc'

const isDev = !app.isPackaged

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Opengantt BIM',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // The renderer only ever loads our own bundle; keep it fully isolated.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())

  // Never navigate the app window to, or open windows on, external sites.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  registerIpc()
  // The window opens right away and asks for the status; a slow start of the
  // database shouldn't keep the user staring at nothing.
  const database = connectDatabase()
  createWindow()
  await database
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Shut the private mongod down cleanly before exiting, so it never leaves a
// stale lock on the data folder.
let closing = false
app.on('before-quit', (event) => {
  if (closing) return
  event.preventDefault()
  closing = true
  void closeDatabase().finally(() => app.quit())
})
