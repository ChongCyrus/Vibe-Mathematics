// Falsifiability driver for scripts/release-check.mjs: a SINGLE-SITE edit must turn its own guard
// (`--self-test`) NAMED-red, while the unmutated control stays green. The mutated copy is written as a
// dot-sibling inside scripts/ so relative paths still resolve, and it is always removed in `finally`.
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const SRC = join(REPO, 'scripts', 'release-check.mjs')

const FAMILIES = [
  {
    // Without this, a lockfile that drifted away from package.json would ship and the market guard would
    // be the only thing that notices.
    name: 'the version-triple check is dropped (a drifted lockfile would ship)',
    from: 'if (lockTop !== pkgVersion) out.push(',
    to: 'if (false) out.push(',
    expect: /drifted lock top-level version is caught/,
  },
  {
    // Without this, a release note missing half its sections would ship.
    name: 'the section-count check is dropped (a truncated release note would ship)',
    from: 'if (got.length !== want.length) out.push(',
    to: 'if (false) out.push(',
    expect: /truncated note is caught by its section count/,
  },
  {
    // Without this, a note whose sections are in the wrong order would ship.
    name: 'the section-order check is dropped (a reordered release note would ship)',
    from: 'if (got[i] !== want[i]) out.push(',
    to: 'if (false) out.push(',
    expect: /reordered note is caught/,
  },
  {
    // Without this, a package containing CRLF would ship - the exact defect this whole line of work fixed.
    name: 'the CRLF scan is dropped (a CRLF package would ship)',
    from: 'if (Number(crlf) > 0) out.push(',
    to: 'if (false) out.push(',
    expect: /CRLF inside the package is caught/,
  },
]

function runSelftest(scriptPath) {
  const r = spawnSync(process.execPath, [scriptPath, '--self-test'], { cwd: REPO, encoding: 'utf8', timeout: 60000 })
  return { code: r.status, out: String(r.stdout || '') + String(r.stderr || '') }
}

const control = runSelftest(SRC)
console.log('control (unmutated release-check): exit=' + control.code + (control.code === 0 ? '  green, as required' : '  NOT GREEN'))
if (control.code !== 0) console.log(control.out.split(/\r?\n/).filter((l) => /FAIL/.test(l)).slice(0, 4).join('\n'))

let red = 0
for (const f of FAMILIES) {
  const dest = join(REPO, 'scripts', '.tmp-release-check-' + Math.random().toString(36).slice(2, 10) + '.mjs')
  let ok = false
  try {
    let text = readFileSync(SRC, 'utf8').replace(/\r\n?/g, '\n')
    if (/\r/.test(text)) { console.error('SETUP-FAIL - the anchor source was not EOL-normalised (a lone CR leaked in)'); process.exit(1) }
    const hits = text.split(f.from).length - 1
    if (hits !== 1) { console.error('SETUP-FAIL - anchor ' + JSON.stringify(f.from) + ' matched ' + hits + ' time(s), expected exactly 1'); process.exit(1) }
    writeFileSync(dest, text.replace(f.from, f.to), 'utf8')
    const r = runSelftest(dest)
    const named = r.out.split(/\r?\n/).filter((l) => /^\s*FAIL - /.test(l) && f.expect.test(l)).map((l) => l.trim())
    ok = r.code !== 0 && named.length > 0
    console.log((ok ? '  ok - ' : '  FAIL - ') + f.name + ' [exit=' + r.code + ']' + (named.length ? ' :: ' + named[0].slice(0, 140) : ' :: no named red (exit=' + r.code + ')'))
    if (ok) red++
  } finally {
    try { rmSync(dest, { force: true }) } catch (e) { /* best effort */ }
  }
}

console.log('')
console.log('mutant families reddening the release-check guard by name: ' + red + '/' + FAMILIES.length)
console.log('control green: ' + (control.code === 0))
if (red !== FAMILIES.length || control.code !== 0) process.exit(1)
console.log('ALL MUTANTS RED AS REQUIRED')
