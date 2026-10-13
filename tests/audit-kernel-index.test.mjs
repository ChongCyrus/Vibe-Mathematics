// tests/audit-kernel-index.test.mjs - the architecture volume's kernel index must match the kernel directory, both ways.
//
// WHY. docs/02 named 24 of the kernel's 84 modules by hand. A hand-kept list is the shape of every drift this session has
// found, so the index is GENERATED from each module's own header comment by scripts/generate-kernel-index.mjs, and this guard
// runs that generator in --check mode. It also asserts the property the generator depends on: every module must carry a usable
// header, because a missing header would silently produce a blank index line rather than a failure.
import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const KERNEL = join(REPO, 'vibe-math-vmu', 'kernel')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

console.log('=== 1. EVERY MODULE CARRIES A USABLE HEADER ===')
const headerOf = (src) => {
  const out = []
  for (const l of src.split('\n')) {
    const t = l.trim()
    if (t === '') { if (out.length) break; else continue }
    if (t.startsWith('//')) { out.push(t.replace(/^\/\/\s?/, '')); continue }
    break
  }
  return out.join(' ').trim()
}
const mods = readdirSync(KERNEL).filter((f) => f.endsWith('.js')).sort()
const headerless = mods.filter((m) => headerOf(readFileSync(join(KERNEL, m), 'utf8')).length < 25)
ok(mods.length >= 50, 'the kernel modules are read', { n: mods.length })
ok(headerless.length === 0,
  'every kernel module states its purpose in a header comment, which is what the generated index is derived from',
  { headerless })

console.log('=== 2. AND THE VOLUME S INDEX MATCHES THE DIRECTORY ===')
let out = ''
let code = 0
try {
  out = execFileSync(process.execPath, [join(REPO, 'scripts', 'generate-kernel-index.mjs')], { cwd: REPO, encoding: 'utf8' })
} catch (e) {
  code = e.status === undefined ? 1 : e.status
  out = String(e.stdout || '') + String(e.stderr || '')
}
ok(code === 0,
  'the generated index is current: run --write after adding, removing or re-headering a module',
  { code, out: out.trim().slice(0, 200) })
ok(/matches the kernel \(\d+ modules/.test(out), 'and the generator reports what it compared', { out: out.trim().slice(0, 120) })

console.log('=== 3. THE INDEX IS ACTUALLY IN THE VOLUME AND TABULATES EVERY MODULE ===')
const doc = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '02-architecture.md'), 'utf8')
const a = doc.indexOf('<!-- BEGIN GENERATED: kernel-index -->')
const b = doc.indexOf('<!-- END GENERATED: kernel-index -->')
ok(a >= 0 && b > a, 'the generated block is present and delimited in the architecture volume')
const block = a >= 0 ? doc.slice(a, b) : ''
const missing = mods.filter((m) => !block.includes('`' + m + '`'))
ok(missing.length === 0, 'and it names every module file', { missing })

console.log('=== KERNEL INDEX: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
