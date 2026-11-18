// electron-builder "afterPack" hook: on macOS, signs the packed app ad hoc (no certificate, no identity).
// Apple silicon refuses to run an app whose code signature does not match its contents; the Electron
// binaries are signed, but packing changes the bundle, so it is signed again here before the .dmg is made.
// This is not what Apple calls a signed, notarized app: Gatekeeper still asks the user to allow it once.
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  console.log(`[adhoc-sign] ${app}`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
}
