// tests/sim-fidelity-baseline.test.mjs — TB-2653: a fidelity gap may be OWNED, but never merely forgotten.
//
// `docs/acceptance/fidelity-branch-baseline.json` exists because the nested fidelity measurement (§5 of
// scripts/sim/audit/all.mjs) reports far more paths than any single scenario walks. A baseline row says three things
// that a declaration cannot: WHICH class of debt it is, WHO closes it, and WHAT WOULD MAKE THE ROW WRONG. This suite
// pins those three, the file shape, and the one count that may only go down.
//
// What is pinned:
//   §1  the file and the envelope: schema + the four class definitions, so a class cannot be invented or silently
//       redefined to absorb a new row
//   §2  every row is auditable: class named, owner is a taskbook, why >= 24 chars, wouldBeWrongIf given, evidence is
//       a real-fields line, and wildcards only ever replace ONE segment (never a prefix)
//   §3  the declared class counts match the rows (a generated stat that lies is worse than no stat)
//   §4  `pending-fix` is pinned EXACTLY: adding one is a deliberate break that must be made in the file and here
//       together, and the pin can only be tightened, never loosened to make a red run green
//   §5  the JSON is loadable by the audit path (absolute path under docs/acceptance) and every row classifies
//       somewhere real: host-surface rows name host adapter keys, pending-fix names the gate key
//
// Runs offline; reads the repository only.

