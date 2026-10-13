// tests/vmu-ops-cannot-decide.test.mjs — the O-5 invariant (docs/22) as a NEGATIVE check.
//
// O-5: "any operations action - money, goods, conference, HR - NEVER votes on and NEVER changes an academic conclusion."
// The invariant cannot be tested by CALLING something: it is an ABSENCE. So this test asserts the absence mechanically - no
// operations module may WRITE to the surfaces that hold a research verdict - and it names every module it checks, so a new
// operations module cannot enter the kernel without appearing here.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const KERNEL = join(HERE, '..', 'vibe-math-vmu', 'kernel')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

// The operations faces: money, goods, conference, HR and the rest of the administrative surface.
const OPS = ['budget.js', 'board.js', 'conference.js', 'resource.js', 'ip.js', 'funding.js', 'capacity.js', 'tenure.js', 'compliance.js', 'course.js', 'external.js', 'publication.js']
// The surfaces that HOLD an academic conclusion. Writing here is what O-5 forbids. Reading them is a different matter: the
// publication face is SUPPOSED to read claims, which is why the list names writes and factory constructors, not the words.
const VERDICT_WRITES = [
  /\blibrary\s*\.\s*(append|write|remove|update)\b/,
  /\bformal\s*\.\s*(verify|register|run)\b/,
  /\brecords\s*\.\s*(append|write)\b/,
  /createLibrary\(/,
  /createFormal\(/,
]
// Exemptions must be written down with a reason, and the reason is checked for substance.
const EXEMPT = {}

console.log('=== 1. THE OPERATIONS MODULES EXIST AND ARE NAMED ===')
const files = readdirSync(KERNEL)
const missing = OPS.filter((f) => !files.includes(f))
ok(missing.length === 0, 'every operations module this check names still exists, so the list cannot go stale silently', missing)
const opsFound = OPS.filter((f) => files.includes(f))
ok(opsFound.length >= 8, 'and the list is substantive rather than a token', opsFound.length)

// The assertion BELOW the loop is not enough: an empty list would make the loop body never run, and a guard whose body
// never runs is not a guard. This is the same shape the declaration criterion exists to find, found in the guard written
// this round.
ok(opsFound.length > 0 && VERDICT_WRITES.length > 0, 'the modules and the forbidden-write list are BOTH non-empty BEFORE the scan, so the loop below cannot pass vacuously', { modules: opsFound.length, patterns: VERDICT_WRITES.length })

console.log('=== 2. NONE OF THEM WRITES A VERDICT ===')
const offenders = []
for (const f of opsFound) {
  if (EXEMPT[f]) continue
  const src = readFileSync(join(KERNEL, f), 'utf8')
  for (const re of VERDICT_WRITES) if (re.test(src)) offenders.push(f + ' matches ' + String(re))
}
ok(offenders.length === 0,
  'no operations module writes to the surfaces that hold an academic conclusion, which is O-5 stated as an absence', offenders)

console.log('=== 3. AND THE EXEMPTION MECHANISM IS NOT A HOLE ===')
ok(Object.keys(EXEMPT).length === 0 || Object.values(EXEMPT).every((r) => typeof r === 'string' && r.length > 20),
  'any exemption carries a written reason, so silence is never the excuse')
ok(VERDICT_WRITES.length >= 3,
  'and the forbidden-write list covers the archive, the formal checker and the durable records', VERDICT_WRITES.length)

console.log('=== OPS CANNOT DECIDE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) process.exitCode = 1
