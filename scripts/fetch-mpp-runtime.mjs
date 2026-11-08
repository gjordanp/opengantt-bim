// Builds resources/mpp/: a small Java runtime plus MPXJ, used to read binary .mpp files
// (MS Project) by converting them to MSPDI XML. Nothing here is committed: the jars come
// from Maven Central (checked against their published SHA-1) and the runtime is cut from
// the local JDK with jlink. Needs a JDK 17+ (JAVA_HOME or `javac`/`jlink` on PATH).
//
// Usage: npm run fetch:mpp
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'resources', 'mpp')
const marker = join(outDir, '.complete')
const exe = process.platform === 'win32' ? '.exe' : ''

// [group path, artifact, version]. MPXJ reads .mpp through Apache POI; the rest is what
// those two need at run time (SQLite/Access/HTML readers are left out: unused here).
const JARS = [
  ['net/sf/mpxj', 'mpxj', '16.11.0'],
  ['org/apache/poi', 'poi', '5.5.1'],
  ['commons-codec', 'commons-codec', '1.20.0'],
  ['org/apache/commons', 'commons-collections4', '4.5.0'],
  ['commons-io', 'commons-io', '2.21.0'],
  ['org/apache/commons', 'commons-lang3', '3.18.0'],
  ['commons-logging', 'commons-logging', '1.2'],
  ['org/apache/commons', 'commons-math3', '3.6.1'],
  ['org/apache/logging/log4j', 'log4j-api', '2.24.3'],
  ['com/zaxxer', 'SparseBitSet', '1.3'],
  ['com/github/joniles', 'rtfparserkit', '1.16.0'],
  ['com/sun/istack', 'istack-commons-runtime', '4.0.1'],
  ['com/sun/activation', 'jakarta.activation', '2.0.1'],
  ['jakarta/xml/bind', 'jakarta.xml.bind-api', '3.0.1'],
  ['org/glassfish/jaxb', 'jaxb-core', '3.0.2'],
  ['org/glassfish/jaxb', 'jaxb-runtime', '3.0.2'],
  ['org/glassfish/jaxb', 'txw2', '3.0.2']
]

// java.desktop (colours) and jdk.charsets (legacy code pages in old .mpp files) are required.
const MODULES = 'java.base,java.xml,java.desktop,java.sql,java.logging,java.naming,java.management,jdk.charsets'

if (existsSync(marker)) {
  console.log(`[fetch-mpp] already present: ${outDir}`)
  process.exit(0)
}

const javaHome = process.env.JAVA_HOME
const tool = (name) => (javaHome && existsSync(join(javaHome, 'bin', name + exe)) ? join(javaHome, 'bin', name + exe) : name)

rmSync(outDir, { recursive: true, force: true })
const lib = join(outDir, 'lib')
mkdirSync(lib, { recursive: true })

const get = async (url) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

for (const [group, artifact, version] of JARS) {
  const base = `https://repo1.maven.org/maven2/${group}/${artifact}/${version}/${artifact}-${version}`
  const [jar, sha1] = await Promise.all([get(`${base}.jar`), get(`${base}.jar.sha1`)])
  const expected = sha1.toString('utf8').trim().split(/\s+/)[0]
  const actual = createHash('sha1').update(jar).digest('hex')
  if (expected !== actual) throw new Error(`${artifact}-${version}.jar does not match its published SHA-1`)
  writeFileSync(join(lib, `${artifact}-${version}.jar`), jar)
  console.log(`[fetch-mpp] ${artifact} ${version}`)
}

const classes = join(outDir, 'classes')
mkdirSync(classes, { recursive: true })
const classpath = JARS.map(([, a, v]) => join(lib, `${a}-${v}.jar`)).join(process.platform === 'win32' ? ';' : ':')
execFileSync(tool('javac'), ['-cp', classpath, '-d', classes, join(root, 'scripts', 'mpp', 'MppToXml.java')], { stdio: 'inherit' })

execFileSync(
  tool('jlink'),
  ['--add-modules', MODULES, '--strip-debug', '--no-header-files', '--no-man-pages', '--compress', 'zip-9', '--output', join(outDir, 'jre')],
  { stdio: 'inherit' }
)

writeFileSync(marker, readFileSync(join(root, 'scripts', 'mpp', 'MppToXml.java')))
console.log(`[fetch-mpp] ready: ${outDir}`)
