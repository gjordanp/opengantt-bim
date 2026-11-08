import type { ProjectData } from './model'
import type { DbSettings, ProjectSummary } from './repository'
import type { BimModelRef } from './bimGroups'

export interface DbStatus {
  connected: boolean
  settings: DbSettings
  /** Why the connection failed, when it did. */
  error?: string
}

/** Progress of the self-update, as reported by the main process. */
export interface UpdateStatus {
  state: 'idle' | 'checking' | 'none' | 'downloading' | 'ready' | 'error'
  version?: string
  /** 0-100 while downloading. */
  percent?: number
  message?: string
}

export interface FileFilter {
  name: string
  /** Without the dot, e.g. `xml`. */
  extensions: string[]
}

/** What the renderer may ask the main process for (exposed by the preload script). */
export interface AppApi {
  platform: string
  db: {
    status(): Promise<DbStatus>
    /** Saves the settings and reconnects with them. */
    configure(settings: DbSettings): Promise<DbStatus>
  }
  /** Converted IFC models kept next to the project, in the app data folder. */
  models: {
    save(projectId: string, modelId: string, name: string, bytes: Uint8Array): Promise<BimModelRef>
    load(projectId: string, modelId: string): Promise<Uint8Array | null>
    remove(projectId: string, modelId: string): Promise<void>
  }
  /** Open and save dialogs; the user always picks the file, the renderer never gets a path to read on its own. */
  files: {
    openText(filters: FileFilter[]): Promise<{ name: string; text: string } | null>
    /** Resolves to the path written, or null if the user cancelled. */
    saveText(defaultName: string, text: string, filters: FileFilter[]): Promise<string | null>
  }
  /** The window chrome (title bar buttons, background) follows the app theme. */
  appearance: {
    setTheme(theme: 'light' | 'dark'): Promise<void>
  }
  app: {
    /** The installed version of the app. */
    version(): Promise<string>
  }
  updates: {
    status(): Promise<UpdateStatus>
    check(): Promise<void>
    /** Restarts the app to install a downloaded update. */
    install(): Promise<void>
    /** Subscribes to status changes; returns the unsubscribe function. */
    onStatus(callback: (status: UpdateStatus) => void): () => void
  }
  projects: {
    list(): Promise<ProjectSummary[]>
    load(id: string): Promise<ProjectData | null>
    create(name: string, data?: Pick<ProjectData, 'tasks' | 'links'>): Promise<string>
    save(id: string, data: ProjectData): Promise<void>
    remove(id: string): Promise<void>
    rename(id: string, name: string): Promise<void>
    duplicate(id: string, name: string): Promise<string | null>
  }
}

export const IPC = {
  dbStatus: 'db:status',
  dbConfigure: 'db:configure',
  projectsList: 'projects:list',
  projectsLoad: 'projects:load',
  projectsCreate: 'projects:create',
  projectsSave: 'projects:save',
  projectsRemove: 'projects:remove',
  projectsRename: 'projects:rename',
  projectsDuplicate: 'projects:duplicate',
  modelsSave: 'models:save',
  modelsLoad: 'models:load',
  modelsRemove: 'models:remove',
  filesOpenText: 'files:openText',
  filesSaveText: 'files:saveText',
  appearanceSetTheme: 'appearance:setTheme',
  appVersion: 'app:version',
  updatesStatus: 'updates:status',
  updatesCheck: 'updates:check',
  updatesInstall: 'updates:install'
} as const
