// tests/audit-vmu-wired-union.test.mjs — the wired-schema generator's two sources must be a UNION.
//
// ROUND 282. Round 281 found the generator using its two key sources as alternatives: `listed.length ? listed : readKeysOf(src)`.
// A face that exports a key list therefore had every OTHER read ignored, and three keys in the records face were invisible - one of them
// sat in the planned registry while the generated table called it wired, and the other two had only reached the schema when they were
// added by hand. The repair made the sources a union; this guard keeps it that way, because that generator owns the core schema.
//
// Strict by default (exit 1 on any violation). `--quiet` prints only the summary. `--selftest` proves it cannot pass vacuously.
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collect, wiredKeysOf, readKeysOf } from '../scripts/generate-wired-schema.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const quiet = process.argv.includes('--quiet')
const selftest = process.argv.includes('--selftest')
const KERNEL = join(REPO, 'vibe-math-vmu', 'kernel')

const c = collect()
const emitted = new Set((c.defs || []).map((d) => d.key))
const preexisting = c.preexisting instanceof Set ? c.preexisting : new Set(c.preexisting || [])
const skipped = new Set(c.skipped || [])
const byModule = new Map()
for (const d of c.defs || []) byModule.set(d.module, (byModule.get(d.module) || new Set()).add(d.key))

const files = readdirSync(KERNEL).filter((f) => f.endsWith('.js'))
const violations = []
const listExporters = []
for (const f of files) {
  const src = readFileSync(join(KERNEL, f), 'utf8')
  const listed = wiredKeysOf(src)
  const read = readKeysOf(src)
  if (listed.length) listExporters.push(f)
  const seen = byModule.get(f) || new Set()
  for (const k of read) {
    // a read key is accounted for if the generator emitted it for THIS module, or the schema already carried it, or it is a known surface
    if (seen.has(k) || preexisting.has(k) || skipped.has(k)) continue
    // the union rule: a module that exports a list must still have its read-only keys accounted for
    violations.push(f + ': reads ' + k + ' but the generator neither emitted it for this module nor found it pre-existing' +
      (listed.length ? ' (this module EXPORTS a key list of ' + listed.length + ' - the union must cover the rest)' : ''))
  }
}

if (selftest) {
  const face = readFileSync(join(KERNEL, 'records.js'), 'utf8')
  const l = wiredKeysOf(face)
  const r = readKeysOf(face)
  const onlyRead = r.filter((k) => !l.includes(k))
  const okExporters = listExporters.length > 0
  const okUnion = onlyRead.length > 0 && onlyRead.every((k) => emitted.has(k))
  console.log('  selftest: modules exporting a key list = ' + listExporters.length + ' -> ' + (okExporters ? 'ok' : 'FAIL'))
  console.log('  selftest: a list-exporter\'s read-only keys are emitted (' + onlyRead.length + ' found) -> ' + (okUnion ? 'ok' : 'FAIL'))
  process.exit(okExporters && okUnion ? 0 : 1)
}

if (!quiet) {
  console.log('  kernel modules scanned: ' + files.length + '; modules exporting a key list: ' + listExporters.length)
  console.log('  keys emitted by the generator: ' + emitted.size)
  for (const v of violations.slice(0, 12)) console.log('  VIOLATION ' + v)
}
console.log('=== WIRED UNION: ' + files.length + ' module(s), ' + listExporters.length + ' list-exporter(s), ' + violations.length + ' violation(s) ===')
process.exit(violations.length ? 1 : 0)
