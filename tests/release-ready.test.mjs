// tests/release-ready.test.mjs — TB-2609: the release gate must refuse for a NAMED reason, never by habit.
//
// The gate answers one question before a real run: are the facts (sim gate green, audit fresh AND attributable to this
// tree, audit clean, no open P0, every P0 in the report tracked in the ledger) all true RIGHT NOW? This suite treats
// `scripts/sim/audit/release-ready.mjs` the way the audit treats receipts: every verdict must come from a measured
// fact, and every refusal must carry the code that names it.
//
// What is pinned:
//   §1  parseAuditReport reads the shapes all.mjs prints, and reads the machine-readable provenance block
//   §2  assess() is GREEN only when every fact holds, and each fact has its own RED with its own code
//   §2b every refusal names an owner and what would make it green
//   §3  the open-items ledger is validated, not trusted, and every P0 the report names must have a ledger row
//   §4  freshness is TWO checks: newer than HEAD and newer than the newest uncommitted CODE edit (drift)
//   §5  the real repo: drift is measurable now, the tree hash is stable and content-bound, only code roots count
//   §6  the CLI: skipping the gate can only ever be NOT READY, --json is parseable, an override keeps the reasons,
//       and AUDIT-14 P0-2 forgeries (a hand-typed PASS, a "compared 0; gaps 0" report) are red by name while a
//       report in the real shape is accepted as attributable
//
// Runs offline and needs no gate run: the red/green products are fixtures. Loaded through file: URLs so the Chinese
// repository path never has to be encoded by hand.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
// Per-process TMP: a fixed scratch dir let two concurrent gate runs rm -rf each other's fixtures, which is exactly how
// a 13.6 s "gate finished" reading was fabricated once. tmpdir + pid is the shape the other sim suites use.
const TMP = join(tmpdir(), 'sim-tests-release-ready-' + process.pid)
const MOD = pathToFileURL(join(REPO, 'scripts', 'sim', 'audit', 'release-ready.mjs')).href
const SCRIPT = join(REPO, 'scripts', 'sim', 'audit', 'release-ready.mjs')
const REAL_AUDIT = process.env.VMU_REAL_AUDIT || 'D:/_tmp/sim/p02-audit/AUDIT.md' // PORTABLE-ALLOW: read-only evidence from a real gate run; overridable via VMU_REAL_AUDIT, and when missing the on-disk row FAILS, never skips

const rr = await import(MOD)

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) {
    passed += 1
    console.log('  ok   ' + label)
  } else {
    failed += 1
    console.log('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  }
}

rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })
const write = (name, text) => {
  const p = join(TMP, name)
  writeFileSync(p, text)
  return p
}

// The tree a report claims to be about. Fixtures use it, so "the report matches this tree" is a fact, not a wish.
const TREE = { ok: true, head: '67fb601a' + '0'.repeat(32), hash: 'sha256:' + 'b'.repeat(64), changed: 12, why: null }
const CORPUS_ID = 'sha256:' + 'c'.repeat(64)
const GENERATED_AT = '2026-11-09T00:00:00.000Z'
// The id is DERIVED (R1b): sha256(corpusId|treeHash). A fixture that minted its own id would be testing a gate that
// accepts any label; the gate recomputes this one, so the fixture must too.
const manifestOf = (over = {}) => ({
  tool: 'scripts/sim/audit/all.mjs',
  auditId: rr.deriveAuditId(CORPUS_ID, TREE.hash),
  generatedAt: GENERATED_AT,
  tree: { ok: true, head: TREE.head, hash: TREE.hash, changed: TREE.changed },
  corpus: { scenarios: 15, receipts: 887, corpusId: CORPUS_ID },
  fidelity: { liveToolsWithFieldList: 69, compared: 69, gaps: 0 },
  checks: { verdict: 'PASS', failures: 0, warnings: 2 },
  p0: [],
  ...over,
})

// A report in the exact shape scripts/sim/audit/all.mjs writes, block included.
const reportText = (opts = {}) => {
  const o = opts || {}
  const manifest = JSON.parse(JSON.stringify(o.manifest || manifestOf()))
  const verdict = o.verdict || 'PASS'
  const failures = Number.isFinite(o.failures) ? o.failures : 0
  const warnings = Number.isFinite(o.warnings) ? o.warnings : 2
  if (!o.noChecks) manifest.checks = { verdict, failures, warnings }
  const fidelity = manifest.fidelity || {}
  const line = '- live tools with a field list: ' + String(fidelity.liveToolsWithFieldList) + '; compared: ' + String(fidelity.compared) + '; gaps: ' + String(fidelity.gaps)
  const lines = [
    '# Simulator audit',
    '## 1. scenarios',
    '- mainline: OK',
    '## 2. receipt audit (A1\u2013A5)',
    '- all: OK',
    '## 3. rule coverage (93 rules -> scenario steps)',
    '- covered: 93/93',
    '## 4. action coverage',
    '- declared actions: 225 covered: 218',
    '## 5. fidelity vs live receipts',
    line,
    'AUDIT: ' + verdict + ' \u2014 ' + failures + ' failure(s), ' + warnings + ' warning(s)',
    '```json audit-report',
    JSON.stringify(manifest, null, 2),
    '```',
  ]
  return lines.join('\n')
}
const handTypedPass = () => [
  '# Simulator audit',
  '## 1. scenarios',
  '## 2. receipt audit (A1\u2013A5)',
  '## 3. rule coverage',
  '## 4. action coverage',
  '## 5. fidelity vs live receipts',
  '- live tools with a field list: 12; compared: 12; gaps: 0',
  'AUDIT: PASS \u2014 0 failure(s), 0 warning(s)',
].join('\n')

