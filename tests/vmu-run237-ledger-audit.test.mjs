import { REPO } from './_lib/repo-root.mjs'
// tests/vmu-run237-ledger-audit.test.mjs — RUN 237: two ledgers disagreed and nothing noticed.
//
// `docs/acceptance/rules-ledger.json` certified 93 rules DONE; `docs/acceptance/sim-audit-rules.md` — an OBSERVATION
// audit (receipts, prompts, tree snapshots; "a function exists" is not evidence there) — judged 18 of them
// PROSE-ONLY / UNREACHABLE / CONTRADICTED. Both files were green in their own terms, which is exactly how a project
// convinces itself it is finished.
//
// The gate now reads BOTH: a DONE that the observation audit calls unobservable must answer it with
// `auditDispute { acknowledged, why, evidence }`, where `evidence` is a pattern inside a MAINTAINED suite (never
// `tests/legacy/`) — "the audit was right about that moment, here is the executable proof it changed". A declared gap
// (`PARTIAL` + `next`) is a warning, not a lie; `--strict-unfinished` still refuses gaps for a release gate.
//
// Run: node tests/vmu-run237-ledger-audit.test.mjs

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'


const TMP = __tmpRoot() + '/run237'
const LEDGER = join(REPO, 'docs', 'acceptance', 'rules-ledger.json')
const GATE = join(REPO, 'scripts', 'check-rules-coverage.mjs')
const SRC_GATE = readFileSync(GATE, 'utf8')

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) {
    passed += 1
    console.log('  ok   ' + name)
  } else {
    failed += 1
    failures.push(name)
    console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  }
}
function has(text, needle, name) {
  ok(typeof text === 'string' && text.indexOf(needle) !== -1, name, { needle })
}

mkdirSync(TMP, { recursive: true })

/** Run the gate against a ledger COPY and return `{ ok, problems }` (never throws on a red gate). */
function runGate(itemMutation, extraArgs = []) {
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'))
  if (typeof itemMutation === 'function') itemMutation(ledger)
  const root = mkdtempSync(join(TMP, 'ledger-'))
  const file = join(root, 'rules-ledger.json')
  writeFileSync(file, JSON.stringify(ledger, null, 2) + '\n', 'utf8')
  let parsed = null
  let exitCode = 0
  try {
    const out = execFileSync(process.execPath, [GATE, '--check', '--json', '--ledger', file].concat(extraArgs), { cwd: REPO, encoding: 'utf8' })
    parsed = JSON.parse(out)
  } catch (e) {
    exitCode = typeof e.status === 'number' ? e.status : 1
    try { parsed = JSON.parse(String(e.stdout || '')) } catch (err) { parsed = null }
  }
  return { exitCode, parsed, root, file }
}
const codesOf = (parsed) => ((parsed && parsed.problems) || []).map((p) => p.code)

/**
 * A SYNTHETIC declared gap, used to test the gap BEHAVIOUR (warning printed / --strict-unfinished refuses).
 * The real ledger has no gaps any more (C10 was the last one, and it left through a public auditDispute), so a
 * behaviour test written against the real ledger would either be vacuous (`gaps.every(...)` over []) or would
 * re-pin the ledger (the RUN 242 "ruler measuring itself" defect). Mutating a DONE row in a COPY keeps the
 * property while measuring only the gate's behaviour.
 */
const synthGap = (ledger) => {
  const it = ledger.items.find((x) => x.id === 'D2')
  it.status = 'PARTIAL'
  it.next = 'synthetic fixture: needs a deployment with the capability this row names'
  delete it.auditDispute
  return it.id
}

