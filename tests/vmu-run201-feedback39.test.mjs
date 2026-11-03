// RUN 201 — run 40 / FEEDBACK39: the ruling that named a ballot nobody had voted in, and three counts that hid
// where they came from.
//
// 1.1  p=1 with `debate_ruling` was checked for SHAPE only (mode unanimous, value 1, subject matches the card), so a
//      brand-new card that had never been debated wrote p=1 naming `ballotId:"bx-1"` — a ballot that EXISTED and held
//      ZERO votes. The write receipt said `p1Evidence:"debate-unanimous"`, `p1RulingRef:"bx-1"`, and nothing had
//      decided anything.
// 1.2  the p=1 description offered "Lean passed + conformance" as a route a card write can take; in this institute
//      the route that works is the chair's `vibe_v5_fidelity_conclude` (it writes p=1 itself and promotes).
// 1.3  `advance` sent a round-2 paper back to writing without saying the ROUND advanced (2 → 3).
// 1.5  a `final` blocked by `VMU_OFFICE_CONSULT_REQUIRED` answered with no `final` block at all, while the retry after
//      the answer carried a full one — a reader could not tell "refused" from "never attempted".
// 2.4  a FIRST write of a card read `settlement.record:{rev:2, mode:"supersede"}`, which looks like an overwrite of
//      something that was never there.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const PACK = read('vibe-math-vmu/packs/v5r/tools.js')
const GATES = read('vibe-math-vmu/packs/v5r/verification-gates.js')
const PAPER = read('vibe-math-vmu/kit/paper.js')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
const advanceOf = (r) => (r && r.advance) || r
const refuseCode = (err) => (err && (err.code || (err.error && err.error.code))) || null

async function assemble(dir, opts = {}) {
  const entry = await import(pathToFileURL(ENTRY).href)
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { async register(s) { specs.push(s); return () => {} } } }
  const handle = await entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root: dir, ...(opts.vmu ? { vmu: opts.vmu } : {}) })
  await handle.ready()
  await handle.kernel.store.open()
  const call = async (name, args) => {
    const s = specs.filter((x) => x && x.name === name)[0]
    if (!s) throw new Error('no such face: ' + name)
    const raw = await s.execute(args, { kernel: handle.kernel })
    return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
  }
  return { handle, specs, call }
}
/** a ballot the institution really holds; `votes` members vote '1' (for), then it is closed. */
async function settledBallot(kernel, votes, close = true) {
  const opened = kernel.ballotbox.open({ question: '裁定？', options: ['1', '0'], rules: { minVotes: 0 } })
  ok(opened && opened.ok === true, 'premise: the ballot opened', opened)
  for (let i = 0; i < votes; i += 1) {
    const cast = kernel.ballotbox.cast({ boxId: opened.boxId, by: 'v' + (i + 1), choice: '1' })
    ok(cast && cast.ok === true, 'premise: vote ' + (i + 1) + ' was cast', cast)
  }
  if (close) {
    const closed = kernel.ballotbox.close({ boxId: opened.boxId })
    ok(closed && closed.ok === true, 'premise: the ballot closed', closed)
  }
  return opened.boxId
}

test('RUN 201 §0 — every repair is on the source it belongs to (source pins)', () => {
  has(PACK, 'async function rulingNameResolution(kernel, debate, context = {})', '§0a ★ the ruling NAME is resolved against the institution (ASYNC since RUN 206: a debate can settle with typed ruling cards)')
  has(PACK, 'const resolution = await rulingNameResolution(kernel, evidence.debate, { cardId })', '§0b and the write path asks before the shape gate')
  has(PACK, 'VMU_PACK_V5R_CORE_P1_RULING_UNRESOLVED', '§0c ★ a name nobody holds is refused by name')
  has(PACK, 'VMU_PACK_V5R_CORE_P1_RULING_UNVOTED', '§0d ★★ and so is a name that holds no votes (the run-40 shape)')
  has(GATES, 'ruling: ev.debate.ruling === undefined ? null : ev.debate.ruling', '§0e the gate hands the READING back')
  has(PACK, 'p1RulingReading', '§0f the receipt prints what was read, not only the string that was passed')
  has(PACK, 'WHAT THAT THIRD ROUTE ACTUALLY REQUIRES', '§0g ★ the p=1 description stops promising a route it cannot honour')
  has(PACK, 'vibe_v5_fidelity_conclude', '§0h and names the route that works in this institute')
  has(PAPER, 'const roundFrom = state.round', '§0i ★ the write-back reads the round BEFORE it moves')
  has(PAPER, 'roundMeans: ', '§0j and says the round advanced')
  has(PAPER, 'gate.error.final = {', '§0k ★★ a gate-blocked final still answers with a final block')
  has(PAPER, "blockedBy: 'office-consult'", '§0l naming what blocked it')
  has(PACK, 'writesInThisCallMeans', '§0m ★ a create-then-patch settlement counts its own writes')
  has(PACK, 'revMeans:', '§0n and says rev is the record counter, not the call count')
})

