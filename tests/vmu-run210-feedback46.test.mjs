// RUN 210 — run 47 / FEEDBACK46: the receipt that hands out a call must say whether that call will be refused,
// and a self-report must not lock a card on a pointer that resolves to nothing.
//
// 1.1  `vibe_v5_verdict_final` accepted a chair-TYPED verdict set and returned a tally; copying its own
//      `correction.call` back was then refused as UNVOTED. The reading already knew (`voted:false`) but did not say
//      what it meant for the call being handed out.
// 1.2  `correction.call` carries `ballotId` — and that slot holds the RULING AGGREGATE name (`tally-…`), not a ballot
//      BOX id; run 47 put the meeting face's own `ballotId` there and was refused.
// 1.3  a card registered `proof_state:"complete"` with a `proof_ref` pointing at a MISSING file LOCKED itself, so the
//      pointer could never be corrected. A complete self-report whose own pointer does not resolve is now recorded as
//      draft (the card stays writable) and the receipt names the downgrade.
// 1.4  the paper's `status.reachableMoves` taught `review{decision}` while the review face refuses `decision`.
// 2.1  the mainline block said "three seats verbatim" while four seats carry the same body.
// 2.4  the hire hint could be read as "`institution` is read on the FIRST hire"; it is never written on this face.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const PACK = read('vibe-math-vmu/packs/v5r/tools.js')
const PAPER_KIT = read('vibe-math-vmu/kit/paper.js')
const BLOCKS = read('vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
const tmp = () => mkdtempSync(join(tmpdir(), 'vmu-run210-'))

async function assemble(dir) {
  const entry = await import(pathToFileURL(ENTRY).href)
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { async register(s) { specs.push(s); return () => {} } } }
  const handle = await entry.apply(ctx, { clock: () => 1793464775000, packs: ['v5r'], root: dir })
  await handle.ready()
  await handle.kernel.store.open()
  const call = async (name, args) => {
    const s = specs.filter((x) => x && x.name === name)[0]
    if (!s) throw new Error('no such face: ' + name)
    const raw = await s.execute(args, { kernel: handle.kernel })
    return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
  }
  return { call, handle, specs }
}
const blockOf = (r, key) => (r && r[key]) || r

test('RUN 210 §0 — the repairs live on the source they belong to (pins)', () => {
  has(PACK, ": status === 'reviewing' ? ['review{deliverable}', 'advance']", '§0a ★★★ the status page stops teaching `review{decision}`')
  ok(!PACK.includes("['review{decision}'"), '§0b …and the wrong spelling is gone')
  has(PACK, '`institution` is NEVER written on this face', '§0c ★★ the hire hint says "never", not "only on the first"')
  has(PACK, 'let proofStateDowngraded = null', '§0d ★★★ a dangling pointer defers the L14 lock')
  has(PACK, "payload.proofLockDeferred = 'pointer:'", '§0e ★★ …and the reason travels in the card body')
  has(PACK, 'proofLockDeferredMeans:', '§0f ★ the receipt names the deferral')
  has(PACK, 'ballotIdMeans:', '§0g ★★ the correction block separates the aggregate name from a box id')
  has(PACK, 'const p1CannotBack = (() => {', '§0h ★★★ the verdict_final receipt predicts its own refusal')
  has(PACK, 'p1CannotBackMeans:', '§0i ★ and says what to do instead')
  has(BLOCKS, '**在册各席逐字一致**', '§0j ★★ the mainline block covers every seat, not "three seats"')
  has(PAPER_KIT, '**不要**用「把 vmu.paper.officeConsult 设成 "off"」绕过它', '§0k ★★ the final hint stops offering "turn the gate off"')
})

