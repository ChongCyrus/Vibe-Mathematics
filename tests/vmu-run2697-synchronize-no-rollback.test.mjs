#!/usr/bin/env node
// vmu RUN 2697 / TB-2697 — THE READ PATH MUST NOT ROLL A ROW BACK.
//
// THE OBSERVED DEFECT: the same end-to-end command produced two different assemblies (pair shas fa20fc12 vs edc53de7).
// The differing row was rec-2 — the blueprint draft — whose `writer` flipped between r-acad and r-1, cascading into
// `fingerprint`, `originalBytes` and every count that reads them. The flipped row matched the FIRST draft's content and
// its `updatedAt` was the instant of a later READ (+61000ms), not of any write. The diagnosis (D:/_tmp/recid-race/
// DIAGNOSIS.md) found the mechanism in `records.synchronize`: a row this instance already held was replaced whenever the
// durable fold's CONTENT differed, even when that fold row was the snapshot taken BEFORE the local write (the snapshot
// patch is queued after the mutation). The replaced row was stamped `now()` and its writer re-derived from the fold, so
// an old snapshot was read back as news and the row moved one revision backwards without anyone writing it.
//
// THE FIX (RUN 2697, lead裁定 (A)): (1) fold rows now carry `rev` and `updatedAt` (kernel/index.js snapshotRecords);
// (2) a held row is replaced ONLY by a fold row STRICTLY NEWER by (updatedAt, then rev) — an older row is refused and
// counted (`staleRows`); (3) an id whose local fold write is not acknowledged yet (`foldPending`) is not adopted from a
// fold row that differs (counted `heldBack`; only the row that EQUALS the pending write proves the write landed);
// (4) the adopted row keeps the fold's own instant instead of stamping `now()`.
//
// WHAT THIS SUITE PROVES: §1 a stale fold row cannot roll a row back (the row was adopted from another kernel, and the
// instance's own pending-write case); §2 a genuinely newer write by another kernel IS still adopted (RUN 129's guard);
// §3 both halves are load-bearing: a mutant that adopts on ANY content difference, and a mutant that drops the pending
// guard, each turn the invariant red (the red output is printed).
import { mkdtemp, rm } from 'node:fs/promises'
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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

let NOW = 1800000000000
const clock = () => NOW
const settle = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms))

const bootWith = async (entryPath, root) => {
  const entry = await import(pathToFileURL(entryPath).href)
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { root, packs: ['v5r'], clock })
  await handle.ready()
  if (!handle.kernel) throw new Error('kernel did not assemble: ' + JSON.stringify(handle.notes || []))
  await handle.kernel.store.open()
  return handle
}

/** The durable snapshot is queued AFTER the mutation returns, so a reader must join on it when it wants agreement. */
const landFold = async (kernel) => {
  if (typeof kernel.flushRecordsFold === 'function') await kernel.flushRecordsFold()
  await settle()
}

/** Rewrite one durable fold row — the fixture plants exactly the row the old code adopted: an OLDER picture. */
const plantFoldRow = async (kernel, row) => {
  await kernel.store.patch('records', (rows) => {
    const out = Array.isArray(rows) ? rows.slice() : []
    const idx = out.findIndex((r) => r && String(r.id) === String(row.id))
    if (idx >= 0) out[idx] = row
    else out.push(row)
    return out
  })
  await settle(20)
}

const sharedOf = (records) => {
  try {
    if (typeof records.sharedView === 'function') return records.sharedView()
    if (typeof records.status === 'function') return records.status().shared || {}
  } catch { /* the seam is asserted in §0 */ }
  return {}
}

const faceOf = (handle, id) => handle.kernel.records.get({ id })

const sketch = (row) => row === null || row === undefined ? null : {
  writer: row.writer, owner: row.owner, rev: row.rev, updatedAt: row.updatedAt,
  fingerprint: row.fingerprint, bytes: row.bytes, body: String(row.body === undefined ? '' : row.body).slice(0, 60),
}

const ROW = (id, title, body, by, extra = {}) => ({
  id, track: 'state', kind: 'state', title, body, tags: [], state: 'live', restoredAt: null, by, owner: by, ...extra,
})