import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireFile } from './_lib/require-file.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const FILE = join(REPO, 'docs', 'acceptance', 'fidelity-branch-baseline.json')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) {
    passed += 1
    console.log('  ok   ' + label)
  } else {
    failed += 1
    console.log('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  }
}

if (!existsSync(FILE)) {
  console.log('  FAIL baseline file missing: ' + FILE)
  console.log('(sim-fidelity-baseline) 0 passed, 1 failed')
  process.exit(1)
}
const raw = readFileSync(FILE, 'utf8')
let doc = null
try {
  doc = JSON.parse(raw)
} catch (e) {
  console.log('  FAIL baseline file is not JSON: ' + e.message)
}
ok(doc !== null && typeof doc === 'object', 'baseline file parses as a JSON object')
if (!doc) {
  console.log('(sim-fidelity-baseline) 0 passed, ' + failed + ' failed')
  process.exit(1)
}

// §1 envelope
ok(doc.schemaVersion === 1, 'schemaVersion is 1', doc.schemaVersion)
const classes = doc.classes !== null && typeof doc.classes === 'object' ? doc.classes : {}
const WANT = ['call-shape', 'host-surface', 'stale-corpus', 'pending-fix']
// RULE E: WANT is a literal four-element list, so `.every()` over it is never vacuous in FACT — but the scanner can
// only see a guard, so each assertion states the non-empty precondition it relies on (`WANT.length > 0`). That keeps
// the guard visible instead of teaching the scanner to trust an identifier's initializer.
ok(WANT.length > 0 && WANT.every((c) => typeof classes[c] === 'string' && classes[c].trim().length >= 40), 'all four classes have a real definition', Object.keys(classes))
ok(WANT.length > 0 && WANT.every((c) => Object.keys(classes).includes(c)), 'no class is missing from the definitions', Object.keys(classes))
ok(typeof doc.wildcard === 'string' && doc.wildcard.includes('*') && doc.wildcard.length >= 20, 'the wildcard rule is documented, not folklore', doc.wildcard)
const items = Array.isArray(doc.items) ? doc.items : []
ok(Array.isArray(doc.items), 'items is an array')
ok(items.length > 0, 'the baseline actually lists rows (an empty baseline would make the three-way check vacuous)', { length: items.length })

// §2 every row is auditable
const bad = []
for (const it of items) {
  const where = String((it && it.tool) || '?') + '.' + String((it && it.field) || '?')
  if (!it || typeof it !== 'object') { bad.push(where + ': not an object'); continue }
  if (!WANT.includes(it.class)) bad.push(where + ': unknown class ' + String(it.class))
  if (!/^TB-\d{4}$/.test(String(it.owner || ''))) bad.push(where + ': owner is not a taskbook (' + String(it.owner) + ')')
  if (String(it.why || '').trim().length < 24) bad.push(where + ': why too short')
  if (!String(it.wouldBeWrongIf || '').trim()) bad.push(where + ': wouldBeWrongIf missing')
  if (!/^real-fields\.jsonl:\d+$/.test(String(it.evidence || ''))) bad.push(where + ': evidence is not a real-fields line (' + String(it.evidence) + ')')
  if (typeof it.tool !== 'string' || !it.tool.trim()) bad.push(where + ': tool missing')
  if (typeof it.field !== 'string' || !it.field.trim()) bad.push(where + ': field missing')
}
ok(bad.length === 0, 'every row names class, owner, why, wouldBeWrongIf and evidence', bad.slice(0, 8))

const wild = items.filter((it) => String(it.field).includes('*'))
const wildBad = wild.filter((it) => String(it.field).split('.').some((seg) => seg !== '*' && seg.includes('*')))
ok(wildBad.length === 0, 'a wildcard replaces a whole segment, never part of one', wildBad.slice(0, 5))
ok(wild.length > 0, 'identifier-shaped paths use the documented wildcard (otherwise the ledger churns on every new id)', { wildcards: wild.length })

// §3 declared counts == rows
const measured = {}
for (const it of items) measured[it.class] = (measured[it.class] || 0) + 1
const declaredCounts = doc.counts !== null && typeof doc.counts === 'object' ? doc.counts : {}
ok(WANT.length > 0 && WANT.every((c) => (measured[c] || 0) === (declaredCounts[c] || 0)), 'declared class counts match the rows', { measured, declaredCounts })
ok(Object.keys(declaredCounts).every((c) => WANT.includes(c)), 'no undeclared class count is carried', Object.keys(declaredCounts))

// §4 the one pinned number: adding a pending-fix row must be a deliberate two-file edit.
const PENDING_FIX_PINNED = 1
const pendingFix = items.filter((it) => it.class === 'pending-fix')
ok(pendingFix.length === PENDING_FIX_PINNED, 'pending-fix row count is at its pinned value (may only go DOWN, never up to silence a gap)', { pinned: PENDING_FIX_PINNED, measured: pendingFix.length })
ok(pendingFix.length > 0 && pendingFix.every((it) => it.tool === 'vibe_v5_verified_promote' && it.field === 'p1Routes'), 'the pinned pending-fix row is the p=1 gate key it claims to be', pendingFix.map((it) => it.tool + '.' + it.field))

// §5 rows classify somewhere real
const hostRows = items.filter((it) => it.class === 'host-surface')
const HOST_KEYS = ['actedForMember', 'callerIsSeat', 'callerIsSeatMeans', 'callerMember', 'memberActed', 'memberActedMeans', 'ranInOwnTurn', 'ranInOwnTurnMeans', 'enforced', 'enforcedScope', 'wouldEvaluate', 'askedAction', 'registry', 'receiptMeta', 'deniedCount', 'seatFilter']
ok(hostRows.length > 0, 'host-surface class is used where host-only keys live', { rows: hostRows.length })
ok(hostRows.every((it) => String(it.field).split('.').some((seg) => HOST_KEYS.includes(seg))), 'every host-surface row names a host-adapter key, not an arbitrary field', hostRows.filter((it) => !String(it.field).split('.').some((seg) => HOST_KEYS.includes(seg))).slice(0, 5).map((it) => it.field))
const staleRows = items.filter((it) => it.class === 'stale-corpus')
ok(staleRows.length === 0, 'no stale-corpus row is claimed while the rich corpus carries no BUILD stamp (claiming it would be unprovable)', { rows: staleRows.length })

// §6 the audit reads this exact path; a baseline the audit never loads is decoration.
const allSrc = readFileSync(join(REPO, 'scripts', 'sim', 'audit', 'all.mjs'), 'utf8')
ok(allSrc.includes("'fidelity-branch-baseline.json'"), 'scripts/sim/audit/all.mjs loads this baseline file', null)
const measureSrc = readFileSync(join(REPO, 'scripts', 'sim', 'audit', 'fidelity-measure.mjs'), 'utf8')
ok(allSrc.includes('staleBaseline') && measureSrc.includes('baselineRowFor'), 'the audit implements the three-way check (new gap fails, stale claim fails, wildcard matching)', null)
ok(measureSrc.includes('RICH_REAL') && measureSrc.includes('real-fields.jsonl') && !allSrc.includes("'real-fieldset.json'") && !allSrc.includes('"real-fieldset.json"'), 'the audit measures against the rich live corpus (one ruler; the shallow file is mentioned only as NOT a substitute)', null)


// §7 R8: the audit's EXIT CODE must reflect the p0 it printed. A report that says FAIL while the process exits 0 is
// how a red audit gets past a shell && chain. Proven with a real run: a baseline row that can never be consumed is
// injected through --baseline, the audit runs (one scenario, cheap), and the exit code is compared with p0 itself.
{
  const TMP = join(tmpdir(), 'sim-tests-fidelity-' + process.pid)
  rmSync(TMP, { recursive: true, force: true })
  mkdirSync(TMP, { recursive: true })
  const bogus = JSON.parse(readFileSync(FILE, 'utf8'))
  bogus.items = [...bogus.items, { class: 'call-shape', tool: 'vibe_v5_wait', field: 'no.such.path.anywhere', owner: 'TB-2643', why: 'a row that no receipt can ever consume, injected to prove the exit code follows p0', wouldBeWrongIf: 'this never appears in rich receipts, so it is stale by construction', evidence: 'real-fields.jsonl:1' }]
  bogus.counts = { ...(bogus.counts || {}), 'call-shape': (bogus.counts && bogus.counts['call-shape'] ? bogus.counts['call-shape'] : 0) + 1 }
  const bogusPath = join(TMP, 'baseline-bogus.json')
  writeFileSync(bogusPath, JSON.stringify(bogus, null, 2))
  const run = spawnSync(process.execPath, [join(REPO, 'scripts', 'sim', 'audit', 'all.mjs'), '--only', 'mainline', '--out', join(TMP, 'out'), '--baseline', bogusPath], { cwd: REPO, encoding: 'utf8', timeout: 180000 })
  const outFile = join(TMP, 'out', 'AUDIT.md')
  ok(run.status === 1, 'an audit whose report carries findings exits 1 (p0 non-empty => non-zero)', { status: run.status, stdoutTail: String(run.stdout || '').slice(-200) })
  // The report this run just wrote MUST exist: a missing file is a named refusal, not an empty string that every
  // `block === null` assertion below would then fail with a vague message. (audit-no-silent-reads.test.mjs flags the
  // old `existsSync(...) ? readFileSync(...) : ''` shape by name.)
  const text = requireFile(outFile, 'the AUDIT.md the audit run just wrote when it exited 1 with findings')
  const m = /```json audit-report\r?\n([\s\S]*?)\r?\n```/.exec(text)
  let block = null
  try { block = m ? JSON.parse(m[1]) : null } catch { block = null }
  ok(block !== null && Array.isArray(block.p0) && block.p0.length > 0, 'the report block itself carries the p0 list it exited for', block && block.p0 && block.p0.length)
  ok(block !== null && block.checks && block.checks.failures === block.p0.length, 'p0 is a projection of the same failures the exit code counts (one number, not two)', block && block.checks)
  ok(block !== null && block.p0.some((p) => String(p.title).includes('no.such.path.anywhere')), 'the injected row is the finding that made the run red (the red was caused, not assumed)', block && block.p0.map((p) => p.title))
  const src = readFileSync(join(REPO, 'scripts', 'sim', 'audit', 'all.mjs'), 'utf8')
  ok(src.includes("process.exitCode = failures.length === 0 ? 0 : 1"), 'the exit code is derived from the failure list, not set by hand elsewhere', null)
  rmSync(TMP, { recursive: true, force: true })
}

console.log('(sim-fidelity-baseline) ' + passed + ' passed, ' + failed + ' failed')
if (failed > 0) process.exitCode = 1
