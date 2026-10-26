// tests/vmu-run36-records-shared.test.mjs — ROUND 36 / task-26: A RECORD ANOTHER KERNEL WROTE MUST BE READABLE FROM A
// KERNEL THAT BOOTED FIRST.
//
// THE DEFECT THIS PINS (measured on the real machine, run 36, build c7673f73): the office kernel booted FIRST, then the
// members' child sessions wrote 20+ rows into `state.json` — each child session mounts its OWN kernel instance over the
// same workspace (docs/02: ONE state.json, SEVERAL kernels). The office's own `kernel.records` stayed EMPTY, so
// `vibe_v5_verified_promote {card:"p-odd-sum"}` answered
//     VMU_NO_SUCH_OBJECT: unknown record: p-odd-sum      hint: known ids: (none)
// while `vibe_v5_read_library` could read the very same card from the member side. The status board's
// "该成员在 progress 轨还没有记录" is the same hole one layer up.
//
// WHY: the projection (`kernel/records.js`) is in-memory, and the durable seam in `kernel/index.js` hydrated it ONCE
// (`let recordsHydrated = false` + an early return). An instance that had already read never looked at the store again,
// so a row written LATER by another kernel was permanently invisible — not "eventually consistent", never.
//
// WHAT IS ASSERTED HERE (each state READ BACK, and every read is a REAL read of the face the pack calls):
//   ① the fixture is honest: A's `records.put` really lands in the durable fold, and B — booted FIRST — had already
//      read an EMPTY list before that write (the latch is closed, so ② is not "someone forgot to hydrate");
//   ② ★★ RUN 36 ITSELF: B's `list` now carries A's row, and B's `get` returns it with the writer's title/body/owner
//      and a fingerprint that VERIFIES (a pulled row must be the same row, not a re-minted lookalike);
//   ③ ★★ THE REVERSE DIRECTION OF THE SAME HOLE: after A writes a second row, B's OWN row is still there and still
//      unchanged — a pull must never overwrite or delete what this instance already knows (no silent local loss);
//   ④ ★★ THE GATE IS NOT LOOSENED: an id nobody wrote is still refused BY NAME — and the hint now lists the ids B can
//      really see ("known ids: (none)" was half of run 36's diagnosis, so an empty list there is a lie now);
//   ⑤ a FRESH root invents nothing (no rows, same named refusal) — "cross-instance read" did not become "read anything";
//   ⑥ a kernel whose store was never OPENED is DEGRADED, not corrupt: reads behave exactly as before and the failed
//      pull is COUNTED (status().shared.refused) so the next run has evidence instead of silence;
//   ⑦ the pull respects the projection's own contract: head list keeps its caps/sort/fields, and the body is not
//      re-shaped on the way in (a shared read must not become a second writer);
//   ⑧ ★ A READ MUST NOT WRITE: pulling rows bumps no store write (the durable snapshot stays the mutating instance's job).
//
// RULE E: every collection assertion states its non-emptiness (or exact shape) in the same expression.
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const J = (o) => JSON.stringify(o)
const serr = (fn) => { try { return { value: fn() } } catch (e) { return { error: e } } }

const entry = await import(pathToFileURL(ENTRY).href)

// Temp roots live under D:\_tmp\r36\records (task rule) and are deleted at the end of the run.
const BASE = 'D:/_tmp/r36/records'
await mkdir(BASE, { recursive: true })

const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, kernel: handle.kernel, specs: state.specs }
}
const railOn = (root) => ({ root, packs: ['v5r'], clock: () => 1000 })
const roots = []
const newRoot = async (tag) => { const r = await mkdtemp(join(BASE, tag + '-')); roots.push(r); return r }

// The durable snapshot is written asynchronously (tmp + rename), so wait for the FACT to land instead of guessing a
// sleep: poll the fold this instance can read.
const until = async (fn, ms = 3000) => {
  const t0 = Date.now()
  for (;;) {
    let v = null
    try { v = fn() } catch (e) { v = null }
    if (v) return v
    if (Date.now() - t0 > ms) return null
    await new Promise((r) => setTimeout(r, 20))
  }
}
const foldHas = (k, id) => () => {
  const rows = k.store.read('records')
  return Array.isArray(rows) && rows.some((r) => r && String(r.id) === id)
}

console.log('=== 1. THE FIXTURE: A writes into the fold, B booted FIRST and already read an EMPTY list ===')
// B = "the office": it boots first (run 36's order), serves a turn, and closes its one-shot hydration on an empty store.
const rootShared = await newRoot('shared')
const B = await boot(railOn(rootShared))
const bFirst = B.kernel.records.list({ track: 'progress', limit: 0 })
ok(bFirst.count === 0 && Array.isArray(bFirst.items) && bFirst.items.length === 0 && bFirst.suppressed === false,
  '① B really started with an EMPTY head list (the precondition run 36 had: the office saw nothing)', bFirst.items)
