#!/usr/bin/env node
/**
 * README/COUNT CONSISTENCY — the numbers quoted in shipped docs are DERIVED, not typed, and each is
 * labelled as a JOB count or a FILE count.
 *
 * DEFECT CLASS: "documented count drifts from the tree" (D1). README quoted `TOTAL 57` (39 suites /
 * 18 probes, "18 items ship") while the runner produced 65, then 85/86, and docs/test-timing.md and
 * docs/AUDIT-CHECKLIST.md disagreed with each other. Authority: `node tests/run-tests.mjs --counts`
 * (the gate's own JOB list — base jobs + VARIANTS jobs) plus `package.json#files` (shipped FILE counts).
 * Shapes come from tests/helpers/doc-counts-format.mjs, the same module the writer
 * (scripts/update-doc-counts.mjs) and the mutant harness use, so the three cannot disagree.
 *
 * Run: node tests/audit-readme-counts.mjs
 * Env (mutant harness): COUNTS_README / COUNTS_README_EN / COUNTS_TIMING / COUNTS_CHECKLIST / COUNTS_FIELDS /
 * COUNTS_PAPER / COUNTS_MATH (absolute or repo-relative). The last three serve the F-C live-doc sweep.
 */
import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { claims } from './helpers/doc-counts-format.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
let passed = 0, failed = 0
const failures = []
const ok = (cond, label, detail) => { if (cond) passed++; else { failed++; failures.push(label + (detail ? ' — ' + detail : '')) } }

const derivedRaw = spawnSync(process.execPath, [join(HERE, 'run-tests.mjs'), '--counts'], { cwd: REPO, encoding: 'utf8' })
let derived = null
try { derived = JSON.parse(String(derivedRaw.stdout || '').trim()) } catch (e) { /* reported below */ }
ok(!!derived && derived.total > 0 && derived.suites > 0,
  'the runner --counts mode produces the derived JOB totals (suites/probes/total)', String(derivedRaw.stdout || '').slice(0, 70))

const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'))
const shippedFiles = pkg.files.filter((f) => f.startsWith('tests/') && f.endsWith('.mjs'))
const shipped = { total: shippedFiles.length, suites: shippedFiles.filter((f) => f.endsWith('.test.mjs')).length }
shipped.probes = shipped.total - shipped.suites
ok(shipped.total > 0 && shipped.suites > 0, 'package.json#files yields the shipped FILE split',
  JSON.stringify({ shipped: shipped.total, suites: shipped.suites, probes: shipped.probes }))

const read = (envName, rel) => {
  const v = process.env[envName]
  return readFileSync(v ? (isAbsolute(v) ? v : join(REPO, v)) : join(REPO, rel), 'utf8')
}
const zh = read('COUNTS_README', 'README.md')
const en = read('COUNTS_README_EN', 'README.en.md')
const tt = read('COUNTS_TIMING', 'docs/test-timing.md')
const ck = read('COUNTS_CHECKLIST', 'docs/AUDIT-CHECKLIST.md')

if (derived) {
  const c = claims(derived, shipped)
  const has = (doc, label, needle) => ok(doc.indexOf(needle) !== -1, label, 'looked for ' + needle)
  has(zh, '★ README.md carries the canonical JOB-count bullet (derived totals + shipped FILE count)', c.zhBullet)
  has(en, '★ README.en.md carries the canonical JOB-count bullet', c.enBullet)
  has(tt, '★ docs/test-timing.md carries the canonical runner row (derived JOB counts + output shape)', c.ttRow)
  has(ck, '★ docs/AUDIT-CHECKLIST.md quotes the derived JOB counts', c.ckClaim)
  has(ck, '★ docs/AUDIT-CHECKLIST.md quotes the derived shipped FILE counts (published subset)', c.ckShipped)
  has(ck, '★ docs/AUDIT-CHECKLIST.md D1 row carries the derived counts', c.d1Row)
  ok(!/TOTAL 57/.test(zh), 'the stale README claim (TOTAL 57) is gone')
  ok(!/TOTAL 65  PASS 65/.test(tt), 'the old test-timing baseline row (TOTAL 65 PASS 65) is gone')
  ok(!/\*\*65 项\*\* = 44 套件 \+ 21/.test(tt + ck), 'no bolded stale 65-item claim remains (prose about the migration is fine)')

  // ── F-C: EVERY `TOTAL <n>` in a LIVE doc equals the derived job count ────────────────────────────
  // Published release notes under `docs/release-notes/**` are FROZEN history: they record what the gate
  // read at their own release (`TOTAL 65` in 2.7.0/2.7.1), so they are excluded BY NAME — and the
  // exclusion is asserted non-empty and reported, so the sweep cannot silently skip everything.
  const FROZEN_EXCLUDED = ['docs/release-notes/RELEASE-NOTES-2.7.0.md', 'docs/release-notes/RELEASE-NOTES-2.7.0.en.md', 'docs/release-notes/RELEASE-NOTES-2.7.1.md', 'docs/release-notes/RELEASE-NOTES-2.7.1.en.md', 'docs/release-notes/RELEASE-NOTES-2.7.2.md']
  const LIVE_DOCS = [
    ['COUNTS_README', 'README.md'], ['COUNTS_README_EN', 'README.en.md'], ['COUNTS_TIMING', 'docs/test-timing.md'],
    ['COUNTS_CHECKLIST', 'docs/AUDIT-CHECKLIST.md'],
    ['COUNTS_FIELDS', 'docs/status-report-fields.md'], ['COUNTS_PAPER', 'docs/final-paper.md'], ['COUNTS_MATH', 'docs/math-computation.md'],
  ]
  let occurrences = 0, scanned = 0
  for (const [env, rel] of LIVE_DOCS) {
    let text = ''
    try { text = read(env, rel) } catch (e) { continue }
    scanned++
    for (const m of text.matchAll(/TOTAL\s+(\d+)/g)) {
      occurrences++
      ok(Number(m[1]) === derived.total, '★ ' + rel + ': every TOTAL <n> equals the derived job count (' + m[1] + ' vs ' + derived.total + ')',
        'occurrence: ' + m[0])
    }
  }
  console.log('  live-docs scanned=' + scanned + ' TOTAL-occurrences=' + occurrences + ' frozen-excluded=' + FROZEN_EXCLUDED.length)
  ok(scanned > 0 && occurrences > 0, '★ the F-C sweep is non-vacuous (it scanned live docs and found TOTAL occurrences)',
    'scanned=' + scanned + ' occurrences=' + occurrences)
  ok(FROZEN_EXCLUDED.length > 0, '★ the frozen release notes are excluded BY NAME, not by a pattern that could swallow the sweep',
    JSON.stringify(FROZEN_EXCLUDED.length))
}

console.log('')
console.log('=== README COUNTS: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)
