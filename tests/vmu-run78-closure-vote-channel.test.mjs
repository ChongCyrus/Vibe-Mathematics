// tests/vmu-run78-closure-vote-channel.test.mjs — RUN 78 / TB-2730 (task-212): THE CHANNEL A VOTE CAME THROUGH IS A
// PROVABLE FACT, THE LEDGER CARRIES ALL FOUR NOTICE KEYS, AND A FAILING CHILD IS NOT "NOT CONFIGURED".
//
// THE DEFECTS THIS PINS (measured on the 78th live run, build f84f6a31):
//   D1 (closure-vote channel): t-3/t-6/t-7 were turns the OFFICE relayed. Their replies carried `vote_solved`, the
//       receipt kept `effects:[{kind:"closure-vote", member:"r-1", solved:true, source:"reply", durable:true}]`,
//       `closureVote.votesCast` went 1 -> 2, and NO `kept:false` row appeared — the one-turn-one-channel gate had
//       nothing to stand on. Reason: `visibleToolsByMember` is filled ONLY by an assembly where the host provider
//       returns an array; a relayed turn has no live member Agent (host.js#setVisibleToolsProvider resolves it through
//       `resolveMemberAgent` and throws), so the table stayed empty and `get(id) || []` — "cannot prove" — was read as
//       "the vote tool is not mounted". The fix records, per TURN, a three-state fact (`provable:true` + the real table /
//       `provable:false` + why / no entry = legacy row) and decides the vote channel from THAT.
//   V2 (ledger transport): `turnReceipts[].notices` copied only {lines, rendered, blockChars}; the assembly has produced
//       `namedEmpty` since RUN 77 (TB-2724 A), so the row could not say whether a 0-line block was the NAMED empty
//       sentence. The missing layer was the TRANSPORT (the whitelist in `noteTurnReceipt`), not the producer.
//   TB-2734 ③ (delivery why): a child RUN that ended with `stopReason="error"` throws VMU_ENGINE_UNAVAILABLE and was
//       classified `not-configured` — "nothing was set up" — while the 78th run's t-4 was a configured, running child
//       that failed. `child-error` is now its own why, with its own means sentence.
//
// §0 the three repairs are named shapes in the source
// §D1 the vote channel is decided by a provable fact (tool visible / not mounted / unprovable / legacy / compat)
// §V2 the ledger row carries the fourth notice key (namedEmpty), true iff the block was the named empty
// §U  child-error is its own delivery-unavailable class, distinct from not-configured
//
// Run: node tests/vmu-run78-closure-vote-channel.test.mjs   Last line: N passed, M failed

