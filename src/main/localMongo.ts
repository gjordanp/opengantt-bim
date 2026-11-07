import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { createConnection, createServer } from 'node:net'
import { join } from 'node:path'
import { MongoClient } from 'mongodb'

const binaryName = process.platform === 'win32' ? 'mongod.exe' : 'mongod'

/**
 * Finds the bundled `mongod`: an explicit `MONGOD_PATH`, then the installer's
 * resources folder, then `resources/mongod/` in the source tree (dev, after
 * `npm run fetch:mongod`). `null` if none exists.
 */
export function resolveMongodPath(resourcesPath?: string): string | null {
  const candidates = [
    process.env['MONGOD_PATH'],
    resourcesPath && join(resourcesPath, 'mongod', binaryName),
    join(process.cwd(), 'resources', 'mongod', binaryName)
  ].filter((p): p is string => Boolean(p))
  return candidates.find((p) => existsSync(p)) ?? null
}

export interface LocalMongo {
  uri: string
  port: number
  /** Asks the server to shut down cleanly, and kills it if it doesn't. */
  stop(): Promise<void>
}

export interface StartOptions {
  binaryPath: string
  /** Where the database files live. Created if missing. */
  dataDir: string
  /** Defaults to any free port. */
  port?: number
  startupTimeoutMs?: number
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })
}

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

/**
 * Starts a private `mongod` for this app: bound to localhost only, on its own
 * port, with a small cache so it stays light on a desktop machine.
 */
export async function startLocalMongo({
  binaryPath,
  dataDir,
  port,
  startupTimeoutMs = 30_000
}: StartOptions): Promise<LocalMongo> {
  mkdirSync(dataDir, { recursive: true })
  const listenPort = port ?? (await freePort())

  const child: ChildProcess = spawn(
    binaryPath,
    [
      '--dbpath', dataDir,
      '--bind_ip', '127.0.0.1',
      '--port', String(listenPort),
      '--wiredTigerCacheSizeGB', '0.25'
    ],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }
  )

  let stderrTail = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-2000)
  })
  let exited = false
  let exitCode: number | null = null
  child.once('exit', (code) => {
    exited = true
    exitCode = code
  })

  const deadline = Date.now() + startupTimeoutMs
  for (;;) {
    if (exited) throw new Error(`mongod exited with code ${exitCode}: ${stderrTail.trim() || 'no output'}`)
    if (await canConnect(listenPort)) break
    if (Date.now() > deadline) {
      child.kill()
      throw new Error(`mongod did not start within ${startupTimeoutMs} ms`)
    }
    await new Promise((r) => setTimeout(r, 150))
  }

  const uri = `mongodb://127.0.0.1:${listenPort}`

  const stop = async (): Promise<void> => {
    if (exited) return
    const done = new Promise<void>((resolve) => child.once('exit', () => resolve()))
    try {
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 2000 })
      await client.connect()
      // The server closes the connection as it goes down, so this call usually errors.
      await client.db('admin').command({ shutdown: 1, force: true }).catch(() => undefined)
      await client.close().catch(() => undefined)
    } catch {
      // fall through to the kill below
    }
    const timer = setTimeout(() => child.kill(), 10_000)
    await done
    clearTimeout(timer)
  }

  return { uri, port: listenPort, stop }
}
