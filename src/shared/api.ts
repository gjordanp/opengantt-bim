import type { ProjectData } from './model'
import type { DbSettings, ProjectSummary } from './repository'
import type { BimModelRef } from './bimGroups'

export interface DbStatus {
  connected: boolean
  settings: DbSettings
  /** Why the connection failed, when it did. */
  error?: string
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
  projects: {
    list(): Promise<ProjectSummary[]>
    load(id: string): Promise<ProjectData | null>
    create(name: string, data?: Pick<ProjectData, 'tasks' | 'links'>): Promise<string>
    save(id: string, data: ProjectData): Promise<void>
    remove(id: string): Promise<void>
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
  modelsSave: 'models:save',
  modelsLoad: 'models:load',
  modelsRemove: 'models:remove'
} as const