// ── §0 the gate reads the second ledger and knows the vocabulary ─────────────────────────────────────────────────
{
  console.log('\n=== §0 the gate reads the observation audit (source pins) ===')
  has(SRC_GATE, 'sim-audit-rules.md', 'the gate names the observation audit it cross-reads')
  has(SRC_GATE, 'VMU_RULES_DONE_DISPUTED_BY_AUDIT', 'a DONE the audit contradicts has its own code')
  has(SRC_GATE, 'auditDisputeProblem', 'the reconciliation is checked by one function')
  has(SRC_GATE, 'acknowledged must be true', 'an acknowledgement cannot be blank')
  has(SRC_GATE, 'tests/legacy/', 'an archived suite can never be the evidence')
  has(SRC_GATE, 'STRICT_UNFINISHED', 'a declared gap is a warning unless the release flag is on')
  has(SRC_GATE, 'reconciledByAudit', 'the report says how many DONE rows answered the audit')
}

// ── §1 the real ledger passes, and its disputed rows are reconciled rather than dismissed ────────────────────────
{
  console.log('\n=== §1 the real ledger: DONE that answers the audit, gaps declared ===')
  const real = JSON.parse(readFileSync(LEDGER, 'utf8'))
  const disputed = real.items.filter((it) => it.auditDispute && it.auditDispute.acknowledged === true)
  ok(disputed.length >= 15, 'the disputed rows carry an acknowledged reconciliation', { count: disputed.length })
  ok(disputed.every((it) => /^tests\/[^/]+\.mjs::/.test(String(it.auditDispute.evidence))),
    'every reconciliation cites a maintained suite and a pattern', disputed.map((it) => it.auditDispute.evidence).slice(0, 3))
  ok(disputed.every((it) => String(it.auditDispute.evidence).indexOf('tests/legacy/') === -1),
    'no reconciliation hides behind an archived suite')
  const gaps = real.items.filter((it) => it.status === 'PARTIAL' || it.status === 'MISSING')
  const gapIds = gaps.map((g) => g.id)
  // ★ RUN 242: this used to be `gaps.length >= 3`, i.e. it counted the ledger instead of asserting the invariant -
  // so closing a gap for a GOOD reason (E16, now proved end-to-end by tests/vmu-run242-order-write.test.mjs) turned
  // this suite red, which is a ruler measuring itself. The invariant is WHICH rows are unreachable without a
  // different deployment or a human ruling: C10 still needs a deployment with Lean. D2 was exactly such a row until
  // the user ruled the other way in RUN 248 (m37456: members manage their own channels), after which the three
  // channels are observable end-to-end (tests/vmu-run248-notice-delivery.test.mjs). Flipping a gap to DONE to make
  // the gate look green is still the fraud this test exists to catch — so a row that leaves the gap list must now
  // answer the observation audit in the open, with a maintained suite, not with silence.
  const d2 = real.items.find((it) => it.id === 'D2')
  // ★ RUN 86: C10 left the gap list through a REAL observation (leanprobe1: four verbs on a Lean 4.34.0 host),
  // so the old pin ("C10 must stay a gap") became false. The invariant worth keeping is the one this suite exists
  // for: a row that LEAVES the gap list must answer the observation audit in the open — DONE + acknowledged
  // dispute + maintained-suite evidence + a written boundary note — never silence. Same pattern D2 is held to.
  const c10 = real.items.find((it) => it.id === 'C10')
  ok(c10.status === 'DONE' && c10.auditDispute && c10.auditDispute.acknowledged === true,
    'C10 left the gap list only through a DONE that answers the observation audit', { status: c10.status })
  ok(/^tests\/[^/]+\.mjs::/.test(String(c10.auditDispute && c10.auditDispute.evidence)) &&
    String(c10.auditDispute.evidence).indexOf('tests/legacy/') === -1,
    'C10 reconciliation cites a maintained suite and a pattern', { evidence: c10.auditDispute && c10.auditDispute.evidence })
  ok(typeof c10.note === 'string' && c10.note.trim().length >= 24,
    'C10 note names the boundary (office path observed, member path not)', { noteLen: typeof c10.note === 'string' ? c10.note.length : null })
  ok(!gapIds.includes('C10'), 'C10 is no longer declared a gap', { gaps: gapIds })
  ok(d2.status === 'DONE' && d2.auditDispute && d2.auditDispute.acknowledged === true &&
    /^tests\/vmu-run248-/.test(String(d2.auditDispute.evidence)),
    'D2 left the gap list only through the user ruling, and the DONE answers the observation audit with a maintained suite',
    { status: d2.status, evidence: d2.auditDispute && d2.auditDispute.evidence })
  ok(gaps.length === 0, 'the real ledger declares no gaps today (the synthetic fixture below exercises the behaviour)', { gaps: gapIds })

  const green = runGate(null)
  ok(green.exitCode === 0, 'the real ledger passes --check', { exitCode: green.exitCode, problems: codesOf(green.parsed) })
  ok(!codesOf(green.parsed).includes('VMU_RULES_UNFINISHED'), 'declared gaps are warnings, not failures (default scope)')
  const synthetic = runGate(synthGap)
  const syntheticWarnings = ((synthetic.parsed && synthetic.parsed.warnings) || [])
  ok(synthetic.exitCode === 0 && syntheticWarnings.some((w) => w.code === 'VMU_RULES_UNFINISHED' &&
      JSON.stringify(w).indexOf('D2') !== -1),
    'a declared gap is still PRINTED as a named unfinished warning (invisible gaps would be the old bug)',
    { exitCode: synthetic.exitCode, warnings: syntheticWarnings.map((w) => w.code) })
}