// A = "a member's child session": its own kernel over the SAME root, mounted AFTER B (same as run 36).
const A = await boot(railOn(rootShared))
ok(A.kernel !== B.kernel, '① A and B are SEPARATE kernel instances over the same root (ONE state.json, SEVERAL kernels)', { same: A.kernel === B.kernel })
const cardA = A.kernel.records.put({ track: 'progress', kind: 'verified', title: 'p-odd-sum', body: 'the odd sum card', tags: ['run36'], by: 'r-6' })
ok(cardA.ok === true && typeof cardA.id === 'string' && cardA.deduplicated === false, '① A’s put returned a real id (the fixture wrote something)', cardA)
const landed = await until(foldHas(A.kernel, cardA.id))
ok(!!landed, '①★ the row really is in the DURABLE fold (state.json), not only in A’s memory — that is what makes ② a read, not a coincidence)', A.kernel.store.read('records'))

console.log('=== 2. ★★ RUN 36 ITSELF: the kernel that booted FIRST reads the row written LATER ===')
const bList = B.kernel.records.list({ track: 'progress', limit: 0 })
ok(bList.ok === true && bList.count === 1 && Array.isArray(bList.items) && bList.items.length === 1 && bList.items[0].id === cardA.id,
  '②★★ B’s head list now carries the row A wrote after B had already hydrated (run 36: this was empty ⇒ `known ids: (none)`)', bList.items)
const bGet = serr(() => B.kernel.records.get({ id: cardA.id }))
ok(!bGet.error, '②★★ B’s `get` resolves the id instead of refusing `VMU_NO_SUCH_OBJECT: unknown record` (the promote tool’s exact failure)',
  bGet.error ? { code: bGet.error.code, message: bGet.error.message, hint: bGet.error.hint } : null)
const got = bGet.value || {}
ok(got.title === 'p-odd-sum' && got.body === 'the odd sum card' && got.track === 'progress' && got.kind === 'verified',
  '② the pulled row is the SAME row (title / body / track / kind), not an empty placeholder minted to satisfy the lookup', got && { title: got.title, body: got.body, track: got.track, kind: got.kind })
ok(typeof got.owner === 'string' && got.owner !== '',
  '② the pulled row carries a NON-EMPTY owner (attribution is never blank; the exact name depends on what the snapshotted row carried - see ②b)',
  { owner: got.owner })
ok(got.fingerprintOk === true && typeof got.fingerprint === 'string' && got.fingerprint.length === 64,
  '②★ the pulled row’s fingerprint VERIFIES (recomputed === stored): it was restored, not re-derived into a lookalike', { fingerprintOk: got.fingerprintOk })
ok(got.status === 'live', '② a pulled row is live in this instance too (nothing invented a trashed/superseded state on the way in)', { status: got.status })
const bStatus = B.kernel.records.status()
ok(bStatus.shared && bStatus.shared.attached === true && bStatus.shared.pulls >= 1 && bStatus.shared.pulled >= 1,
  '②★★ the seam is ATTACHED and the pull is COUNTED (pulls / pulled ≥ 1) — a silent refresh would be its own run-36', bStatus.shared)

console.log('=== 2b. THE SEAM ITSELF: a row that carries its writer restores it as the owner ===')
// ②b reads the CONTRACT without the kernel's snapshot in the way. (Why it is not asserted through the kernel path: the
// row kernel/index.js snapshots carries no `by` - it copies `by: r.by` off a view that names that field `owner`
// (kernel/index.js:1976). That is a snapshot-side defect OUTSIDE this task's write face; it is reported, not papered
// over, and it is exactly why ② only requires a non-empty owner.)
const recordsMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'records.js')).href)
const seamRows = []
const fakeStore = {
  read: (key) => (key === 'records' ? JSON.parse(JSON.stringify(seamRows)) : undefined),
  stats: () => ({ open: true, stamp: 'fake:1' }),
}
const standalone = recordsMod.createRecords({ clock: () => 1000, settings: {}, log: () => {} })
const attachOut = standalone.attachStore(fakeStore)
ok(attachOut.ok === true && attachOut.attached === true && attachOut.key === 'records',
  '②b attachStore accepts a duck-typed durable port and NAMES the key it reads (`records`)', attachOut)
const attachBad = standalone.attachStore({ write: () => 'nope' })
ok(attachBad.ok === false && attachBad.reason === 'not-a-store' && typeof attachBad.hint === 'string',
  '②b a port this projection cannot READ is a NAMED refusal, not a throw (a boot path must not crash over an optional seam)', attachBad)
