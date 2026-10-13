// tests/audit-claim-traceability.test.mjs - every claim id a design volume makes must appear in at least one test or script.
//
// WHY THIS EXISTS. I wrote a note in docs/24 saying its claims had no test line, and both halves of that note were wrong: the
// volume makes no A1/A2 claims at all (those are labels in an unrelated A/B suite), and the twenty ids it DOES cite are
// traceable in every case. A wrong "untraced" is worse than silence, because it sends the next reader to write tests for
// claims that already have them. The check is cheap and it keeps the statement true instead of asserted.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

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

const walk = (d) => readdirSync(join(REPO, d), { withFileTypes: true }).flatMap((e) => {
  const r = join(d, e.name)
  if (e.isDirectory()) return /(^|\/)(\.git|node_modules)$/.test(r) ? [] : walk(r)
  return [r]
})

console.log('=== 1. THE VOLUME AND ITS CLAIM IDS ARE READ ===')
const volume = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '24-v5r-containment.md'), 'utf8')
const ids = [...new Set([...volume.matchAll(/\b([CDFG]\d{1,2}[a-z]?)\b/g)].map((m) => m[1]))].sort()
ok(ids.length >= 10, 'the containment volume cites its claims by id', { ids: ids.length })

console.log('=== 2. EVERY CLAIM ID IS TRACEABLE TO CODE ===')
const files = [...walk('tests'), ...walk('scripts'), ...walk('vibe-math-vmu')].filter((f) => /\.(mjs|js)$/.test(f))
const text = files.map((f) => readFileSync(join(REPO, f), 'utf8')).join('\n')
const untraced = ids.filter((id) => !new RegExp('\\b' + id + '\\b').test(text))
ok(untraced.length === 0,
  'every claim id in the volume appears in at least one test, script or kernel file - so each claim can be followed to its evidence',
  { untraced })

console.log('=== 3. AND THE VOLUME DOES NOT CLAIM THE OTHER SUITE S LABELS ===')
// A1/A2 are test-case labels in accept-ab-v5-minimal; the containment volume must not present them as its own claims
ok(!/\bA1\b|\bA2\b/.test(volume.replace(/\n> .*A1.*\n/g, '\n')),
  'the volume does not adopt another suite s case labels as its own claim ids - the mistake this guard was written from')

console.log('=== CLAIM TRACEABILITY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
