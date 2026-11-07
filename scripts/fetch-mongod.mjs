// Fetches the official MongoDB Community server binary for this platform into
// resources/mongod/, so the installer can ship it next to the app (see
// electron-builder `extraResources`) and the app can run it as its own local
// database. The binary is never committed (resources/mongod is git-ignored).
//
// Usage: npm run fetch:mongod
//
// MongoDB Community Server is licensed under the SSPL: it is redistributed here
// unmodified and run as a separate process. See THIRD_PARTY_NOTICES.md.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MONGOD_VERSION = '8.2.6'

const require = createRequire(import.meta.url)
const { MongoBinary } = require('mongodb-memory-server-core')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'resources', 'mongod')
const outFile = join(outDir, process.platform === 'win32' ? 'mongod.exe' : 'mongod')

if (existsSync(outFile)) {
  console.log(`[fetch-mongod] already present: ${outFile}`)
} else {
  console.log(`[fetch-mongod] getting MongoDB ${MONGOD_VERSION} (first time downloads several hundred MB)...`)
  const cached = await MongoBinary.getPath({ version: MONGOD_VERSION })
  mkdirSync(outDir, { recursive: true })
  copyFileSync(cached, outFile)
  console.log(`[fetch-mongod] copied to ${outFile}`)
}