seamRows.push({ id: 'r-seam-1', track: 'progress', kind: 'finding', title: 'seam card', body: 'seam body', tags: [], by: 'r-6' })
const seamGot = standalone.get({ id: 'r-seam-1' })
ok(seamGot.ok === true && seamGot.owner === 'r-6',
  '②b★★ a row that carries its WRITER restores it as the record’s owner (who writes `by` into the row is the snapshotter’s job, not the reader’s)',
  { owner: seamGot.owner, id: seamGot.id })
seamRows.push({ id: 'r-seam-bad', track: 'progress', kind: 'not-a-kind', title: 'a row this projection cannot accept', body: '' })
const afterBad = standalone.list({ track: 'progress', limit: 0 })
const badShared = standalone.status().shared
ok(afterBad.items.length > 0,
  '②b the ACCEPTED row is still in the list after the refused one arrived (non-vacuous: the negative check below has something to check)', afterBad.items.length)
ok(afterBad.items.every((i) => i.id !== 'r-seam-bad') && badShared.refused >= 1 && typeof badShared.lastWhy === 'string' && badShared.lastWhy !== '',
  '②b a row the projection REFUSES is COUNTED and NAMED (shared.refused / shared.lastWhy), never silently dropped and never a thrown read',
  { refused: badShared.refused, lastWhy: badShared.lastWhy, lastDetail: badShared.lastDetail })

console.log('=== 3. ★★ THE REVERSE DIRECTION: a pull never overwrites what this instance already knows ===')
const own = B.kernel.records.put({ track: 'progress', kind: 'progress', title: 'p-b-own', body: 'B wrote this one itself', by: 'r-7' })
ok(own.ok === true && own.deduplicated === false, '③ B put a row of its own (the row that must survive ③)', own)
const ownLanded = await until(foldHas(B.kernel, own.id))
ok(!!ownLanded, '③★ B’s own write reached the DURABLE fold before the next instance writes (the ordering that makes ③ meaningful)', B.kernel.store.read('records'))
const cardLater = A.kernel.records.put({ track: 'progress', kind: 'finding', title: 'p-a-later', body: 'A wrote a second row', by: 'r-6' })
ok(cardLater.ok === true && cardLater.id !== cardA.id && cardLater.id !== own.id, '③ A wrote a SECOND row (a new id, so nothing can be satisfied by cache)', { cardLater: cardLater.id, cardA: cardA.id, own: own.id })
const laterLanded = await until(foldHas(A.kernel, cardLater.id))
ok(!!laterLanded, '③★ A’s second write reached the fold too (the two snapshots did not overwrite each other in flight)', A.kernel.store.read('records'))
const bBoth = B.kernel.records.list({ track: 'progress', limit: 0 })
const ids = bBoth.items.map((x) => x.id)
ok(bBoth.count === 3 && ids.includes(cardA.id) && ids.includes(own.id) && ids.includes(cardLater.id),
  '③★★ after A’s second write, B sees THREE rows: its own and BOTH of A’s (the refresh is incremental, not a replace)', ids)
const ownAfter = B.kernel.records.get({ id: own.id })
ok(ownAfter.body === 'B wrote this one itself' && ownAfter.owner === 'r-7',
  '③★★★ B’s OWN row is byte-unchanged after the pull (a refresh that rebuilt the map from the fold would have dropped or overwritten it)', { body: ownAfter.body, owner: ownAfter.owner })
// …and the durable fold still carries B's row too: the pull is a READ, it must not have rewritten the snapshot into a
// onesided view.
const foldNow = A.kernel.store.read('records')
ok(Array.isArray(foldNow) && foldNow.length > 0, '③ the durable fold really returns a NON-EMPTY row array (the read is not degraded to an empty list)', foldNow)
const foldIds = foldNow.map((r) => r && r.id)
ok(foldIds.includes(own.id) && foldIds.includes(cardA.id) && foldIds.includes(cardLater.id),
  '③ the fold is not a one-sided view either: B’s row and A’s rows all survive (no instance owns the file)', foldIds)

console.log('=== 4. ★★ THE GATE IS NOT LOOSENED: an id nobody wrote is still refused BY NAME ===')
const ghost = serr(() => B.kernel.records.get({ id: 'p-nobody-wrote-this' }))
ok(ghost.error && ghost.error.code === 'VMU_NO_SUCH_OBJECT',
  '④★★ a row that exists nowhere is still REFUSED with the same code (cross-instance read ≠ read anything)', ghost.error ? ghost.error.code : ghost.value)
ok(ghost.error && /known ids: /.test(String(ghost.error.hint)) && !/known ids: \(none\)/.test(String(ghost.error.hint)),
  '④★★★ and the hint now lists the ids B can REALLY see — "known ids: (none)" was half of run 36’s diagnosis, so it must not stay a lie',
  ghost.error ? ghost.error.hint : null)

