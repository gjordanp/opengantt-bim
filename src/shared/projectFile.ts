import type { ProjectData } from './model'

/**
 * The project file (`.ogbim`): one project with everything it needs, to move it to another computer or keep a copy.
 *
 * Layout, all in one file and with no compression (the models are already compressed):
 *   5 bytes   the text "OGBIM"
 *   1 byte    format version
 *   4 bytes   length of the manifest, little endian
 *   N bytes   the manifest, JSON in UTF-8
 *   ...       the models, one after another, in the order and with the lengths the manifest lists
 */
export const MAGIC = 'OGBIM'
export const FORMAT_VERSION = 1
export const MAX_MANIFEST_BYTES = 64 * 1024 * 1024

/** A model inside the file: the reference the project keeps, plus how many bytes of the file it takes. */
export interface FileModel {
  id: string
  name: string
  addedAt: string
  /** Bytes the model takes in the file. */
  length: number
}

export interface Manifest {
  format: 'opengantt-bim'
  version: number
  appVersion: string
  exportedAt: string
  project: ProjectData
  models: FileModel[]
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/

/** The bytes that open the file: magic, version, manifest length and the manifest. */
export function buildHeader(manifest: Manifest): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(manifest))
  const out = new Uint8Array(MAGIC.length + 1 + 4 + json.length)
  out.set(new TextEncoder().encode(MAGIC), 0)
  out[MAGIC.length] = FORMAT_VERSION
  new DataView(out.buffer).setUint32(MAGIC.length + 1, json.length, true)
  out.set(json, MAGIC.length + 5)
  return out
}

/** The fixed part of the header: how long the manifest is, or why the file is not a project file. */
export function readPrefix(bytes: Uint8Array): { manifestLength: number; headerLength: number } {
  const prefix = MAGIC.length + 5
  if (bytes.length < prefix || new TextDecoder().decode(bytes.subarray(0, MAGIC.length)) !== MAGIC) {
    throw new Error('No es un archivo de proyecto de Opengantt BIM.')
  }
  const version = bytes[MAGIC.length]
  if (version > FORMAT_VERSION) throw new Error('Este archivo es de una versión más nueva de Opengantt BIM. Actualiza la aplicación para abrirlo.')
  const manifestLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(MAGIC.length + 1, true)
  if (manifestLength === 0 || manifestLength > MAX_MANIFEST_BYTES) throw new Error('El archivo está dañado (encabezado inválido).')
  return { manifestLength, headerLength: prefix }
}

/** Reads and checks the manifest; `fileSize` is the size of the whole file, to be sure the models fit in it. */
export function parseManifest(json: Uint8Array, headerLength: number, fileSize: number): { manifest: Manifest; dataStart: number } {
  let manifest: Manifest
  try {
    manifest = JSON.parse(new TextDecoder().decode(json)) as Manifest
  } catch {
    throw new Error('El archivo está dañado (no se puede leer su contenido).')
  }
  if (manifest?.format !== 'opengantt-bim' || typeof manifest.project !== 'object' || manifest.project === null) {
    throw new Error('No es un archivo de proyecto de Opengantt BIM.')
  }
  const project = manifest.project
  if (typeof project.name !== 'string' || !Array.isArray(project.tasks) || !Array.isArray(project.links)) {
    throw new Error('El archivo está dañado (faltan las tareas del proyecto).')
  }
  if (!Array.isArray(manifest.models)) throw new Error('El archivo está dañado (faltan los modelos).')
  const seen = new Set<string>()
  let total = 0
  for (const m of manifest.models) {
    if (!m || !SAFE_ID.test(String(m.id)) || seen.has(m.id) || !Number.isInteger(m.length) || m.length < 0) {
      throw new Error('El archivo está dañado (un modelo no es válido).')
    }
    seen.add(m.id)
    total += m.length
  }
  const dataStart = headerLength + json.length
  if (dataStart + total > fileSize) throw new Error('El archivo está incompleto: faltan datos de los modelos.')
  return { manifest, dataStart }
}
