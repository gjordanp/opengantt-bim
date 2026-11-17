import { describe, expect, it } from 'vitest'
import { buildHeader, parseManifest, readPrefix, type Manifest } from './projectFile'

const manifest = (models: Manifest['models'] = []): Manifest => ({
  format: 'opengantt-bim',
  version: 1,
  appVersion: '0.4.0',
  exportedAt: '2026-11-18T10:00:00.000Z',
  project: { name: 'Edificio «ñandú»', tasks: [{ id: '1', text: 'Ciclo 1', start_date: '2026-03-02', duration: 8, progress: 0, parent: '0' }], links: [] },
  models
})

/** Reads a header back the way the importer does. */
function roundTrip(m: Manifest, bodyLength = 0): { manifest: Manifest; dataStart: number } {
  const header = buildHeader(m)
  const file = new Uint8Array(header.length + bodyLength)
  file.set(header)
  const { manifestLength, headerLength } = readPrefix(file)
  return parseManifest(file.subarray(headerLength, headerLength + manifestLength), headerLength, file.length)
}

describe('project file header', () => {
  it('gives the manifest back, accents included', () => {
    const { manifest: back, dataStart } = roundTrip(manifest())
    expect(back.project.name).toBe('Edificio «ñandú»')
    expect(back.project.tasks).toHaveLength(1)
    expect(dataStart).toBe(buildHeader(manifest()).length)
  })

  it('accepts models that fit in the file', () => {
    const models = [
      { id: 'm1', name: 'Estructura.ifc', addedAt: '2026-11-01T00:00:00.000Z', length: 10 },
      { id: 'm2', name: 'Arq.ifc', addedAt: '2026-11-01T00:00:00.000Z', length: 5 }
    ]
    expect(roundTrip(manifest(models), 15).manifest.models).toHaveLength(2)
  })

  it('refuses a file that is cut short', () => {
    const models = [{ id: 'm1', name: 'a', addedAt: '', length: 10 }]
    expect(() => roundTrip(manifest(models), 9)).toThrow(/incompleto/)
  })

  it('refuses something that is not a project file', () => {
    expect(() => readPrefix(new TextEncoder().encode('PK\u0003\u0004 not ours at all'))).toThrow(/No es un archivo/)
    expect(() => readPrefix(new Uint8Array(3))).toThrow(/No es un archivo/)
  })

  it('refuses a newer format with a message to update', () => {
    const header = buildHeader(manifest())
    header[5] = 99
    expect(() => readPrefix(header)).toThrow(/versión más nueva/)
  })

  it('refuses model ids that could reach outside the models folder', () => {
    for (const id of ['../x', 'a/b', '', 'a b']) {
      expect(() => roundTrip(manifest([{ id, name: 'x', addedAt: '', length: 0 }]))).toThrow(/dañado/)
    }
    const dup = { id: 'same', name: 'x', addedAt: '', length: 0 }
    expect(() => roundTrip(manifest([dup, dup]))).toThrow(/dañado/)
  })

  it('refuses a manifest without tasks', () => {
    const bad = { ...manifest(), project: { name: 'x' } } as unknown as Manifest
    expect(() => roundTrip(bad)).toThrow(/dañado/)
  })
})
