import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { BimModelRef } from '../shared/bimGroups'

/** Converted models live next to the database: <userData>/models/<projectId>/<modelId>.frag */
const root = (): string => join(app.getPath('userData'), 'models')

// Ids come from the renderer; only plain id characters may reach the file system.
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/
function check(...ids: string[]): void {
  for (const id of ids) if (!SAFE_ID.test(id)) throw new Error('Invalid id')
}

const fileFor = (projectId: string, modelId: string): string => join(root(), projectId, `${modelId}.frag`)

export async function saveModel(projectId: string, modelId: string, name: string, bytes: Uint8Array): Promise<BimModelRef> {
  check(projectId, modelId)
  await mkdir(join(root(), projectId), { recursive: true })
  await writeFile(fileFor(projectId, modelId), bytes)
  return { id: modelId, name: String(name).slice(0, 200), size: bytes.byteLength, addedAt: new Date().toISOString() }
}

export async function loadModel(projectId: string, modelId: string): Promise<Uint8Array | null> {
  check(projectId, modelId)
  try {
    return new Uint8Array(await readFile(fileFor(projectId, modelId)))
  } catch {
    return null
  }
}

export async function removeModel(projectId: string, modelId: string): Promise<void> {
  check(projectId, modelId)
  await rm(fileFor(projectId, modelId), { force: true })
}

export async function copyProjectModels(fromId: string, toId: string): Promise<void> {
  check(fromId, toId)
  await cp(join(root(), fromId), join(root(), toId), { recursive: true }).catch(() => undefined)
}

export async function removeProjectModels(projectId: string): Promise<void> {
  check(projectId)
  await rm(join(root(), projectId), { recursive: true, force: true })
}