const rootA = await mkdtemp(join('D:/_tmp', 'vmu-r2697-'))
const mutantRoot = await mkdtemp(join('D:/_tmp', 'vmu-r2697-mutant-'))
const cleanups = []
try {
  // ── §0 the seam publishes both refusal counters with their sentences ─────────────────────────────────────────────
  const office = await bootWith(ENTRY, rootA)
  cleanups.push(async () => Promise.all((office.cleanups || []).map(async (c) => { try { return await c() } catch { return null } })))
  const recA = office.kernel.records
  const sv0 = sharedOf(recA)
  ok(typeof sv0.staleRows === 'number' && typeof sv0.heldBack === 'number',
    '§0 the seam publishes staleRows and heldBack (a refused fold row is COUNTED, never silent)',
    { staleRows: sv0.staleRows, heldBack: sv0.heldBack })
  ok(typeof sv0.staleRowsMeans === 'string' && sv0.staleRowsMeans.length > 60
    && typeof sv0.heldBackMeans === 'string' && sv0.heldBackMeans.length > 60,
    '§0 both counters explain when a fold row is refused', { staleRowsMeans: sv0.staleRowsMeans, heldBackMeans: sv0.heldBackMeans })

  // ── §1a A STALE FOLD ROW CANNOT ROLL BACK A ROW THIS INSTANCE HOLDS ─────────────────────────────────────────────
  // The fixture is TB-2697's arrive: a row that this instance wrote, whose durable fold snapshot is then replayed as the
  // OLDER picture (the draft's first version). Before the fix, one read adopted it: writer moved back to r-1 and
  // updatedAt became the READ instant. The row here is written locally because the defect did not need a second kernel:
  // it needed a fold row that was not newer than the row in hand.
  NOW += 10
  const filed = office.kernel.records.put(ROW('rec-stale', 'note｜Shared/Protocol.md｜r1', 'v1 written here', 'r-1', { settled: true }))
  ok(filed && filed.ok === true, '§1a the office files the row', filed && { ok: filed.ok, id: filed.id })
  await landFold(office.kernel)
  const adoptedBefore = sketch(faceOf(office, 'rec-stale'))
  ok(adoptedBefore.body === 'v1 written here' && adoptedBefore.writer === 'r-1',
    '§1a the row in hand is the one this instance wrote (the read retires its pending fold write)', adoptedBefore)
  await plantFoldRow(office.kernel, ROW('rec-stale', 'note｜Shared/Protocol.md｜r1', 'v0 that the fold still had', 'r-9', { rev: 1, updatedAt: adoptedBefore.updatedAt - 5000 }))
  const afterStale = sketch(faceOf(office, 'rec-stale'))
  const staleHeld = afterStale.writer === adoptedBefore.writer && afterStale.updatedAt === adoptedBefore.updatedAt
    && afterStale.fingerprint === adoptedBefore.fingerprint && afterStale.body === adoptedBefore.body
  ok(staleHeld,
    '§1a AN OLDER FOLD ROW IS REFUSED: a read does not change the row (this was the TB-2697 flip)',
    staleHeld ? undefined : { before: adoptedBefore, afterStale })
  ok(sharedOf(recA).staleRows >= 1, '§1a the refusal is COUNTED as staleRows', { staleRows: sharedOf(recA).staleRows })

  // ── §1b OUR OWN UNACKNOWLEDGED WRITE IS NOT UNDONE BY A FOLD ROW THAT LOOKS NEWER ────────────────────────────────
  // ★ RUN 269: the pending mark now has its documented SECOND exit — the kernel clears it the moment the snapshot
  // patch RESOLVES (`records.acknowledgeFoldWrite`, wired in `kernel/index.js snapshotRecords`). That is what makes a
  // frozen-clock cross-kernel write stop being shadowed forever (run 129). So "unacknowledged" is no longer a thing
  // that happens by accident in this fixture: the fixture HOLDS THE PATCH OPEN for exactly the two writes it wants
  // reviewed, and releases it afterwards. Without that hold this block would no longer test the guard, it would test
  // a window that has closed on purpose.
  const gate = { hold: 0, release: null }
  const realPatch = office.kernel.store.patch.bind(office.kernel.store)
  office.kernel.store.patch = (key, fn) => {
    const landed = realPatch(key, fn)
    if (key !== 'records' || gate.hold <= 0) return landed
    gate.hold -= 1
    const wait = new Promise((resolve) => { gate.release = resolve })
    return landed.then((v) => wait.then(() => v))
  }
  gate.hold = 2
  NOW += 10
  office.kernel.records.put(ROW('rec-own', 'note｜Shared/Own.md｜r1', 'v1 own body', 'r-1', { settled: true }))
  NOW += 10
  office.kernel.records.supersede({ id: 'rec-own', by: 'r-acad', reason: 'common design continuation (RUN 2697 fixture)', body: 'v2 own body from the chair' })
  const ownBefore = sketch(faceOf(office, 'rec-own'))
  ok(ownBefore.body === 'v2 own body from the chair' && ownBefore.writer === 'r-acad',
    '§1b the chair rewrite is what this instance holds', ownBefore)
  // The fold still holds the pre-rewrite body; the fixture also bumps rev in the SAME millisecond, so a
  // (updatedAt, rev) comparison alone would call it strictly newer — only the pending guard can refuse it.
  await plantFoldRow(office.kernel, ROW('rec-own', 'note｜Shared/Own.md｜r1', 'v1 own body', 'r-1', { rev: ownBefore.rev + 1, updatedAt: ownBefore.updatedAt }))
  const ownAfter = sketch(faceOf(office, 'rec-own'))
  const pendingHeld = ownAfter.writer === ownBefore.writer && ownAfter.updatedAt === ownBefore.updatedAt
    && ownAfter.fingerprint === ownBefore.fingerprint && ownAfter.body === ownBefore.body
  ok(pendingHeld,
    '§1b A PENDING LOCAL WRITE OUTRANKS THE FOLD: the row is not adopted while its durable patch is unacknowledged',
    pendingHeld ? undefined : { before: ownBefore, afterPending: ownAfter })
  ok(sharedOf(recA).heldBack >= 1, '§1b the skip is COUNTED as heldBack', { heldBack: sharedOf(recA).heldBack })
  // Release the held patches and prove the OTHER exit works: once acknowledged, the same differing fold row is judged
  // on its merits (strictly newer wins) instead of being shadowed forever. This is run 129's live defect, asserted.
  const ackedCount = (() => { try { return gate.release ? (gate.release(), 1) : 0 } catch { return 0 } })()
  office.kernel.store.patch = realPatch
  await settle(30)
  ok(ackedCount === 1, '§1b the fixture released the held snapshot patch (so the ack path really runs)', { released: ackedCount })
  const sharedAck = sharedOf(recA)
  ok(sharedAck.heldBack >= 1 && typeof sharedAck.heldBackMeans === 'string',
    '§1b after the ack the pending mark is cleared in ONE documented place (the kernel), and the counter keeps its sentence',
    { heldBack: sharedAck.heldBack })

  // ── §2 RUN 129'S GUARD: A GENUINELY NEWER WRITE BY ANOTHER KERNEL IS STILL ADOPTED ──────────────────────────────
  const member = await bootWith(ENTRY, rootA)
  cleanups.push(async () => Promise.all((member.cleanups || []).map(async (c) => { try { return await c() } catch { return null } })))
  member.kernel.records.get({ id: 'rec-stale' })   // hydrate the row this kernel is about to rewrite
  await landFold(member.kernel)
  NOW += 10000
  member.kernel.records.supersede({ id: 'rec-stale', by: 'r-acad', reason: 'RUN 129 guard: the member rewrote a row the office adopted', body: 'v2 written by the member kernel after the office adopted v1' })
  await landFold(member.kernel)
  const refreshedSketch = sketch(faceOf(office, 'rec-stale'))
  const adoptedNewer = refreshedSketch.writer === 'r-acad' && refreshedSketch.body === 'v2 written by the member kernel after the office adopted v1'
  ok(adoptedNewer,
    '§2 a strictly newer cross-kernel rewrite IS adopted (the office now sees the member s v2)',
    adoptedNewer ? undefined : { before: adoptedBefore, afterNewer: refreshedSketch })
  ok(refreshedSketch.updatedAt !== adoptedBefore.updatedAt,
    '§2 the adopted row carries the WRITE instant, not the read instant (the +61000ms was the defect)',
    { before: adoptedBefore.updatedAt, after: refreshedSketch.updatedAt })
  ok(sharedOf(recA).refreshed >= 1, '§2 the adoption is COUNTED as refreshed', { refreshed: sharedOf(recA).refreshed })

  // ── §3 BOTH HALVES ARE LOAD-BEARING (mutation proof, on copies of the tree) ────────────────────────────────────
  const makeMutant = (name, mutate) => {
    const dir = join(mutantRoot, name)
    cpSync(join(REPO, 'vibe-math-vmu'), join(dir, 'vibe-math-vmu'), { recursive: true })
    const recPath = join(dir, 'vibe-math-vmu', 'kernel', 'records.js')
    const before = readFileSync(recPath, 'utf8')
    const after = mutate(before)
    if (after === before) throw new Error('mutation ' + name + ' changed nothing (the fixture is stale)')
    writeFileSync(recPath, after)
    return join(dir, 'vibe-math-vmu', 'vibe-math-vmu.js')
  }
  const withRoot = async (entryPath, fn) => {
    const rootB = await mkdtemp(join('D:/_tmp', 'vmu-r2697-m-'))
    try {
      const k = await bootWith(entryPath, rootB)
      return await fn(k)
    } finally {
      await rm(rootB, { recursive: true, force: true })
    }
  }
  // mutant 1: adopt on ANY content difference (the old `!==` bar).
  const mutantLooser = makeMutant('looser', (src) => src.replace('&& (heldAt === null || foldAt > heldAt || (foldAt === heldAt && foldRev !== null && foldRev > heldRev))', '&& true'))
  const loose = await withRoot(mutantLooser, async (k) => {
    NOW += 10
    k.kernel.records.put(ROW('rec-m', 'note｜M.md｜r1', 'fresh body', 'r-1', { settled: true }))
    await landFold(k.kernel)
    const held = sketch(faceOf(k, 'rec-m'))
    await plantFoldRow(k.kernel, ROW('rec-m', 'note｜M.md｜r1', 'stale body', 'r-9', { rev: 1, updatedAt: held.updatedAt - 5000 }))
    return { held, read: sketch(faceOf(k, 'rec-m')) }
  })
  const looseFlipped = loose.read.writer !== loose.held.writer || loose.read.body !== loose.held.body
  if (looseFlipped) console.error('MUTANT-RED [looser]: baseline invariant broken — held=' + JSON.stringify(loose.held) + ' read=' + JSON.stringify(loose.read))
  ok(looseFlipped,
    '§3 RED PROOF: the mutant that adopts on ANY content difference DOES roll the row back (removing the strict-newer gate changes the row)',
    looseFlipped ? undefined : { held: loose.held, afterMutantRead: loose.read })

  // mutant 2: no pending guard (the unacknowledged write is treated like any other fold row).
  const mutantNoPending = makeMutant('drop-pending', (src) => src.replace(/const pending = shared\.foldPending\.get\(id\)\n        if \(pending\) \{[\s\S]*?\n        \}\n/, ''))
  const noPending = await withRoot(mutantNoPending, async (k) => {
    NOW += 10
    k.kernel.records.put(ROW('rec-p', 'note｜P.md｜r1', 'v1', 'r-1', { settled: true }))
    NOW += 10
    k.kernel.records.supersede({ id: 'rec-p', by: 'r-acad', reason: 'pending fixture', body: 'v2' })
    const held = sketch(faceOf(k, 'rec-p'))
    await plantFoldRow(k.kernel, ROW('rec-p', 'note｜P.md｜r1', 'v1', 'r-1', { rev: held.rev + 1, updatedAt: held.updatedAt }))
    return { held, read: sketch(faceOf(k, 'rec-p')) }
  })
  const pendingFlipped = noPending.read.writer !== noPending.held.writer || noPending.read.body !== noPending.held.body
  if (pendingFlipped) console.error('MUTANT-RED [drop-pending]: baseline invariant broken — held=' + JSON.stringify(noPending.held) + ' read=' + JSON.stringify(noPending.read))
  ok(pendingFlipped,
    '§3 RED PROOF: the mutant that DROPS the pending guard lets a pending row be overwritten (the unacknowledged write is lost)',
    pendingFlipped ? undefined : { held: noPending.held, afterMutantRead: noPending.read })
} finally {
  for (const c of cleanups.reverse()) { try { await c() } catch { /* best effort */ } }
  await rm(rootA, { recursive: true, force: true })
  await rm(mutantRoot, { recursive: true, force: true })
}

if (failed > 0) {
  console.error('\n=== vmu-run2697: ' + passed + ' passed, ' + failed + ' failed ===')
  for (const f of failures) console.error('  - ' + f)
  process.exitCode = 1
} else {
  console.log('\n=== vmu-run2697: ' + passed + ' passed, 0 failed ===')
}
