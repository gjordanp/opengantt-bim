/** Reads the fields the installer needs from electron-updater's latest.yml (a flat, predictable file). */
export function parseLatest(text) {
  const field = (name) => {
    const m = text.match(new RegExp(`^${name}:\\s*['"]?(.+?)['"]?\\s*$`, 'm'))
    return m ? m[1] : undefined
  }
  const version = field('version')
  const file = field('path')
  const sha512 = field('sha512')
  // "size" lives inside the files list, indented.
  const sizeMatch = text.match(/^\s+size:\s*(\d+)\s*$/m)
  const size = sizeMatch ? Number(sizeMatch[1]) : undefined
  if (!version || !file || !sha512 || !size) throw new Error('latest.yml is missing version, path, sha512 or size')
  if (!/^[\w.-]+\.exe$/.test(file)) throw new Error(`Unexpected installer name in latest.yml: ${file}`)
  return { version, file, sha512, size }
}

export const REPO = 'gjordanp/opengantt-bim'

/** Where the files of a release live: the latest one, or a given version. */
export function releaseBase(version) {
  if (!version) return `https://github.com/${REPO}/releases/latest/download/`
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Not a version: ${version} (use for example 0.3.0)`)
  return `https://github.com/${REPO}/releases/download/v${version}/`
}
