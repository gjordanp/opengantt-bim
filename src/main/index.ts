import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'node:path'
import { closeDatabase, connectDatabase } from './database'
import { registerIpc } from './ipc'
import { initUpdater } from './updater'

const isDev = !app.isPackaged
// Set once the database is shutting down, so quitting isn't intercepted twice.
let closing = false

/** The minimal macOS menu: app (about, hide, quit), edit (the clipboard and undo shortcuts) and window. */
function macMenu(): Menu {
  return Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    { role: 'windowMenu' }
  ])
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Opengantt BIM',
    backgroundColor: '#ffffff',
    // The packaged app uses the icon built into the executable; this is for dev runs.
    ...(isDev ? { icon: join(__dirname, '../../build/icon.png') } : {}),
    // No native menu bar or title bar: the app draws its own, and the OS only
    // supplies the minimize/maximize/close buttons on top of it.
    // On macOS the traffic-light buttons sit at the left, inside the bar; on Windows the OS buttons overlay the right.
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 14, y: 13 } } : { titleBarOverlay: { color: '#ffffff', symbolColor: '#0a0a0a', height: 40 } }),
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
  // No menu bar on Windows and Linux (the app draws its own). On macOS the menu bar is always there, and without an
  // Edit menu Cmd+C, Cmd+V and Cmd+Z do nothing in text fields, so a small one is set.
  Menu.setApplicationMenu(process.platform === 'darwin' ? macMenu() : null)
  registerIpc()
  initUpdater(async () => {
    // The installer restarts the app: shut the private mongod down cleanly first.
    closing = true
    await closeDatabase()
  })
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
app.on('before-quit', (event) => {
  if (closing) return
  event.preventDefault()
  closing = true
  void closeDatabase().finally(() => app.quit())
})