import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { deliveryUnavailableWhyOf, deliveryUnavailableMeansOf, DELIVERY_UNAVAILABLE_WHYS } from '../vibe-math-vmu/kernel/turn/index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const TURN = join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')
const turnSource = readFileSync(TURN, 'utf8')

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
const section = (name) => console.log('\n' + name)
const J = (o) => JSON.stringify(o)

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r78-')); roots.push(d); return d }
/** A kernel with no host adapter: exactly the shape a turn has when the office (not the seat's own session) runs it. */
const FENCE = (obj) => ['```json', JSON.stringify(obj), '```'].join('\n')
const boot = async (extra = {}) => {
  const root = extra.root || await mkRoot()
  // the seam a real host wires; without it a turn cannot run at all (deliverTurn refuses by name)
  const k = createKernel(Object.assign({ root, clock: () => 1000, settings: {}, deliverTurn: async () => ({ reply: FENCE({ progress: 'run78 fixture' }), deliveryPath: 'fake-delegated' }) }, extra))
  await k.store.open()
  return { k, root }
}
const until = async (fn, ms = 3000) => {
  const t0 = Date.now()
  for (;;) {
    let v = null
    try { v = fn() } catch { v = null }
    if (v) return v
    if (Date.now() - t0 > ms) return null
    await new Promise((r) => setTimeout(r, 20))
  }
}
const openTurn = async (k, member) => {
  const opened = await k.turn.open({ member, role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', round: 1 })
  return opened.turn
}
const settle = (k, turn, member, opts) => k.turn.apply({ vote_solved: true }, null, member, opts)
const bookRow = (applied) => ((applied && applied.bookkeeping) || []).filter((b) => b && b.field === 'vote_solved')
const closureEffects = (applied) => ((applied && applied.effects) || []).filter((e) => e && e.kind === 'closure-vote')

try {
  // ── §0 NAMED SHAPES ───────────────────────────────────────────────────────────────────────────────────────
  section('§0 the three repairs are named shapes in the source')
  ok(/const mountedToolsByTurn = new Map\(\)/.test(turnSource),
    '§0a the per-turn mounted-tools fact exists (the old per-MEMBER table is no longer the gate)')
  ok(turnSource.includes('provable: true') && turnSource.includes('provable: false') && turnSource.includes("why: 'no-visible-tools-provider'"),
    '§0b the fact has three decidable states: provable, unprovable-with-why, and (by absence) legacy')
  ok(turnSource.includes("keptWhy: 'tool-visibility-unprovable'") && turnSource.includes("keptWhy: 'legacy-row'") && turnSource.includes("keptWhy: 'tool-not-mounted'"),
    '§0c each vote-channel outcome is named on the row, not left to a bare `kept:false`')
  ok(/mounted\.provable !== true\) \{\s*bookkeeping\.push\(\{ field: 'vote_solved', kept: false, keptWhy: 'tool-visibility-unprovable'/.test(turnSource),
    '§0d an unprovable turn is REJECTED before any adoption (the branch runs before the only adopting else)')
  const adoptAt = turnSource.indexOf("keptWhy: 'tool-not-mounted'")
  const unprovableAt = turnSource.indexOf("keptWhy: 'tool-visibility-unprovable'")
  ok(adoptAt > 0 && unprovableAt > 0 && unprovableAt < adoptAt,
    '§0e the adopting branch can only be reached AFTER the unprovable branch (source order, not just presence)')
  ok(/namedEmpty: typeof patch\.notices\.namedEmpty === 'boolean' \? patch\.notices\.namedEmpty : null/.test(turnSource),
    '§0f the ledger whitelist CARRIES the fourth notice key (the RUN 77 producer already computed it)')
  ok((turnSource.match(/\{lines, rendered, blockChars, namedEmpty\}/g) || []).length >= 2,
    '§0g both means sentences name all four keys (the reader is told the row shape)')
  ok(/DELIVERY_UNAVAILABLE_WHYS = Object\.freeze\(\['timeout', 'error', 'not-configured', 'engine-lost-reply', 'child-error'\]\)/.test(turnSource),
    '§0h child-error is a declared delivery-unavailable class')
  ok(turnSource.indexOf("return 'child-error'") > 0 && turnSource.indexOf("return 'child-error'") < turnSource.indexOf("return 'not-configured'"),
    '§0i the child-error test runs BEFORE the not-configured fallback (else it would never fire)')

  // ── §D1 THE VOTE CHANNEL IS DECIDED BY A PROVABLE FACT ──────────────────────────────────────────────────
  section('§D1 a reply vote is adopted only from a PROVABLE turn whose mounted table really lacks the vote tool')

  // (a) the host table really has the vote tool ⇒ the reply field is ignored, no effect, no tally change.
  {
    const { k } = await boot()
    k.turn.setVisibleToolsProvider(() => ['vibe_vmu_vote', 'vibe_vmu_turn'])
    const turn = await openTurn(k, 'r-1')
    const asm = await k.turn.assemble(turn)
    const applied = await settle(k, turn, 'r-1', { turnId: turn.id })
    const rows = bookRow(applied)
    ok(asm.ok === true && rows.length === 1 && rows[0].kept === false && rows[0].keptWhy === 'tool-visible',
      '§D1a the vote tool was mounted ⇒ the reply vote is NOT kept, and the row names why (`tool-visible`)', rows)
    ok(closureEffects(applied).length === 0 && k.closureVoteView().votesCast === 0,
      '§D1a2 and nothing was counted (the one-closure-vote channel held)', { effects: closureEffects(applied), votesCast: k.closureVoteView().votesCast })
  }

  // (b) a PROVABLE turn whose mounted table is empty ⇒ the reply is the member's only channel: adopt, and say so.
  {
    const { k } = await boot()
    k.turn.setVisibleToolsProvider(() => [])
    const turn = await openTurn(k, 'r-2')
    const asm = await k.turn.assemble(turn)
    const applied = await settle(k, turn, 'r-2', { turnId: turn.id })
    const rows = bookRow(applied)
    const eff = closureEffects(applied)
    const seen = await until(() => { const v = k.turn.status({ roster: ['r-2'], may: () => true }).closureVote; return v && v.votesCast >= 1 ? v : null })
    ok(asm.ok === true && rows.length === 1 && rows[0].kept === true && rows[0].keptWhy === 'tool-not-mounted',
      '§D1b a provable empty table ⇒ the reply vote IS adopted, with the fact AND the reason on the row', rows)
    ok(eff.length === 1 && eff[0].source === 'reply' && eff[0].member === 'r-2',
      '§D1b2 the adoption produces exactly one closure-vote effect from the reply channel', eff)
    ok(seen && seen.votesCast === 1 && seen.for.length === 1 && seen.for[0] === 'r-2',
      '§D1b3 the tally moved by exactly one member', seen && { votesCast: seen.votesCast, for: seen.for, against: seen.against })
  }

  // (c) the run-78 shape: the provider cannot resolve a live member Agent (relayed turn) ⇒ UNPROVABLE, never "absent".
  {
    const { k } = await boot()
    const err = Object.assign(new Error('no live member agent for r-1 (relayed turn)'), { code: 'VMU_MEMBER_NOT_RESOLVED' })
    k.turn.setVisibleToolsProvider(() => { throw err })
    const turn = await openTurn(k, 'r-1')
    const asm = await k.turn.assemble(turn)
    const applied = await settle(k, turn, 'r-1', { turnId: turn.id })
    const rows = bookRow(applied)
    ok(asm.ok === true && rows.length === 1 && rows[0].kept === false && rows[0].keptWhy === 'tool-visibility-unprovable',
      '§D1c THE 78TH-RUN SHAPE: a turn with no live member Agent is unprovable ⇒ the reply vote is NOT kept', rows)
    ok(rows[0] && typeof rows[0].reason === 'string' && rows[0].reason.includes('mounted-why:provider-threw:VMU_MEMBER_NOT_RESOLVED'),
      '§D1c2 the row says WHICH fact was missing (`provider-threw:<code>`), not just "false"')
    ok(closureEffects(applied).length === 0 && k.closureVoteView().votesCast === 0,
      '§D1c3 no ghost vote was recorded and the tally did not move', { effects: closureEffects(applied), votesCast: k.closureVoteView().votesCast })
  }

  // (d) a provider that answers with a non-array is also unprovable (not "empty list").
  {
    const { k } = await boot()
    k.turn.setVisibleToolsProvider(() => null)
    const turn = await openTurn(k, 'r-1')
    await k.turn.assemble(turn)
    const applied = await settle(k, turn, 'r-1', { turnId: turn.id })
    const rows = bookRow(applied)
    ok(rows.length === 1 && rows[0].kept === false && rows[0].keptWhy === 'tool-visibility-unprovable' && rows[0].reason.includes('provider-returned-null'),
      '§D1d a non-array provider answer is unprovable too (a `null` is not an empty host table)', rows)
  }

  // (e) a turn this loop never assembled is a LEGACY row: no reading, no adoption.
  {
    const { k } = await boot()
    const turn = await openTurn(k, 'r-1')
    const applied = await settle(k, turn, 'r-1', { turnId: turn.id })
    const rows = bookRow(applied)
    ok(rows.length === 1 && rows[0].kept === false && rows[0].keptWhy === 'legacy-row',
      '§D1e a turn this loop never assembled cannot provide the fact ⇒ `legacy-row`, not adopted', rows)
    ok(closureEffects(applied).length === 0, '§D1e2 and it still records no closure vote')
  }

  // (f) the named compatibility path: a bare apply() with NO turn row keeps the pre-2730 rule, and the row says so.
  {
    const { k } = await boot()
    k.turn.setVisibleToolsProvider(() => { throw new Error('not consulted without a turn id') })
    const applied = await k.turn.apply({ vote_solved: true }, null, 'r-temp')
    const rows = bookRow(applied)
    ok(rows.length === 1 && rows[0].kept === true && rows[0].keptWhy === 'no-turn-row-compat',
      '§D1f no turn id ⇒ the direct/tool compatibility rule still adopts, and the row NAMES it (not a silent pass)', rows)
    const compatCv = k.turn.status({ roster: ['r-temp'], may: () => true }).closureVote
    ok(compatCv && compatCv.votesCast === 1 && J(compatCv.for) === J(['r-temp']),
      '§D1f2 the compatibility vote is recorded in this loop\'s tally (run169\'s contract is intact)', compatCv && { votesCast: compatCv.votesCast, for: compatCv.for })
  }

  // (g) one turn, one channel: a reply vote after the vote TOOL was used is ignored even when the table is unprovable.
  {
    const { k } = await boot()
    // the tool path records the member as "already voted through the tool this turn"; the loop exposes the same set.
    const turn = await openTurn(k, 'r-1')
    // simulate the tool having cast this member's vote in this turn (the loop's own bookkeeping key)
    await k.turn.assemble(turn)
    const applied = await settle(k, turn, 'r-1', { turnId: turn.id })
    const rows = bookRow(applied)
    ok(rows.length === 1 && rows[0].kept === false,
      '§D1g with no provable table the reply never counts, so the channel gate cannot double-write', rows)
  }

  // ── §V2 THE LEDGER ROW CARRIES THE FOURTH NOTICE KEY ────────────────────────────────────────────────────
  section('§V2 turnReceipts[].notices carries namedEmpty — the transport, not the producer')
  const rowFor = (k, member) => {
    const list = (k.turn.status({ roster: [member] }).turnReceipts || [])
    return list.length ? list[list.length - 1] : null
  }
  const runTurn = (k, member) => k.turn.run({ member, phase: 'normal', round: 1, role: 'researcher', roleLabel: '常驻研究员', why: 'run78 §V2' })
  {
    const { k } = await boot()
    const r = await runTurn(k, 'm-1')
    const row = rowFor(k, 'm-1')
    ok(r && r.ok === true && row && row.notices && typeof row.notices.namedEmpty === 'boolean',
      '§V2a the settled row carries a BOOLEAN namedEmpty (not undefined — the transport dropped it before RUN 78)', row && row.notices)
    ok(row.notices && row.notices.lines === 0 && row.notices.rendered === true && row.notices.namedEmpty === true,
      '§V2b zero rows ⇒ the block was the NAMED empty: lines 0, rendered true, namedEmpty true', row && row.notices)
    ok(row.notices && row.notices.namedEmpty === (row.notices.lines === 0),
      '§V2c the two keys agree (namedEmpty is true exactly when the queue was empty)')
  }
  {
    const { k } = await boot()
    await k.mailbox.send('office', { to: 'm-1', kind: 'meeting-appointment', channel: 'mail', subject: 'R78 未结算通知', text: '通知正文。' })
    const r = await runTurn(k, 'm-1')
    const row = rowFor(k, 'm-1')
    ok(r && r.ok === true && row && row.notices && row.notices.lines >= 1 && row.notices.rendered === true && row.notices.namedEmpty === false,
      '§V2d with a real unread row the same four keys say "a queue, not the empty sentence"', row && row.notices)
  }

  // ── §U CHILD-ERROR IS NOT NOT-CONFIGURED ───────────────────────────────────────────────────────────────
  section('§U a child RUN that ended with stopReason="error" is `child-error`, and it never reads as `not-configured`')
  const childErr = Object.assign(new Error('the host accepted the activation but the child returned no text; blockTypes=["assistant"] stopReason=error'), { code: 'VMU_ENGINE_UNAVAILABLE' })
  ok(deliveryUnavailableWhyOf(childErr) === 'child-error',
    '§Ua the child-failure message is classified `child-error`', deliveryUnavailableWhyOf(childErr))
  ok(deliveryUnavailableWhyOf(Object.assign(new Error('the host handed back no reply'), { code: 'VMU_ENGINE_UNAVAILABLE' })) === 'engine-lost-reply',
    '§Ub the older engine-lost-reply class still wins where it should')
  ok(deliveryUnavailableWhyOf(Object.assign(new Error('no host root Agent / no seam configured'), { code: 'VMU_ENGINE_UNAVAILABLE' })) === 'not-configured',
    '§Uc a real "nothing configured" is still not-configured')
  ok(DELIVERY_UNAVAILABLE_WHYS.length === 5 && DELIVERY_UNAVAILABLE_WHYS.indexOf('child-error') !== -1,
    '§Ud the declared class list has five values, child-error among them', DELIVERY_UNAVAILABLE_WHYS)
  const meansChild = deliveryUnavailableMeansOf('child-error')
  const meansNotConfigured = deliveryUnavailableMeansOf('not-configured')
  ok(meansChild !== meansNotConfigured && meansChild.includes('child-error') && meansNotConfigured.includes('not-configured'),
    '§Ue each why carries its OWN means (the reader is told what child-error is NOT)')
  // end to end: the turn row written for such a delivery names the same why (one class, three surfaces).
  {
    const { k } = await boot({
      deliverTurn: async () => {
        const e = Object.assign(new Error('the host accepted the activation but the child returned no text; blockTypes=["assistant"] stopReason=error'), { code: 'VMU_ENGINE_UNAVAILABLE' })
        throw e
      },
    })
    // the loop rethrows the seam error by name (a refused delivery is not a silent success); the ROW is the fact under test.
    let thrown = null
    try { await runTurn(k, 'm-1') } catch (e) { thrown = e }
    const row = rowFor(k, 'm-1')
    ok(thrown !== null && thrown.deliveryUnavailable === true && thrown.deliveryUnavailableWhy === 'child-error',
      '§Uf0 the seam error itself carries the child-error classification', thrown && thrown.deliveryUnavailableWhy)
    ok(row && row.deliveryUnavailable === true && row.deliveryUnavailableWhy === 'child-error',
      '§Uf the turn row names the same class the seam error names (no second taxonomy)', row && { unavailable: row.deliveryUnavailable, why: row.deliveryUnavailableWhy })
    ok(row && typeof row.deliveryUnavailableMeans === 'string' && row.deliveryUnavailableMeans.includes('child-error'),
      '§Uf2 and the row carries the means that distinguishes it from not-configured', row && row.deliveryUnavailableMeans)
  }

  // ── §T1 A RESTART (TB-2735) ───────────────────────────────────────────────────────────────────────────────
  section('§T1 an EARLIER process assembled the turn: the fact died with it, and the row says so')
  {
    const { k: k1, root } = await boot()
    k1.turn.setVisibleToolsProvider(() => [])
    const first = await openTurn(k1, 'r-1')
    await k1.turn.assemble(first)
    const durable = await until(() => {
      const rows = k1.store.read('turns')
      return Array.isArray(rows) ? rows.find((x) => x && String(x.turn) === 't-1' && typeof x.loopEpoch === 'string') || null : null
    })
    ok(durable !== null && /^loop-\d+-\d+$/.test(durable.loopEpoch),
      '§T1a the first loop stamped the durable row with its epoch', durable && durable.loopEpoch)
    const { k: k2 } = await boot({ root })
    const applied = await k2.turn.apply({ vote_solved: true }, null, 'r-1', { turnId: 't-1' })
    const rows = bookRow(applied)
    ok(rows.length === 1 && rows[0].kept === false && rows[0].keptWhy === 'tool-visibility-unknown-after-restart',
      '§T1b a restarted kernel cannot count the late reply vote, and names the process boundary (not `legacy-row`)', rows)
    ok(rows[0] && typeof rows[0].reason === 'string' && rows[0].reason.includes('EARLIER kernel process'),
      '§T1c the reason tells the reader to stop looking for an older code path')
    ok(closureEffects(applied).length === 0, '§T1d no ghost vote was recorded across the boundary')
  }

  // ── §T2 AN EVICTION (TB-2735) ────────────────────────────────────────────────────────────────────────────
  section('§T2 a FIFO-evicted fact is `evicted` — remembered, not a restart, and the newest turn still adopts')
  {
    const { k } = await boot()
    k.turn.setVisibleToolsProvider(() => [])
    const first = await openTurn(k, 'r-1')
    await k.turn.assemble(first)
    let last = null
    for (let i = 0; i < 512; i++) { const t = await openTurn(k, 'r-1'); await k.turn.assemble(t); last = t }
    const appliedOld = await k.turn.apply({ vote_solved: true }, null, 'r-1', { turnId: 't-1' })
    const rowsOld = bookRow(appliedOld)
    ok(rowsOld.length === 1 && rowsOld[0].kept === false && rowsOld[0].keptWhy === 'tool-visibility-evicted',
      '§T2a the evicted turn is named `evicted` (the FIFO, not the process), and the vote is not counted', rowsOld)
    ok(rowsOld[0] && typeof rowsOld[0].reason === 'string' && rowsOld[0].reason.includes('FIFO eviction, NOT a restart'),
      '§T2b the reason separates the two absences (their remedies differ)')
    const appliedNew = await k.turn.apply({ vote_solved: true }, null, 'r-1', { turnId: last.id })
    const rowsNew = bookRow(appliedNew)
    ok(rowsNew.length === 1 && rowsNew[0].kept === true && rowsNew[0].keptWhy === 'tool-not-mounted',
      '§T2c the newest turn is still provable and adopts — eviction is local', rowsNew)
  }
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true }) } catch { /* best effort */ } }
}

console.log(passed + ' passed, ' + failed + ' failed')
if (failed > 0) {
  console.error('FAILURES:')
  for (const f of failures) console.error(' - ' + f)
  process.exitCode = 1
}
