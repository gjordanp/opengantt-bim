import { contextBridge } from 'electron'

// The renderer talks to the main process only through this narrow API.
// Project file access (open/save) is added here in the persistence step.
const api = {
  platform: process.platform
}

contextBridge.exposeInMainWorld('api', api)

export type PreloadApi = typeof api
