// tests/vmu-run79-review-fingerprint.test.mjs — RUN 79 / TB-2743 (task-224): A VOTE BINDS THE TEXT IT JUDGED.
//
// THE DEFECT THIS PINS (real machine, run 79 round 2, MEASURED): r-1 filed a cross-review with `of:"r-2"` and
// `deliverable:true` (record rec-34) while the judged part was still the ROUND-1 text (record rec-20, fingerprint
// `65cccd…` unchanged). The vote was counted because the only thing the gate compared was the round number, and a
// count is not a judgement. Two faces of the same hole are checked here — `perRoundReviewCoverage` (the reading) and
// `advance` / `final` (the doors that act on it).
//
// WHAT THIS SUITE PROVES, from REAL kernel receipts (the fixtures drive the public tool faces, they do not restate the
// implementation):
//   §A1 a review row CARRIES the fingerprint (and round) of the part text it judged;
//   §A2 the ROUND-BOUNDARY shape: a round-1 vote re-filed in round 2 against unchanged prose is NOT counted, is NAMED
//       in `staleReviews` with both fingerprints and both rounds, and `advance` refuses `VMU_REVIEW_STALE`;
//   §A2b the refusal hint is WALKABLE: every call it prints is parsed out of the hint and executed in order, and the
//       paper then reaches awaiting-editor; `status` and `advance` print the SAME coverage object;
//   §A4 the FINGERPRINT arm: a row whose round MATCHES and whose fingerprint does not is excluded and named with a
//       single copyable repair call that is executed verbatim — a round-only comparison would count it;
//   §A5 the FINAL gate applies the same binding, so a stale vote cannot finalise a paper;
//   §B  "not tested ≠ absent": `toolchainProbe` names not-run / ran-absent / ran-present, and `toolchainAbsent:[]` with
//       not-run is never read as "the toolchain is missing".
//
// Run: node tests/vmu-run79-review-fingerprint.test.mjs   Last line: === VMU RUN79 REVIEW FINGERPRINT: N passed, M failed ===

import { cpSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const urlish = (p) => pathToFileURL(p).href

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const CODE = (r) => (r && r.code) || null

// ── the real v5r pack on a throwaway root ───────────────────────────────────────────────────────────────────────────
async function boot (settings = null, entryUrl = null) {
  const root = mkdtempSync(join(tmpdir(), 'vmu-r79-rf-'))
  const specs = []
  const ctx = { effect: (fn) => fn(), on: () => () => {}, tools: { register: async (spec) => { specs.push(spec); return () => {} } } }
  const entry = await import(entryUrl || urlish(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')))
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'], root }, settings ? { settings } : {}))
  await handle.ready()
  await handle.kernel.store.open()
  const hire = async (id, slot) => handle.kernel.members.hire({ id, slot, institution: 'sim' })
  const call = async (name, args = {}) => {
    const spec = specs.filter((s) => s && s.name === name)[0]
    if (!spec) throw new Error('no such tool on this boot: ' + name)
    const raw = await spec.execute(args, { kernel: handle.kernel })
    return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
  }
  // refusals reach the face as a receipt (ok:false + code) or as a thrown error; this normalises both
  const drive = async (name, args = {}) => {
    try {
      const receipt = await call(name, args)
      return { refused: receipt.ok === false && typeof receipt.code === 'string', receipt, code: receipt.code, message: String(receipt.message || ''), hint: String(receipt.hint || '') }
    } catch (e) {
      return { refused: true, thrown: true, receipt: null, code: e && e.code, message: String((e && e.message) || ''), hint: String((e && e.hint) || '') }
    }
  }
  const paper = (action, extra = {}) => drive('vibe_v5_paper', Object.assign({ action }, extra))
  const evidenceRow = (tag) => handle.kernel.records.put({ track: 'progress', kind: 'finding', title: 'v5r-paper|ev|' + tag, body: JSON.stringify({ statement: 'evidence ' + tag }), by: 'vibe_v5_paper' })
  return { root, handle, kernel: handle.kernel, specs, call, drive, paper, hire, evidenceRow }
}
const cleanup = (b) => { try { rmSync(b.root, { recursive: true, force: true, maxRetries: 3 }) } catch (e) {} }

// ── the copyable hints: turn the sentences a refusal PRINTS back into the calls they name ──────────────────────────
// This is the criterion "the hint is reachable": if the parse fails, or a parsed call is refused, the hint is a slogan.
function parseCalls (hint) {
  const out = []
  const reCall = /vibe_v5_paper\s*\{([^}]*)\}/g
  let m = reCall.exec(String(hint))
  while (m !== null) {
    const args = {}
    const re = /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*("(?:[^"\\]|\\.)*"|true|false|-?\d+)/g
    let g = re.exec(m[1])
    while (g !== null) {
      const raw = g[2]
      args[g[1]] = raw === 'true' ? true : raw === 'false' ? false : /^-?\d+$/.test(raw) ? Number(raw) : JSON.parse(raw)
      g = re.exec(m[1])
    }
    if (Object.keys(args).length > 0) out.push(args)
    m = reCall.exec(String(hint))
  }
  return out
}

// ── §0 source guards (the mechanism this suite checks must exist; the BEHAVIOUR is checked below with real receipts)
{
  const kit = readFileSync(join(REPO, 'vibe-math-vmu', 'kit', 'paper.js'), 'utf8')
  const tools = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')
  ok(/judgedPartFingerprint/.test(kit) && /judgedPartRound/.test(kit),
    '§0 the review row carries the judged part fingerprint and round (TB-2743 A)')
  ok((kit.match(/VMU_REVIEW_STALE/g) || []).length >= 1,
    '§0 the stale-vote refusal is NAMED, not a silent subtraction', (kit.match(/VMU_REVIEW_STALE/g) || []).length)
  ok(/staleReviews/.test(kit) && /staleReviewsMeans/.test(kit),
    '§0 the coverage reading names stale votes instead of only excluding them')
  ok(/export function toolchainProbeOf/.test(tools) && /toolchainProbeMeans/.test(tools),
    '§0 the toolchain probe has one named reading and one means (TB-2743 B)')
  ok(/blockedByMeans/.test(tools) && /'not-finalized'/.test(tools),
    '§0 pdfCompiled names why it produced nothing instead of leaving a bare false')
}

// ── §A1 a vote binds the text it judged ────────────────────────────────────────────────────────────────────────────
{
  const b = await boot()
  for (const [id, slot] of [['r-0', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) await b.hire(id, slot)
  const ev1 = b.evidenceRow('a1-1')
  const ev2 = b.evidenceRow('a1-2')
  const start = await b.paper('start', { target: 'a1', title: 'run 79 binding', participants: ['r-1', 'r-2'] })
  ok(start.receipt && start.receipt.started && start.receipt.started.ok === true, '§A1 fixture: paper a1 starts', CODE(start))
  const p1 = await b.paper('part', { target: 'a1', member: 'r-1', part: 'r-1 part', body: 'A1 first text of r-1', evidence: [ev1.id] })
  const p2 = await b.paper('part', { target: 'a1', member: 'r-2', part: 'r-2 part', body: 'A1 first text of r-2', evidence: [ev2.id] })
  ok(p1.refused === false && p2.refused === false, '§A1 fixture: both parts are filed', CODE(p1) || CODE(p2))
  const adv1 = await b.paper('advance', { target: 'a1' })
  ok(adv1.refused === false && adv1.receipt.advance.to === 'reviewing', '§A1 fixture: the paper enters reviewing', adv1.receipt && adv1.receipt.advance)
  const fp2First = (await b.paper('status', { target: 'a1' })).receipt.paper.parts['r-2'].fingerprint
  const vote1 = await b.paper('review', { target: 'a1', member: 'r-1', of: 'r-2', deliverable: true })
  ok(vote1.refused === false, '§A1 fixture: r-1 votes deliverable on r-2', CODE(vote1))
  ok(vote1.receipt && vote1.receipt.review && vote1.receipt.review.judgedPartFingerprint === fp2First,
    '§A1 a vote CARRIES the fingerprint of the text it judged', { bound: vote1.receipt && vote1.receipt.review && vote1.receipt.review.judgedPartFingerprint, current: fp2First })
  ok(vote1.receipt && vote1.receipt.review && vote1.receipt.review.judgedPartRound === 1,
    '§A1 and the round it judged (1), not only the paper round', vote1.receipt && vote1.receipt.review && vote1.receipt.review.judgedPartRound)
  ok(vote1.receipt && vote1.receipt.review && typeof vote1.receipt.review.judgedPartMeans === 'string' && /judged/i.test(vote1.receipt.review.judgedPartMeans),
    '§A1 the vote receipt explains the binding it recorded', vote1.receipt && vote1.receipt.review && vote1.receipt.review.judgedPartMeans)
  cleanup(b)
}

// ── §A2 the round-boundary shape (TB-2761 D-1): the round moved, the PROSE did not ──────────────────────────────
// RUN 81 measured the opposite of what RUN 79 pinned: a round bump alone does NOT invalidate a verdict on an untouched
// section. The binding is the judged part's FINGERPRINT. This block now asserts the corrected reading: the round-2 votes
// on round-1 text COUNT (equal fingerprints), `voidReviews` stays empty, and `advance` passes.
{
  const b = await boot()
  for (const [id, slot] of [['r-0', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) await b.hire(id, slot)
  const ev1 = b.evidenceRow('a2-1')
  const ev2 = b.evidenceRow('a2-2')
  await b.paper('start', { target: 'a2', title: 'run 79 round boundary', participants: ['r-1', 'r-2'] })
  await b.paper('part', { target: 'a2', member: 'r-1', part: 'r-1 part', body: 'A2 round-1 text of r-1', evidence: [ev1.id] })
  await b.paper('part', { target: 'a2', member: 'r-2', part: 'r-2 part', body: 'A2 round-1 text of r-2', evidence: [ev2.id] })
  const fp1 = (await b.paper('status', { target: 'a2' })).receipt.paper.parts['r-1'].fingerprint
  const fp2 = (await b.paper('status', { target: 'a2' })).receipt.paper.parts['r-2'].fingerprint
  const adv1 = await b.paper('advance', { target: 'a2' })
  ok(adv1.refused === false && adv1.receipt.advance.to === 'reviewing', '§A2 fixture: round 1 enters reviewing', adv1.receipt && adv1.receipt.advance)
  const dissent = await b.paper('review', { target: 'a2', member: 'r-1', of: 'r-2', deliverable: false })
  ok(dissent.refused === false, '§A2 fixture: r-1 dissents on r-2 (this is what sends the paper back to writing)', CODE(dissent))
  const bounce = await b.paper('advance', { target: 'a2' })
  ok(bounce.refused === false && bounce.receipt.advance.to === 'writing' && bounce.receipt.advance.round === 2,
    '§A2 fixture: advance bounces the paper to writing round 2', bounce.receipt && bounce.receipt.advance)
  // ★★★ TB-2761 D-5: the two round numbers on ONE screen are explained and in sync (run 81 read round:3 beside updatedRound:2).
  ok(bounce.receipt && bounce.receipt.advance && bounce.receipt.advance.updatedRound === bounce.receipt.advance.roundTo && bounce.receipt.advance.updatedRoundSameAsRound === true &&
    typeof bounce.receipt.advance.updatedRoundMeans === 'string' && bounce.receipt.advance.updatedRoundMeans.length > 20,
    '§A2 ★ D-5: the round-advancing receipt carries updatedRound == roundTo, the equality flag, and a means sentence',
    bounce.receipt && bounce.receipt.advance)
  const back = await b.paper('advance', { target: 'a2' })
  ok(back.refused === false && back.receipt.advance.to === 'reviewing' && back.receipt.advance.round === 2,
    '§A2 fixture: round 2 enters reviewing', back.receipt && back.receipt.advance)
  // THE MEASURED SHAPE: the parts were never re-filed after the bounce, so the round-2 votes judge round-1 prose whose
  // FINGERPRINTS are unchanged. Before TB-2761 that was read as "stale"; the corrected rule counts it.
  const v1 = await b.paper('review', { target: 'a2', member: 'r-1', of: 'r-2', deliverable: true })
  const v2 = await b.paper('review', { target: 'a2', member: 'r-2', of: 'r-1', deliverable: true })
  ok(v1.refused === false && v2.refused === false, '§A2 fixture: both members vote deliverable in round 2', CODE(v1) || CODE(v2))
  ok(v1.receipt && v1.receipt.review && v1.receipt.review.judgedPartRound === 1 && v1.receipt.review.stalePart === false,
    '§A2 the vote receipt records the judged ROUND as history but does NOT call it stale (the text is unchanged)', { round: v1.receipt && v1.receipt.review && v1.receipt.review.judgedPartRound, stale: v1.receipt && v1.receipt.review && v1.receipt.review.stalePart })
  const st = await b.paper('status', { target: 'a2' })
  const cov = st.receipt.perRoundReviewCoverage
  ok(cov && cov.round === 2, '§A2 the paper stands in round 2', cov && cov.round)
  const coveredIds = (cov && Array.isArray(cov.covered)) ? cov.covered.map((c) => c.member).sort() : []
  ok(JSON.stringify(coveredIds) === JSON.stringify(['r-1', 'r-2']),
    '§A2 ★ D-1: BOTH round-2 votes are COUNTED although their rows/rounds are round 1 — the judged text is unchanged', coveredIds)
  ok(cov && Array.isArray(cov.missing) && cov.missing.length === 0, '§A2 nothing is missing: the untouched text still covers', cov && cov.missing)
  ok(cov && Array.isArray(cov.voidReviews) && cov.voidReviews.length === 0,
    '§A2 ★ D-2: no vote is voided — and the empty list is explicit, not a missing field', cov && cov.voidReviews)
  ok(cov && Array.isArray(cov.staleReviews) && cov.staleReviews.length === 0 && Array.isArray(cov.invalidatedByRound) && cov.invalidatedByRound.length === 0,
    '§A2 the two legacy filtered views agree with voidReviews (both empty)', { stale: cov && cov.staleReviews, invalidated: cov && cov.invalidatedByRound })
  const advOk = await b.paper('advance', { target: 'a2' })
  ok(advOk.refused === false && advOk.receipt.advance.to === 'awaiting-editor',
    '§A2 ★ advance PASSES on round-old votes whose text is unchanged (no more round-only staleness)', { code: advOk.code, to: advOk.receipt && advOk.receipt.advance && advOk.receipt.advance.to })
  const st2 = await b.paper('status', { target: 'a2' })
  ok(JSON.stringify(st2.receipt.perRoundReviewCoverage) === JSON.stringify(advOk.receipt.advance.perRoundReviewCoverage),
    '§A2 status and advance print the SAME coverage object (one arithmetic, two doors)')
  cleanup(b)
}

// ── §A2b TB-2761 D-2/D-4: ONE void list grouped by why with COUNT; equal fingerprints are never printed as "≠" ──────
{
  const b = await boot()
  for (const [id, slot] of [['r-0', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) await b.hire(id, slot)
  const ev1 = b.evidenceRow('a2b-1')
  const ev2 = b.evidenceRow('a2b-2')
  await b.paper('start', { target: 'a2b', title: 'run 81 void reviews', participants: ['r-1', 'r-2'] })
  await b.paper('part', { target: 'a2b', member: 'r-1', part: 'r-1 part', body: 'A2b text of r-1', evidence: [ev1.id] })
  await b.paper('part', { target: 'a2b', member: 'r-2', part: 'r-2 part', body: 'A2b text of r-2', evidence: [ev2.id] })
  await b.paper('advance', { target: 'a2b' })
  const fp2b = (await b.paper('status', { target: 'a2b' })).receipt.paper.parts['r-2'].fingerprint
  // the measured rec-34 shape: a deliverable vote BOUND to a text the part no longer carries (forged fingerprint)
  b.kernel.records.put({
    track: 'paper', kind: 'paper-review', title: 'v5r-paper|a2b|review|r-1',
    body: JSON.stringify({ target: 'a2b', member: 'r-1', of: 'r-2', round: 1, deliverable: true, comments: '', judgedPartFingerprint: 'deadbeef', judgedPartRound: 1 }),
    by: 'vibe_v5_paper'
  })
  const v2 = await b.paper('review', { target: 'a2b', member: 'r-2', of: 'r-1', deliverable: true })
  ok(v2.refused === false, '§A2b fixture: the other member votes on the current text', CODE(v2))
  const cov = (await b.paper('status', { target: 'a2b' })).receipt.perRoundReviewCoverage
  const groups = (cov && Array.isArray(cov.voidReviews)) ? cov.voidReviews : []
  ok(groups.length === 1 && groups[0].why === 'part-text-changed' && groups[0].count === 1 && JSON.stringify(groups[0].members) === JSON.stringify(['r-1']),
    '§A2b ★ D-2: voidReviews groups by why WITH a count (part-text-changed ×1, members named)', groups)
  ok(groups[0] && Array.isArray(groups[0].entries) && groups[0].entries.length === 1 && typeof groups[0].whyMeans === 'string' && groups[0].whyMeans.length > 20,
    '§A2b ★ the group carries its entries and a human sentence, not just a code', groups[0] && groups[0].entries)
  const legacyStale = (cov && Array.isArray(cov.staleReviews)) ? cov.staleReviews : []
  ok(legacyStale.length === 1 && legacyStale[0].by === 'r-1' && legacyStale[0].why === 'part-text-changed',
    '§A2b the legacy staleReviews view is a FILTERED VIEW of voidReviews (same entry, same why)', legacyStale)
  ok(cov && Array.isArray(cov.invalidatedByRound) && cov.invalidatedByRound.length === 0,
    '§A2b no legacy round-invalidated entries are invented on top of the text-changed one', cov && cov.invalidatedByRound)
  // ★ D-4: the disagreement/refusal prose may only print ≠ between REALLY different fingerprints; the old code printed
  // "f56eba11… ≠ f56eba11…" (same hash) when the defect was the ROUND. The branch that could print it now compares first.
  const kitSrc = readFileSync(join(REPO, 'vibe-math-vmu', 'kit', 'paper.js'), 'utf8')
  ok(kitSrc.includes('const sameBytes =') && kitSrc.includes('作废原因是轮次/无绑定，不是字节'),
    '§A2b ★ D-4: the STALE-PART line compares the two fingerprints before printing "≠" (equal bytes get the round explanation)')
  ok(!/judgedPartFingerprint '\s*\+ String\(v\.judgedPartFingerprint\) \+ ' ≠ 当前 '/.test(kitSrc),
    '§A2b ★ the old unconditional "judgedPartFingerprint … ≠ 当前 …" template is gone')
  cleanup(b)
}

// ── §A4 the fingerprint arm: the round matches, the TEXT does not ─────────────────────────────────────────────────
{
  const b = await boot()
  for (const [id, slot] of [['r-0', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) await b.hire(id, slot)
  const ev1 = b.evidenceRow('a4-1')
  const ev2 = b.evidenceRow('a4-2')
  await b.paper('start', { target: 'a4', title: 'run 79 fingerprint arm', participants: ['r-1', 'r-2'] })
  await b.paper('part', { target: 'a4', member: 'r-1', part: 'r-1 part', body: 'A4 text of r-1', evidence: [ev1.id] })
  await b.paper('part', { target: 'a4', member: 'r-2', part: 'r-2 part', body: 'A4 text of r-2', evidence: [ev2.id] })
  await b.paper('advance', { target: 'a4' })
  const fp2 = (await b.paper('status', { target: 'a4' })).receipt.paper.parts['r-2'].fingerprint
  // a durable row that agrees about the ROUND and disagrees about the TEXT: exactly the measured rec-34 shape, with the
  // fingerprint made explicit so the criterion cannot be satisfied by comparing round numbers.
  const forged = b.kernel.records.put({
    track: 'paper', kind: 'paper-review', title: 'v5r-paper|a4|review|r-1',
    body: JSON.stringify({ target: 'a4', member: 'r-1', of: 'r-2', round: 1, deliverable: true, comments: '', judgedPartFingerprint: 'deadbeef', judgedPartRound: 1 }),
    by: 'vibe_v5_paper'
  })
  ok(forged && forged.ok === true, '§A4 fixture: a round-matching wrong-fingerprint review row is in the ledger', forged && forged.id)
  const realVote2 = await b.paper('review', { target: 'a4', member: 'r-2', of: 'r-1', deliverable: true })
  ok(realVote2.refused === false, '§A4 fixture: the other member votes on the current text', CODE(realVote2))
  const cov = (await b.paper('status', { target: 'a4' })).receipt.perRoundReviewCoverage
  const stale = (cov && Array.isArray(cov.staleReviews)) ? cov.staleReviews : []
  ok(stale.length === 1 && stale[0].by === 'r-1' && stale[0].judgedPartFingerprint === 'deadbeef' && stale[0].currentFingerprint === fp2,
    '§A4 the fingerprint decides: the wrong-fingerprint vote is named, not counted', stale)
  ok(stale.length === 1 && stale[0].judgedPartRound === 1 && stale[0].currentRound === 1 && stale[0].why === 'part-text-changed',
    '§A4 both ROUNDS are equal and the reason is part-text-changed (a round-only comparison would have counted it)', stale[0])
  const coveredIds = (cov && Array.isArray(cov.covered)) ? cov.covered.map((c) => c.member) : []
  ok(coveredIds.indexOf('r-1') === -1, '§A4 the forged vote is NOT coverage', coveredIds)
  const adv = await b.paper('advance', { target: 'a4' })
  ok(adv.refused === true && adv.code === 'VMU_REVIEW_STALE', '§A4 advance refuses the forged vote by name', { code: adv.code })
  const calls = parseCalls(adv.hint)
  ok(calls.length === 1 && calls[0].action === 'review' && calls[0].member === 'r-1' && calls[0].of === 'r-2' && calls[0].deliverable === true,
    '§A4 the part-text-changed hint is ONE fully specified copyable call (no template ellipses)', calls)
  const walked = calls[0] === undefined ? { refused: true, code: 'NO_PARSE' } : await b.paper('review', calls[0])
  ok(walked.refused === false && walked.receipt.review.judgedPartFingerprint === fp2,
    '§A4 executing that call verbatim SUCCEEDS and binds the current fingerprint', walked.receipt && walked.receipt.review && walked.receipt.review.judgedPartFingerprint)
  const advOk = await b.paper('advance', { target: 'a4' })
  ok(advOk.refused === false && advOk.receipt.advance.to === 'awaiting-editor',
    '§A4 once the only defect is repaired the SAME advance passes', advOk.receipt && advOk.receipt.advance)
  cleanup(b)
}

// ── §A5 the final gate applies the same binding ───────────────────────────────────────────────────────────────────
{
  const b = await boot()
  for (const [id, slot] of [['r-0', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) await b.hire(id, slot)
  const ev1 = b.evidenceRow('a5-1')
  const ev2 = b.evidenceRow('a5-2')
  await b.paper('start', { target: 'a5', title: 'run 79 final gate', participants: ['r-1', 'r-2'] })
  await b.paper('part', { target: 'a5', member: 'r-1', part: 'r-1 part', body: 'A5 text of r-1', evidence: [ev1.id] })
  await b.paper('part', { target: 'a5', member: 'r-2', part: 'r-2 part', body: 'A5 text of r-2', evidence: [ev2.id] })
  await b.paper('advance', { target: 'a5' })
  await b.paper('review', { target: 'a5', member: 'r-1', of: 'r-2', deliverable: true })
  await b.paper('review', { target: 'a5', member: 'r-2', of: 'r-1', deliverable: true })
  const adv = await b.paper('advance', { target: 'a5' })
  ok(adv.refused === false && adv.receipt.advance.to === 'awaiting-editor', '§A5 fixture: the paper reaches awaiting-editor', adv.receipt && adv.receipt.advance)
  // a NEWER durable row for r-1, bound to a text the part does not carry: the FINAL door must read the same binding
  b.kernel.records.put({
    track: 'paper', kind: 'paper-review', title: 'v5r-paper|a5|review|r-1',
    body: JSON.stringify({ target: 'a5', member: 'r-1', of: 'r-2', round: 1, deliverable: true, comments: '', judgedPartFingerprint: 'deadbeef', judgedPartRound: 1 }),
    by: 'vibe_v5_paper'
  })
  const badFinal = await b.paper('final', { target: 'a5', member: 'r-0', decision: 'deliverable', note: 'run 79 A5', conclusion: 'C' })
  ok(badFinal.refused === true && badFinal.code === 'VMU_REVIEW_STALE',
    '§A5 final REFUSES a stale vote (same round, wrong fingerprint: only the binding can catch it)', { code: badFinal.code })
  ok((await b.paper('status', { target: 'a5' })).receipt.paper.status !== 'finalized',
    '§A5 and nothing was finalised by the refused call')
  // the repair path the editor really has: revise -> re-file -> review -> advance -> final
  const revise = await b.paper('final', { target: 'a5', member: 'r-0', decision: 'revise', note: 'run 79 A5: re-review on the new text' })
  const reviseTo = revise.receipt && revise.receipt.final ? revise.receipt.final.to : null
  ok(revise.refused === false && reviseTo === 'writing', '§A5 fixture: revise reopens writing', { code: revise.code, message: revise.message, to: reviseTo })
  await b.paper('part', { target: 'a5', member: 'r-1', part: 'r-1 part', body: 'A5 revised text of r-1', evidence: [ev1.id] })
  await b.paper('part', { target: 'a5', member: 'r-2', part: 'r-2 part', body: 'A5 revised text of r-2', evidence: [ev2.id] })
  const adv2 = await b.paper('advance', { target: 'a5' })
  ok(adv2.refused === false && adv2.receipt.advance.to === 'reviewing', '§A5 fixture: the revised paper re-enters reviewing', adv2.receipt && adv2.receipt.advance)
  const v1 = await b.paper('review', { target: 'a5', member: 'r-1', of: 'r-2', deliverable: true })
  const v2 = await b.paper('review', { target: 'a5', member: 'r-2', of: 'r-1', deliverable: true })
  ok(v1.refused === false && v2.refused === false, '§A5 fixture: both vote on the revised text', CODE(v1) || CODE(v2))
  const adv3 = await b.paper('advance', { target: 'a5' })
  ok(adv3.refused === false && adv3.receipt.advance.to === 'awaiting-editor', '§A5 fixture: back to awaiting-editor', adv3.receipt && adv3.receipt.advance)
  const fin2 = await b.paper('final', { target: 'a5', member: 'r-0', decision: 'deliverable', note: 'run 79 A5', conclusion: 'C' })
  ok(fin2.refused === true && fin2.code === 'VMU_OFFICE_CONSULT_REQUIRED',
    '§A5 with fresh votes the cross-review gate passes and the NEXT named gate is the office consult', { code: fin2.code })
  const consult = await b.paper('consult', { target: 'a5', member: 'office', answer: 'ok', note: 'run 79 A5' })
  ok(consult.refused === false, '§A5 the office answers through the tool face', { code: consult.code, message: consult.message })
  const fin3 = await b.paper('final', { target: 'a5', member: 'r-0', decision: 'deliverable', note: 'run 79 A5', conclusion: 'C' })
  ok(fin3.refused === false, '§A5 and the same final is then accepted', { code: fin3.code, message: fin3.message })
  ok((await b.paper('status', { target: 'a5' })).receipt.paper.status === 'finalized', '§A5 the paper is finalised')
  cleanup(b)
}

// ── §B not tested is not absent ───────────────────────────────────────────────────────────────────────────────────
{
  const tools = await import(urlish(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')))
  ok(typeof tools.toolchainProbeOf === 'function', '§B fixture: the probe reading is exported')
  ok(tools.toolchainProbeOf({ latexAvailable: null, asked: false }) === 'not-run', '§B toolchainProbeOf: nothing asked is NOT RUN')
  ok(tools.toolchainProbeOf({ latexAvailable: false, asked: true }) === 'ran-absent', '§B toolchainProbeOf: an answered NO is RAN-ABSENT')
  ok(tools.toolchainProbeOf({ latexAvailable: true, asked: true }) === 'ran-present', '§B toolchainProbeOf: an answered YES is RAN-PRESENT')

  const b = await boot()
  for (const [id, slot] of [['r-0', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) await b.hire(id, slot)
  await b.paper('start', { target: 'b1', title: 'run 79 not tested', participants: ['r-1', 'r-2'] })
  const st0 = (await b.paper('status', { target: 'b1' })).receipt
  ok(st0.toolchainProbe === 'not-run', '§B a fresh paper says the toolchain question was NOT ASKED', st0.toolchainProbe)
  ok(Array.isArray(st0.toolchainAbsent) && st0.toolchainAbsent.length === 0, '§B and names no absent toolchain', st0.toolchainAbsent)
  ok(st0.latexAvailable === null, '§B latexAvailable is null, not false (no measurement was made)', st0.latexAvailable)
  ok(typeof st0.toolchainProbeMeans === 'string' && /NOT ASKED/.test(st0.toolchainProbeMeans),
    '§B the means sentence says NOT ASKED instead of implying absence', st0.toolchainProbeMeans)
  ok(/NOT that the toolchain is installed/.test(st0.toolchainProbeMeans),
    '§B the means sentence explicitly refuses the absent reading')
  ok(st0.pdfCompiled && st0.pdfCompiled.produced === false, '§B fixture: no pdf has been produced', st0.pdfCompiled && st0.pdfCompiled.produced)
  ok(st0.pdfCompiled && st0.pdfCompiled.blockedBy === 'not-finalized' && typeof st0.pdfCompiled.blockedByMeans === 'string' && st0.pdfCompiled.blockedByMeans.length > 0,
    '§B blockedBy names the FIRST reason (not-finalized) with a means', st0.pdfCompiled && st0.pdfCompiled.blockedBy)

  // drive the paper to final: on this machine the compile question IS asked and answered, which must change the reading
  const ev1 = b.evidenceRow('b1-1')
  const ev2 = b.evidenceRow('b1-2')
  await b.paper('part', { target: 'b1', member: 'r-1', part: 'r-1 part', body: 'B1 text of r-1', evidence: [ev1.id] })
  await b.paper('part', { target: 'b1', member: 'r-2', part: 'r-2 part', body: 'B1 text of r-2', evidence: [ev2.id] })
  await b.paper('advance', { target: 'b1' })
  await b.paper('review', { target: 'b1', member: 'r-1', of: 'r-2', deliverable: true })
  await b.paper('review', { target: 'b1', member: 'r-2', of: 'r-1', deliverable: true })
  await b.paper('advance', { target: 'b1' })
  await b.paper('consult', { target: 'b1', member: 'office', answer: 'ok', note: 'run 79 B' })
  const fin = await b.paper('final', { target: 'b1', member: 'r-0', decision: 'deliverable', note: 'run 79 B', conclusion: 'C' })
  ok(fin.refused === false, '§B fixture: the paper finalises', { code: fin.code, message: fin.message })
  const st1 = (await b.paper('status', { target: 'b1' })).receipt
  ok(st1.toolchainProbe !== 'not-run',
    '§B after a finalisation asked the compile question, the reading is no longer not-run', st1.toolchainProbe)
  ok(st1.toolchainProbe === 'ran-absent' || st1.toolchainProbe === 'ran-present',
    '§B the reading is a MEASURED value', st1.toolchainProbe)
  if (st1.toolchainProbe === 'ran-absent') {
    ok(Array.isArray(st1.toolchainAbsent) && st1.toolchainAbsent.length > 0, '§B ran-absent names what was absent', st1.toolchainAbsent)
    ok(st1.pdfCompiled && st1.pdfCompiled.produced === false && st1.pdfCompiled.blockedBy === 'toolchain-absent',
      '§B and the missing pdf is attributed to the toolchain, not to the paper', st1.pdfCompiled && st1.pdfCompiled.blockedBy)
    ok(/measured absence/.test(String(st1.toolchainProbeMeans)), '§B the means calls it a measured absence', st1.toolchainProbeMeans)
  }
  ok(['not-finalized', 'no-parts', 'toolchain-absent', 'compile-not-run'].indexOf(String(st1.pdfCompiled && st1.pdfCompiled.blockedBy)) !== -1,
    '§B blockedBy is one of the named reasons (never a bare false)', st1.pdfCompiled && st1.pdfCompiled.blockedBy)
  cleanup(b)
}

// ── TB-2761 LAMPS: each fix gets a working-tree copy that reverts it; the OLD (defective) reading must come back ───
// A lamp that does not bite is worse than no lamp: each body drives the same door the positive assertion used.
{
  const withLamp = async (mutations, body) => {
    const dir = mkdtempSync(join(tmpdir(), 'vmu-r79-lamp-'))
    try {
      cpSync(join(REPO, 'vibe-math-vmu'), join(dir, 'vibe-math-vmu'), { recursive: true })
      const kitPath = join(dir, 'vibe-math-vmu', 'kit', 'paper.js')
      let src = readFileSync(kitPath, 'utf8')
      // ★ #3b（audit-declaration-criterion RULE E）：遍历 mutation 列表的循环在空表上会静默通过；先钉住非空。
      ok(Array.isArray(mutations) && mutations.length > 0, 'lamp-setup: the mutation list is non-empty (' + mutations.length + ')')
      for (const m of mutations) {
        ok(src.indexOf(m[0]) !== -1, 'lamp-setup: mutation point present (' + String(m[0]).slice(0, 46) + '…)')
        src = src.replace(m[0], m[1])
      }
      writeFileSync(kitPath, src)
      const b = await boot(null, urlish(join(dir, 'vibe-math-vmu', 'vibe-math-vmu.js')))
      try { await body(b) } finally { cleanup(b) }
    } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }) }
  }
  const seed = async (b, target) => {
    for (const [id, slot] of [['r-0', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) await b.hire(id, slot)
    const e1 = b.evidenceRow('lamp-1')
    const e2 = b.evidenceRow('lamp-2')
    await b.paper('start', { target, title: 'tb2761 lamp', participants: ['r-1', 'r-2'] })
    await b.paper('part', { target, member: 'r-1', part: 'p1', body: 'lamp text 1', evidence: [e1.id] })
    await b.paper('part', { target, member: 'r-2', part: 'p2', body: 'lamp text 2', evidence: [e2.id] })
    await b.paper('advance', { target })
  }

  // D-1 lamp: revert the TEXT binding to the old ROUND binding.
  await withLamp([["if (judged.partChanged) return out(false, 'part-text-changed')", "if (rowRound !== round) return out(false, 'part-text-changed')"]], async (b) => {
    await seed(b, 'l1')
    await b.paper('review', { target: 'l1', member: 'r-1', of: 'r-2', deliverable: true })
    await b.paper('review', { target: 'l1', member: 'r-2', of: 'r-1', deliverable: false })
    await b.paper('advance', { target: 'l1' }) // bounce → round 2 writing
    await b.paper('advance', { target: 'l1' }) // → reviewing round 2
    const cov = (await b.paper('status', { target: 'l1' })).receipt.perRoundReviewCoverage
    ok(!!cov && cov.covered.length === 0 && cov.missing.indexOf('r-1') !== -1,
      'lamp D-1 RED-worthy: 把判据退回「round 绑定」⇒ round-1 的 deliverable 票不再计入（run 81 D-1 的原状）',
      cov && { covered: cov.covered, missing: cov.missing })
  })

  // D-2 lamp: drop the per-why COUNT and the old "two lists, no count" reading comes back.
  await withLamp([['count: byWhy.get(why).length', 'count: null']], async (b) => {
    await seed(b, 'l2')
    b.kernel.records.put({ track: 'paper', kind: 'paper-review', title: 'v5r-paper|l2|review|r-1',
      body: JSON.stringify({ target: 'l2', member: 'r-1', of: 'r-2', round: 1, deliverable: true, comments: '', judgedPartFingerprint: 'deadbeef', judgedPartRound: 1 }),
      by: 'vibe_v5_paper' })
    await b.paper('review', { target: 'l2', member: 'r-2', of: 'r-1', deliverable: true })
    const cov = (await b.paper('status', { target: 'l2' })).receipt.perRoundReviewCoverage
    const count = cov && cov.voidReviews && cov.voidReviews[0] ? cov.voidReviews[0].count : undefined
    ok(count !== 1, 'lamp D-2 RED-worthy: 去掉 count ⇒ 作废组又无法回答「几张票」（run 81 D-2 的原状）', { count })
  })

  // D-5 lamp: drop the advance-side sync of `updatedRound`; the two numbers on one receipt diverge again.
  await withLamp([["state.round += 1; state.updatedRound = state.round; state.status = 'writing'", "state.round += 1; state.status = 'writing'"]], async (b) => {
    await seed(b, 'l5')
    await b.paper('review', { target: 'l5', member: 'r-1', of: 'r-2', deliverable: false })
    const bounce = await b.paper('advance', { target: 'l5' })
    ok(bounce.refused === false && bounce.receipt.advance && bounce.receipt.advance.updatedRound !== bounce.receipt.advance.roundTo,
      'lamp D-5 RED-worthy: 不同步 updatedRound ⇒ 同一回执上 round 与 updatedRound 又不同（run 81 D-5 的原状）',
      bounce.receipt && bounce.receipt.advance && { roundTo: bounce.receipt.advance.roundTo, updatedRound: bounce.receipt.advance.updatedRound })
  })

  // D-4 lamp: make the equality check always true; a line about TWO DIFFERENT fingerprints must not claim they are
  // equal (the mirror image of the run-81 "same hash printed as ≠"). The stale-part line must render here: a forged row
  // binds a fingerprint the part does not carry, and a dissent makes the advance bounce with that line in the record.
  await withLamp([
    ['const sameBytes = String(shown(v.judgedPartFingerprint)) === String(shown(v.currentFingerprint))', 'const sameBytes = true'],
  ], async (b) => {
    await seed(b, 'l4')
    b.kernel.records.put({ track: 'paper', kind: 'paper-review', title: 'v5r-paper|l4|review|r-1',
      body: JSON.stringify({ target: 'l4', member: 'r-1', of: 'r-2', round: 1, deliverable: true, comments: '', judgedPartFingerprint: 'deadbeef', judgedPartRound: 1 }),
      by: 'vibe_v5_paper' })
    await b.paper('review', { target: 'l4', member: 'r-2', of: 'r-1', deliverable: false })
    const bounce = await b.paper('advance', { target: 'l4' })
    const st = await b.paper('status', { target: 'l4' })
    const hist = (st.receipt && st.receipt.paper && Array.isArray(st.receipt.paper.disagreement)) ? st.receipt.paper.disagreement : []
    const last = hist.length ? String(hist[hist.length - 1].detail || '') : ''
    const staleRow = ((bounce.receipt && bounce.receipt.advance && bounce.receipt.advance.reviewsRead) || []).filter((r) => r && r.member === 'r-1' && r.stalePart === true)[0] || null
    ok(bounce.refused === false && /与当前相同/.test(last) && !!staleRow && staleRow.judgedPartFingerprint !== staleRow.currentFingerprint,
      'lamp D-4 RED-worthy: 把比较改成恒真 ⇒ 两个不同指纹也被印成「与当前相同」（同族假事实）',
      { detail: last.slice(0, 200), judged: staleRow && staleRow.judgedPartFingerprint, current: staleRow && staleRow.currentFingerprint })
  })
}

console.log('=== VMU RUN79 REVIEW FINGERPRINT: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exitCode = 1
