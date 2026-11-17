import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

/** Downloads `url` to `dest`, and fails (deleting the file) if its size or SHA-512 (base64) differ from the expected ones. */
export async function downloadVerified(url, dest, { size, sha512 }, onProgress = () => {}) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`)
  const hash = createHash('sha512')
  let received = 0
  const meter = async function* (source) {
    for await (const chunk of source) {
      hash.update(chunk)
      received += chunk.length
      onProgress(received, size)
      yield chunk
    }
  }
  try {
    await pipeline(Readable.fromWeb(res.body), meter, createWriteStream(dest))
    if (received !== size) throw new Error(`Wrong size: got ${received} bytes, expected ${size}`)
    if (hash.digest('base64') !== sha512) throw new Error('The SHA-512 of the download does not match the one in latest.yml')
  } catch (e) {
    await unlink(dest).catch(() => {})
    throw e
  }
}
