import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

/** Where the app records the pid of the mongod it started (mongod's own `mongod.lock` is not used for this). */
export const pidFileFor = (dataDir: string): string => join(dataDir, 'opengantt-mongod.pid')

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** True when `pid` is a running process whose image name is `name` (so a reused pid is never killed by mistake). */
function isProcessNamed(pid: number, name: string): boolean {
  try {
    const out =
      process.platform === 'win32'
        ? execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true })
        : execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' })
    return out.toLowerCase().includes(name.toLowerCase())
  } catch {
    return false
  }
}

/**
 * A mongod left behind by a crashed or force-killed app keeps the data folder locked, so the
 * next start would fail. If the previous run recorded its pid and that process is still a
 * mongod, stop it and wait for it to go. Returns true when an orphan was found and stopped.
 */
export async function reapOrphanMongod(dataDir: string, binaryName: string, waitMs = 5000): Promise<boolean> {
  const file = pidFileFor(dataDir)
  let pid = NaN
  try {
    pid = Number.parseInt(readFileSync(file, 'utf8'), 10)
  } catch {
    return false
  }
  rmSync(file, { force: true })
  if (!Number.isInteger(pid) || pid <= 0 || !isProcessNamed(pid, binaryName)) return false
  try {
    process.kill(pid)
  } catch {
    return false
  }
  const deadline = Date.now() + waitMs
  while (isAlive(pid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100))
  return true
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
  await reapOrphanMongod(dataDir, binaryName)
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

  const pidFile = pidFileFor(dataDir)
  if (child.pid) writeFileSync(pidFile, String(child.pid), 'utf8')
  // Even if the app dies abruptly, taking its mongod down with it avoids the orphan in the first place.
  const killWithApp = (): void => {
    try {
      child.kill()
    } catch {
      /* already gone */
    }
  }
  process.once('exit', killWithApp)

  let stderrTail = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-2000)
  })
  let exited = false
  let exitCode: number | null = null
  child.once('exit', (code) => {
    exited = true
    exitCode = code
    rmSync(pidFile, { force: true })
    process.removeListener('exit', killWithApp)
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
