import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type AppApi } from '../shared/api'

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
  projects: {
    list: () => ipcRenderer.invoke(IPC.projectsList),
    load: (id) => ipcRenderer.invoke(IPC.projectsLoad, id),
    create: (name, data) => ipcRenderer.invoke(IPC.projectsCreate, name, data),
    save: (id, data) => ipcRenderer.invoke(IPC.projectsSave, id, data),
    remove: (id) => ipcRenderer.invoke(IPC.projectsRemove, id)
  }
}

contextBridge.exposeInMainWorld('api', api)
