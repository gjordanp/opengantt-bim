#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadVerified } from '../src/download.js'
import { parseLatest, releaseBase } from '../src/latest.js'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const value = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

if (flag('--help') || flag('-h')) {
  console.log(`openganttbim: downloads and runs the Opengantt BIM installer (Windows)

  npx openganttbim                  install the latest version
  npx openganttbim --version 0.3.0  install a given version
  npx openganttbim --silent         no installer window (NSIS /S)
  npx openganttbim --check          only show what would be installed

The installer is not code-signed, so Windows may still show its own warning. Before running it,
this tool checks the file against the size and SHA-512 published in the release (latest.yml),
which catches a corrupt or truncated download.`)
  process.exit(0)
}

if (process.platform !== 'win32') {
  console.error('Opengantt BIM has a Windows installer only. Nothing was downloaded.')
  process.exit(1)
}

const mb = (n) => (n / 1048576).toFixed(1)
let dir
try {
  const base = releaseBase(value('--version'))
  run: {
  console.log('Looking up the release...')
  const res = await fetch(base + 'latest.yml', { redirect: 'follow' })
  if (!res.ok) throw new Error(`Could not read latest.yml: HTTP ${res.status}`)
  const info = parseLatest(await res.text())
  console.log(`Opengantt BIM ${info.version} (${mb(info.size)} MB)`)
  if (flag('--check')) break run

  dir = await mkdtemp(join(tmpdir(), 'openganttbim-'))
  const file = join(dir, info.file)
  let last = -1
  await downloadVerified(base + info.file, file, info, (got, total) => {
    const pct = Math.floor((got / total) * 100)
    if (pct !== last && process.stdout.isTTY) process.stdout.write(`\rDownloading... ${pct}%`)
    last = pct
  })
  console.log('\nSize and SHA-512 match the release. Starting the installer...')

  const code = await new Promise((resolve, reject) => {
    const child = spawn(file, flag('--silent') ? ['/S'] : [], { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', resolve)
  })
  if (code !== 0) throw new Error(`The installer ended with code ${code}`)
  console.log('Done.')
  }
} catch (e) {
  console.error(`\nError: ${e.message}`)
  process.exitCode = 1
} finally {
  if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
}
