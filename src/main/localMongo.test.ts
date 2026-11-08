import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { pidFileFor, reapOrphanMongod } from './localMongo'

const nodeName = process.platform === 'win32' ? 'node.exe' : 'node'
const dirs: string[] = []
const children: number[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'og-mongo-'))
  dirs.push(dir)
  return dir
}

/** A process that idles until killed, standing in for an orphaned mongod. */
function idleProcess(): number {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true })
  child.unref()
  children.push(child.pid as number)
  return child.pid as number
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

afterEach(() => {
  for (const pid of children.splice(0)) {
    try {
      process.kill(pid)
    } catch {
      /* already gone */
    }
  }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('reapOrphanMongod', () => {
  it('does nothing when there is no pid file', async () => {
    expect(await reapOrphanMongod(tempDir(), nodeName)).toBe(false)
  })

  it('stops a leftover process that matches the binary name and removes the pid file', async () => {
    const dir = tempDir()
    const pid = idleProcess()
    writeFileSync(pidFileFor(dir), String(pid))
    expect(await reapOrphanMongod(dir, nodeName)).toBe(true)
    expect(alive(pid)).toBe(false)
    expect(existsSync(pidFileFor(dir))).toBe(false)
  })

  it('leaves alone a live process with a different name (a reused pid)', async () => {
    const dir = tempDir()
    const pid = idleProcess()
    writeFileSync(pidFileFor(dir), String(pid))
    expect(await reapOrphanMongod(dir, 'definitely-not-this.exe')).toBe(false)
    expect(alive(pid)).toBe(true)
    expect(existsSync(pidFileFor(dir))).toBe(false)
  })

  it('ignores a stale or garbage pid file', async () => {
    const dir = tempDir()
    writeFileSync(pidFileFor(dir), 'not a pid')
    expect(await reapOrphanMongod(dir, nodeName)).toBe(false)
    expect(existsSync(pidFileFor(dir))).toBe(false)
  })
})
