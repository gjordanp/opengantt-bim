import { ipcMain } from 'electron'
import { IPC } from '../shared/api'
import { configureDatabase, getRepository, getStatus } from './database'

export function registerIpc(): void {
  ipcMain.handle(IPC.dbStatus, () => getStatus())
  ipcMain.handle(IPC.dbConfigure, (_e, settings) => configureDatabase(settings))

  ipcMain.handle(IPC.projectsList, () => getRepository().list())
  ipcMain.handle(IPC.projectsLoad, (_e, id: string) => getRepository().load(id))
  ipcMain.handle(IPC.projectsCreate, (_e, name: string, data) => getRepository().create(name, data))
  ipcMain.handle(IPC.projectsSave, (_e, id: string, data) => getRepository().save(id, data))
  ipcMain.handle(IPC.projectsRemove, (_e, id: string) => getRepository().remove(id))
}
