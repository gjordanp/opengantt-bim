import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { DEFAULT_DB_SETTINGS, type DbSettings, type ProjectRepository } from '../shared/repository'
import type { DbStatus } from '../shared/api'
import { resolveMongodPath, startLocalMongo, type LocalMongo } from './localMongo'
import { MongoProjectRepository } from './mongoRepository'

let repo: ProjectRepository | null = null
let local: LocalMongo | null = null
let status: DbStatus = { connected: false, settings: DEFAULT_DB_SETTINGS }

const settingsFile = (): string => join(app.getPath('userData'), 'settings.json')

function loadSettings(): DbSettings {
  try {
    const raw = JSON.parse(readFileSync(settingsFile(), 'utf8')) as { db?: DbSettings }
    if (raw.db?.mode === 'external' && typeof raw.db.mongoUri === 'string') return raw.db
  } catch {
    // no settings yet
  }
  return DEFAULT_DB_SETTINGS
}

function saveSettings(db: DbSettings): void {
  writeFileSync(settingsFile(), JSON.stringify({ db }, null, 2), 'utf8')
}

async function disconnect(): Promise<void> {
  await repo?.close().catch(() => undefined)
  repo = null
  await local?.stop().catch(() => undefined)
  local = null
}

/** Connects with the given (or saved) settings. Never throws: failures land in the status. */
export async function connectDatabase(settings: DbSettings = loadSettings()): Promise<DbStatus> {
  await disconnect()
  try {
    let uri: string
    if (settings.mode === 'external') {
      uri = settings.mongoUri
    } else {
      const binaryPath = resolveMongodPath(process.resourcesPath)
      if (!binaryPath) throw new Error('No se encontró el servidor de base de datos incluido (mongod).')
      local = await startLocalMongo({ binaryPath, dataDir: join(app.getPath('userData'), 'mongo-data') })
      uri = local.uri
    }
    repo = await MongoProjectRepository.connect(uri)
    status = { connected: true, settings }
  } catch (error) {
    await disconnect()
    status = { connected: false, settings, error: error instanceof Error ? error.message : String(error) }
  }
  return status
}

export async function configureDatabase(settings: DbSettings): Promise<DbStatus> {
  const result = await connectDatabase(settings)
  if (result.connected) saveSettings(settings)
  return result
}

export const getStatus = (): DbStatus => status

export function getRepository(): ProjectRepository {
  if (!repo) throw new Error('La base de datos no está conectada.')
  return repo
}

export const closeDatabase = disconnect
