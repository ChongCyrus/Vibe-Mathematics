// tests/vmu-commit-store-e2e.test.mjs — Round 9 / task-67 A: the allocating commit store, end to end.
//
// LIFTED FROM the Round-8 probe (`D:\_tmp\vmu-r8\commit-store.mjs`, 14/0) — core's §6.5 named it as the single source
// for the 14 assertions, grouped: ① two kernels share ONE store (4) ② crash between intent and effect (6)
// ③ no store degrades BY NAME (2) ④ a store that mounts after boot (2). Two things were ADDED here, as agreed:
//   · a RULE E non-empty precondition on every collection-shaped assertion (so none of them can pass vacuously), and
//   · a NEGATIVE half: a `commitStore` whose resolution THROWS must be recorded by name (`commit-store-failed` /
//     `VMU_COMMIT_STORE_FAILED`) and leave the gate non-durable - never silently swallowed.
// Plus one assertion group about the CONTRACT ITSELF that the Lead flagged: a store that allocates a NEW ticket for a
// record that already carries one breaks pairing between an intent and its outcome, so recovery replays forever.
//
// THE STORE CONTRACT (docs/03 §2): `append(record)` ALLOCATES a ticket when the record has none and PRESERVES an
// explicit `ticket`, because `complete()` appends the outcome under the INTENT's ticket and recovery matches `done`
// rows by ticket.
//
// Run: node tests/vmu-commit-store-e2e.test.mjs
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { createBallot, createDurableCommitLog } from '../vibe-math-vmu/kernel/ballot.js'

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; console.error('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}

/** The stub named in core's §6.5: it ALLOCATES a missing ticket, PRESERVES an explicit one, and lets `seq` catch up. */
const mkStore = () => {
  const rows = []
  let seq = 0
  return {
    rows,
    append (rec) {
      const given = Number(rec && rec.ticket)
      const t = Number.isFinite(given) && given > 0 ? given : (seq += 1)
      if (t > seq) seq = t
      rows.push(Object.assign({}, rec, { ticket: t }))
      return { ticket: t }
    },
    readAll () { return rows.map((r) => Object.assign({}, r)) },
  }
}

// ── ① two kernels sharing ONE store get distinct, monotonic tickets
console.log('=== ① two kernels sharing ONE store (4) ===')
{
  const store = mkStore()
  const k1 = createKernel({ settings: {}, clock: () => 1000, commitStore: store })
  const k2 = createKernel({ settings: {}, clock: () => 2000, commitStore: store })
  const b1 = k1.ballot()
  const b2 = k2.ballot()
  ok(b1.status().gate.durable === true, 'process 1: the gate is DURABLE (the store was threaded in)', b1.status().gate)
  ok(b2.status().gate.durable === true, 'process 2: the gate is DURABLE too', b2.status().gate)
  b1.open({ by: 'chair' }); b1.cast('m1', true)
  b2.open({ by: 'chair' }); b2.cast('m2', true)
  const tickets = store.rows.filter((r) => r.done !== true).map((r) => Number(r.ticket)).filter(Number.isFinite)
  // RULE E: pin the collection non-empty before comparing positions, or two empty logs would satisfy the claim.
  ok(tickets.length > 0 && tickets.length >= 2, 'both processes appended intents to the SAME log', tickets)
  ok(tickets.length >= 2 && tickets[0] === 1 && tickets[1] === 2, 'and the store allocated 1 then 2 (distinct + monotonic)', tickets.slice(0, 4))
}

// ── ② a crash between intent and effect ⇒ the next process replays it EXACTLY ONCE
console.log('=== ② crash between intent and effect (6) ===')
{
  const store = mkStore()
  const log1 = createDurableCommitLog({ store, clock: () => 1000 })
  const rec = log1.reserve({ member: 'm1', value: true, kind: 'decisive' })
  ok(rec && rec.ticket === 1, 'the INTENT was appended first (intent-before-effect)', rec)
  const rowsAfterCrash = store.readAll()
  ok(rowsAfterCrash.length === 1 && rowsAfterCrash[0].done !== true, 'the log holds exactly one UNFINISHED intent', rowsAfterCrash)
  const log2 = createDurableCommitLog({ store, clock: () => 2000 })
  const r1 = log2.recover()
  ok(!!r1 && r1.ok === true && Array.isArray(r1.pending) && r1.pending.length === 1, 'the new process sees exactly one pending intent', r1 && r1.pending)
  const r2 = log2.recover()
  ok(!!r2 && r2.pending.length === 1, 'recovery is idempotent (asking twice does not duplicate)', r2 && r2.pending.length)
  log2.complete(r1.pending[0], 'recovered')
  const log3 = createDurableCommitLog({ store, clock: () => 3000 })
  const r3 = log3.recover()
  // RULE E: "no pending left" only means something if the log is non-empty (it is: intent + outcome).
  ok(store.readAll().length > 0 && !!r3 && r3.pending.length === 0, 'after completion no process replays it again (no double-apply)', r3 && r3.pending)
  const doneRows = store.readAll().filter((r) => r.done === true)
  ok(doneRows.length === 1 && Number(doneRows[0].ticket) === 1, 'the outcome row carries the SAME ticket as its intent', doneRows)
}

// ── ③ no store ⇒ named degradation, never pretended
console.log('=== ③ no store ⇒ named degradation (2) ===')
{
  const k = createKernel({ settings: {}, clock: () => 1000 })
  const b = k.ballot()
  ok(b.status().gate.durable === false, 'without a store the gate is NOT durable (named)', b.status().gate)
  const seams = k.status().seams
  ok(seams.commitStore === false && /no allocating store/.test(String(seams.commitStoreNote)),
    'status().seams names the absent seam (and explains what would provide it)', { commitStore: seams.commitStore, note: seams.commitStoreNote })
}

// ── ④ a store that mounts AFTER boot is picked up (call-time resolution)
console.log('=== ④ a store mounted after boot (2) ===')
{
  let live = null
  const k = createKernel({ settings: {}, clock: () => 1000, commitStore: () => live })
  const b1 = k.ballot()
  ok(b1.status().gate.durable === false, 'before the store mounts: not durable', b1.status().gate)
  live = mkStore()
  const b2 = k.ballot()
  ok(b2.status().gate.durable === true, 'after it mounts: the NEXT ballot is durable (resolved at CALL time, not boot)', b2.status().gate)
}

// ── ⑤ NEGATIVE: a commit store whose resolution THROWS is named and the gate stays non-durable
console.log('=== ⑤ (added) a THROWING commit store is named, never swallowed ===')
{
  const b = createBallot({ settings: {}, clock: () => 1000, commitStore: () => { throw new Error('store exploded') } })
  ok(b.status().gate.durable === false, 'the gate is NOT durable after the resolver threw (named degradation)', b.status().gate)
  const hist = typeof b.history === 'function' ? b.history() : b.history
  const row = (Array.isArray(hist) ? hist : []).find((r) => r && r.what === 'commit-store-failed')
  ok(!!row && row.code === 'VMU_COMMIT_STORE_FAILED',
    '★ and the failure is RECORDED BY NAME (`commit-store-failed` / `VMU_COMMIT_STORE_FAILED`)', row)
  ok(!!row && typeof row.message === 'string' && row.message.includes('store exploded'),
    'the recorded row carries the resolver\'s own message (so the cause is not lost)', row && row.message)
}

// ── ⑥ (added) THE CONTRACT ITSELF: a store that re-numbers an explicit ticket breaks intent↔outcome pairing
console.log('=== ⑥ (added) the contract: an explicit ticket must be PRESERVED ===')
{
  const badStore = (() => { // allocates ALWAYS - ignores the ticket the caller supplied
    const rows = []
    let seq = 0
    return { rows, append (rec) { seq += 1; rows.push(Object.assign({}, rec, { ticket: seq })); return { ticket: seq } }, readAll () { return rows.map((r) => Object.assign({}, r)) } }
  })()
  const log1 = createDurableCommitLog({ store: badStore, clock: () => 1000 })
  const rec = log1.reserve({ member: 'm1', value: true, kind: 'decisive' })
  log1.complete(rec, 'ok')
  // the outcome went to ticket 2 (the store re-numbered) while the intent sat at 1 ⇒ the intent stays pending forever
  const next = createDurableCommitLog({ store: badStore, clock: () => 2000 })
  const r = next.recover()
  const intents = badStore.readAll().filter((x) => x.done !== true)
  const outcomes = badStore.readAll().filter((x) => x.done === true)
  ok(intents.length > 0 && outcomes.length > 0 && !!r && r.pending.length >= 1,
    '★ a store that re-numbers an explicit ticket leaves the intent PENDING even though it was completed - the exact failure the contract exists to prevent',
    { intents: intents.map((x) => x.ticket), outcomes: outcomes.map((x) => x.ticket), pending: r && r.pending.length })
  ok(outcomes.length > 0 && Number(outcomes[0].ticket) !== Number(intents[0].ticket),
    'and the mismatch is visible as DIFFERENT tickets on the outcome and the intent (what `mkStore` preserves)',
    { intent: intents[0] && intents[0].ticket, outcome: outcomes[0] && outcomes[0].ticket })
}

console.log('')
console.log('=== COMMIT STORE E2E: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)
