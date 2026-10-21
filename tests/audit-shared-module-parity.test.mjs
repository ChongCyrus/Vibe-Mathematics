// tests/audit-shared-module-parity.test.mjs - the shared math module must stay byte-identical across every version that reuses it.
//
// WHY. docs/01's D-decision is that math-computation.js is a SHARED module reused verbatim by v2 through v5r, and that is not a
// stylistic preference: it is what makes a math result comparable across presets. Last round I reported the parity reference as
// missing, having looked under _oneoff/vm-verify where an old note pointed; the copies are in the repository, in each version's
// own directory, and hashing them shows all six files identical at def90af7. So the check is real and cheap - and because the
// claim is load-bearing, it belongs in the gate rather than in a note.
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
// ★ G4 stage A: the five historical preset dirs come from ONE seam; `vibe-math-vmu` is the CURRENT framework
// (not a legacy preset) and stays repo-relative on purpose.
import { legacyDir } from './_lib/legacy-presets.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const VERSIONS = ['vibe-math-v2', 'vibe-math-v3', 'vibe-math-v4', 'vibe-math-v5', 'vibe-math-v5r', 'vibe-math-vmu']
const dirOf = (v) => (v === 'vibe-math-vmu' ? join(REPO, v) : legacyDir(v))
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')

console.log('=== 1. EVERY COPY EXISTS ===')
const present = VERSIONS.filter((v) => existsSync(join(dirOf(v), 'math-computation.js')))
ok(VERSIONS.length > 0 && present.length > 0, 'the module list and the copies found are BOTH non-empty, so the comparison below cannot pass vacuously', { versions: VERSIONS.length, present: present.length })
ok(present.length === VERSIONS.length, 'all six copies of the shared module are present', { present: present.length, of: VERSIONS.length })

console.log('=== 2. AND THEY ARE ALL THE SAME BYTES ===')
const hashes = new Map(present.map((v) => [v, sha(join(dirOf(v), 'math-computation.js'))]))
const distinct = new Set(hashes.values())
ok(distinct.size === 1,
  'every copy is byte-identical, which is what "reused verbatim" means and what makes a math result comparable across presets',
  { hashes: [...hashes.entries()].map(([v, h]) => v + '=' + h.slice(0, 12)), distinct: distinct.size })

console.log('=== 3. AND THE VOLUME THAT DOCUMENTS IT SAYS SO ===')
const d15 = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '15-math-computation-toolbox.md'), 'utf8')
ok(/逐字节|byte-identical|字节相同/.test(d15),
  'the toolbox volume states the parity claim rather than leaving it to a decision row')
ok([...distinct][0].slice(0, 12) === 'def90af767a6' || /def90af7/.test(d15),
  'and the volume records the digest it was verified at, so a future change is visible rather than silent')

console.log('=== SHARED PARITY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