test('RUN 201 §1 — a ruling must name a decision that exists AND that somebody voted in', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run201-'))
  try {
    const { handle, call } = await assemble(dir)
    await call('vibe_v5_start', { researcherCount: 2 })
    const base = { title: '裁定卡', statement: 'n + n = 2n', value: 1, motive: '算术', p: 1, member: 'r-acad' }

    // (a) a ballot id nobody holds ⇒ UNRESOLVED (the name cannot be read anywhere)
    // ★ MEASURED: this pack ANSWERS a refusal — it returns {ok:false, code, message, hint}, it does not throw (the kit
    // converts handler throws into receipts). Reading the answer is the assertion; a try/catch around it proves nothing.
    const unresolved = await call('vibe_v5_record_proposition', Object.assign({}, base, {
      id: 'rec-r201-a',
      debate_ruling: { mode: 'unanimous', value: 1, subject: 'rec-r201-a', ballotId: 'bx-nope' },
    }))
    ok(unresolved.ok === false && unresolved.code === 'VMU_PACK_V5R_CORE_P1_RULING_UNRESOLVED',
      '§1a ★ a ruling that names a ballot nobody holds is refused by name', unresolved)
    ok(/cannot be resolved/.test(String(unresolved.message)), '§1b and the message says the name did not resolve', unresolved.message)

    // (b) ★★ THE RUN-40 SHAPE: the ballot EXISTS and holds ZERO votes
    const emptyBox = await settledBallot(handle.kernel, 0, false)
    const unvoted = await call('vibe_v5_record_proposition', Object.assign({}, base, {
      id: 'rec-r201-b',
      debate_ruling: { mode: 'unanimous', value: 1, subject: 'rec-r201-b', ballotId: emptyBox },
    }))
    ok(unvoted.ok === false && unvoted.code === 'VMU_PACK_V5R_CORE_P1_RULING_UNVOTED',
      '§1c ★★ p=1 was refused because that ballot has no votes (run 40 wrote it through)', unvoted)
    // ★★ RUN 204: the sentence narrowed from "holds NO votes" to "holds NO COUNTED votes" — a vote can be received
    // and not counted (quorum), and that is a different fact from "nobody voted". The pin follows the narrower claim.
    ok(/holds NO counted votes/.test(String(unvoted.message)), '§1d the message says which reading refused it', unvoted.message)
    ok(/cast votes into that box/.test(String(unvoted.hint)), '§1e and the hint names the reachable way to make it real', unvoted.hint)

    // (c) a CLOSED ballot that people voted in ⇒ admitted, and the receipt carries the reading
    const realBox = await settledBallot(handle.kernel, 2, true)
    const wrote = await call('vibe_v5_record_proposition', Object.assign({}, base, {
      id: 'rec-r201-c',
      debate_ruling: { mode: 'unanimous', value: 1, subject: 'rec-r201-c', ballotId: realBox },
    }))
    ok(wrote.ok === true, '§1f a ruling that names a real, voted ballot is still admitted', wrote.code || wrote.ok)
    ok(wrote.p1RulingRef === realBox, '§1g the receipt still names the ruling', wrote.p1RulingRef)
    ok(wrote.p1RulingReading && wrote.p1RulingReading.ok === true,
      '§1h ★★ and now it also carries WHAT WAS READ', wrote.p1RulingReading)
    ok(Number(wrote.p1RulingReading.votes) === 2, '§1i the reading counts the votes that decided it', wrote.p1RulingReading)
    ok(wrote.p1RulingReading.settled === true && wrote.p1RulingReading.state === 'closed',
      '§1j and says the ballot was closed', wrote.p1RulingReading)

    // (d) the meeting route is read the same way: a meeting with no motion that was voted decides nothing
    const met = await call('vibe_v5_meeting', { member: 'r-acad', agenda: '裁定会', title: '裁定会' })
    ok(met.ok === true && typeof met.meeting === 'string', '§1k premise: a meeting was convened', met)
    const metUnvoted = await call('vibe_v5_record_proposition', Object.assign({}, base, {
      id: 'rec-r201-d',
      debate_ruling: { mode: 'unanimous', value: 1, subject: 'rec-r201-d', meeting: met.meeting },
    }))
    ok(metUnvoted.ok === false && metUnvoted.code === 'VMU_PACK_V5R_CORE_P1_RULING_UNVOTED',
      '§1l ★ the MEETING route is resolved too — an unvoted meeting decides nothing', metUnvoted)
    ok(/0 vote\(s\) recorded/.test(String(metUnvoted.message)), '§1m the reading prints the counts it read', metUnvoted.message)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 201 §2 — a create-then-patch settlement says how many times this call wrote', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run201-'))
  try {
    const { handle, call } = await assemble(dir)
    await call('vibe_v5_start', { researcherCount: 2 })
    const box = await settledBallot(handle.kernel, 2, true)
    const wrote = await call('vibe_v5_record_proposition', {
      id: 'rec-r201-s', title: '裁定卡', statement: 'n + n = 2n', value: 1, motive: '算术', p: 1, member: 'r-acad',
      debate_ruling: { mode: 'unanimous', value: 1, subject: 'rec-r201-s', ballotId: box },
    })
    ok(wrote.ok === true, '§2a premise: the card is written with its ruling', wrote.code || wrote.ok)
    const s = wrote.settlement
    ok(s && typeof s === 'object', '§2b the settlement block is present', wrote.settlement)
    ok(s.createdByThisCall === true, '§2c ★★ the receipt says the card was CREATED by this call', s)
    ok(s.writesInThisCall === 2, '§2d ★★ and that the call wrote the record twice (create + patch)', s)
    ok(/TWO writes happened in this call/.test(String(s.writesInThisCallMeans || '')), '§2e the sentence explains rev=2 instead of leaving it to look like an overwrite', s.writesInThisCallMeans)
    ok(/version counter/.test(String(s.revMeans || '')), '§2f ★ rev is named as the RECORD version counter', s.revMeans)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 201 §3 — advance says the ROUND advanced; a gate-blocked final still answers with a final block', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run201-'))
  const dir2 = mkdtempSync(join(tmpdir(), 'vmu-run201b-'))
  try {
    const { call } = await assemble(dir, { vmu: { 'vmu.paper.officeConsult': 'off' } })
    await call('vibe_v5_start', { researcherCount: 2 })
    const card = await call('vibe_v5_record_proposition', { id: 'rec-r201-p', title: '证据卡', statement: 'n + n = 2n', value: 0.9, motive: '算术', p: 0.9, member: 'r-acad' })
    ok(card.ok === true, '§3a premise: the evidence card is written', card)
    await call('vibe_v5_paper', { action: 'start', target: 'p-201', participants: ['r-1', 'r-2'] })
    for (const m of ['r-1', 'r-2']) await call('vibe_v5_paper', { action: 'part', target: 'p-201', member: m, part: m + ' 的部分', body: m + ' 的解法', evidence: ['rec-r201-p'] })
    await call('vibe_v5_paper', { action: 'advance', target: 'p-201' })
    for (const m of ['r-1', 'r-2']) await call('vibe_v5_paper', { action: 'review', target: 'p-201', member: m, deliverable: true, comments: '可交付' })
    const round1 = advanceOf(await call('vibe_v5_paper', { action: 'advance', target: 'p-201' }))
    ok(round1.ok === true && round1.to === 'awaiting-editor', '§3b premise: round 1 is unanimous', round1)
    const back2 = await call('vibe_v5_paper', { action: 'final', target: 'p-201', member: 'r-acad', decision: 'revise', note: '第二轮' })
    ok(back2.ok === true, '§3c premise: the editor opened round 2', back2.code || back2.ok)
    await call('vibe_v5_paper', { action: 'advance', target: 'p-201' })
    // ★ run 40's shape: nobody filed a round-2 review, so the round is held open and the paper goes BACK to writing
    const held = advanceOf(await call('vibe_v5_paper', { action: 'advance', target: 'p-201' }))
    ok(held.ok === true && held.to === 'writing', '§3d premise: the round is not unanimous and the paper goes back to writing', held)
    ok(held.roundFrom === 2 && held.roundTo === 3, '§3e ★★ the receipt names BOTH rounds (2 → 3), not just "writing"', { roundFrom: held.roundFrom, roundTo: held.roundTo, round: held.round })
    ok(/2 → 3/.test(String(held.roundMeans || '')), '§3f and says the round advanced, so round 3 is not a retry of round 2', held.roundMeans)
  } finally { rmSync(dir, { recursive: true, force: true }) }
  try {
    // ★ 1.5: the consult gate is ON here, so `final` is blocked by name — and now it says what it blocked.
    const { call } = await assemble(dir2, { vmu: { 'vmu.paper.officeConsult': 'required' } })
    await call('vibe_v5_start', { researcherCount: 2 })
    const card = await call('vibe_v5_record_proposition', { id: 'rec-r201-q', title: '证据卡', statement: 'n + n = 2n', value: 0.9, motive: '算术', p: 0.9, member: 'r-acad' })
    ok(card.ok === true, '§3g premise: the evidence card is written', card)
    await call('vibe_v5_paper', { action: 'start', target: 'p-202', participants: ['r-1', 'r-2'] })
    for (const m of ['r-1', 'r-2']) await call('vibe_v5_paper', { action: 'part', target: 'p-202', member: m, part: m + ' 的部分', body: m + ' 的解法', evidence: ['rec-r201-q'] })
    await call('vibe_v5_paper', { action: 'advance', target: 'p-202' })
    for (const m of ['r-1', 'r-2']) await call('vibe_v5_paper', { action: 'review', target: 'p-202', member: m, deliverable: true, comments: '可交付' })
    const toEditor = advanceOf(await call('vibe_v5_paper', { action: 'advance', target: 'p-202' }))
    ok(toEditor.ok === true && toEditor.to === 'awaiting-editor', '§3h premise: the paper awaits its editor', toEditor)
    // ★ MEASURED: `vibe_v5_paper` ANSWERS a refusal — the kit turns the gate's throw into a receipt, so the refusal is
    // the return value. A try/catch here reads `null` and cannot distinguish "allowed" from "refused".
    const blocked = await call('vibe_v5_paper', { action: 'final', target: 'p-202', member: 'r-acad', decision: 'deliverable', note: '定稿' })
    ok(blocked.ok === false, '§3i ★ the final really was refused by the consult gate', blocked)
    ok(refuseCode(blocked) === 'VMU_OFFICE_CONSULT_REQUIRED', '§3j by the named gate', refuseCode(blocked))
    const fin = blocked.final
    ok(fin && typeof fin === 'object', '§3k ★★ the refusal carries a final block (run 40 answered with none)', fin)
    ok(fin.finalized === false && fin.ok === false, '§3l and it says the paper is NOT finalized', fin)
    ok(fin.blockedBy === 'office-consult', '§3m naming what blocked it', fin && fin.blockedBy)
    ok(fin.consult && typeof fin.consult.requestId === 'string' && fin.consult.requestId.length > 0,
      '§3n ★ the question that must be answered first is named by id', fin && fin.consult)
    ok(/NOT finalized/.test(String(fin.means || '')), '§3o with the sentence that a refused final leaves the paper where it was', fin && fin.means)
  } finally { rmSync(dir2, { recursive: true, force: true }) }
})
