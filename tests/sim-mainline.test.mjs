// tests/sim-mainline.test.mjs — the fidelity simulator's own regression suite.
//
// WHY: `scripts/sim/` is the instrument the audits read. An instrument that silently stops
// exercising anything is worse than no instrument: the corpus still looks green. So the mainline
// scenario is pinned here, in process, on four facts that all failed at least once in a real run:
//
//   ① a legal main line completes with ZERO mechanism refusals (environmental ones are named);
//   ② the office acting in a seat's name is DISCLOSED (memberActed), not silent (RUN 225-C);
//   ③ the prompt that is measured is the one the turn loop would really assemble — bindings and
//      settings included, keyed by SLOT (chair/member/temp), not by source role name. The budget
//      gate passed at 27 973 while the real chair prompt was 32 057 because it measured
//      `role:'researcher'` (RUN 226). This suite refuses to let that regress into the simulator;
//   ④ the blueprint's md file is the truth: after the scenario the file exists and the row's
//      mdFingerprint matches what the file hashes to (RUN 225-A).
//
// Run: node tests/sim-mainline.test.mjs

import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = 'D:/wd/vibemath开发/Vibe-Mathematics'
const TMP = 'D:/_tmp/sim-tests'

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
    console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 600)))
  }
}

const HARNESS = (await import(pathToFileURL(join(REPO, 'scripts/sim/harness.mjs')).href))
const SCENARIO = (await import(pathToFileURL(join(REPO, 'scripts/sim/scenarios/mainline.mjs')).href))

// ---- ① the scenario runs at all, and refuses nothing for a MECHANISM reason ----------------
mkdirSync(TMP, { recursive: true })
const root = mkdtempSync(join(TMP, 'ws-'))
const h = await HARNESS.boot({ root })
const result = await SCENARIO.mainline(h, { log: () => {} })

ok(Array.isArray(result.steps) && result.steps.length >= 20, 'a main line has at least twenty steps', result.steps && result.steps.length)
ok(Array.isArray(result.receipts) && result.receipts.length >= 20, 'every step made a call', result.receipts && result.receipts.length)

const ENVIRONMENTAL = ['VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING', 'VMU_ENGINE_UNAVAILABLE']
const refused = result.receipts.filter((r) => r.receipt && r.receipt.ok === false)
const mechanical = refused.filter((r) => !ENVIRONMENTAL.includes(r.receipt.code))
ok(mechanical.length === 0, 'no step was refused for a mechanism reason', mechanical.map((r) => ({ tool: r.tool, code: r.receipt.code })))
// ★ A skip-list that may be EMPTY makes `.every()` a tautology (RULE E shape A): the mainline scenario declares
// exactly one environmental refusal, so the COUNT is pinned and the shape is checked over a non-empty set.
ok(refused.length > 0 && refused.every((r) => ENVIRONMENTAL.includes(r.receipt.code)),
  'every refusal that did happen is an environment fact, not a bug (and there is at least one, so this is not vacuous)',
  refused.map((r) => r.receipt.code))

// ---- ② substitution is disclosed -----------------------------------------------------------
// Only calls that ANSWERED can carry the disclosure: a refused call refused before anything was written.
const naming = result.receipts.filter((r) => r.receipt && r.receipt.ok !== false && r.args && typeof r.args.member === 'string' && r.args.member !== '')
ok(naming.length > 0, 'the scenario does name members (so the disclosure has something to say)', naming.length)
const undisclosed = naming.filter((r) => !r.receipt || typeof r.receipt.memberActed !== 'boolean')
ok(undisclosed.length === 0, 'every receipt that names a seat says whether the seat acted or the office did', undisclosed.map((r) => ({ tool: r.tool, keys: Object.keys(r.receipt || {}).slice(0, 12) })))
const asSeat = naming.filter((r) => r.receipt && r.receipt.memberActed === true)
ok(asSeat.length > 0, 'a seat acting in its own turn reads memberActed:true', asSeat.length)

