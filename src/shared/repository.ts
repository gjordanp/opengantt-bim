import type { ProjectData } from './model'

export interface ProjectSummary {
  id: string
  name: string
  /** ISO timestamp of the last save. */
  updatedAt: string
  taskCount: number
  /** Converted IFC models kept with the project. */
  modelCount: number
  /** Earliest task start, `YYYY-MM-DD`, or null when there are no tasks. */
  start: string | null
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
  rename(id: string, name: string): Promise<void>
  /** Copies a whole project (tasks, calendar, BIM groups and model references) and returns the new id. */
  duplicate(id: string, name: string): Promise<string | null>
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
