import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

const javaName = process.platform === 'win32' ? 'java.exe' : 'java'

/** The bundled Java runtime + MPXJ (see scripts/fetch-mpp-runtime.mjs): installer resources first, then the source tree in dev. */
export function resolveMppRuntime(resourcesPath?: string): string | null {
  const candidates = [process.env.MPP_RUNTIME_PATH, resourcesPath && join(resourcesPath, 'mpp'), join(process.cwd(), 'resources', 'mpp')]
  for (const dir of candidates) {
    if (dir && existsSync(join(dir, 'jre', 'bin', javaName)) && existsSync(join(dir, 'classes', 'MppToXml.class'))) return dir
  }
  return null
}

/** Converts a binary .mpp to MS Project XML text by running MPXJ in the bundled Java runtime. */
export async function mppToXml(mppPath: string, resourcesPath?: string): Promise<string> {
  const runtime = resolveMppRuntime(resourcesPath)
  if (!runtime) throw new Error('Este equipo no tiene el lector de .mpp incluido. En MS Project use «Guardar como» → XML y abra ese archivo.')
  const dir = await mkdtemp(join(tmpdir(), 'ogbim-mpp-'))
  const out = join(dir, 'project.xml')
  try {
    const classpath = [join(runtime, 'classes'), join(runtime, 'lib', '*')].join(delimiter)
    await new Promise<void>((resolve, reject) => {
      execFile(
        join(runtime, 'jre', 'bin', javaName),
        ['-Xmx1g', '-XX:TieredStopAtLevel=1', '-cp', classpath, 'MppToXml', mppPath, out],
        { timeout: 120_000, windowsHide: true, maxBuffer: 1024 * 1024 },
        (error, _stdout, stderr) => {
          if (!error) return resolve()
          const reason = /Formato no reconocido/.test(stderr) ? 'El archivo no es un proyecto de MS Project.' : `No se pudo leer el .mpp: ${stderr.split('\n').find((l) => /Exception|Error/.test(l)) ?? error.message}`
          reject(new Error(reason))
        }
      )
    })
    return await readFile(out, 'utf8')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
