// vmu work ledger — the in-flight ledger (docs/07 §3) and its two declarations (round 298).
//
// Why this suite exists: the face had NO suite of its own. The workflow suite covers the workflow graph and does not import the
// ledger, so the two declarations wired in round 298 were probe-verified but unasserted. This file is that home.
//
// The contract it encodes:
//   1. an item registered with start() survives in a durable store, and settle() removes exactly it;
//   2. recover() runs after a store opens, so everything still present was written by a PREVIOUS process - it is marked
//      interrupted with a NAMED reason and reported, never silently dropped and never guessed as done;
//   3. `vmu.work.keepEntries` bounds the ledger and drops the OLDEST, so unfinished work stays visible;
//   4. `vmu.work.autoSettle=false` makes recover() REPORT survivors without rewriting them.
//
// `--self-probe` removes the pruning and requires the corresponding assertion to fail.

import { createWorkLedger } from '../vibe-math-vmu/kernel/work.js'

let passed = 0, failed = 0
const ok = (cond, name, detail) => {
  if (cond) { passed++; console.log('  ok   ' + name) }
  else { failed++; console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}
/** The face is async, so a refusal arrives as a REJECTION - awaiting is what makes the assertion mean anything. */
const refuses = async (code, name, fn) => {
  try { await fn(); ok(false, name, 'no refusal') } catch (e) { ok(e && e.code === code, name, e && e.code) }
}

/** A minimal durable store: `read`/`patch`, exactly the two methods the ledger requires. */
const mkStore = () => {
  const data = new Map()
  return {
    read: (k) => (data.has(k) ? data.get(k) : []),
    patch: (k, fn) => { const next = fn(data.get(k)); data.set(k, next); return next },
    _raw: data,
  }
}
const mk = (settings) => createWorkLedger({ store: mkStore(), clock: () => 1000, settings: settings || {} })

// ── 1. registration, settling, and the named refusals ───────────────────────────────────────────────────────
{
  const w = mk()
  await refuses('VMU_INVALID_ARGUMENT', 'start() without an owner is refused by name', () => w.start({ kind: 'work' }))
  const a = await w.start({ owner: 'o-1', kind: 'method', objective: 'prove it' })
  const b = await w.start({ owner: 'o-2' })
  ok(a.ok === true && typeof a.entry.id === 'string' && a.entry.interrupted === false, 'start() registers an in-flight item', a.entry)
  ok(w.status().pending === 2 && w.status().entries === 2, 'status() counts both as pending', w.status())
  const s = await w.settle(a.entry.id, { outcome: 'done' })
  ok(s.ok === true && s.remaining === 1 && s.outcome === 'done', 'settle() removes exactly that item and reports the remainder', s)
  await refuses('VMU_NO_SUCH_OBJECT', 'settling an unknown id is refused by name', () => w.settle('nope'))
  ok(b.entry.id !== a.entry.id, 'two items get distinct ids')
}

// ── 2. a restart marks survivors interrupted, with a named reason ────────────────────────────────────────────
{
  const store = mkStore()
  const before = createWorkLedger({ store, clock: () => 1000 })
  await before.start({ owner: 'o-1' })
  await before.start({ owner: 'o-2' })
  // a NEW ledger over the SAME store stands in for a restarted process
  const after = createWorkLedger({ store, clock: () => 2000 })
  ok(after.status().pending === 2, 'a fresh ledger over the same store sees the previous process its work')
  const r = await after.recover()
  ok(r.ok === true && r.recovered === 2, 'recover() marks both survivors', r)
  ok(after.status().pending === 0 && after.status().interrupted === 2, 'after recovery nothing is left pending', after.status())
  const all = after.list()
  ok(all.every((e) => e.interrupted === true && typeof e.interruptedReason === 'string' && e.interruptedReason.length > 0),
    'every survivor carries a NAMED interruption reason (never silently dropped)', all.map((e) => e.interruptedReason))
  const again = await after.recover()
  ok(again.recovered === 0, 'recover() is idempotent: a second run finds nothing pending')
}

// ── 3. vmu.work.keepEntries bounds the ledger, dropping the OLDEST ───────────────────────────────────────────
{
  const capped = mk({ 'vmu.work.keepEntries': 3 })
  for (let i = 0; i < 5; i += 1) await capped.start({ owner: 'o-' + i })
  const ids = capped.list().map((e) => e.owner)
  ok(ids.length === 3, 'keepEntries=3 bounds the ledger to three entries', ids)
  ok(ids[ids.length - 1] === 'o-4' && ids[0] === 'o-2', 'pruning keeps the NEWEST entries - unfinished work stays visible', ids)
  const uncapped = mk({})
  for (let i = 0; i < 5; i += 1) await uncapped.start({ owner: 'o-' + i })
  ok(uncapped.list().length === 5, 'below the cap nothing is pruned at all', uncapped.list().length)
}

// ── 4. vmu.work.autoSettle=false reports survivors without rewriting them ────────────────────────────────────
{
  const store = mkStore()
  await createWorkLedger({ store, clock: () => 1000 }).start({ owner: 'o-1' })
  const report = createWorkLedger({ store, clock: () => 2000, settings: { 'vmu.work.autoSettle': false } })
  const r = await report.recover()
  ok(r.recovered === 0 && r.reported === 1 && r.autoSettle === false, 'autoSettle=false REPORTS survivors and marks none', r)
  ok(report.status().pending === 1, 'autoSettle=false leaves the survivor PENDING (it did not rewrite state)', report.status())
  const active = createWorkLedger({ store, clock: () => 3000 })
  const r2 = await active.recover()
  ok(r2.recovered === 1, 'with the default, the same survivor IS marked', r2.recovered)
}

// ── the observation surface is lenient: a broken store must not break status() ──────────────────────────────
{
  const broken = createWorkLedger({ store: { read: () => { throw new Error('closed') }, patch: () => {} }, clock: () => 1000 })
  ok(broken.status().entries === 0, 'status() survives an unreadable store (observability must not throw)')
  await refuses('VMU_STORE_FAILED', 'a WRITE path against an unreadable store refuses by name', () => broken.start({ owner: 'o' }))
}

const guard = process.argv.includes('--self-probe')
if (guard) {
  console.log('=== VMU WORK SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}
console.log('=== VMU WORK: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