// ---- ③ the measured prompt is the real one, keyed by SLOT ----------------------------------
const prompts = h.prompts || []
ok(prompts.length >= 3, 'at least one prompt per seat was assembled', prompts.length)
const bySeat = {}
for (const p of prompts) bySeat[p.seat] = Math.max(bySeat[p.seat] || 0, p.chars || (p.text || '').length)
ok(typeof bySeat.chair === 'number' && bySeat.chair > 20000, 'the chair prompt is measured in the tens of thousands (slot-keyed, not role-keyed)', bySeat)
ok(typeof bySeat.member === 'number' && bySeat.member > 15000, 'the member prompt is measured too', bySeat)
// T99's hard cap and the RUN 226 chair allowance: the simulator must not report a chair prompt
// that is short enough to pass a 30 000 gate, because the real one is not.
ok(typeof bySeat.chair === 'number' && bySeat.chair > 30000, 'the chair prompt is honestly above the T99 cap (a shorter number would be a lie)', bySeat.chair)
ok(typeof bySeat.chair === 'number' && bySeat.chair <= 36000, 'and still inside the chair allowance the budget gate enforces', bySeat.chair)

// ---- ④ the blueprint md is the truth, the row is its index --------------------------------
const mdPath = result.tree.find((f) => /Shared[\\/]Protocol\.md$/.test(f.path))
ok(Boolean(mdPath), 'the blueprint was written to a markdown file', result.tree.map((f) => f.path).filter((p) => /\.md$/.test(p)))
if (mdPath) {
  const body = readFileSync(join(root, mdPath.path), 'utf8')
  ok(/^# 蓝图｜/m.test(body), 'the md file starts with a blueprint header a human can read', body.slice(0, 120))
  ok(/^## 正文$/m.test(body), 'the md file carries a readable body section', body.slice(0, 400))
  const digest = 'sha256:' + createHash('sha256').update(body).digest('hex')
  const read = result.highlights && result.highlights.blueprintRead
  ok(Boolean(read && read.mdFingerprint), 'the read receipt carries the file fingerprint', read && Object.keys(read))
  ok(read && read.mdFingerprint === digest, 'the row points at exactly the file on disk (no drift between index and truth)', { receipt: read && read.mdFingerprint, disk: digest })
  // The scenario reads the row it PROPOSED, and after adoption that draft row is no longer the file's row: the file
  // describes the CURRENT row. So a truthful reader says changed:true and EXPLAINS it (status moved) - an unchanged
  // answer here would be a lie. Reading the same path (which resolves to the current row) must then say unchanged.
  ok(read && read.mdChangedSinceIndex === true, 'a superseded draft row does not claim to be the file (the file is the current row now)', read && read.mdChangedSinceIndex)
  ok(read && typeof read.mdMeans === 'string' && read.mdMeans.length > 0, 'and it says WHY it differs instead of just flagging a drift', read && read.mdMeans)
  // `read` addresses a ROW (that is what the face declares); the path answered by a row is the file it indexes.
  const adoptedId = result.highlights && result.highlights.adopted && (result.highlights.adopted.id || (result.highlights.adopted.adopted && result.highlights.adopted.adopted.id))
  ok(typeof adoptedId === 'string' && adoptedId !== '', 'the adopted blueprint row has an id to read', adoptedId)
  const currentRead = await h.call('vibe_v5_blueprint', { action: 'read', id: adoptedId })
  ok(currentRead && currentRead.ok !== false, 'the CURRENT row of that path is readable', currentRead && Object.keys(currentRead))
  ok(currentRead && currentRead.mdChangedSinceIndex === false, 'a file nobody edited reads as unchanged on the row that owns it', currentRead && currentRead.mdChangedSinceIndex)
  ok(currentRead && currentRead.mdFingerprint === digest, 'and the current row points at the same file', currentRead && currentRead.mdFingerprint)
}

console.log('\n=== sim mainline: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('failures: ' + JSON.stringify(failures))
  process.exitCode = 1
}
