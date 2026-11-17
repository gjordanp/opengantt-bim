import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { downloadVerified } from '../src/download.js'
import { parseLatest, releaseBase } from '../src/latest.js'

const SAMPLE = `version: 0.3.0
files:
  - url: Opengantt-BIM-Setup-0.3.0.exe
    sha512: tZGAGupwGLMtU0dXafh+oFSLWFEjjFwQd5zYMLBt5Z3Z3GvMbsUN82S4HI7Ptsx9yD0ApNbavBFihz5DFK7KTw==
    size: 205440949
path: Opengantt-BIM-Setup-0.3.0.exe
sha512: tZGAGupwGLMtU0dXafh+oFSLWFEjjFwQd5zYMLBt5Z3Z3GvMbsUN82S4HI7Ptsx9yD0ApNbavBFihz5DFK7KTw==
releaseDate: '2026-11-17T04:10:22.427Z'
`

test('parseLatest reads version, file, hash and size', () => {
  const i = parseLatest(SAMPLE)
  assert.equal(i.version, '0.3.0')
  assert.equal(i.file, 'Opengantt-BIM-Setup-0.3.0.exe')
  assert.equal(i.size, 205440949)
  assert.match(i.sha512, /^tZGAG/)
})

test('parseLatest refuses a file name that is not an installer', () => {
  assert.throws(() => parseLatest(SAMPLE.replaceAll('Opengantt-BIM-Setup-0.3.0.exe', '..\\evil.bat')))
})

test('releaseBase builds the latest and the versioned address', () => {
  assert.match(releaseBase(), /releases\/latest\/download\/$/)
  assert.match(releaseBase('0.3.0'), /releases\/download\/v0\.3\.0\/$/)
  assert.throws(() => releaseBase('../x'))
})

async function serve(body) {
  const server = createServer((_, res) => res.end(body))
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { url: `http://127.0.0.1:${server.address().port}/f.exe`, close: () => server.close() }
}
const meta = (buf) => ({ size: buf.length, sha512: createHash('sha512').update(buf).digest('base64') })

test('downloadVerified keeps a file whose size and hash match', async () => {
  const buf = Buffer.from('installer bytes')
  const s = await serve(buf)
  const dest = join(tmpdir(), `og-ok-${Date.now()}.exe`)
  await downloadVerified(s.url, dest, meta(buf))
  assert.deepEqual(await readFile(dest), buf)
  s.close()
})

test('downloadVerified deletes a file whose hash differs', async () => {
  const buf = Buffer.from('installer bytes')
  const s = await serve(Buffer.from('tampered bytes!'))
  const dest = join(tmpdir(), `og-bad-${Date.now()}.exe`)
  await assert.rejects(downloadVerified(s.url, dest, meta(buf)), /SHA-512/)
  await assert.rejects(stat(dest))
  s.close()
})

test('downloadVerified deletes a file of the wrong size', async () => {
  const buf = Buffer.from('installer bytes')
  const s = await serve(Buffer.from('short'))
  const dest = join(tmpdir(), `og-size-${Date.now()}.exe`)
  await assert.rejects(downloadVerified(s.url, dest, meta(buf)), /size/)
  await assert.rejects(stat(dest))
  s.close()
})
