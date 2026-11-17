import { mkdtemp, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Manifest } from '../shared/projectFile'
import { openProjectFile, writeProjectFile } from './projectFileIo'

let dir: string
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ogbim-test-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

// Two "models" with recognisable bytes, one of them bigger than a typical read buffer.
const modelA = Uint8Array.from({ length: 300_000 }, (_, i) => i % 251)
const modelB = Uint8Array.from([1, 2, 3, 4, 5])

const manifest = (): Manifest => ({
  format: 'opengantt-bim',
  version: 1,
  appVersion: '0.4.0',
  exportedAt: '2026-11-18T10:00:00.000Z',
  project: {
    name: 'Edificio de prueba',
    holidays: ['2026-12-25'],
    tasks: [{ id: '1', text: 'Ciclo 1', start_date: '2026-03-02', duration: 8, progress: 0.5, parent: '0' }],
    links: [],
    bim: {
      groups: [{ id: 'g1', code: 'G1', name: 'Piso 1', color: '#0ea5e9', query: { op: 'and', rules: [] }, manualInclude: [], manualExclude: [] }],
      links: [{ taskId: '1', groupIds: ['g1'], guids: [] }],
      models: [
        { id: 'm1', name: 'Estructura.ifc', size: modelA.length, addedAt: '2026-11-01T00:00:00.000Z' },
        { id: 'm2', name: 'Arquitectura.ifc', size: modelB.length, addedAt: '2026-11-02T00:00:00.000Z' }
      ]
    }
  },
  models: [
    { id: 'm1', name: 'Estructura.ifc', addedAt: '2026-11-01T00:00:00.000Z', length: modelA.length },
    { id: 'm2', name: 'Arquitectura.ifc', addedAt: '2026-11-02T00:00:00.000Z', length: modelB.length }
  ]
})

describe('project file on disk', () => {
  it('gives the project and each model back byte for byte', async () => {
    const path = join(dir, 'ok.ogbim')
    await writeProjectFile(path, manifest(), [modelA, modelB])
    const file = await openProjectFile(path)
    try {
      expect(file.manifest.project.name).toBe('Edificio de prueba')
      expect(file.manifest.project.bim?.links[0].groupIds).toEqual(['g1'])
      expect(file.manifest.models.map((m) => m.id)).toEqual(['m1', 'm2'])
      expect(await file.readModel(1)).toEqual(modelB) // out of order on purpose
      expect(await file.readModel(0)).toEqual(modelA)
    } finally {
      await file.close()
    }
  })

  it('works for a project with no models', async () => {
    const path = join(dir, 'none.ogbim')
    const m = { ...manifest(), models: [] }
    await writeProjectFile(path, m, [])
    const file = await openProjectFile(path)
    expect(file.manifest.models).toEqual([])
    await file.close()
  })

  it('refuses a file cut short, before reading any model', async () => {
    const path = join(dir, 'cut.ogbim')
    await writeProjectFile(path, manifest(), [modelA, modelB])
    await truncate(path, 1000 + 1)
    await expect(openProjectFile(path)).rejects.toThrow(/incompleto/)
  })

  it('refuses a file that is not a project file', async () => {
    const path = join(dir, 'other.ogbim')
    await writeFile(path, 'esto es un texto cualquiera que no es un proyecto')
    await expect(openProjectFile(path)).rejects.toThrow(/No es un archivo/)
  })
})