test('RUN 210 §1 — a "complete" whose pointer resolves to nothing is written as declared, but NOT locked', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    ok((await call('vibe_v5_start', { problem: 'RUN 210 的证明指针', researcherCount: 2 })).ok === true, 'premise: founded')

    // ★★★ the live shape from run 47: proof_state complete + a proof_ref that does not exist yet
    const w = await call('vibe_v5_record_proposition', {
      statement: '前 n 个奇数之和等于 n 的平方', value: '对 n≥1 成立', motive: '初等结论',
      p: 0.9, member: 'r-1', proof_ref: 'Members/r-1/Propos/oddsum-210.md', proof_state: 'complete',
    })
    ok(w.ok === true, '§1a the card is still WRITTEN (a missing pointer is not a reason to refuse the claim)', w)
    ok(w.proofState === 'complete', '§1b ★★ the DECLARATION is recorded exactly as written (the debate gate reads it)', w.proofState)
    ok(w.proofLockDeferred === true, '§1c ★★★ but the rule-L14 lock is DEFERRED', w.proofLockDeferred)
    ok(w.proofLockDeferredReason === 'missing', '§1d ★ the reason is a field, not a footnote', w.proofLockDeferredReason)
    has(w.proofLockDeferredMeans, 'LOCK IS DEFERRED', '§1e ★ the consequence is stated in words')
    has(w.proofLockDeferredMeans, 'stays writable', '§1f ★ and says the pointer can still be corrected')

    // because the lock was deferred, the pointer can still be corrected — this is the harm the lock used to create.
    // ★ RUN 239: a rewrite that OMITS `proof_ref` would rebuild the body without the pointer line, so the records face
    // refuses it by name (VMU_RECORD_DESTRUCTIVE_WRITE) instead of silently dropping it. The refusal is not a lock: it
    // names the two ways through. Assert that first (a wall with no door is what RUN 210 was about), then correct the
    // pointer through the door a correction should use.
    const fixPlain = await call('vibe_v5_record_proposition', {
      id: String(w.recordId), statement: '前 n 个奇数之和等于 n 的平方', value: '对 n≥1 成立',
      motive: '补上证明文件后重登记', p: 0.9, member: 'r-1',
    })
    ok(fixPlain.ok === false && fixPlain.code === 'VMU_RECORD_DESTRUCTIVE_WRITE',
      '§1g ★★★ a rewrite that would DROP the pointer line is refused by name (not silently dropped)', fixPlain && fixPlain.code)
    has(fixPlain.hint, 'bodyMode', '§1g ★ and the refusal names the door: bodyMode')
    has(fixPlain.hint, 'confirmDestructive', '§1g ★ and the other one: confirmDestructive')
    const fix = await call('vibe_v5_record_proposition', {
      id: String(w.recordId), statement: '前 n 个奇数之和等于 n 的平方', value: '对 n≥1 成立',
      motive: '补上证明文件后重登记', p: 0.9, member: 'r-1', bodyMode: 'merge',
    })
    ok(fix.ok === true, '§1g ★★★ a second write to the same card is ALLOWED (it used to be locked forever)', fix)
  } finally { /* hygiene */ }
})

test('RUN 210 §2 — a chair-typed tally says, in the same receipt, that its own call will be refused', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    ok((await call('vibe_v5_start', { problem: 'RUN 210 的主席代填', researcherCount: 2 })).ok === true, 'premise: founded')
    const card = await call('vibe_v5_record_proposition', {
      statement: '前 n 个奇数之和等于 n 的平方', value: '对 n≥1 成立', motive: '初等结论', p: 0.9, member: 'r-1',
    })
    ok(card.ok === true, 'premise: card', card)
    ok((await call('vibe_v5_meeting', { member: 'r-acad', agenda: '就 rec-1 辩论', title: 'm-deb' })).ok === true, 'premise: meeting')
    ok((await call('vibe_vmu_meeting', { action: 'attend', id: 'm1', member: 'r-acad' })).ok === true, 'premise: attend')

    // ★★★ chair TYPES all three verdicts (no member filed a card): run 47's shortcut
    const fin = await call('vibe_v5_verdict_final', {
      meeting: 'm1', member: 'r-acad', proposition_id: String(card.recordId),
      verdicts: [
        { member: 'r-acad', p: 1, reason: '归纳法' },
        { member: 'r-1', p: 1, reason: '逐项核验' },
        { member: 'r-2', p: 1, reason: '归纳法+边界' },
      ],
    })
    ok(fin.ok === true, '§2a premise: the chair-typed ruling is accepted', fin)
    ok(fin.p1RulingReading && fin.p1RulingReading.voted === false, '§2b premise: the reading says voted:false', fin.p1RulingReading)
    ok(fin.p1CannotBack && fin.p1CannotBack.code === 'VMU_PACK_V5R_CORE_P1_RULING_UNVOTED',
      '§2c ★★★ the receipt predicts the refusal BY NAME', fin.p1CannotBack)
    ok(fin.p1CannotBack.why === 'chair-typed-only', '§2d ★ and names why (chair-typed only)', fin.p1CannotBack)
    has(fin.p1CannotBackMeans, 'WILL BE REFUSED', '§2e ★★ in words the holder can act on')
    has(fin.p1CannotBackMeans, 'file their OWN ruling card', '§2f ★★★ and names the one path that works')

    // the printed call also separates `ballotId` (aggregate) from a ballot box
    ok(fin.correction && typeof fin.correction.ballotIdMeans === 'string', '§2g ★★ correction carries ballotIdMeans', fin.correction && fin.correction.ballotIdMeans)
    has(fin.correction.ballotIdMeans, 'RULING AGGREGATE NAME', '§2h ★★★ it says what that slot really holds')
    has(fin.correction.ballotIdMeans, 'never a ballot BOX id', '§2i ★ and what it is not')
  } finally { /* hygiene */ }
})

