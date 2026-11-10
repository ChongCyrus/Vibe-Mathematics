// tests/sim-mainline.test.mjs — the fidelity simulator's own regression suite.
//
// WHY: `scripts/sim/` is the instrument the audits read. An instrument that silently stops
// exercising anything is worse than no instrument: the corpus still looks green. So the mainline
// scenario is pinned here, in process, on four facts that all failed at least once in a real run:
//
//   ① a legal main line completes with no UNEXPLAINED mechanism refusals: every refusal is either an
//      environment fact or declared by the scenario's own seq-pinned ledger (TB-2650 made the fs-first
//      reindex refusal a designed policy fact, so "zero mechanism refusals" would be the wrong pin);
//   ② the office acting in a seat's name is DISCLOSED (memberActed), not silent (RUN 225-C);
//   ③ the prompt that is measured is the one the turn loop would really assemble — bindings and
//      settings included, keyed by SLOT (chair/member/temp), not by source role name. The budget
//      gate passed at 27 973 while the real chair prompt was 32 057 because it measured
//      `role:'researcher'` (RUN 226). This suite refuses to let that regress into the simulator;
//   ④ the blueprint's md file is the truth: after the scenario the file exists and the row's
//      mdFingerprint matches what the file hashes to (RUN 225-A);
//   ⑤ fs-first (TB-2613 / RUN 255, pinned by TB-2625): the draft md is the MEMBER's own file. The
//      scenario must write it for real, propose with that mdPath, continue the SAME draft row, and
//      adopt it — and the canonical file's body must be that member file, byte for byte. The chain
//      is checked by reading the RECEIPTS back, not by trusting the scenario's own summary;
//   ⑥ the scenario's contract self-check can go RED BY NAME. A drift that removes `mdPath` must be
//      reported as SIM_BLUEPRINT_FS_FIRST_CONTRACT (and turn `run.mjs` non-zero), not walk on into
//      two VMU_INVALID_ARGUMENT calls that look like a product bug — that was the failure mode
//      this suite existed through for two days before TB-2625.
//
// Run: node tests/sim-mainline.test.mjs

import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO } from './_lib/repo-root.mjs'

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
// ★ TB-2650 made `vibe_vmu_records {action:'reindex'}` REFUSE when the library holds a member-written plain md (the
// fs-first contract): this scenario fs-writes its draft and then asks for a reindex on purpose, so that refusal is a
// DESIGNED policy fact, not a mechanism bug. It is declared in the scenario's own ledger by seq — the test consumes
// that ledger instead of growing a hardcoded skip-list, so an undeclared refusal still fails AND a prediction that
// never fires fails too (the same "quota, not excuse" rule run.mjs applies to corpora).
const declared = Array.isArray(result.expectedRefusals) ? result.expectedRefusals : []
const declaredAt = (r) => declared.find((e) => Number(e.seq) === Number(r.seq) && e.code === r.receipt.code && (!e.tool || e.tool === r.tool))
const explained = (r) => ENVIRONMENTAL.includes(r.receipt.code) || declaredAt(r) !== undefined
const unexplained = refused.filter((r) => !explained(r))
ok(unexplained.length === 0, 'no mechanism refusal is unexplained: every refusal is an environment fact or declared at its seq by the scenario', unexplained.map((r) => ({ seq: r.seq, tool: r.tool, code: r.receipt.code })))
// ★ A skip-list that may be EMPTY makes `.every()` a tautology (RULE E shape A): the refusal COUNT is pinned instead.
ok(refused.length > 0 && refused.every(explained),
  'every refusal that did happen is either an environment fact or a declared policy fact (and there is at least one, so this is not vacuous)',
  refused.map((r) => ({ seq: r.seq, code: r.receipt.code })))
