import { open, stat } from 'node:fs/promises'
import { buildHeader, MAGIC, parseManifest, readPrefix, type Manifest } from '../shared/projectFile'

/** Writes the header and then the models, in the order the manifest lists them. */
export async function writeProjectFile(path: string, manifest: Manifest, models: Uint8Array[]): Promise<void> {
  const file = await open(path, 'w')
  try {
    await file.write(buildHeader(manifest))
    for (const bytes of models) await file.write(bytes)
  } finally {
    await file.close()
  }
}

export interface OpenedProjectFile {
  manifest: Manifest
  /** The bytes of the i-th model of the manifest. */
  readModel(index: number): Promise<Uint8Array>
  close(): Promise<void>
}

/** Opens a project file and checks it; the models are read one at a time, only when asked for. */
export async function openProjectFile(path: string): Promise<OpenedProjectFile> {
  const file = await open(path, 'r')
  try {
    const size = (await stat(path)).size
    const prefix = Buffer.alloc(MAGIC.length + 5)
    const { bytesRead } = await file.read(prefix, 0, prefix.length, 0)
    const { manifestLength, headerLength } = readPrefix(new Uint8Array(prefix.subarray(0, bytesRead)))
    const json = Buffer.alloc(manifestLength)
    const read = await file.read(json, 0, manifestLength, headerLength)
    if (read.bytesRead < manifestLength) throw new Error('El archivo está incompleto: faltan datos del proyecto.')
    const { manifest, dataStart } = parseManifest(new Uint8Array(json), headerLength, size)
    const offsets: number[] = []
    let at = dataStart
    for (const m of manifest.models) {
      offsets.push(at)
      at += m.length
    }
    return {
      manifest,
      readModel: async (index) => {
        const length = manifest.models[index].length
        const bytes = Buffer.alloc(length)
        let got = 0
        while (got < length) {
          const r = await file.read(bytes, got, length - got, offsets[index] + got)
          if (r.bytesRead === 0) throw new Error('El archivo está incompleto: faltan datos de los modelos.')
          got += r.bytesRead
        }
        return new Uint8Array(bytes)
      },
      close: () => file.close()
    }
  } catch (error) {
    await file.close()
    throw error
  }
}