test('RUN 210 §3 — HONEST path: members file their own rulings, and the receipt then predicts SUCCESS', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    ok((await call('vibe_v5_start', { problem: 'RUN 210 的成员自交', researcherCount: 2 })).ok === true, 'premise: founded')
    const card = await call('vibe_v5_record_proposition', {
      statement: '前 n 个奇数之和等于 n 的平方', value: '对 n≥1 成立', motive: '初等结论', p: 0.9, member: 'r-1',
    })
    ok(card.ok === true, 'premise: card', card)
    ok((await call('vibe_v5_meeting', { member: 'r-acad', agenda: '就 rec-1 辩论', title: 'm-deb' })).ok === true, 'premise: meeting')
    for (const m of ['r-acad', 'r-1', 'r-2']) {
      const a = await call('vibe_vmu_meeting', { action: 'attend', id: 'm1', member: m })
      ok(a.ok === true, 'premise: attend ' + m, a)
    }
    // the CHAIR does not file a member ruling (VMU_RULING_CHAIR_SIGNS) — the debaters do, and the chair then collects
    for (const m of ['r-1', 'r-2']) {
      const v = await call('vibe_v5_verdict', { meeting: 'm1', member: m, proposition_id: String(card.recordId), verdict: 1, reason: '归纳法核验' })
      ok(v.ok === true, 'premise: ' + m + ' filed a ruling card', v)
    }
    const fin = await call('vibe_v5_verdict_final', { meeting: 'm1', member: 'r-acad', proposition_id: String(card.recordId) })
    ok(fin.ok === true, '§3a premise: ruling taken', fin)
    ok(fin.p1RulingReading && fin.p1RulingReading.voted === true, '§3b ★ the reading finds a counted decision', fin.p1RulingReading)
    ok(fin.p1CannotBack === null, '§3c ★★★ and NO refusal is predicted (the field is absent, not a hopeful true)', fin.p1CannotBack)
  } finally { /* hygiene */ }
})

test('RUN 210 §4 — the paper status page teaches the call the review face actually accepts', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    ok((await call('vibe_v5_start', { problem: 'RUN 210 的状态页', researcherCount: 2 })).ok === true, 'premise: founded')
    ok((await call('vibe_v5_paper', { action: 'start', participants: ['r-1', 'r-2'], target: 'paper-210' })).ok === true, 'premise: paper')
    ok((await call('vibe_v5_paper', { action: 'part', target: 'paper-210', member: 'r-1', part: '第一节', body: '归纳法证明。' })).ok === true, 'premise: part 1')
    ok((await call('vibe_v5_paper', { action: 'part', target: 'paper-210', member: 'r-2', part: '第二节', body: '逐项核验。' })).ok === true, 'premise: part 2')
    ok(blockOf(await call('vibe_v5_paper', { action: 'advance', target: 'paper-210' }), 'advance').moved === true, 'premise: moved to reviewing')

    const status = blockOf(await call('vibe_v5_paper', { action: 'status', target: 'paper-210' }), 'status')
    const moves = status && status.reachableMoves ? status.reachableMoves : null
    ok(moves !== null, '§4a premise: the page lists reachable moves', status)
    ok(Array.isArray(moves.moves) && moves.moves.includes('review{deliverable}'),
      '§4b ★★★ it teaches `review{deliverable}`', moves.moves)
    ok(!(Array.isArray(moves.moves) && moves.moves.includes('review{decision}')),
      '§4c ★★★ and no longer teaches the spelling the review face refuses', moves.moves)
  } finally { /* hygiene */ }
})