const HEAD_MS = Date.parse('2026-11-09T00:00:00+08:00')
const auditFacts = (text, mtimeMs) => ({
  path: join(TMP, 'AUDIT.md'),
  mtimeMs,
  report: rr.parseAuditReport(text),
})
const cleanLedger = () => ({
  ok: true,
  bad: [],
  items: [
    { id: 'p1-open', title: 'one open P1 with a condition', severity: 'P1', status: 'open', owner: 'someone', condition: 'close when the reading exists' },
  ],
})
const baseFacts = () => ({
  root: TMP,
  corpus: { ok: true, dir: TMP, files: [{ scenario: 'mainline', receiptsPath: join(TMP, 'receipts.jsonl') }], corpusId: CORPUS_ID, newestMs: Date.parse(GENERATED_AT), why: null },
  fidelityRecomputed: { ok: true, liveToolsWithFieldList: 69, compared: 69, gaps: 0, gapList: [], why: null },
  ledgerProofs: { ok: true, ran: [], missing: [], failed: [] },
  gate: { ran: true, exitCode: 0, wallMs: 68000, tail: '=== sim gate: 73 passed, 0 failed ===', error: null },
  audit: auditFacts(reportText(), HEAD_MS + 3600000),
  head: { commitMs: HEAD_MS, iso: '2026-11-09T00:00:00+08:00' },
  drift: { ok: true, changed: ['vibe-math-vmu/kernel/index.js'], newestMs: HEAD_MS + 600000, newestPath: 'vibe-math-vmu/kernel/index.js', why: null },
  treeHash: { ...TREE },
  openItems: cleanLedger(),
  override: null,
})
const codes = (verdict) => (verdict.reasons || []).map((r) => r.code)
const redCodes = (mutate) => {
  const f = baseFacts()
  mutate(f)
  return codes(rr.assess(f))
}

