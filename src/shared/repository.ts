import type { ProjectData } from './model'

export interface ProjectSummary {
  id: string
  name: string
  /** ISO timestamp of the last save. */
  updatedAt: string
}

/**
 * Where projects live. Documents have the shape of `ProjectData`, so the same
 * interface can be backed by MongoDB today and by an embedded document store
 * later.
 */
export interface ProjectRepository {
  list(): Promise<ProjectSummary[]>
  /** `null` when the id doesn't exist. */
  load(id: string): Promise<ProjectData | null>
  /** Creates a project and returns its id. */
  create(name: string, data?: Pick<ProjectData, 'tasks' | 'links'>): Promise<string>
  /** Replaces the project's name, tasks and links. Throws if it doesn't exist. */
  save(id: string, data: ProjectData): Promise<void>
  remove(id: string): Promise<void>
  close(): Promise<void>
}

/**
 * Where the database comes from. `bundled` (default) runs the `mongod` that
 * ships with the installer; `external` connects to a MongoDB the user runs.
 */
export type DbSettings =
  | { mode: 'bundled' }
  | { mode: 'external'; mongoUri: string }

export const DB_NAME = 'opengantt_bim'

export const DEFAULT_DB_SETTINGS: DbSettings = { mode: 'bundled' }
