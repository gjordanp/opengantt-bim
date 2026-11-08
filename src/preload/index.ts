import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type AppApi, type UpdateStatus } from '../shared/api'

// The renderer talks to the main process only through this narrow API.
const api: AppApi = {
  platform: process.platform,
  db: {
    status: () => ipcRenderer.invoke(IPC.dbStatus),
    configure: (settings) => ipcRenderer.invoke(IPC.dbConfigure, settings)
  },
  models: {
    save: (projectId, modelId, name, bytes) => ipcRenderer.invoke(IPC.modelsSave, projectId, modelId, name, bytes),
    load: (projectId, modelId) => ipcRenderer.invoke(IPC.modelsLoad, projectId, modelId),
    remove: (projectId, modelId) => ipcRenderer.invoke(IPC.modelsRemove, projectId, modelId)
  },
  updates: {
    status: () => ipcRenderer.invoke(IPC.updatesStatus),
    check: () => ipcRenderer.invoke(IPC.updatesCheck),
    install: () => ipcRenderer.invoke(IPC.updatesInstall),
    onStatus: (callback) => {
      const listener = (_e: unknown, status: UpdateStatus): void => callback(status)
      ipcRenderer.on(IPC.updatesStatus, listener)
      return () => ipcRenderer.removeListener(IPC.updatesStatus, listener)
    }
  },
  projects: {
    list: () => ipcRenderer.invoke(IPC.projectsList),
    load: (id) => ipcRenderer.invoke(IPC.projectsLoad, id),
    create: (name, data) => ipcRenderer.invoke(IPC.projectsCreate, name, data),
    save: (id, data) => ipcRenderer.invoke(IPC.projectsSave, id, data),
    remove: (id) => ipcRenderer.invoke(IPC.projectsRemove, id),
    rename: (id, name) => ipcRenderer.invoke(IPC.projectsRename, id, name),
    duplicate: (id, name) => ipcRenderer.invoke(IPC.projectsDuplicate, id, name)
  }
}

contextBridge.exposeInMainWorld('api', api)
