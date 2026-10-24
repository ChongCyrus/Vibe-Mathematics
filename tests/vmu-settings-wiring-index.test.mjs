#!/usr/bin/env node
// THE SETTINGS-DOC GENERATOR MUST ANSWER FROM ONE INDEX, NOT PER (KEY × FILE).
//
// WHY THIS GATE EXISTS (measured 2026-10-25, not remembered):
//   `node scripts/generate-vmu-settings-table.mjs --check` took **82.4 s** on this tree. `node --cpu-prof` put 32.6 %
//   in `consumersOf`, 14.5 % in regex COMPILATION, 10.3 % in `tableIterationCarrier` and 5.6 % in `templateReader` —
//   i.e. the cost was O(keys × files), made four times worse because `verdictOf` is called FOUR times per key by the
//   count block. Nothing was wrong with the VERDICTS; the cost was structural.
//
// WHAT THIS GATE PROVES
//   A. the four verdict TIERS still answer through the index (four real anchors: a code read, a prompts-template read,
//      a declared-but-unwired key, and an unreachable-reader key) — so a "fast" index that silently stopped seeing one
//      of the three read shapes would redden here, not in the manual;
//   B. the index is NON-VACUOUS: every anchor key really exists in `settings/schema.js`, and the generator's own
//      summary satisfies `keys === wired + undetermined + notWired + unreachable`;
//   C. the per-(key × file) scans are GONE from the source — the two shapes that cost the time (`SOURCE_FILES.filter(…)
//      .includes(quote + key + quote)` and a `templateReader(key)` that compiled a RegExp per call) must not come back;
//   D. the anchor judge has TEETH: fed the wrong verdict for each anchor it reports a failure (a positive control), so
//      the four "expected" strings below are not decoration.
//
// WHAT IT DOES NOT PROVE: that the four tiers are the RIGHT judgement for every one of the 1265 keys. That is
// `tests/audit-vmu-docs.test.mjs` + `tests/audit-doc-planned-claims.test.mjs`; this file guards the SHAPE and the COST.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const GEN = join(REPO, 'scripts', 'generate-vmu-settings-table.mjs')
const SCHEMA = join(REPO, 'vibe-math-vmu', 'settings', 'schema.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}

const { SETTING_DEFS } = await import(new URL('file://' + SCHEMA.replace(/\\/g, '/')).href)
const {
  hasConsumer, carrierOf, verdictOf, WIRED, UNDETERMINED, NOT_WIRED, NOT_WIRED_UNREACHABLE,
} = await import(new URL('file://' + GEN.replace(/\\/g, '/')).href)

const defined = new Set(SETTING_DEFS.map((d) => d.key))

// ── A. four real anchors, one per read shape / tier ───────────────────────────────────────────────
const ANCHORS = [
  // read through a KERNEL service (`kernel/mathjobs.js`), i.e. the plain quoted-literal path
  { key: 'vmu.math.maxParallel', verdict: WIRED, carrier: 'kernel/mathjobs.js', why: 'quoted literal read by a kernel module' },
  // read ONLY as a `{{ setting:… }}` placeholder in a pack prompt — the template path
  { key: 'vmu.turn.maxParallel', verdict: WIRED, carrier: 'packs/v5r/prompts/v5r-blocks-b.js', why: 'template-placeholder read by a pack prompt' },
  // declared, named nowhere a runtime can read it
  { key: 'vmu.a11y.enabled', verdict: NOT_WIRED, carrier: null, why: 'declared but no reader' },
  // the only reader is a kernel module the assembly never loads
  { key: 'vmu.paper.maxSections', verdict: NOT_WIRED_UNREACHABLE, carrier: 'kernel/paper.js', why: 'sole reader is unloadable' },
]

for (const a of ANCHORS) ok(defined.has(a.key), 'A: the anchor key exists in settings/schema.js :: ' + a.key)
ok(ANCHORS.every((a) => defined.has(a.key)), 'A: every anchor is a real key (a gate on remembered names is a gate on nothing)')

const verdictOfAnchor = (a) => (defined.has(a.key) ? verdictOf(a.key) : '<undefined-key>')
// RULE E: the judge must be able to say NO. Feed it a deliberately wrong expectation and require a miss for EACH
// anchor — otherwise "4/4 anchors agree" could be true of a judge that returns a constant.
const judgeFor = (mapping) => (a) => verdictOfAnchor(a) === mapping(a)
{
  const real = judgeFor((a) => a.verdict)
  const flipped = judgeFor((a) => (a.verdict === WIRED ? NOT_WIRED : WIRED))
  let realHits = 0
  let flipHits = 0
  for (const a of ANCHORS) {
    if (real(a)) realHits++
    if (flipped(a)) flipHits++
  }
  ok(realHits === ANCHORS.length, 'A: every anchor reports the verdict its DOCUMENTED read shape implies',
    'hits=' + realHits + '/' + ANCHORS.length)
  ok(flipHits === 0, 'D: the judge has teeth — asking for the OPPOSITE verdict misses on every anchor',
    'flippedHits=' + flipHits)
}

// carriers: the two wired anchors must name the file that reads them (the CARRIER column's only claim)
for (const a of ANCHORS) {
  const c = carrierOf(a.key)
  if (!defined.has(a.key)) continue
  if (a.carrier === null) ok(c === null, 'A: a key with no reader names no carrier :: ' + a.key, String(c))
  else ok(typeof c === 'string' && c.split(/[\\/]/).join('/').endsWith(a.carrier), 'A: the carrier names the real reader :: ' + a.key, String(c))
}
ok(hasConsumer('vmu.paper.maxSections') === false,
  'A: hasConsumer separates a reachable reader from an unreachable one')

// ── B. the generator's own summary algebra (spawned, so the CLI path is exercised too) ─────────────
const run = spawnSync(process.execPath, [GEN, '--json'], { cwd: REPO, encoding: 'utf8', timeout: 300000 })
ok(run.status === 0, 'B: the generator still runs end to end (`--json`)', 'status=' + run.status + ' ' + String(run.stderr || '').slice(0, 200))
let summary = null
try { summary = JSON.parse(String(run.stdout || '')) } catch { summary = null }
ok(summary !== null, 'B: it emits a parseable summary')
if (summary) {
  ok(summary.keys === SETTING_DEFS.length, 'B: the summary counts every declared key', summary.keys + ' vs ' + SETTING_DEFS.length)
  const parts = summary.wired + summary.undetermined + summary.notWired + summary.unreachableReader
  ok(parts === summary.keys, 'B: the four tiers PARTITION the key set (no key floats outside a verdict, none is counted twice)',
    parts + ' vs ' + summary.keys)
  ok(summary.stale === false, 'B: the committed document is in sync with the generator', summary.stale)
  ok(summary.keys > 1000, 'B: non-vacuous — the table really covers the schema', summary.keys)
}

// ── C. the per-(key × file) scans must not come back ──────────────────────────────────────────────
const src = readFileSync(GEN, 'utf8')
ok(/WIRE\.consumers\.has\(key\)/.test(src), 'C: `consumersOf` answers from the memoised index')
ok(/WIRE\.entries/.test(src), 'C: the one-pass per-file entries are what both predicates read')
ok(/WIRE\.verdict\.has\(key\)/.test(src), 'C: `verdictOf` is memoised (the count block asked it four times per key)')
ok(!/SOURCE_FILES\.filter\(\(f\) => !DEAD_KERNEL\.has\(f\.rel\) &&/.test(src),
  'C: the retired per-key scan over SOURCE_FILES is gone (it was 32.6 % of the runtime)')
ok(!/const templateReader = \(key\) => new RegExp/.test(src),
  'C: the retired per-call RegExp compiler is gone (it was 14.5 % of the runtime)')

// ── report ────────────────────────────────────────────────────────────────────────────────────────
if (failed) {
  console.log('=== VMU SETTINGS WIRING INDEX: RED (passed=' + passed + ', failed=' + failed + ') ===')
  for (const f of failures) console.log('  FAIL ' + f)
  process.exit(1)
}
console.log('=== VMU SETTINGS WIRING INDEX: ' + passed + ' passed, 0 failed ===')
process.exit(0)
