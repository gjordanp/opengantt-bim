import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC, type UpdateStatus } from '../shared/api'

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000

let status: UpdateStatus = { state: 'idle' }

function publish(next: UpdateStatus): void {
  status = next
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IPC.updatesStatus, next)
}

/**
 * Looks for new versions on the GitHub releases of this repository (see `publish` in
 * electron-builder.yml), downloads them in the background and installs them the next
 * time the app closes. Only active in the packaged app: a dev run has nothing to update.
 *
 * `beforeInstall` runs just before the app restarts to install, so the local database
 * can be shut down cleanly first.
 */
export function initUpdater(beforeInstall: () => Promise<void>): void {
  ipcMain.handle(IPC.updatesStatus, () => status)
  ipcMain.handle(IPC.updatesCheck, async () => {
    if (!app.isPackaged) return publish({ state: 'none' })
    try {
      await autoUpdater.checkForUpdates()
    } catch (e) {
      publish({ state: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  })
  ipcMain.handle(IPC.updatesInstall, async () => {
    if (status.state !== 'ready') return
    await beforeInstall()
    autoUpdater.quitAndInstall(false, true)
  })

  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => publish({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => publish({ state: 'downloading', version: info.version, percent: 0 }))
  autoUpdater.on('update-not-available', () => publish({ state: 'none' }))
  autoUpdater.on('download-progress', (p) => publish({ state: 'downloading', version: status.version, percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => publish({ state: 'ready', version: info.version }))
  autoUpdater.on('error', (e) => publish({ state: 'error', message: e.message }))

  const check = (): void => void autoUpdater.checkForUpdates().catch(() => undefined)
  setTimeout(check, 10_000)
  setInterval(check, CHECK_EVERY_MS)
}