console.log('=== 5. A FRESH ROOT: nothing is invented, the refusal is identical ===')
const rootFresh = await newRoot('fresh')
const C = await boot(railOn(rootFresh))
const cList = C.kernel.records.list({ track: 'progress', limit: 0 })
ok(cList.count === 0 && cList.items.length === 0, '⑤ on a root no kernel ever wrote, the head list is EMPTY (no ghost rows from the seam)', cList.items)
const cGet = serr(() => C.kernel.records.get({ id: 'p-odd-sum' }))
ok(cGet.error && cGet.error.code === 'VMU_NO_SUCH_OBJECT' && /known ids: \(none\)/.test(String(cGet.error.hint)),
  '⑤★★ on that root the refusal is EXACTLY the old one, hint included (an empty store still reports an empty list)', cGet.error ? { code: cGet.error.code, hint: cGet.error.hint } : cGet.value)

console.log('=== 6. AN UNOPENED STORE IS DEGRADED, NOT CORRUPT (and the failed pull is counted) ===')
const unopened = (await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')).href))
  .createKernel({ settings: {}, root: rootFresh, host: null, deliverTurn: async () => 'ok' })
const uList = serr(() => unopened.records.list({ track: 'progress', limit: 0 }))
ok(!uList.error && uList.value && uList.value.count === 0,
  '⑥ a kernel whose store was never opened still answers the head list (empty, no throw) — the lazy-retry path is intact',
  uList.error ? { code: uList.error.code, message: uList.error.message } : uList.value && uList.value.count)
const uGet = serr(() => unopened.records.get({ id: 'p-odd-sum' }))
ok(uGet.error && uGet.error.code === 'VMU_NO_SUCH_OBJECT', '⑥ and `get` still refuses BY NAME (an unopened store is not a reason to change the code)', uGet.error ? uGet.error.code : uGet.value)
const uShared = unopened.records.status().shared
ok(uShared && uShared.attached === true && uShared.refused >= 1 && typeof uShared.lastWhy === 'string' && uShared.lastWhy !== '',
  '⑥★★ the failed pull is COUNTED and ATTRIBUTED (shared.refused ≥ 1, shared.lastWhy names it) — evidence instead of a silent empty list',
  uShared)

console.log('=== 7. THE PROJECTION CONTRACT SURVIVES THE PULL (caps, sort, fields, owner) ===')
const capped = B.kernel.records.list({ track: 'progress', limit: 2 })
ok(capped.count === 2 && capped.available === 3 && capped.dropped === 1 && capped.truncated === true,
  '⑦★ `limit` still truncates on the PULLED set and says so (count 2 / available 3 / dropped 1) — the pull did not bypass the head caps', { count: capped.count, available: capped.available, dropped: capped.dropped })
const coreFields = ['id', 'track', 'kind', 'status', 'updatedAt', 'fingerprint']
ok(capped.items.length === 2,
  '⑦ the truncated list really carries rows, so the field and order checks below are not measuring an empty list (non-vacuous)', capped.items.length)
ok(capped.items.every((x) => coreFields.every((f) => f in x)),
  '⑦★ every pulled head still carries the CORE head fields (id/track/kind/status/updatedAt/fingerprint)', capped.items[0])
const ascending = capped.items.every((x, i) => i === 0 || capped.items[i - 1].updatedAt <= x.updatedAt)
ok(ascending, '⑦ the head sort is unchanged (updatedAt ascending): the shared rows enter the same order, not a prepended batch', capped.items.map((x) => x.updatedAt))
const trimmed = serr(() => B.kernel.records.list({ track: 'progress', fields: ['id', 'track'] }))
ok(trimmed.error && trimmed.error.code === 'VMU_HEAD_FIELD_IMMUTABLE',
  '⑦ the immutability rule for core head fields still fires after a pull (no relaxation)', trimmed.error ? trimmed.error.code : trimmed.value)

console.log('=== 8. ★ A READ MUST NOT WRITE: the pull bumps no store write ===')
const writesBefore = B.kernel.store.stats().writes
B.kernel.records.list({ track: 'progress', limit: 0 })
B.kernel.records.get({ id: cardA.id })
B.kernel.records.list({ track: 'progress', limit: 0 })
const writesAfter = B.kernel.store.stats().writes
ok(writesAfter === writesBefore,
  '⑧★★★ reading through the seam wrote NOTHING to the store (the durable snapshot stays the mutating instance’s job — a read that writes is a second writer)',
  { before: writesBefore, after: writesAfter })

for (const r of roots) { try { await rm(r, { recursive: true, force: true }) } catch (e) { /* best effort */ } }

console.log('')
if (failures.length) { console.error('FAILURES:'); for (const f of failures) console.error('  · ' + f) }
console.log('=== VMU RUN36 RECORDS SHARED: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed ? 1 : 0)
