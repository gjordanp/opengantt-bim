import { BrowserWindow, app, dialog, type WebContents } from 'electron'
import type { BimModelRef } from '../shared/bimGroups'
import type { ProjectData } from '../shared/model'
import { FORMAT_VERSION, type FileModel, type Manifest } from '../shared/projectFile'
import { openProjectFile, writeProjectFile } from './projectFileIo'
import { getRepository } from './database'
import { loadModel, removeProjectModels, saveModel } from './modelStore'

const FILTERS = [{ name: 'Proyecto de Opengantt BIM', extensions: ['ogbim'] }]

export interface ExportResult {
  path: string
  /** Models written into the file. */
  models: number
  /** Models the project lists but whose file was not found (left out). */
  missing: number
}

export interface ImportResult {
  id: string
  name: string
  models: number
}

async function dialogFor<T>(sender: WebContents, run: (win: BrowserWindow | null) => Promise<T>): Promise<T> {
  return run(BrowserWindow.fromWebContents(sender))
}

/** Saves a project, with its models, in one file the user picks. Null when they cancel. */
export async function exportProjectFile(sender: WebContents, id: string, defaultName: string): Promise<ExportResult | null> {
  const data = await getRepository().load(id)
  if (!data) throw new Error('El proyecto ya no existe.')
  const refs = data.bim?.models ?? []
  const present: { ref: BimModelRef; bytes: Uint8Array }[] = []
  for (const ref of refs) {
    const bytes = await loadModel(id, ref.id)
    if (bytes) present.push({ ref, bytes })
  }
  const picked = await dialogFor(sender, (win) => {
    const options = { defaultPath: `${defaultName}.ogbim`, filters: FILTERS }
    return win ? dialog.showSaveDialog(win, options) : dialog.showSaveDialog(options)
  })
  if (picked.canceled || !picked.filePath) return null

  // A model whose file is gone is left out of the file and out of the copy of the project it carries.
  const project: ProjectData = { ...data, bim: data.bim ? { ...data.bim, models: present.map((p) => p.ref) } : data.bim }
  const models: FileModel[] = present.map((p) => ({ id: p.ref.id, name: p.ref.name, addedAt: p.ref.addedAt, length: p.bytes.byteLength }))
  const manifest: Manifest = { format: 'opengantt-bim', version: FORMAT_VERSION, appVersion: app.getVersion(), exportedAt: new Date().toISOString(), project, models }
  await writeProjectFile(picked.filePath, manifest, present.map((p) => p.bytes))
  return { path: picked.filePath, models: present.length, missing: refs.length - present.length }
}

/** Reads a project file the user picks and creates a new project from it, models included. Null when they cancel. */
export async function importProjectFile(sender: WebContents): Promise<ImportResult | null> {
  const picked = await dialogFor(sender, (win) => {
    const options = { properties: ['openFile' as const], filters: FILTERS }
    return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options)
  })
  const path = picked.filePaths[0]
  if (picked.canceled || !path) return null

  const file = await openProjectFile(path)
  let newId: string | null = null
  try {
    const { manifest } = file
    const repo = getRepository()
    const project = manifest.project
    newId = await repo.create(project.name, { tasks: project.tasks, links: project.links })
    const refs: BimModelRef[] = []
    for (let i = 0; i < manifest.models.length; i++) {
      const m = manifest.models[i]
      const ref = await saveModel(newId, m.id, m.name, await file.readModel(i))
      refs.push({ ...ref, addedAt: m.addedAt || ref.addedAt })
    }
    await repo.save(newId, { ...project, bim: project.bim ? { ...project.bim, models: refs } : project.bim })
    return { id: newId, name: project.name, models: refs.length }
  } catch (error) {
    // Nothing half-imported stays behind.
    if (newId) {
      await getRepository().remove(newId).catch(() => undefined)
      await removeProjectModels(newId).catch(() => undefined)
    }
    throw error
  } finally {
    await file.close()
  }
}
