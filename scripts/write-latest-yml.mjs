// Rewrites dist/latest.yml for the installer that is in dist/ right now.
//
// electron-updater trusts latest.yml for the installer's size and SHA-512. When the
// installer is signed after electron-builder ran (SignPath signs it outside the
// build), those numbers no longer match, so they are recalculated here.
//
// Usage: node scripts/write-latest-yml.mjs [distDir]
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = process.argv[2] ?? 'dist'
const { version } = JSON.parse(readFileSync('package.json', 'utf8'))

const installer = readdirSync(dist).find((f) => /-Setup-.*\.exe$/.test(f))
if (!installer) throw new Error(`No installer (*-Setup-*.exe) found in ${dist}`)

const file = join(dist, installer)
const sha512 = createHash('sha512').update(readFileSync(file)).digest('base64')
const size = statSync(file).size

const yml = `version: ${version}
files:
  - url: ${installer}
    sha512: ${sha512}
    size: ${size}
path: ${installer}
sha512: ${sha512}
releaseDate: '${new Date().toISOString()}'
`
writeFileSync(join(dist, 'latest.yml'), yml)
console.log(`latest.yml written for ${installer} (${size} bytes)`)
