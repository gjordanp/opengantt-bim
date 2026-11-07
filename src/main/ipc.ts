import { ipcMain } from 'electron'
import { IPC } from '../shared/api'
import { configureDatabase, getRepository, getStatus } from './database'
import { copyProjectModels, loadModel, removeModel, removeProjectModels, saveModel } from './modelStore'

export function registerIpc(): void {
  ipcMain.handle(IPC.dbStatus, () => getStatus())
  ipcMain.handle(IPC.dbConfigure, (_e, settings) => configureDatabase(settings))

  ipcMain.handle(IPC.projectsList, () => getRepository().list())
  ipcMain.handle(IPC.projectsLoad, (_e, id: string) => getRepository().load(id))
  ipcMain.handle(IPC.projectsCreate, (_e, name: string, data) => getRepository().create(name, data))
  ipcMain.handle(IPC.projectsSave, (_e, id: string, data) => getRepository().save(id, data))
  ipcMain.handle(IPC.projectsRemove, async (_e, id: string) => {
    await getRepository().remove(id)
    await removeProjectModels(id)
  })

  ipcMain.handle(IPC.projectsRename, (_e, id: string, name: string) => getRepository().rename(id, name))
  ipcMain.handle(IPC.projectsDuplicate, async (_e, id: string, name: string) => {
    const copyId = await getRepository().duplicate(id, name)
    if (copyId) await copyProjectModels(id, copyId)
    return copyId
  })

  ipcMain.handle(IPC.modelsSave, (_e, projectId: string, modelId: string, name: string, bytes: Uint8Array) =>
    saveModel(projectId, modelId, name, bytes)
  )
  ipcMain.handle(IPC.modelsLoad, (_e, projectId: string, modelId: string) => loadModel(projectId, modelId))
  ipcMain.handle(IPC.modelsRemove, (_e, projectId: string, modelId: string) => removeModel(projectId, modelId))
}