console.log('--- 1. parseAuditReport reads the shapes all.mjs prints, block included')
{
  const good = rr.parseAuditReport(reportText())
  ok(good.verdict === 'PASS', 'verdict is PASS', good.verdict)
  ok(good.failures === 0 && good.warnings === 2, 'failure and warning counts are read', good)
  ok(good.sections.length === 5 && good.missingSections.length === 0, 'all five sections are present', good.missingSections)
  ok(good.gaps === 0 && good.compared === 69, 'the prose fidelity line is read too', good)
  ok(good.manifest !== null && good.manifest.tool === 'scripts/sim/audit/all.mjs', 'the provenance block is parsed', good.manifestError || good.manifest)
  ok(good.manifest && /^sha256:[0-9a-f]{64}$/.test(good.manifest.tree.hash), 'the block carries a tree hash', good.manifest && good.manifest.tree.high)
  ok(good.manifest && good.manifest.fidelity.compared === 69 && good.manifest.fidelity.liveToolsWithFieldList === 69, 'the block carries the fidelity counts', good.manifest && good.manifest.fidelity)

  const bare = rr.parseAuditReport(handTypedPass())
  ok(bare.manifest === null, 'a hand-typed report has no provenance block', bare.manifest)
  ok(/no ```json audit-report block/.test(String(bare.manifestError)), 'and the parser says why the origin is unprovable', bare.manifestError)
  const broken = rr.parseAuditReport(reportText().replace('"auditId":', '"auditId": [broken'))
  ok(broken.manifest === null && /not JSON/.test(String(broken.manifestError)), 'a malformed block is not read as a manifest', broken.manifestError)

  const bad = rr.parseAuditReport('# nothing here')
  ok(bad.verdict === null && bad.gaps === null, 'an empty report reads as unmeasured, never as PASS', bad)
  ok(bad.missingSections.length === 5, 'a report with no sections names all five as missing', bad.missingSections)
  const failedReport = rr.parseAuditReport(reportText({ verdict: 'FAIL', failures: 2 }))
  ok(failedReport.verdict === 'FAIL' && failedReport.failures === 2, 'a FAIL verdict is not laundered into a PASS', failedReport)
}

console.log('--- 2. assess is GREEN only when every fact holds')
{
  const green = rr.assess(baseFacts())
  ok(green.ready === true, 'all facts true => READY', codes(green))
  ok(green.reasons.length === 0, 'a READY verdict carries no reason', green.reasons)
  ok(green.checks.length >= 22, 'every check is reported, pass or fail', green.checks.length)

  ok(redCodes((f) => { f.gate = { ran: false, exitCode: null, wallMs: 0, error: 'the caller passed --no-gate' } }).includes('SIM_GATE_NOT_RUN'), 'a gate that was not run is a reason, not a pass')
  ok(redCodes((f) => { f.gate.exitCode = 1 }).includes('SIM_GATE_FAILED'), 'a red gate fails the release')
  ok(redCodes((f) => { f.audit = null }).includes('AUDIT_MISSING'), 'no audit report is not the same as a clean one')
  ok(redCodes((f) => { f.audit = auditFacts(reportText(), HEAD_MS - 60000) }).includes('AUDIT_STALE'), 'a report older than HEAD is stale by name')
  ok(redCodes((f) => { f.audit = auditFacts(reportText({ verdict: 'FAIL', failures: 1 }), HEAD_MS + 3600000) }).includes('AUDIT_FAILED'), 'a FAIL report fails the release even when it is fresh')

  // P0-2 defect 1: a hand-typed file with the right lines used to be READY. Now its LACK OF PROVENANCE is the red.
  ok(redCodes((f) => { f.audit = auditFacts(handTypedPass(), HEAD_MS + 3600000) }).includes('AUDIT_UNVERIFIABLE'), 'a hand-typed PASS is red because its origin cannot be proven')
  ok(redCodes((f) => { f.treeHash = { ok: false, hash: null, head: null, changed: 0, why: 'git could not run here' } }).includes('AUDIT_TREE_UNMEASURED'), 'an unmeasurable tree hash is a reason, never an assumed match')
  ok(redCodes((f) => { f.treeHash = { ...TREE, hash: 'sha256:' + 'd'.repeat(64) } }).includes('AUDIT_TREE_CHANGED'), 'a report about a DIFFERENT tree is red by name')
  ok(redCodes((f) => { f.treeHash = { ...TREE, head: 'deadbeef' + '0'.repeat(32) } }).includes('AUDIT_TREE_CHANGED'), 'a moved HEAD is named too')

  // P0-2 defect 2: compared and gaps answer different questions; "compared 0; gaps 0" measured NOTHING.
  ok(redCodes((f) => { f.audit = auditFacts(reportText({ manifest: manifestOf({ fidelity: { liveToolsWithFieldList: 69, compared: 0, gaps: 0 } }) }), HEAD_MS + 3600000) }).includes('AUDIT_FIDELITY_MEASURED_NOTHING'), 'compared 0 is red even when gaps is 0')
  ok(redCodes((f) => { f.audit = auditFacts(reportText({ manifest: manifestOf({ fidelity: { liveToolsWithFieldList: 69, compared: 5, gaps: 0 } }) }), HEAD_MS + 3600000) }).includes('AUDIT_FIDELITY_COUNTS_INCONSISTENT'), 'comparing only some live tools is named')
  ok(redCodes((f) => { f.audit = auditFacts(reportText({ manifest: manifestOf({ fidelity: { liveToolsWithFieldList: 69, compared: 69, gaps: 3 } }) }), HEAD_MS + 3600000) }).includes('AUDIT_FIDELITY_GAPS'), 'a fidelity gap blocks by name')
  ok(redCodes((f) => { f.audit = auditFacts(reportText({ manifest: manifestOf({ fidelity: null }) }), HEAD_MS + 3600000) }).includes('AUDIT_FIDELITY_UNMEASURED'), 'a report with no fidelity counts is not green')
  ok(redCodes((f) => { f.audit = auditFacts(reportText().replace('## 5. fidelity vs live receipts', '## 5. something else'), HEAD_MS + 3600000) }).includes('AUDIT_INCOMPLETE'), 'a missing section is named')

  // O-2: the report P0s must be in the ledger, otherwise "no open P0" is an empty claim.
  const p0 = [{ id: 'audit-finding-01', title: 'receipt audit mainline: 1 finding(s)', severity: 'P0', owner: 'see the FAIL line' }]
  ok(redCodes((f) => { f.audit = auditFacts(reportText({ manifest: manifestOf({ p0 }) }), HEAD_MS + 3600000) }).includes('AUDIT_P0_UNLEDGERED'), 'a report P0 with no ledger row blocks by name')

  ok(redCodes((f) => { f.openItems = { ok: false, why: 'open-items ledger is not JSON: Unexpected token', items: [] } }).includes('OPEN_ITEMS_INVALID'), 'an unreadable ledger blocks instead of defaulting to clean')
}

console.log('--- 2c. R1/R2/R3/R4/R5/R6: corpus, proofs, recomputation, verdict, gap naming, override text')
{
  const badCorpus = (over) => { const f = baseFacts(); f.corpus = { ...f.corpus, ...over }; return codes(rr.assess(f)) }
  ok(badCorpus({ ok: false, corpusId: null, why: 'no corpus-<scenario>/receipts.jsonl under D:/_tmp/sim' }).includes('AUDIT_CORPUS_UNMEASURED'), 'a corpus the gate cannot re-read is a reason, never an assumed match') // PORTABLE-ALLOW: fixture text inside a refusal why, not an execution path
  ok(badCorpus({ corpusId: 'sha256:' + 'f'.repeat(64) }).includes('AUDIT_CORPUS_STALE'), 'a report naming a corpus that is not on disk is stale by name')
  {
    const f = baseFacts()
    f.audit = { path: join(TMP, 'AUDIT.md'), mtimeMs: HEAD_MS + 3600000, report: rr.parseAuditReport(reportText({ manifest: manifestOf({ generatedAt: '2020-01-01T00:00:00.000Z' }) })) }
    ok(codes(rr.assess(f)).includes('AUDIT_CORPUS_STALE'), 'a report stamped BEFORE the receipts it claims to have measured is stale, even when the id matches')
  }
  {
    const f = baseFacts()
    f.audit = { path: join(TMP, 'AUDIT.md'), mtimeMs: HEAD_MS + 3600000, report: rr.parseAuditReport(reportText({ manifest: manifestOf({ auditId: 'audit-0123456789abcdef' }) })) }
    ok(codes(rr.assess(f)).includes('AUDIT_ID_MISMATCH'), 'an id that is not sha256(corpusId|treeHash) is named (a stamp that cannot be recomputed is decoration)')
  }
  {
    const f = baseFacts()
    const m = manifestOf(); delete m.checks
    f.audit = { path: join(TMP, 'AUDIT.md'), mtimeMs: HEAD_MS + 3600000, report: rr.parseAuditReport(reportText({ manifest: m, noChecks: true })) }
    ok(codes(rr.assess(f)).includes('AUDIT_CHECKS_ABSENT'), 'a block with no checks verdict cannot be compared with the prose')
  }
  {
    const f = baseFacts()
    const m = manifestOf(); m.checks = { verdict: 'FAIL', failures: 3, warnings: 0 }
    f.audit = { path: join(TMP, 'AUDIT.md'), mtimeMs: HEAD_MS + 3600000, report: rr.parseAuditReport(reportText({ manifest: m, noChecks: true })) }
    const c = codes(rr.assess(f))
    ok(c.includes('AUDIT_VERDICT_CONTRADICTION'), 'prose PASS with a machine FAIL is a contradiction, not a pass', c)
  }
  {
    const f = baseFacts(); f.fidelityRecomputed = { ok: false, why: 'real-fields.jsonl is missing', compared: null, gaps: null, liveToolsWithFieldList: null, gapList: [] }
    ok(codes(rr.assess(f)).includes('AUDIT_FIDELITY_RECOMPUTE_UNMEASURED'), 'an unverifiable "gaps 0" is not a measurement')
  }
  {
    const f = baseFacts()
    f.fidelityRecomputed = { ok: true, liveToolsWithFieldList: 69, compared: 69, gaps: 2, gapList: [{ tool: 'vibe_v5_wait', field: 'call.facts.kind' }, { tool: 'vibe_vmu_turn', field: 'at' }], why: null }
    const verdict = rr.assess(f)
    const reason = verdict.reasons.find((r) => r.code === 'AUDIT_FIDELITY_MISMATCH')
    ok(Boolean(reason), 'a report whose claim disagrees with the recomputation is red')
    ok(reason && reason.message.includes('vibe_v5_wait.call.facts.kind') && reason.message.includes('vibe_vmu_turn.at'), 'and it NAMES the differing tool.field paths (R5)', reason && reason.message)
  }
  ok(redCodes((f) => { f.ledgerProofs = { ok: false, ran: [], missing: [{ id: 'ledger-row', why: 'fixed P1 has no proof:{cmd,expect}' }], failed: [] } }).includes('AUDIT_EVIDENCE_MISSING'), 'a fixed row without a runnable proof is named')
  ok(redCodes((f) => { f.ledgerProofs = { ok: false, ran: [], missing: [], failed: [{ id: 'ledger-row', cmd: 'node tests/x.test.mjs', expect: 0, actual: 1 }] } }).includes('AUDIT_EVIDENCE_FAILED'), 'a proof that does not reproduce its exit code is named with the counts')
  const badOverride = baseFacts()
  badOverride.override = { reason: 'same', at: GENERATED_AT, by: 'x' }
  badOverride.overrideCheck = rr.validateOverride('same', 'same')
  ok(codes(rr.assess(badOverride)).includes('OVERRIDE_REASON_INVALID'), 'a copy-pasted override reason is refused as a bypass too')
  ok(rr.validateOverride('too short', null).ok === false, 'a two-word reason is refused')
  ok(rr.validateOverride('TB-2653: R3 lands, gate red only on AUDIT_EVIDENCE_FAILED, acceptable for this dry run', null).ok === true, 'a reason that says what is known is accepted')
}

console.log('--- 2b. every refusal names an owner and what would make it green (TB-2609 follow-up)')
{
  // The tree is edited by several lanes at once, so NOT READY is the normal state for part of the day. A reason that
  // only says WHAT is missing turns the gate into a wall; the owner line is how a reader learns whom to wait for.
  // This is output contract, not a check: no verdict above changes because of it.
  const mutations = [
    (f) => { f.gate = { ran: false, exitCode: null, wallMs: 0, error: 'the caller passed --no-gate' } },
    (f) => { f.gate.exitCode = 1 },
    (f) => { f.audit = null },
    (f) => { f.audit = auditFacts(reportText(), HEAD_MS - 60000) },
    (f) => { f.audit = auditFacts(reportText(), HEAD_MS + 3600000); f.drift = { ok: true, changed: ['scripts/x.mjs'], newestMs: HEAD_MS + 7200000, newestPath: 'scripts/x.mjs' } },
    (f) => { f.drift = { ok: false, changed: [], newestMs: null, newestPath: null, why: 'git is not available in this sandbox' } },
    (f) => { f.audit = auditFacts(reportText({ verdict: 'FAIL', failures: 1 }), HEAD_MS + 3600000) },
    (f) => { f.audit = auditFacts(handTypedPass(), HEAD_MS + 3600000) },
    (f) => { f.treeHash = { ok: false, hash: null, head: null, changed: 0, why: 'no git' } },
    (f) => { f.treeHash = { ...TREE, hash: 'sha256:' + 'e'.repeat(64) } },
    (f) => { f.audit = auditFacts(reportText({ manifest: manifestOf({ fidelity: { liveToolsWithFieldList: 69, compared: 0, gaps: 0 } }) }), HEAD_MS + 3600000) },
    (f) => { f.audit = auditFacts(reportText({ manifest: manifestOf({ fidelity: { liveToolsWithFieldList: 69, compared: 5, gaps: 0 } }) }), HEAD_MS + 3600000) },
    (f) => { f.audit = auditFacts(reportText({ manifest: manifestOf({ fidelity: { liveToolsWithFieldList: 69, compared: 69, gaps: 2 } }) }), HEAD_MS + 3600000) },
    (f) => { f.audit = auditFacts(reportText({ manifest: manifestOf({ p0: [{ id: 'audit-finding-99', title: 'x' }] }) }), HEAD_MS + 3600000) },
    (f) => { f.openItems = { ok: false, why: 'not JSON', items: [] } },
    (f) => { f.openItems = { ok: true, bad: [], items: [{ id: 'p0-open', title: 'blocker', severity: 'P0', status: 'open', owner: 'state-lane', condition: 'close it' }] } },
  ]
  const reasons = mutations.flatMap((m) => { const f = baseFacts(); m(f); return rr.assess(f).reasons })
  ok(reasons.length >= 16, 'precondition: the red facts above produce reasons to read', reasons.length)
  const naked = reasons.filter((r) => !String(r.owner || '').trim() || !String(r.wouldBeReadyIf || '').trim())
  ok(naked.length === 0, 'no refusal is anonymous: each names an owner and what would make it green', naked)
  ok(new Set(reasons.map((r) => r.code)).size >= 14, 'each of those refusals is a distinct code', [...new Set(reasons.map((r) => r.code))])

  // The OPEN_P0 owner is not a stock sentence: it comes from the ledger entry that is actually open.
  const ledgerP0 = baseFacts()
  ledgerP0.openItems = { ok: true, bad: [], items: [{ id: 'p0-named', title: 'blocker', severity: 'P0', status: 'open', owner: 'compare-lane', condition: 'close it' }] }
  const p0Reason = rr.assess(ledgerP0).reasons.find((r) => r.code === 'OPEN_P0')
  ok(p0Reason, 'the open P0 is reported', rr.assess(ledgerP0).reasons)
  ok(p0Reason && p0Reason.owner.includes('compare-lane') && p0Reason.owner.includes('p0-named'), 'the OPEN_P0 reason names the ledger owner, not a placeholder', p0Reason && p0Reason.owner)
}

console.log('--- 3. the ledger is validated, and a report P0 must have a row (O-2)')
{
  const openP0 = baseFacts()
  openP0.openItems = { ok: true, bad: [], items: [{ id: 'p0-open', title: 'a real blocker', severity: 'P0', status: 'open', owner: 'lane', condition: 'close it' }] }
  ok(codes(rr.assess(openP0)).includes('OPEN_P0'), 'an open P0 blocks the release', rr.assess(openP0).reasons)

  const p0Fixed = baseFacts()
  p0Fixed.openItems = { ok: true, bad: [], items: [{ id: 'p0-fixed', title: 'a closed blocker', severity: 'P0', status: 'fixed', owner: 'lane' }] }
  ok(rr.assess(p0Fixed).ready === true, 'a fixed P0 does not block forever (the gate must be able to open)')

  const p1Open = baseFacts()
  p1Open.openItems = { ok: true, bad: [], items: [{ id: 'p1', title: 'a bounded P1', severity: 'P1', status: 'open', owner: 'lane', condition: 'needs a deployment with Lean' }] }
  ok(rr.assess(p1Open).ready === true, 'an open P1 with an owner and a condition does not block', codes(rr.assess(p1Open)))

  const p0 = [{ id: 'audit-finding-01', title: 'receipt audit mainline: 1 finding(s)', severity: 'P0', owner: 'see the FAIL line' }]
  const ledgered = baseFacts()
  ledgered.audit = auditFacts(reportText({ manifest: manifestOf({ p0 }) }), HEAD_MS + 3600000)
  ledgered.openItems = { ok: true, bad: [], items: [...cleanLedger().items, { id: 'audit-finding-01', title: 'the finding', severity: 'P0', status: 'taskbook', owner: 'sim-lane' }] }
  ok(!codes(rr.assess(ledgered)).includes('AUDIT_P0_UNLEDGERED'), 'a P0 with a ledger row does not block (the gate can be satisfied honestly)')
  const byTitle = baseFacts()
  byTitle.audit = auditFacts(reportText({ manifest: manifestOf({ p0 }) }), HEAD_MS + 3600000)
  byTitle.openItems = { ok: true, bad: [], items: [{ id: 'tb-2644-p0', title: 'receipt audit mainline: 1 finding(s)', severity: 'P0', status: 'taskbook', owner: 'sim-lane' }] }
  ok(!codes(rr.assess(byTitle)).includes('AUDIT_P0_UNLEDGERED'), 'a row matched by title also counts (ids churn, titles are what a reader recognizes)')

  const ledgerFile = write('ledger-bad.json', JSON.stringify({
    items: [
      { id: 'no-owner', title: 'x', severity: 'P1', status: 'open', condition: 'y' },
      { id: 'no-condition', title: 'x', severity: 'P1', status: 'open', owner: 'z' },
      { id: 'bad-severity', title: 'x', severity: 'P4', status: 'open', owner: 'z', condition: 'y' },
      { id: 'bad-status', title: 'x', severity: 'P1', status: 'wontfix', owner: 'z' },
    ],
  }, null, 2))
  const readBad = rr.readOpenItems(ledgerFile)
  ok(readBad.ok === true && readBad.bad.length === 4, 'every malformed entry is named, not just the first', readBad.bad)
  ok(readBad.bad.some((m) => m.startsWith('no-owner: no owner')), 'an open item without an owner is named', readBad.bad)
  ok(readBad.bad.some((m) => m.startsWith('no-condition: an OPEN item must name its condition')), 'an open item without a condition is named', readBad.bad)

  const missing = rr.readOpenItems(join(TMP, 'does-not-exist.json'))
  ok(missing.ok === false && /missing open-items ledger/.test(missing.why), 'a missing ledger says so instead of reading as empty', missing.why)

  const realLedger = rr.readOpenItems()
  ok(realLedger.ok === true && realLedger.items.length >= 6, 'the repository ledger exists and carries the LEFT OPEN entries', realLedger.items && realLedger.items.length)
  ok(realLedger.bad.length === 0, 'the repository ledger validates (owner, severity, status, condition)', realLedger.bad)
  // Do not pin one row: rows get closed by their owners and a pinned id would turn "closed" into a red. Pin the RULE:
  // every open item must carry an owner and a condition, and the P0-2 row this task exists for must be present.
  const openRows = (realLedger.items || []).filter((it) => it.status === 'open')
  ok(openRows.every((it) => typeof it.owner === 'string' && it.owner.trim().length > 0 && typeof it.condition === 'string' && it.condition.trim().length > 0), 'every open ledger item carries an owner and a condition', openRows.map((it) => it.id))
  ok((realLedger.items || []).some((it) => it.id === 'audit14-p0-2-release-gate-forgeable'), 'the P0-2 row that this task closes is on the ledger')
}

console.log('--- 4. freshness has TWO faces: newer than HEAD, and newer than the newest uncommitted code edit')
{
  const drifted = baseFacts()
  drifted.drift = { ok: true, changed: ['vibe-math-vmu/kernel/turn/index.js'], newestMs: HEAD_MS + 7200000, newestPath: 'vibe-math-vmu/kernel/turn/index.js', why: null }
  ok(codes(rr.assess(drifted)).includes('AUDIT_PREDATES_WORKTREE'), 'an audit that predates uncommitted code is not fresh (HEAD alone proves too little)', rr.assess(drifted).reasons)

  const measured = baseFacts()
  measured.drift = { ok: true, changed: [], newestMs: null, newestPath: null, why: null }
  ok(rr.assess(measured).ready === true, 'a clean working tree needs no drift comparison')

  const unmeasured = baseFacts()
  unmeasured.drift = { ok: false, newestMs: null, newestPath: null, changed: [], why: 'git could not list the working tree' }
  ok(codes(rr.assess(unmeasured)).includes('AUDIT_DRIFT_UNMEASURED'), 'an unmeasured drift is a reason, never an assumed pass')
  ok(rr.assess(unmeasured).ready === false, 'and it cannot come out READY')
}

console.log('--- 5. the real repository: drift is measurable and only loadable code counts')
{
  const drift = rr.worktreeDriftMs(REPO)
  ok(drift.ok === true, 'git can list this working tree', drift.why)
  ok(Array.isArray(drift.changed), 'the changed paths are returned', typeof drift.changed)
  const outsideRoots = []
  const ledgerAsCode = []
  for (const p of drift.changed) {
    if (!p.startsWith('vibe-math-vmu/') && !p.startsWith('scripts/') && !p.startsWith('tests/')) outsideRoots.push(p)
    if (p.includes('sim-audit-open-items.json')) ledgerAsCode.push(p)
  }
  ok(outsideRoots.length === 0, 'only code roots count; a docs edit must not look like unaudited code', outsideRoots.slice(0, 5))
  ok(ledgerAsCode.length === 0, 'the ledger itself is not treated as code')
  const head = rr.headCommitMs(REPO)
  ok(Number.isFinite(head) && head > 0, 'HEAD has a readable commit time', head)
  const newest = rr.newestAudit(process.env.VMU_SIM_ROOT || 'D:/_tmp/sim') // PORTABLE-ALLOW: dev audit root; overridable via VMU_SIM_ROOT, and a root with no AUDIT.md FAILS the row below, never skips
  ok(newest !== null && existsSync(newest.path), 'the newest AUDIT.md under the sim root is found (or the run was never audited)', newest && newest.path)

  // The tree hash must bind CONTENT, not just the set of dirty paths, and must be stable across two calls. The
  // in-place edit happens INSIDE the repo on purpose: a file under D:/_tmp is not part of the tree this gate measures. PORTABLE-ALLOW: prose in a comment, not an execution path
  // The "how many paths" assertion must not borrow non-emptiness from the checkout: on a clean tree the old form
  // (`changed > 0`) was red for the wrong reason, which is the same disease as reading the environment instead of
  // the thing under test. So we plant one dirty path ourselves, measure WHILE it is there, and check that removing
  // it restores the digest byte for byte — the plant/remove cycle must leave no trace.
  const cleanBefore = rr.treeHashOf(REPO)
  const h1 = rr.treeHashOf(REPO)
  const marker = join(REPO, 'scripts', 'sim', 'audit', '.tree-hash-proof-' + String(process.pid) + '.tmp')
  let planted = null
  let after = null
  try {
    writeFileSync(marker, 'one')
    planted = rr.treeHashOf(REPO)
    writeFileSync(marker, 'two (same path, different bytes)')
    after = rr.treeHashOf(REPO)
  } finally {
    rmSync(marker, { force: true })
  }
  const cleanAfter = rr.treeHashOf(REPO)
  ok(cleanBefore.ok === true && h1.ok === true && planted.ok === true && cleanAfter.ok === true, 'the tree hash is measurable in this checkout, with and without a planted dirty path', [cleanBefore.why, h1.why, planted && planted.why, cleanAfter.why])
  ok(/^sha256:[0-9a-f]{64}$/.test(String(cleanBefore.hash)) && /^sha256:[0-9a-f]{64}$/.test(String(planted.hash)), 'the tree hash is a sha256', [cleanBefore.hash, planted && planted.hash])
  ok(cleanBefore.hash === h1.hash && cleanAfter.hash === cleanBefore.hash, 'two calls on an unchanged tree agree, and removing the planted path restores the hash byte for byte', [cleanBefore.hash, h1.hash, cleanAfter.hash])
  ok(cleanBefore.head === h1.head && cleanBefore.head === planted.head && String(cleanBefore.head).length >= 7, 'the head commit is part of the digest input, on a clean tree as much as a dirty one', [cleanBefore.head, planted && planted.head])
  ok(cleanBefore.changed >= drift.changed.length && planted.changed === cleanBefore.changed + 1, 'the digest covers every dirty path, and a planted path is counted exactly once (self-made non-emptiness, not the checkout state)', { hashChanged: cleanBefore.changed, planted: planted && planted.changed, driftChanged: drift.changed.length })
  ok(planted.hash !== after.hash, 'editing a file in place changes the hash (a dirty-path list would not)', { before: planted.hash, after: after && after.hash })
}

console.log('--- 6. the CLI: skipping the gate is a reason, --json is parseable, forgeries are red by name')
{
  const noGate = spawnSync(process.execPath, [SCRIPT, '--no-gate', '--no-proofs', '--root=' + TMP, '--json'], { cwd: REPO, encoding: 'utf8', timeout: 120000 })
  ok(noGate.status === 7, '--no-gate exits 7: NOT READY is the exit code, not just prose', noGate.status)
  let parsed = null
  try { parsed = JSON.parse(noGate.stdout) } catch { parsed = null }
  ok(parsed !== null, '--json prints one parseable object', noGate.stdout && noGate.stdout.slice(0, 120))
  ok(parsed && parsed.ready === false, 'and the object says not ready', parsed && parsed.ready)
  ok(parsed && (parsed.reasons || []).some((r) => r.code === 'SIM_GATE_NOT_RUN'), 'the skipped proof is the named reason', parsed && parsed.reasons)
  ok(parsed && parsed.facts && parsed.facts.tree && /^sha256:[0-9a-f]{64}$/.test(String(parsed.facts.tree.hash)), 'the JSON carries the measured tree hash', parsed && parsed.facts && parsed.facts.tree)

  const text = spawnSync(process.execPath, [SCRIPT, '--no-gate', '--no-proofs', '--root=' + TMP], { cwd: REPO, encoding: 'utf8', timeout: 120000 })
  ok(/NOT READY: \d+ reason\(s\)/.test(text.stdout), 'the human line states how many reasons', text.stdout && text.stdout.split('\n')[0])
  ok(text.stdout.includes('-OverrideReleaseGate'), 'the override is offered, with the hint that it is a last resort', text.stdout && text.stdout.split('\n').filter((l) => l.includes('Override')).length)

  const help = spawnSync(process.execPath, [SCRIPT, '--help'], { cwd: REPO, encoding: 'utf8', timeout: 120000 })
  ok(help.status === 0 && /usage: node scripts\/sim\/audit\/release-ready\.mjs/.test(help.stdout), '--help exits 0 with the usage line', help.status)

  // Forgeries: a hand-typed PASS (AUDIT-14 probe A) and "compared 0; gaps 0" (probe B). Both used to be READY.
  const forged = write('forged-AUDIT.md', handTypedPass())
  const forgedRun = spawnSync(process.execPath, [SCRIPT, '--no-gate', '--no-proofs', '--root=' + TMP, '--json', '--audit=' + forged, '--head-iso=2026-11-09T00:00:00+08:00'], { cwd: REPO, encoding: 'utf8', timeout: 120000 })
  let forgedJson = null
  try { forgedJson = JSON.parse(forgedRun.stdout) } catch { forgedJson = null }
  ok(forgedRun.status === 7, 'a hand-typed PASS makes the run exit 7', forgedRun.status)
  ok(forgedJson && (forgedJson.reasons || []).some((r) => r.code === 'AUDIT_UNVERIFIABLE'), 'and the reason is AUDIT_UNVERIFIABLE, named', forgedJson && forgedJson.reasons && forgedJson.reasons.map((r) => r.code))

  const nothingMeasured = write('nothing-measured-AUDIT.md', reportText({ manifest: manifestOf({ fidelity: { liveToolsWithFieldList: 69, compared: 0, gaps: 0 } }) }))
  const nmRun = spawnSync(process.execPath, [SCRIPT, '--no-gate', '--no-proofs', '--root=' + TMP, '--json', '--audit=' + nothingMeasured, '--head-iso=2026-11-09T00:00:00+08:00'], { cwd: REPO, encoding: 'utf8', timeout: 120000 })
  let nmJson = null
  try { nmJson = JSON.parse(nmRun.stdout) } catch { nmJson = null }
  ok(nmRun.status === 7, 'compared 0; gaps 0 makes the run exit 7', nmRun.status)
  ok(nmJson && (nmJson.reasons || []).some((r) => r.code === 'AUDIT_FIDELITY_MEASURED_NOTHING'), 'and the reason names the empty measurement', nmJson && nmJson.reasons && nmJson.reasons.map((r) => r.code))

  // A report in the REAL shape must not be accused of forgery: its provenance parses, so the only reasons left are
  // the truthful ones (the fixture tree is not this checkout, and --no-gate was passed).
  const realShape = write('real-shape-AUDIT.md', reportText())
  const rsRun = spawnSync(process.execPath, [SCRIPT, '--no-gate', '--no-proofs', '--root=' + TMP, '--json', '--audit=' + realShape, '--head-iso=2026-11-09T00:00:00+08:00'], { cwd: REPO, encoding: 'utf8', timeout: 120000 })
  let rsJson = null
  try { rsJson = JSON.parse(rsRun.stdout) } catch { rsJson = null }
  ok(rsRun.status === 7, 'a real-shaped report still exits 7 because --no-gate is a reason', rsRun.status)
  const rsCodes = rsJson ? (rsJson.reasons || []).map((r) => r.code) : []
  const forgedOrEmpty = ['AUDIT_UNVERIFIABLE', 'AUDIT_FIDELITY_MEASURED_NOTHING', 'AUDIT_FIDELITY_UNMEASURED', 'AUDIT_FIDELITY_COUNTS_INCONSISTENT', 'AUDIT_P0_UNLEDGERED'].filter((c) => rsCodes.includes(c))
  ok(rsJson !== null && forgedOrEmpty.length === 0, 'but it is NOT accused of being unverifiable or empty', { codes: rsCodes, accusedOf: forgedOrEmpty })

  // Override: the JSON keeps the reasons it bypassed and records who/why/when.
  const over = spawnSync(process.execPath, [SCRIPT, '--no-gate', '--no-proofs', '--root=' + TMP, '--json', '--override-reason=TB-2609 selftest: proving the bypass is loud (' + Date.now() + ')', '--override-by=sim-lane'], { cwd: REPO, encoding: 'utf8', timeout: 120000 })
  let overJson = null
  try { overJson = JSON.parse(over.stdout) } catch { overJson = null }
  ok(over.status === 7, 'an override keeps exit 7: the reasons were bypassed, not cleared', over.status)
  ok(overJson && overJson.override && /^TB-2609 selftest: proving the bypass is loud \(\d+\)$/.test(String(overJson.override.reason)), 'the override reason is in the JSON', overJson && overJson.override)
  ok(overJson && overJson.override && overJson.override.by === 'sim-lane' && typeof overJson.override.at === 'string', 'the override records who and when', overJson && overJson.override)
  ok(overJson && overJson.ready === false && (overJson.reasons || []).some((r) => r.code === 'SIM_GATE_NOT_RUN'), 'and the original reasons are still listed next to it', overJson && overJson.reasons && overJson.reasons.map((r) => r.code))

  // THE ACCEPTANCE ITEM: construct a REAL stale report on disk and require the run to name it.
  const oldReport = write('old-AUDIT.md', reportText())
  const oldMs = Date.parse('2020-01-01T00:00:00+08:00') / 1000
  try { utimesSync(oldReport, oldMs, oldMs) } catch { /* windows may refuse on some volumes; the byte-level check below still proves the file exists */ }
  const stale = spawnSync(process.execPath, [SCRIPT, '--no-gate', '--no-proofs', '--root=' + TMP, '--json', '--audit=' + oldReport, '--head-iso=2026-11-09T00:00:00+08:00'], { cwd: REPO, encoding: 'utf8', timeout: 120000 })
  let staleJson = null
  try { staleJson = JSON.parse(stale.stdout) } catch { staleJson = null }
  ok(stale.status === 7, 'a constructed stale report makes the run exit 7', stale.status)
  ok(staleJson && (staleJson.reasons || []).some((r) => r.code === 'AUDIT_STALE'), 'and the reason is AUDIT_STALE, named', staleJson && staleJson.reasons)
  ok(statSync(oldReport).size > 0, 'the fixture report really exists on disk (the red was not assumed)', statSync(oldReport).size)

  // The newest REAL report (when the audit has been run on this machine) must parse as attributable, not forged.
  if (existsSync(REAL_AUDIT)) {
    const real = rr.parseAuditReport(readFileSync(REAL_AUDIT, 'utf8'))
    ok(real.manifest !== null && real.manifest.tool === 'scripts/sim/audit/all.mjs', 'the real audit report on disk carries a provenance block', real.manifestError)
    ok(real.manifest && /^sha256:[0-9a-f]{64}$/.test(String(real.manifest.tree.hash)), 'and it names the tree hash it read', real.manifest && real.manifest.tree.hash)
    ok(real.manifest && Number.isInteger(real.manifest.fidelity.compared) && Number.isInteger(real.manifest.fidelity.liveToolsWithFieldList), 'and the fidelity counts are integers, not prose', real.manifest && real.manifest.fidelity)
    ok(real.manifest && Array.isArray(real.manifest.p0), 'and its P0 findings are a list', real.manifest && real.manifest.p0)
  } else {
    ok(false, 'no real audit report at ' + REAL_AUDIT + ' (set VMU_REAL_AUDIT): the on-disk report check is measurement, not an optional skip; run node scripts/sim/audit/all.mjs --out ' + dirname(REAL_AUDIT) + ' first')
  }
}

console.log('--- 6b. R2: ledger proofs are RUN, not read (shape alone let A5 through)')
{
  const root = join(TMP, 'proof-root')
  mkdirSync(join(root, 'tests'), { recursive: true })
  writeFileSync(join(root, 'tests', 'green.mjs'), 'process.exit(0)\n')
  writeFileSync(join(root, 'tests', 'red3.mjs'), 'process.exit(3)\n')
  const row = (id, cmd, expect, severity = 'P0') => ({ id, title: id, severity, status: 'fixed', owner: 'lane', proof: { cmd, expect, note: 'fixture' } })
  const proofRun = (items) => rr.runLedgerProofs(items, { root })
  const green = proofRun([row('green', 'node tests/green.mjs', 0)])
  ok(green.ok === true && green.ran.length === 1 && green.ran[0].actual === 0, 'a proof that exits as recorded passes', green)
  ok(proofRun([row('red-matching', 'node tests/red3.mjs', 3)]).ok === true, 'the exit code is compared with the recorded expectation, not with zero')
  const failed = proofRun([row('red-mismatch', 'node tests/red3.mjs', 0)])
  ok(failed.ok === false && failed.failed.length === 1 && failed.failed[0].actual === 3, 'a proof that does not reproduce its exit code is named with the real code', failed)
  const missing = proofRun([{ id: 'no-proof', title: 'x', severity: 'P1', status: 'fixed', owner: 'lane' }, row('bad-cmd', 'python -c print(1)', 0), row('gone', 'node tests/does-not-exist.mjs', 0)])
  ok(missing.missing.length === 3, 'no proof, a non-node command and a missing file are each named', missing.missing)
  ok(missing.missing.some((m) => m.id === 'bad-cmd' && /node <tests\|scripts>/.test(m.why)), 'the command shape is constrained to node tests|scripts (no shell)', missing.missing)
  const openRows = [{ id: 'open-p1', title: 'x', severity: 'P1', status: 'open', owner: 'lane', condition: 'y' }]
  ok(proofRun(openRows).ok === true, 'open rows need no proof (still open is not a fixed claim)')
  // The real ledger: one cheap row, run for real. The full sweep is a release-time job (lead: re-run proofs on a
  // quiet tree), so this suite pins that the runner WORKS against the repository ledger, not that all 20 pass.
  const realItems = rr.readOpenItems().items || []
  const one = realItems.find((it) => it.id === 'tb2634-deterministic-consult-id')
  if (one && one.proof && one.proof.cmd) {
    const realOne = rr.runLedgerProofs([one], { timeoutMs: 60000 })
    ok(realOne.ok === true && realOne.ran.length === 1, 'one real ledger proof reproduces on this checkout', realOne)
  } else {
    ok(false, 'the real ledger row tb2634-deterministic-consult-id carries proof:{cmd,expect}', one)
  }
}

console.log('--- 8. TB-2662 red team: every vector must be NAMED (refused for the tested reason), none masked or leaked')
{
  // The harness lives outside the repo because it is a probe, not a product (TB-2662, audit-r14). It rebuilds its own
  // fixtures from the CURRENT audit context before every run, so a fixture cannot be tuned to pass a fixed gate.
  const RT = process.env.VMU_REDTEAM_ROOT || 'D:/_tmp/gate-redteam' // PORTABLE-ALLOW: probe harness root; overridable via VMU_REDTEAM_ROOT, and a missing harness FAILS the section below, never skips
  const HARNESS = join(RT, 'run-all.mjs')
  if (!existsSync(HARNESS)) {
    ok(false, 'red-team harness missing at ' + HARNESS + ' (TB-2662 owns it): the gate cannot claim 9/9 named without it')
  } else {
    const started = Date.now()
    const rt = spawnSync(process.execPath, [HARNESS], { cwd: RT, encoding: 'utf8', timeout: 600000, maxBuffer: 64 * 1024 * 1024 })
    const wall = Date.now() - started
    let results = null
    try { results = JSON.parse(readFileSync(join(RT, 'run-all-latest.json'), 'utf8')) } catch { results = null }
    const vectors = results && Array.isArray(results.results) ? results.results : []
    const byStatus = (st) => vectors.filter((v) => v.status === st).map((v) => v.id)
    ok(rt.status === 0, 'run-all exits 0 (exit 0 means all nine are named, not merely refused)', { status: rt.status, wall, tail: String(rt.stdout || '').slice(-300) })
    // Twelve rows for nine vectors: A5 and A6 each carry named sub-cases in the manifest, so the rows outnumber the ids.
    // v2 ruler (audit-r14): one primary judgement per vector, plus a fifth state -- `neutralized` (the gate is right to say
    // READY, because the forgery had to reproduce the ruler numbers, i.e. measure for real). 13 rows for 9 vectors: A5/A6
    // carry sub-cases and A8 is split into A8a (fake numbers) and A8b (real numbers, hand-typed).
    const counts = results && results.counts ? results.counts : {}
    ok(vectors.length === 13, 'the harness ran nine vectors (thirteen rows)', vectors.length)
    ok(counts.named === 11 && counts.neutralized === 2, 'eleven rows NAMED and two NEUTRALIZED (A8b has no yield by design)', counts)
    ok((counts.masked || 0) === 0, 'no row is MASKED (a refusal for an unrelated reason would hide the tested judgement)', counts.masked)
    ok((counts.leaked || 0) === 0, 'no row is LEAKED (READY)', counts.leaked)
    ok((counts.half || 0) === 0 && (counts.error || 0) === 0, 'no row is HALF or errored', counts)
    ok(byStatus('masked').length === 0, 'no vector is MASKED (refused for an unrelated reason, so the attack was never tested)')
    ok(byStatus('leaked').length === 0, 'no vector is LEAKED (READY)')
    ok(byStatus('half').length === 0, 'no vector is HALF (refused, judgment fired, required detail missing)')
    console.log('  (red team ' + wall + ' ms)')
  }
}

rmSync(TMP, { recursive: true, force: true })
console.log('')
console.log('=== release ready gate: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exitCode = 1