// ── §2 remove the reconciliation from a disputed row ⇒ the gate refuses the DONE ────────────────────────────────
{
  console.log('\n=== §2 a DONE that ignores the audit is red ===')
  const bare = runGate((ledger) => {
    const it = ledger.items.filter((x) => x.auditDispute)[0]
    delete it.auditDispute
    return it.id
  })
  ok(bare.exitCode !== 0, 'the gate fails', { exitCode: bare.exitCode })
  ok(codesOf(bare.parsed).includes('VMU_RULES_DONE_DISPUTED_BY_AUDIT'), 'with VMU_RULES_DONE_DISPUTED_BY_AUDIT', codesOf(bare.parsed))
}

// ── §3 the reconciliation must be executable, not a sentence ───────────────────────────────────────────────────
{
  console.log('\n=== §3 a citation that cannot be run is refused ===')
  const cases = [
    ['a pattern that is not in the suite', (it) => { it.auditDispute.evidence = 'tests/vmu-run237-ledger-audit.test.mjs::' + 'NO_SUCH_PATTERN_' + Date.now() }],
    ['a suite that does not exist', (it) => { it.auditDispute.evidence = 'tests/no-such-suite.test.mjs::anything' }],
    ['an archived suite', (it) => { it.auditDispute.evidence = 'tests/legacy/v2-list-agents-and-next-step.mutants.mjs::runSuite' }],
    ['no acknowledgement', (it) => { it.auditDispute.acknowledged = false }],
    ['a why that says nothing', (it) => { it.auditDispute.why = 'fixed' }],
  ]
  for (const [label, mutate] of cases) {
    const res = runGate((ledger) => {
      const it = ledger.items.filter((x) => x.auditDispute)[0]
      mutate(it)
    })
    ok(res.exitCode !== 0 && codesOf(res.parsed).includes('VMU_RULES_DONE_DISPUTED_BY_AUDIT'),
      'refused: ' + label, { exitCode: res.exitCode, codes: codesOf(res.parsed) })
  }
}

// ── §4 the release flag still refuses declared gaps (a release is not a working tree) ───────────────────────────
{
  console.log('\n=== §4 --strict-unfinished refuses the declared gaps ===')
  const strict = runGate(synthGap, ['--strict-unfinished'])
  ok(strict.exitCode !== 0, 'the release scope fails while a declared gap exists', { exitCode: strict.exitCode })
  ok(codesOf(strict.parsed).includes('VMU_RULES_UNFINISHED') &&
    JSON.stringify((strict.parsed && strict.parsed.problems) || []).indexOf('D2') !== -1,
    'and names the gap it refuses', codesOf(strict.parsed))
}

console.log('\nTOTAL ' + (passed + failed) + ' PASS ' + passed + ' FAIL ' + failed)
if (failures.length > 0) {
  console.log('\nFAILURES:')
  for (const f of failures) console.log('  - ' + f)
  process.exitCode = 1
}