const declaredMisses = declared.filter((e) => !refused.some((r) => Number(r.seq) === Number(e.seq) && r.receipt.code === e.code))
ok(declaredMisses.length === 0, 'every refusal the scenario declared by seq actually fired (declared-but-never-hit is zero)', declaredMisses)
const policyRefusals = refused.filter((r) => !ENVIRONMENTAL.includes(r.receipt.code))
ok(policyRefusals.length > 0 && policyRefusals.every((r) => declaredAt(r) !== undefined),
  'the fs-first reindex refusal is present and declared by seq: the policy refusal is evidence, not an excuse',
  policyRefusals.map((r) => ({ seq: r.seq, code: r.receipt.code })))

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
// T99's hard cap and the RUN 226 chair allowance were used here as an honesty probe ("a shorter
// number would be a lie"). RUN 247 changed the premise honestly: the chair prompt now really IS
// below T99 (26 944 normal / 29 891 meeting) because the tool catalogue and parameter restatement
// were deleted. The probe keeps its point - the measured number must be the real assembly, not a
// stub - by bounding it on both sides: it must be a real multi-thousand-character assembly and
// still inside the allowance, which is what the budget gate enforces on its own ruler.
ok(typeof bySeat.chair === 'number' && bySeat.chair > 25000, 'the chair prompt is measured at its real size, not a stub (RUN 247 brought it under T99, so the old "above 30 000" framing is gone)', bySeat.chair)
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

  // ---- ⑤ fs-first (TB-2625): the draft is the MEMBER's file, the row is its index ----------
  // Read back from the RECEIPTS, not from the scenario's summary: the summary would only prove the scenario believes it
  // called these four faces. What must be true is that the faces answered propose(mdPath) -> propose(draft + mdPath) ->
  // adopt -> read, and that the draft row indexes the file the scenario wrote with the member's own fs tool.
  const bp = result.receipts.filter((r) => r.tool === 'vibe_v5_blueprint')
  const p1 = bp.find((r) => r.args && r.args.action === 'propose' && !r.args.draft)
  const p2 = bp.find((r) => r.args && r.args.action === 'propose' && r.args.draft)
  const ad = bp.find((r) => r.args && r.args.action === 'adopt')
  const rd = bp.find((r) => r.args && r.args.action === 'read')
  ok(Boolean(p1 && p1.args.mdPath), 'the first propose names the member draft file (fs-first: no mdPath, no row)', p1 && { mdPath: p1.args.mdPath, id: p1.receipt.id })
  ok(Boolean(p1 && p1.receipt.ok !== false && typeof p1.receipt.id === 'string' && p1.receipt.id !== ''),
    'and the face FILED a draft row (the id comes back FROM the face, the scenario never invents it)',
    p1 && { id: p1.receipt.id, filed: p1.receipt.filed, draftMdMissing: p1.receipt.draftMdMissing })
  ok(Boolean(p2 && p1 && p2.args.draft === p1.receipt.id), 'the codesign continues the SAME draft row instead of opening a second one', p2 && { draft: p2.args.draft, first: p1 && p1.receipt.id })
  ok(Boolean(p2 && p1 && p2.args.mdPath === p1.args.mdPath), 'and rewrites the same member file, not a second copy', p2 && { path: p2.args.mdPath })
  ok(Boolean(ad && ad.receipt.ok !== false && p1 && ad.args.draft === p1.receipt.id), 'adoption names that same draft row', ad && { draft: ad.args.draft })
  ok(Boolean(rd && rd.receipt.ok !== false), 'and the row is readable afterwards', rd && rd.receipt.status)
  // The file the scenario wrote IS the file the row indexes: the receipt's fingerprint is the sha256 of the bytes on disk.
  // This is the assertion that fails when a contract change makes the kernel index its own copy instead of the member's.
  const draftFile = join(root, 'VibeMath', p1.args.mdPath)
  const draftBody = readFileSync(draftFile, 'utf8')
  const draftDigest = 'sha256:' + createHash('sha256').update(draftBody).digest('hex')
  ok(/^# 公共蓝图/m.test(draftBody) && /^## 共同设计补充｜r-1$/m.test(draftBody),
    'the member file holds both the member text and the chair continuation', draftBody.slice(0, 200))
  ok(Boolean(p2 && p2.receipt.mdFingerprint === draftDigest), 'the draft ROW indexes exactly that member file (the file is the truth)',
    { receipt: p2 && p2.receipt.mdFingerprint, disk: draftDigest })
  ok(Boolean(p1 && p1.receipt.textSource === 'md'), 'the draft text came from the FILE, not from the argument (textSource:md)',
    p1 && { textSource: p1.receipt.textSource, textArgumentDropped: p1.receipt.textArgumentDropped })
  ok(Boolean(p1 && p1.receipt.mdOwner && p1.receipt.mdOwner.writtenBy === 'member-file'),
    'the draft receipt says WHO wrote the file (member-file), not the kernel', p1 && p1.receipt.mdOwner && p1.receipt.mdOwner.writtenBy)
  ok(Boolean(ad && ad.receipt.mdOwner && ad.receipt.mdOwner.writtenBy === 'kernel-materialized'),
    'adoption is kernel-materialized: only the canonical file is written by the kernel', ad && ad.receipt.mdOwner && ad.receipt.mdOwner.writtenBy)
  // ...and the canonical file's BODY is the member draft's body (the row drops the trailing newline), which is what
  // "the kernel adopted the member's document" means: it copied the FILE, not an argument the caller typed.
  const canonicalBody = String(body.split('## 正文' + String.fromCharCode(10))[1] || '')
  ok(canonicalBody.trim() !== '' && canonicalBody.replace(/\s+$/, '') === draftBody.replace(/\s+$/, ''),
    'the adopted file body IS the member draft file, byte for byte (the chain fed the canonical md from the file)',
    { canonical: canonicalBody.slice(0, 160), draft: draftBody.slice(0, 160) })
}

// ---- ⑥ the scenario's own contract check can go RED BY NAME (TB-2625) ----------------------
// A self-check that never fired is decoration. This replays the scenario on a second workspace with `mdPath` stripped
// from every blueprint propose — exactly the drift that kept this gate red for days — and requires the run to REPORT
// SIM_BLUEPRINT_FS_FIRST_CONTRACT instead of walking on into two VMU_INVALID_ARGUMENT calls that read like a product bug.
const root2 = mkdtempSync(join(TMP, 'ws-drift-'))
const h2 = await HARNESS.boot({ root: root2 })
const call2 = h2.call
h2.call = async (name, args = {}, opts) => {
  if (name === 'vibe_v5_blueprint' && args && args.action === 'propose' && args.mdPath) {
    const stripped = Object.assign({}, args)
    delete stripped.mdPath
    return call2(name, stripped, opts)
  }
  return call2(name, args, opts)
}
const drifted = await SCENARIO.mainline(h2, { log: () => {} })
const driftCodes = (drifted.failures || []).map((f) => f.code)
ok(driftCodes.includes('SIM_BLUEPRINT_FS_FIRST_CONTRACT'), 'removing mdPath turns the contract check RED by name, it does not walk on', driftCodes)
ok(Array.isArray(result.failures) && result.failures.length === 0, 'the real run passed its own contract checks', result.failures)
const chainSteps = Object.values((result.contract && result.contract.chain) || {})
ok(Boolean(result.contract && result.contract.fsFirst === true && chainSteps.length >= 4 && chainSteps.every(Boolean)),
  'the corpus records the four-step chain as filed', result.contract)
try { rmSync(root2, { recursive: true, force: true }) } catch { /* a leftover temp dir is not a test failure */ }

console.log('\n=== sim mainline: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('failures: ' + JSON.stringify(failures))
  process.exitCode = 1
}
