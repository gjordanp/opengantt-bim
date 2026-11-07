import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type AppApi } from '../shared/api'

// The renderer talks to the main process only through this narrow API.
const api: AppApi = {
  platform: process.platform,
  db: {
    status: () => ipcRenderer.invoke(IPC.dbStatus),
    configure: (settings) => ipcRenderer.invoke(IPC.dbConfigure, settings)
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
