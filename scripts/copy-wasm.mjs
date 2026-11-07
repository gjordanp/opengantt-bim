// Copies the web-ifc WebAssembly binary next to the renderer's static files so it
// is served from our own bundle (no CDN) under a stable name: /wasm/web-ifc.wasm
import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

// The package's `exports` hides package.json; the main entry sits in the same folder as the wasm.
const require = createRequire(import.meta.url)
const pkgDir = dirname(require.resolve('web-ifc'))
const target = join(process.cwd(), 'src/renderer/public/wasm')
mkdirSync(target, { recursive: true })
copyFileSync(join(pkgDir, 'web-ifc.wasm'), join(target, 'web-ifc.wasm'))
console.log('web-ifc.wasm ->', target)
